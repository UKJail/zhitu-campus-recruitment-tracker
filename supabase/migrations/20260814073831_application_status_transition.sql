create or replace function public.transition_application_status(
  p_application_id uuid,
  p_target public.application_status
)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications;
  v_from public.application_status;
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;
  if v_application.status = p_target then
    return v_application;
  end if;

  v_allowed := case v_application.status
    when 'saved' then p_target in ('preparing', 'rejected', 'closed')
    when 'preparing' then p_target in ('applied', 'rejected', 'closed')
    when 'applied' then p_target in ('assessment', 'interview', 'offer', 'rejected', 'closed')
    when 'assessment' then p_target in ('interview', 'offer', 'rejected', 'closed')
    when 'interview' then p_target in ('offer', 'rejected', 'closed')
    when 'offer' then p_target in ('closed')
    when 'rejected' then p_target in ('saved')
    when 'closed' then p_target in ('saved')
    else false
  end;

  if not v_allowed then
    raise exception 'invalid status transition from % to %', v_application.status, p_target;
  end if;
  if p_target in ('assessment', 'interview', 'offer')
     and v_application.applied_confirmed_at is null then
    raise exception 'application must be confirmed before advancing';
  end if;

  v_from := v_application.status;
  update public.applications
  set status = p_target,
      applied_confirmed_at = case
        when p_target = 'applied' and applied_confirmed_at is null then now()
        else applied_confirmed_at
      end,
      updated_at = now()
  where id = v_application.id and user_id = v_user_id
  returning * into v_application;

  insert into public.application_events (
    application_id, user_id, from_status, to_status, source, metadata
  ) values (
    v_application.id, v_user_id, v_from, p_target, 'user',
    jsonb_build_object('action', 'manual_status_change')
  );

  return v_application;
end;
$$;

revoke execute on function public.transition_application_status(uuid, public.application_status)
from public, anon;
grant execute on function public.transition_application_status(uuid, public.application_status)
to authenticated;

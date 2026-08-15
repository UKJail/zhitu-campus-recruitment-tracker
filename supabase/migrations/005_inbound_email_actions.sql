alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists action_status text
    check (action_status in ('pending', 'accepted', 'rejected'));

create index if not exists notifications_user_pending_action_idx
  on public.notifications (user_id, created_at desc)
  where action_status = 'pending';

create or replace function public.confirm_email_status_suggestion(
  p_notification_id uuid,
  p_accept boolean
)
returns public.notifications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_notification public.notifications;
  v_application public.applications;
  v_application_id uuid;
  v_target public.application_status;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_notification
  from public.notifications
  where id = p_notification_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'notification not found';
  end if;
  if v_notification.action_status <> 'pending' then
    raise exception 'suggestion already resolved';
  end if;

  if p_accept and nullif(v_notification.metadata ->> 'applicationId', '') is not null then
    v_application_id := (v_notification.metadata ->> 'applicationId')::uuid;
    v_target := (v_notification.metadata ->> 'suggestedStatus')::public.application_status;

    select * into v_application
    from public.applications
    where id = v_application_id and user_id = v_user_id
    for update;

    if not found then
      raise exception 'application not found';
    end if;

    update public.applications
    set status = v_target,
        applied_confirmed_at = case
          when v_target = 'applied' then coalesce(applied_confirmed_at, now())
          else applied_confirmed_at
        end
    where id = v_application.id and user_id = v_user_id;

    insert into public.application_events (
      application_id, user_id, from_status, to_status, source, metadata
    ) values (
      v_application.id,
      v_user_id,
      v_application.status,
      v_target,
      'email',
      jsonb_build_object(
        'notificationId', v_notification.id,
        'inboundEmailId', v_notification.metadata ->> 'inboundEmailId',
        'confirmedByUser', true
      )
    );
  end if;

  update public.notifications
  set action_status = case when p_accept then 'accepted' else 'rejected' end,
      read_at = coalesce(read_at, now())
  where id = v_notification.id and user_id = v_user_id
  returning * into v_notification;

  return v_notification;
end;
$$;

revoke execute on function public.confirm_email_status_suggestion(uuid, boolean) from public, anon;
grant execute on function public.confirm_email_status_suggestion(uuid, boolean) to authenticated;

-- Apply before deploying the webhook route. No existing records are changed.
create or replace function public.store_inbound_email_with_notifications(
  p_email jsonb,
  p_notifications jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_provider_id text;
  v_email_id uuid;
  v_existing_owner uuid;
  v_notification jsonb;
begin
  if jsonb_typeof(p_email) is distinct from 'object'
    or jsonb_typeof(p_notifications) is distinct from 'array' then
    raise exception 'Invalid mail payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_notifications) not between 1 and 2 then
    raise exception 'Expected one notification and at most one reminder' using errcode = '22023';
  end if;
  v_owner := (p_email ->> 'user_id')::uuid;
  v_provider_id := nullif(p_email ->> 'provider_id', '');
  if v_owner is null or v_provider_id is null then
    raise exception 'Missing mail owner or provider id' using errcode = '22023';
  end if;

  insert into public.inbound_emails (
    user_id, provider_id, sender, subject, body_text, category, extracted_data, received_at
  ) values (
    v_owner, v_provider_id, p_email ->> 'sender', p_email ->> 'subject',
    p_email ->> 'body_text', p_email ->> 'category', p_email -> 'extracted_data',
    (p_email ->> 'received_at')::timestamptz
  ) on conflict (provider_id) do nothing
  returning id into v_email_id;

  if v_email_id is null then
    select id, user_id into v_email_id, v_existing_owner
    from public.inbound_emails where provider_id = v_provider_id;
    if v_existing_owner is distinct from v_owner then
      raise exception 'Mail ownership mismatch' using errcode = '42501';
    end if;
    return jsonb_build_object('id', v_email_id, 'duplicate', true);
  end if;

  for v_notification in select value from jsonb_array_elements(p_notifications) loop
    if jsonb_typeof(v_notification) is distinct from 'object'
      or (v_notification ->> 'user_id')::uuid is distinct from v_owner then
      raise exception 'Notification ownership mismatch' using errcode = '42501';
    end if;
    if jsonb_typeof(v_notification -> 'metadata') is distinct from 'object' then
      raise exception 'Invalid notification metadata' using errcode = '22023';
    end if;
    insert into public.notifications (
      user_id, kind, title, body, scheduled_for, metadata, action_status
    ) values (
      v_owner, v_notification ->> 'kind', v_notification ->> 'title',
      v_notification ->> 'body', (v_notification ->> 'scheduled_for')::timestamptz,
      (v_notification -> 'metadata') || jsonb_build_object('inboundEmailId', v_email_id),
      v_notification ->> 'action_status'
    );
  end loop;
  return jsonb_build_object('id', v_email_id, 'duplicate', false);
end;
$$;

revoke all on function public.store_inbound_email_with_notifications(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.store_inbound_email_with_notifications(jsonb, jsonb) to service_role;

-- These restrictive policies complement the existing own-row policies. They
-- do not permit new reads/writes and do not alter existing foreign key joins.
create policy interviews_references_same_owner
on public.interviews as restrictive for all to authenticated
using (true)
with check (
  application_id is null or exists (
    select 1 from public.applications a
    where a.id = interviews.application_id and a.user_id = interviews.user_id
  )
);

create policy interview_reviews_references_same_owner
on public.interview_reviews as restrictive for all to authenticated
using (true)
with check (
  (interview_id is null or exists (
    select 1 from public.interviews i
    where i.id = interview_reviews.interview_id and i.user_id = interview_reviews.user_id
  ))
  and (resume_version_id is null or exists (
    select 1 from public.resume_versions v
    where v.id = interview_reviews.resume_version_id and v.user_id = interview_reviews.user_id
  ))
);

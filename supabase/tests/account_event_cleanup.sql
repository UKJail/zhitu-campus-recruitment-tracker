-- Run against a database with migrations applied. Everything is rolled back;
-- only randomly generated fixture accounts are touched, never existing users.
begin;
do $$
declare
  fixture_id uuid := gen_random_uuid();
  fixture_app uuid;
  fixture_event uuid;
  fixture_job uuid;
  blocked boolean;
begin
  select id into fixture_job from public.jobs limit 1;
  if fixture_job is null then raise exception 'Test requires at least one job'; end if;
  insert into auth.users (id, email, raw_user_meta_data)
    values (fixture_id, 'delete-check-' || fixture_id::text || '@example.invalid', '{}'::jsonb);
  insert into public.applications (user_id, job_id, status)
    values (fixture_id, fixture_job, 'saved') returning id into fixture_app;
  insert into public.application_events (user_id, application_id, to_status, source)
    values (fixture_id, fixture_app, 'saved', 'system') returning id into fixture_event;

  blocked := false;
  begin
    update public.application_events set metadata = '{}'::jsonb where id = fixture_event;
  exception when raise_exception then
    if sqlerrm <> 'application events are append-only' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Event update was not blocked'; end if;

  blocked := false;
  begin
    delete from public.application_events where id = fixture_event;
  exception when raise_exception then
    if sqlerrm <> 'application events are append-only' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Direct event delete was not blocked'; end if;

  blocked := false;
  begin
    delete from public.applications where id = fixture_app;
  exception when raise_exception then
    if sqlerrm <> 'application events are append-only' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Application delete bypassed history protection'; end if;

  -- The hosted SQL editor cannot SET ROLE supabase_auth_admin. This verifies
  -- the database cascade; Auth API permissions need a separate integration test.
  delete from auth.users where id = fixture_id;
  if exists (select 1 from public.profiles where id = fixture_id)
    or exists (select 1 from public.applications where user_id = fixture_id)
    or exists (select 1 from public.application_events where user_id = fixture_id)
  then raise exception 'Account cascade cleanup failed'; end if;
end;
$$;
select 'passed: history remains immutable; Auth deletion cascades successfully' as result;
rollback;

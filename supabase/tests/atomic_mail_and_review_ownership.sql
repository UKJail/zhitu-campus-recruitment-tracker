-- Run after migrations. All fixtures are random, synthetic and rolled back.
begin;
do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  fixture_job uuid;
  app_a uuid;
  app_b uuid;
  interview_a uuid;
  interview_b uuid;
  review_a uuid;
  resume_b uuid;
  version_b uuid;
  mail jsonb;
  notice jsonb;
  result jsonb;
  blocked boolean;
  fixture_provider_id text := 'atomic-mail-check-' || gen_random_uuid()::text;
begin
  if has_function_privilege('anon', 'public.store_inbound_email_with_notifications(jsonb,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.store_inbound_email_with_notifications(jsonb,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.store_inbound_email_with_notifications(jsonb,jsonb)', 'execute') then
    raise exception 'RPC execution privileges are unsafe';
  end if;
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_a,'ownership-a-' || owner_a::text || '@example.invalid','{}'),
    (owner_b,'ownership-b-' || owner_b::text || '@example.invalid','{}');
  insert into public.jobs(company,title,location,description,apply_url,fingerprint)
    values ('Fixture','Test role','Test city','Synthetic test','https://example.invalid/job',gen_random_uuid()::text)
    returning id into fixture_job;
  insert into public.applications(user_id,job_id) values(owner_a,fixture_job) returning id into app_a;
  insert into public.applications(user_id,job_id) values(owner_b,fixture_job) returning id into app_b;
  insert into public.interviews(user_id,application_id,round) values(owner_a,app_a,'one') returning id into interview_a;
  insert into public.interviews(user_id,application_id,round) values(owner_b,app_b,'one') returning id into interview_b;
  insert into public.interview_reviews(user_id,interview_id) values(owner_a,interview_a) returning id into review_a;
  insert into public.resumes(user_id,name,storage_path,mime_type,size_bytes)
    values(owner_b,'fixture',owner_b::text || '/fixture.pdf','application/pdf',1) returning id into resume_b;
  insert into public.resume_versions(user_id,resume_id,content,source)
    values(owner_b,resume_b,'{}','upload') returning id into version_b;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  blocked := false;
  begin
    insert into public.interviews(user_id,application_id,round) values(owner_a,app_b,'unauthorized');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Foreign application reference was accepted'; end if;
  blocked := false;
  begin
    update public.interview_reviews set interview_id=interview_b where id=review_a;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Foreign interview reference was accepted'; end if;
  blocked := false;
  begin
    update public.interview_reviews set resume_version_id=version_b where id=review_a;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'Foreign resume reference was accepted'; end if;
  update public.interview_reviews set highlights='Owned update allowed' where id=review_a;
  if not found then raise exception 'Owned review update was incorrectly blocked'; end if;
  execute 'reset role';

  mail := jsonb_build_object('user_id',owner_a,'provider_id',fixture_provider_id,'category','interview','received_at',now(),'subject','Synthetic');
  notice := jsonb_build_object('user_id',owner_a,'kind','email_interview','title','Synthetic','metadata','{}'::jsonb);
  execute 'set local role service_role';
  blocked := false;
  begin
    perform public.store_inbound_email_with_notifications(mail,jsonb_build_array(notice,notice - 'title'));
  exception when not_null_violation then blocked := true;
  end;
  if not blocked then raise exception 'Invalid notification was accepted'; end if;
  if exists(select 1 from public.inbound_emails e where e.provider_id=fixture_provider_id) then
    raise exception 'Failed notification left a stored email and would suppress retry';
  end if;
  result := public.store_inbound_email_with_notifications(mail,jsonb_build_array(notice,notice || '{"kind":"email_interview_reminder"}'::jsonb));
  if result->>'duplicate' <> 'false' then raise exception 'First delivery is unexpectedly duplicate'; end if;
  if (select count(*) from public.notifications n where n.metadata->>'inboundEmailId'=result->>'id') <> 2 then
    raise exception 'Not all notifications were saved';
  end if;
  result := public.store_inbound_email_with_notifications(mail,jsonb_build_array(notice));
  if result->>'duplicate' <> 'true' then raise exception 'Repeated delivery is not idempotent'; end if;
  if (select count(*) from public.notifications n where n.metadata->>'inboundEmailId'=result->>'id') <> 2 then
    raise exception 'Retry duplicated notifications';
  end if;
  execute 'reset role';
end;
$$;
select 'passed: cross-owner references rejected; mail+notifications atomic and idempotent' as result;
rollback;

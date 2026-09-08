-- DML-only smoke test for the explicitly approved independent test project.
-- Execute the WHOLE file in one request/connection. No schema changes, Auth API,
-- email calls, AI calls or Storage objects. All synthetic rows are rolled back.
begin;

do $$
begin
  if exists(select 1 from auth.users where id='9f000000-0000-4000-8000-000000000001')
    or exists(select 1 from auth.users where email='ai-quota-smoke@example.invalid') then
    raise exception 'fixture collision: no existing account will be modified';
  end if;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data)
values('9f000000-0000-4000-8000-000000000001','ai-quota-smoke@example.invalid','{"display_name":"Synthetic quota smoke"}'::jsonb);

do $$
begin
  if not exists(select 1 from public.profiles where id='9f000000-0000-4000-8000-000000000001' and not is_admin) then
    raise exception 'expected ordinary profile creation trigger did not run';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  v_user uuid:='9f000000-0000-4000-8000-000000000001';
  v_resume uuid:=gen_random_uuid();
  v_run uuid:=gen_random_uuid();
  v_late_run uuid:=gen_random_uuid();
  v_unlinked_run uuid:=gen_random_uuid();
  v_task uuid;
  v_late_task uuid;
  v_unlinked_task uuid:=gen_random_uuid();
  v_today date:=timezone('Asia/Shanghai',now())::date;
  v_result jsonb;
  v_output jsonb;
  v_count integer;
begin
  insert into public.resumes(id,user_id,name,storage_path,mime_type,size_bytes,parsed_text,parse_status)
  values(v_resume,v_user,'Synthetic quota smoke',v_user::text||'/quota-smoke.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',1,'Synthetic content only','ready');
  v_output:=jsonb_build_object('score',80,'matchedKeywords','[]'::jsonb,'missingKeywords','[]'::jsonb,
    'risks','[]'::jsonb,'suggestions','[]'::jsonb,'context',jsonb_build_object('resumeId',v_resume));

  v_result:=public.reserve_ai_usage_server(v_user,'resume_optimization',gen_random_uuid(),'smoke-current',true);
  if not (v_result->>'reserved')::boolean then raise exception 'first reservation failed'; end if;
  v_task:=(v_result->>'taskId')::uuid;
  insert into public.ai_runs(id,user_id,kind,provider,status,input_fingerprint)
  values(v_run,v_user,'job_match','synthetic-test','running','smoke-current');
  perform public.bind_ai_usage_run_server(v_user,v_task,v_run);
  update public.ai_runs set status='completed',output=v_output where id=v_run;

  -- Simulates both completion responses being lost: only the linked saved run remains.
  v_result:=public.reconcile_ai_usage_server(v_user,50);
  if (v_result->>'completed')::integer<>1 then raise exception 'one saved run was not reconciled'; end if;
  if not exists(select 1 from public.ai_usage_tasks where id=v_task and status='completed'
    and execution_run_id=v_run and result_run_id=v_run and quota_date=v_today) then
    raise exception 'task completion changed ownership, run or billing day';
  end if;
  if (private.ai_quota_for_user(v_user)->>'used')::integer<>1 then raise exception 'first result must use exactly one allowance'; end if;

  v_result:=public.reconcile_ai_usage_server(v_user,50);
  if (v_result->>'completed')::integer<>0 then raise exception 'repeat reconciliation billed twice'; end if;
  perform public.complete_ai_usage_server(v_user,v_task,v_run);
  if (private.ai_quota_for_user(v_user)->>'used')::integer<>1 then raise exception 'explicit completion retry billed twice'; end if;
  select count(*)::integer into v_count from public.ai_usage_tasks where user_id=v_user;
  if v_count<>1 then raise exception 'reconciliation created another usage row'; end if;

  v_result:=public.reserve_ai_usage_server(v_user,'resume_optimization',gen_random_uuid(),'smoke-late',true);
  v_late_task:=(v_result->>'taskId')::uuid;
  insert into public.ai_runs(id,user_id,kind,provider,status,input_fingerprint)
  values(v_late_run,v_user,'job_match','synthetic-test','running','smoke-late');
  perform public.bind_ai_usage_run_server(v_user,v_late_task,v_late_run);
  update public.ai_usage_tasks set status='expired',created_at=now()-interval '1 day',quota_date=v_today-1 where id=v_late_task;
  update public.ai_runs set status='completed',output=v_output where id=v_late_run;
  v_result:=public.reconcile_ai_usage_server(v_user,50);
  if (v_result->>'completed')::integer<>1 then raise exception 'late saved result was not reconciled'; end if;
  if not exists(select 1 from public.ai_usage_tasks where id=v_late_task and status='completed' and quota_date=v_today-1) then
    raise exception 'late result moved to a different billing day';
  end if;
  if (private.ai_quota_for_user(v_user)->>'used')::integer<>1 then raise exception 'late result consumed today allowance'; end if;

  -- Historical run with a matching fingerprint but NO recorded execution binding.
  insert into public.ai_usage_tasks(id,user_id,kind,status,operation_key,input_fingerprint,quota_date,created_at)
  values(v_unlinked_task,v_user,'resume_optimization','expired',gen_random_uuid(),'smoke-unlinked',v_today-1,now()-interval '1 day');
  insert into public.ai_runs(id,user_id,kind,provider,status,input_fingerprint,output)
  values(v_unlinked_run,v_user,'job_match','synthetic-test','completed','smoke-unlinked',v_output);
  v_result:=public.reconcile_ai_usage_server(v_user,50);
  if (v_result->>'completed')::integer<>0 then raise exception 'unlinked historical result was guessed'; end if;
  if not exists(select 1 from public.ai_usage_tasks where id=v_unlinked_task and status='expired' and execution_run_id is null and result_run_id is null) then
    raise exception 'unlinked history was mutated';
  end if;
  if (private.ai_quota_for_user(v_user)->>'used')::integer<>1 then raise exception 'unlinked history changed current quota'; end if;
  if not exists(select 1 from public.ai_runs where id=v_run and output=v_output and status='completed') then
    raise exception 'saved result was modified';
  end if;
end;
$$;

reset role;
select 'passed: exact binding, once-only settlement, original quota date, unlinked history excluded' as result;
rollback;

-- Both must be zero after the rollback. No private account details are returned.
select
  (select count(*)::integer from auth.users where id='9f000000-0000-4000-8000-000000000001') as remaining_auth_users,
  (select count(*)::integer from public.ai_usage_tasks where user_id='9f000000-0000-4000-8000-000000000001') as remaining_usage_tasks;

-- Synthetic accounts exist only within this rolled-back transaction. No emails or AI calls.
begin;
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); op uuid := gen_random_uuid();
  task uuid; run uuid; other_run uuid; result jsonb; blocked boolean;
begin
  if has_function_privilege('anon','public.reserve_ai_usage_server(uuid,text,uuid,text,boolean)','execute')
    or has_function_privilege('authenticated','public.reserve_ai_usage_server(uuid,text,uuid,text,boolean)','execute')
    or has_function_privilege('authenticated','public.complete_ai_usage_server(uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.release_ai_usage_server(uuid,uuid)','execute') then
    raise exception 'Public clients may mutate server quota';
  end if;
  insert into auth.users(id,email,raw_user_meta_data) values
    (a,'quota-check-'||a::text||'@example.invalid','{}'),
    (b,'quota-check-'||b::text||'@example.invalid','{}');
  update public.profiles set ai_daily_limit=2 where id in (a,b);
  execute 'set local role service_role';
  if current_user <> 'service_role' then raise exception 'Fixture must execute as service_role'; end if;
  result := public.reserve_ai_usage_server(a,'resume_optimization',op,'fingerprint-a',false);
  if not (result->>'reserved')::boolean then raise exception 'First lease not granted'; end if;
  task := (result->>'taskId')::uuid;
  result := public.reserve_ai_usage_server(a,'resume_optimization',op,'fingerprint-a',false);
  if (result->>'reserved')::boolean then raise exception 'Same operation got two execution leases'; end if;
  result := public.reserve_ai_usage_server(a,'resume_optimization',gen_random_uuid(),'fingerprint-a',true);
  if (result->>'reserved')::boolean then raise exception 'Concurrent same input got two execution leases'; end if;
  blocked := false;
  begin
    perform public.reserve_ai_usage_server(a,'resume_optimization',op,'changed-input',false);
  exception when raise_exception then
    if sqlerrm <> 'AI operation input mismatch' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Operation accepted different input'; end if;
  blocked := false;
  begin
    perform public.reserve_ai_usage_server(a,'interview_prep',op,'fingerprint-a',false);
  exception when raise_exception then
    if sqlerrm <> 'AI operation input mismatch' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Operation accepted different kind'; end if;

  insert into public.ai_runs(user_id,kind,provider,status,input_fingerprint,output)
  values(b,'job_match','fixture','completed','fingerprint-a','{}') returning id into other_run;
  blocked := false;
  begin
    perform public.complete_ai_usage_server(a,task,other_run);
  exception when raise_exception then
    if sqlerrm <> 'AI result does not match task' then raise; end if;
    blocked := true;
  end;
  if not blocked then raise exception 'Cross-owner result accepted'; end if;
  insert into public.ai_runs(user_id,kind,provider,status,input_fingerprint,output)
  values(a,'job_match','fixture','completed','fingerprint-a','{}') returning id into run;
  perform public.complete_ai_usage_server(a,task,run);
  perform public.complete_ai_usage_server(a,task,run);
  result := public.reserve_ai_usage_server(a,'resume_optimization',op,'fingerprint-a',false);
  if not (result->>'cached')::boolean or (result->>'reserved')::boolean then raise exception 'Completed retry not cached'; end if;
  result := public.reserve_ai_usage_server(a,'interview_prep',gen_random_uuid(),'interview-input',false);
  if not (result->>'reserved')::boolean then raise exception 'Shared second slot not reserved'; end if;
  task := (result->>'taskId')::uuid;
  result := public.reserve_ai_usage_server(a,'interview_prep',gen_random_uuid(),'third-input',false);
  if (result->>'allowed')::boolean then raise exception 'Shared quota exceeded'; end if;
  perform public.release_ai_usage_server(b,task);
  if (select status from public.ai_usage_tasks where id=task) <> 'reserved' then raise exception 'Cross-owner release accepted'; end if;
  perform public.release_ai_usage_server(a,task);
  result := public.reserve_ai_usage_server(a,'interview_prep',gen_random_uuid(),'third-input',false);
  if not (result->>'reserved')::boolean then raise exception 'Failed task slot not returned'; end if;
  execute 'reset role';
end;
$$;
select 'passed: private quota mutations, single execution leases, binding, ownership, shared quota and refund' as result;
rollback;

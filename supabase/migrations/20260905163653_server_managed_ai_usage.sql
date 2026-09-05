-- Additive rollout: deploy these service-only RPCs first, then deploy the app.
-- Revoke the legacy user-callable mutation RPCs only after that deployment.
create or replace function private.ai_quota_for_user(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_today date := timezone('Asia/Shanghai', now())::date;
  v_limit integer;
  v_used integer;
begin
  select ai_daily_limit into v_limit from public.profiles where id=p_user_id;
  if v_limit is null then raise exception 'profile not found'; end if;
  select count(*)::integer into v_used from public.ai_usage_tasks
  where user_id=p_user_id and quota_date=v_today
    and (status='completed' or (status='reserved' and created_at >= now()-interval '30 minutes'));
  return jsonb_build_object('limit',v_limit,'used',v_used,'remaining',greatest(v_limit-v_used,0),
    'resetAt',(v_today+1)::timestamp at time zone 'Asia/Shanghai');
end;
$$;

create or replace function public.reserve_ai_usage_server(
  p_user_id uuid, p_kind text, p_operation_key uuid, p_input_fingerprint text,
  p_force_new boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_today date := timezone('Asia/Shanghai', now())::date;
  v_limit integer;
  v_used integer;
  v_task public.ai_usage_tasks;
begin
  if p_user_id is null or p_operation_key is null then raise exception 'user and operation required'; end if;
  if p_kind is null or p_kind not in ('resume_optimization','interview_prep') then raise exception 'invalid AI task kind'; end if;
  if nullif(trim(p_input_fingerprint),'') is null then raise exception 'input fingerprint required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select ai_daily_limit into v_limit from public.profiles where id=p_user_id for update;
  if v_limit is null then raise exception 'profile not found'; end if;
  update public.ai_usage_tasks set status='expired', updated_at=now()
  where user_id=p_user_id and status='reserved' and created_at < now()-interval '30 minutes';

  select * into v_task from public.ai_usage_tasks where user_id=p_user_id and operation_key=p_operation_key;
  if found then
    if v_task.kind <> p_kind or v_task.input_fingerprint <> p_input_fingerprint then
      raise exception 'AI operation input mismatch';
    end if;
    if v_task.status in ('reserved','completed') then
      -- A retry is not a second execution lease, even if the operation key matches.
      return jsonb_build_object('allowed',true,'cached',v_task.status='completed','reserved',false,
        'taskId',v_task.id,'taskStatus',v_task.status,'resultRunId',v_task.result_run_id,
        'quota',private.ai_quota_for_user(p_user_id));
    end if;
    delete from public.ai_usage_tasks where id=v_task.id and user_id=p_user_id;
  end if;

  select * into v_task from public.ai_usage_tasks
  where user_id=p_user_id and kind=p_kind and input_fingerprint=p_input_fingerprint and status='reserved'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('allowed',true,'cached',false,'reserved',false,'taskId',v_task.id,
      'taskStatus','reserved','resultRunId',null,'quota',private.ai_quota_for_user(p_user_id));
  end if;
  if not coalesce(p_force_new,false) then
    select t.* into v_task from public.ai_usage_tasks t
    join public.ai_runs r on r.id=t.result_run_id and r.user_id=t.user_id and r.status='completed'
    where t.user_id=p_user_id and t.kind=p_kind and t.input_fingerprint=p_input_fingerprint
      and t.status='completed' and r.input_fingerprint=p_input_fingerprint
      and r.kind=case p_kind when 'resume_optimization' then 'job_match' else 'interview_prep' end
    order by t.created_at desc limit 1;
    if found then
      return jsonb_build_object('allowed',true,'cached',true,'reserved',false,'taskId',v_task.id,
        'taskStatus',v_task.status,'resultRunId',v_task.result_run_id,'quota',private.ai_quota_for_user(p_user_id));
    end if;
  end if;

  select count(*)::integer into v_used from public.ai_usage_tasks
  where user_id=p_user_id and quota_date=v_today and status in ('reserved','completed');
  if v_used >= v_limit then
    return jsonb_build_object('allowed',false,'cached',false,'reserved',false,'taskId',null,
      'taskStatus','limit_reached','resultRunId',null,'quota',private.ai_quota_for_user(p_user_id));
  end if;
  insert into public.ai_usage_tasks(user_id,kind,status,operation_key,input_fingerprint,quota_date)
  values(p_user_id,p_kind,'reserved',p_operation_key,p_input_fingerprint,v_today) returning * into v_task;
  return jsonb_build_object('allowed',true,'cached',false,'reserved',true,'taskId',v_task.id,
    'taskStatus','reserved','resultRunId',null,'quota',private.ai_quota_for_user(p_user_id));
end;
$$;

create or replace function public.complete_ai_usage_server(p_user_id uuid,p_task_id uuid,p_result_run_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_task public.ai_usage_tasks;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'profile not found'; end if;
  select * into v_task from public.ai_usage_tasks where id=p_task_id and user_id=p_user_id for update;
  if not found then raise exception 'AI task not found'; end if;
  if v_task.status not in ('reserved','completed') then raise exception 'AI task is not active'; end if;
  if v_task.status='completed' and v_task.result_run_id is distinct from p_result_run_id then
    raise exception 'AI task already completed with a different result';
  end if;
  if not exists(select 1 from public.ai_runs where id=p_result_run_id and user_id=p_user_id
    and status='completed' and input_fingerprint=v_task.input_fingerprint
    and kind=case v_task.kind when 'resume_optimization' then 'job_match' else 'interview_prep' end) then
    raise exception 'AI result does not match task';
  end if;
  update public.ai_usage_tasks set status='completed',result_run_id=p_result_run_id,updated_at=now()
  where id=p_task_id and user_id=p_user_id;
  return private.ai_quota_for_user(p_user_id);
end;
$$;

create or replace function public.release_ai_usage_server(p_user_id uuid,p_task_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null then raise exception 'user required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'profile not found'; end if;
  update public.ai_usage_tasks set status='released',updated_at=now()
  where id=p_task_id and user_id=p_user_id and status='reserved';
  return private.ai_quota_for_user(p_user_id);
end;
$$;

revoke all on function private.ai_quota_for_user(uuid) from public,anon,authenticated;
revoke all on function public.reserve_ai_usage_server(uuid,text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.complete_ai_usage_server(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.release_ai_usage_server(uuid,uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.ai_quota_for_user(uuid) to service_role;
grant execute on function public.reserve_ai_usage_server(uuid,text,uuid,text,boolean) to service_role;
grant execute on function public.complete_ai_usage_server(uuid,uuid,uuid) to service_role;
grant execute on function public.release_ai_usage_server(uuid,uuid) to service_role;

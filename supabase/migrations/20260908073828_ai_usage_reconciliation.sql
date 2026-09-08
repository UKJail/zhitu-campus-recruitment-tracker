-- Deploy before the app binds runs. No historical task is inferred from a
-- fingerprint: the execution link must have been recorded before generation.
alter table public.ai_usage_tasks add column if not exists execution_run_id uuid
  references public.ai_runs(id) on delete set null;
create unique index if not exists ai_usage_tasks_execution_run_unique
  on public.ai_usage_tasks(execution_run_id) where execution_run_id is not null;
create index if not exists ai_usage_tasks_reconciliation_idx
  on public.ai_usage_tasks(user_id,created_at,id)
  where execution_run_id is not null and status in ('reserved','expired');

create or replace function public.bind_ai_usage_run_server(p_user_id uuid,p_task_id uuid,p_run_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_task public.ai_usage_tasks;
begin
  if p_user_id is null or p_task_id is null or p_run_id is null then raise exception 'binding identifiers required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'profile not found'; end if;
  select * into v_task from public.ai_usage_tasks where id=p_task_id and user_id=p_user_id for update;
  if not found or v_task.status<>'reserved' or v_task.created_at<now()-interval '30 minutes' then
    raise exception 'AI task has no active execution lease';
  end if;
  if v_task.execution_run_id is not null and v_task.execution_run_id<>p_run_id then
    raise exception 'AI task is already bound to another run';
  end if;
  if not exists(select 1 from public.ai_runs r where r.id=p_run_id and r.user_id=p_user_id
    and r.status='running' and r.input_fingerprint=v_task.input_fingerprint
    and r.created_at>=v_task.created_at
    and r.kind=case v_task.kind when 'resume_optimization' then 'job_match' else 'interview_prep' end) then
    raise exception 'AI execution does not match task';
  end if;
  update public.ai_usage_tasks set execution_run_id=p_run_id where id=p_task_id;
  return true;
end;
$$;

-- Structural artifact checks are deliberately fail-closed. The application
-- validates complete provider schemas before saving; malformed/missing artifacts
-- are retained for inspection, never generated again or billed by this worker.
create or replace function private.ai_usage_saved_result(p_task_id uuid,p_run_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(
    select 1 from public.ai_usage_tasks t join public.ai_runs r on r.id=p_run_id
    where t.id=p_task_id and r.user_id=t.user_id and r.status='completed'
      and r.input_fingerprint=t.input_fingerprint
      and r.kind=case t.kind when 'resume_optimization' then 'job_match' else 'interview_prep' end
      and jsonb_typeof(r.output)='object'
      and case when t.kind='resume_optimization' then
        jsonb_typeof(r.output->'score')='number'
        and r.output->'score'>='0'::jsonb and r.output->'score'<='100'::jsonb
        and jsonb_typeof(r.output->'matchedKeywords')='array'
        and jsonb_typeof(r.output->'missingKeywords')='array'
        and jsonb_typeof(r.output->'risks')='array'
        and jsonb_typeof(r.output->'suggestions')='array'
        and exists(select 1 from public.resumes s where s.id::text=r.output#>>'{context,resumeId}' and s.user_id=t.user_id)
      else exists(select 1 from public.interview_preparations p
        where p.id::text=r.output->>'preparationId' and p.user_id=t.user_id
          and jsonb_typeof(p.result)='object' and jsonb_typeof(p.result->'summary')='string'
          and jsonb_typeof(p.result->'roleSignals')='array'
          and jsonb_typeof(p.result->'questions')='array'
          and case when jsonb_typeof(p.result->'roleSignals')='array' then jsonb_array_length(p.result->'roleSignals') between 3 and 5 else false end
          and case when jsonb_typeof(p.result->'questions')='array' then jsonb_array_length(p.result->'questions') between 6 and 12 else false end
          and jsonb_typeof(p.result->'riskWarnings')='array'
          and jsonb_typeof(p.result->'preparationChecklist')='array'
          and nullif(p.resume_storage_path,'') is not null)
      end
  );
$$;

create or replace function public.reconcile_ai_usage_server(p_user_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_candidate record;
  v_task public.ai_usage_tasks;
  v_completed integer:=0;
  v_released integer:=0;
  v_examined integer:=0;
  v_locked integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'batch limit must be 1..100'; end if;
  -- Acquire account locks before row locks, in stable order. Busy accounts are
  -- retried by the next maintenance pass; a batch cannot stall live requests.
  for v_candidate in
    select t.id,t.user_id from public.ai_usage_tasks t
    join public.ai_runs r on r.id=t.execution_run_id and r.user_id=t.user_id
    where t.status in ('reserved','expired') and (p_user_id is null or t.user_id=p_user_id)
      and r.input_fingerprint=t.input_fingerprint
      and r.kind=case t.kind when 'resume_optimization' then 'job_match' else 'interview_prep' end
      and (private.ai_usage_saved_result(t.id,r.id) or (r.status='failed' and r.output is null))
    order by t.user_id,t.created_at,t.id limit p_limit
  loop
    v_examined:=v_examined+1;
    if not pg_try_advisory_xact_lock(hashtextextended(v_candidate.user_id::text,0)) then
      v_locked:=v_locked+1; continue;
    end if;
    perform 1 from public.profiles where id=v_candidate.user_id for update;
    if not found then continue; end if;
    select * into v_task from public.ai_usage_tasks
    where id=v_candidate.id and user_id=v_candidate.user_id for update;
    if not found or v_task.status not in ('reserved','expired') then continue; end if;
    if private.ai_usage_saved_result(v_task.id,v_task.execution_run_id) then
      -- Never change quota_date: a delayed result belongs to its original day.
      update public.ai_usage_tasks set status='completed',result_run_id=execution_run_id,updated_at=now()
      where id=v_task.id;
      v_completed:=v_completed+1;
    elsif exists(select 1 from public.ai_runs r where r.id=v_task.execution_run_id and r.user_id=v_task.user_id
      and r.status='failed' and r.output is null and r.input_fingerprint=v_task.input_fingerprint
      and r.kind=case v_task.kind when 'resume_optimization' then 'job_match' else 'interview_prep' end) then
      update public.ai_usage_tasks set status='released',updated_at=now() where id=v_task.id;
      v_released:=v_released+1;
    end if;
  end loop;
  return jsonb_build_object('completed',v_completed,'released',v_released,'examined',v_examined,'skippedLocked',v_locked);
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
  if v_task.execution_run_id is not null and v_task.execution_run_id is distinct from p_result_run_id then
    raise exception 'AI result differs from bound execution';
  end if;
  if v_task.status not in ('reserved','completed') and not (
    v_task.status='expired' and v_task.execution_run_id=p_result_run_id
  ) then raise exception 'AI task is not active'; end if;
  if v_task.status='completed' then
    if v_task.result_run_id is distinct from p_result_run_id then raise exception 'AI task already completed with a different result'; end if;
    return private.ai_quota_for_user(p_user_id);
  end if;
  -- Old application instances remain usable during additive deployment, but
  -- only explicitly bound runs are eligible for automatic recovery.
  if v_task.execution_run_id is not null then
    if not private.ai_usage_saved_result(p_task_id,p_result_run_id) then raise exception 'AI saved artifact is missing or invalid'; end if;
  elsif not exists(select 1 from public.ai_runs where id=p_result_run_id and user_id=p_user_id
    and status='completed' and input_fingerprint=v_task.input_fingerprint
    and kind=case v_task.kind when 'resume_optimization' then 'job_match' else 'interview_prep' end) then
    raise exception 'AI result does not match task';
  end if;
  update public.ai_usage_tasks set status='completed',result_run_id=p_result_run_id,updated_at=now()
  where id=p_task_id and user_id=p_user_id;
  return private.ai_quota_for_user(p_user_id);
end;
$$;

revoke all on function public.bind_ai_usage_run_server(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function private.ai_usage_saved_result(uuid,uuid) from public,anon,authenticated;
revoke all on function public.reconcile_ai_usage_server(uuid,integer) from public,anon,authenticated;
revoke all on function public.complete_ai_usage_server(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.bind_ai_usage_run_server(uuid,uuid,uuid) to service_role;
grant execute on function private.ai_usage_saved_result(uuid,uuid) to service_role;
grant execute on function public.reconcile_ai_usage_server(uuid,integer) to service_role;
grant execute on function public.complete_ai_usage_server(uuid,uuid,uuid) to service_role;
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
  perform public.reconcile_ai_usage_server(p_user_id,100);
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
    if v_task.execution_run_id is not null then
      -- A bound expired/released task is history, not a reusable execution lease.
      -- Retry requires an explicit fresh operation ID; never delete its link.
      return jsonb_build_object('allowed',true,'cached',false,'reserved',false,
        'taskId',v_task.id,'taskStatus',v_task.status,'resultRunId',null,
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

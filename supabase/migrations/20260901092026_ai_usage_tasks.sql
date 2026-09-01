create table public.ai_usage_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('resume_optimization', 'interview_prep')),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released', 'expired')),
  operation_key uuid not null,
  input_fingerprint text not null,
  quota_date date not null,
  result_run_id uuid references public.ai_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, operation_key)
);

create index ai_usage_tasks_user_quota_idx
  on public.ai_usage_tasks (user_id, quota_date, status);

create index ai_usage_tasks_user_fingerprint_idx
  on public.ai_usage_tasks (user_id, kind, input_fingerprint, created_at desc)
  where status = 'completed';

alter table public.ai_usage_tasks enable row level security;
revoke all on public.ai_usage_tasks from anon, authenticated;

create trigger ai_usage_tasks_updated_at
  before update on public.ai_usage_tasks
  for each row execute function private.set_updated_at();

create or replace function public.get_ai_quota()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (timezone('Asia/Shanghai', now()))::date;
  v_limit integer;
  v_used integer;
  v_reset_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select ai_daily_limit into v_limit
  from public.profiles
  where id = v_user_id;

  if v_limit is null then
    raise exception 'profile not found';
  end if;

  select count(*)::integer into v_used
  from public.ai_usage_tasks
  where user_id = v_user_id
    and quota_date = v_today
    and (
      status = 'completed'
      or (status = 'reserved' and created_at >= now() - interval '30 minutes')
    );

  v_reset_at := ((v_today + 1)::timestamp at time zone 'Asia/Shanghai');

  return jsonb_build_object(
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'resetAt', v_reset_at
  );
end;
$$;

create or replace function public.reserve_ai_usage(
  p_kind text,
  p_operation_key uuid,
  p_input_fingerprint text,
  p_force_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date := (timezone('Asia/Shanghai', now()))::date;
  v_limit integer;
  v_used integer;
  v_existing public.ai_usage_tasks;
  v_task public.ai_usage_tasks;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_kind not in ('resume_optimization', 'interview_prep') then
    raise exception 'invalid AI task kind';
  end if;
  if nullif(trim(p_input_fingerprint), '') is null then
    raise exception 'input fingerprint required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  update public.ai_usage_tasks
  set status = 'expired', updated_at = now()
  where user_id = v_user_id
    and status = 'reserved'
    and created_at < now() - interval '30 minutes';

  select * into v_existing
  from public.ai_usage_tasks
  where user_id = v_user_id and operation_key = p_operation_key;

  if found and v_existing.status in ('reserved', 'completed') then
    return jsonb_build_object(
      'allowed', true,
      'cached', v_existing.status = 'completed',
      'reserved', v_existing.status = 'reserved',
      'taskId', v_existing.id,
      'taskStatus', v_existing.status,
      'resultRunId', v_existing.result_run_id,
      'quota', public.get_ai_quota()
    );
  end if;

  if found then
    delete from public.ai_usage_tasks
    where id = v_existing.id and user_id = v_user_id;
  end if;

  if not p_force_new then
    select * into v_existing
    from public.ai_usage_tasks
    where user_id = v_user_id
      and kind = p_kind
      and input_fingerprint = p_input_fingerprint
      and status = 'completed'
    order by created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'allowed', true,
        'cached', true,
        'reserved', false,
        'taskId', v_existing.id,
        'taskStatus', v_existing.status,
        'resultRunId', v_existing.result_run_id,
        'quota', public.get_ai_quota()
      );
    end if;
  end if;

  select ai_daily_limit into v_limit
  from public.profiles
  where id = v_user_id
  for update;

  if v_limit is null then
    raise exception 'profile not found';
  end if;

  select count(*)::integer into v_used
  from public.ai_usage_tasks
  where user_id = v_user_id
    and quota_date = v_today
    and status in ('reserved', 'completed');

  if v_used >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'cached', false,
      'reserved', false,
      'taskId', null,
      'taskStatus', 'limit_reached',
      'resultRunId', null,
      'quota', public.get_ai_quota()
    );
  end if;

  insert into public.ai_usage_tasks (
    user_id, kind, status, operation_key, input_fingerprint, quota_date
  ) values (
    v_user_id, p_kind, 'reserved', p_operation_key, p_input_fingerprint, v_today
  ) returning * into v_task;

  return jsonb_build_object(
    'allowed', true,
    'cached', false,
    'reserved', true,
    'taskId', v_task.id,
    'taskStatus', v_task.status,
    'resultRunId', null,
    'quota', public.get_ai_quota()
  );
end;
$$;

create or replace function public.complete_ai_usage(
  p_task_id uuid,
  p_result_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_task public.ai_usage_tasks;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_task
  from public.ai_usage_tasks
  where id = p_task_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'AI task not found';
  end if;
  if v_task.status not in ('reserved', 'completed') then
    raise exception 'AI task is not active';
  end if;

  update public.ai_usage_tasks
  set status = 'completed', result_run_id = p_result_run_id, updated_at = now()
  where id = v_task.id and user_id = v_user_id;

  return public.get_ai_quota();
end;
$$;

create or replace function public.release_ai_usage(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public.ai_usage_tasks
  set status = 'released', updated_at = now()
  where id = p_task_id
    and user_id = v_user_id
    and status = 'reserved';

  return public.get_ai_quota();
end;
$$;

revoke execute on function public.get_ai_quota() from public, anon;
revoke execute on function public.reserve_ai_usage(text, uuid, text, boolean) from public, anon;
revoke execute on function public.complete_ai_usage(uuid, uuid) from public, anon;
revoke execute on function public.release_ai_usage(uuid) from public, anon;

grant execute on function public.get_ai_quota() to authenticated;
grant execute on function public.reserve_ai_usage(text, uuid, text, boolean) to authenticated;
grant execute on function public.complete_ai_usage(uuid, uuid) to authenticated;
grant execute on function public.release_ai_usage(uuid) to authenticated;

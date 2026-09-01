create index if not exists ai_usage_tasks_result_run_idx
  on public.ai_usage_tasks(result_run_id)
  where result_run_id is not null;

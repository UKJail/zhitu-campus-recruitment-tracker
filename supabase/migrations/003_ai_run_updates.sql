create policy ai_runs_update_own on public.ai_runs for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant update (status, output, error_code) on public.ai_runs to authenticated;

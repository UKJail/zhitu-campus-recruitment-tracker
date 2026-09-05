-- Apply only after the application uses the *_server RPCs.
-- Keep get_ai_quota() available for authenticated users to read their own quota.
revoke all on function public.reserve_ai_usage(text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.complete_ai_usage(uuid,uuid) from public,anon,authenticated;
revoke all on function public.release_ai_usage(uuid) from public,anon,authenticated;

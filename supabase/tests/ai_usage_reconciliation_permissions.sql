-- Read-only role audit. Each denied role should report execute_allowed=false;
-- service_role should report true. security_definer must remain false.
select x.role_name,x.function_name,
  has_function_privilege(x.role_name,x.function_name,'EXECUTE') as execute_allowed,
  p.prosecdef as security_definer
from (
  select r.role_name,f.function_name
  from (values('anon'),('authenticated'),('service_role')) as r(role_name)
  cross join (values
    ('public.bind_ai_usage_run_server(uuid,uuid,uuid)'),
    ('public.reconcile_ai_usage_server(uuid,integer)'),
    ('public.complete_ai_usage_server(uuid,uuid,uuid)'),
    ('public.reserve_ai_usage_server(uuid,text,uuid,text,boolean)'),
    ('private.ai_usage_saved_result(uuid,uuid)')
  ) as f(function_name)
) x
join pg_proc p on p.oid=x.function_name::regprocedure
order by x.function_name,x.role_name;

select
  c.relrowsecurity as usage_table_rls,
  has_table_privilege('anon','public.ai_usage_tasks','SELECT,INSERT,UPDATE,DELETE') as anon_table_access,
  has_table_privilege('authenticated','public.ai_usage_tasks','SELECT,INSERT,UPDATE,DELETE') as authenticated_table_access
from pg_class c where c.oid='public.ai_usage_tasks'::regclass;

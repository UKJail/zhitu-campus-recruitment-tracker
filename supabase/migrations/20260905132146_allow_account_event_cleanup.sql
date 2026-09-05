-- Keep history immutable for existing accounts. Only Auth-user deletion may
-- cascade into event cleanup. A private definer lookup is needed because the
-- Auth deletion role and application roles have different table privileges.
create or replace function private.prevent_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and pg_trigger_depth() > 1
    and not exists (select 1 from auth.users where id = old.user_id)
  then
    return old;
  end if;
  raise exception 'application events are append-only';
end;
$$;

revoke execute on function private.prevent_event_mutation() from public, anon, authenticated;

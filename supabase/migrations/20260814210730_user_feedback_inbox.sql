create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint user_feedback_content_length check (char_length(btrim(content)) between 2 and 2000)
);

create index user_feedback_created_idx on public.user_feedback (created_at desc);
create index user_feedback_user_created_idx on public.user_feedback (user_id, created_at desc);

alter table public.user_feedback enable row level security;

create policy user_feedback_submit_own
  on public.user_feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.user_feedback from anon, authenticated;
grant insert on public.user_feedback to authenticated;
grant select, insert, update, delete on public.user_feedback to service_role;

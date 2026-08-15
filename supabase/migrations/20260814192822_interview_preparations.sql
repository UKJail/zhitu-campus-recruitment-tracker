create table public.interview_preparations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inbound_email_id uuid references public.inbound_emails(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  company text not null,
  role text not null,
  job_description text not null,
  resume_file_name text not null,
  resume_storage_path text not null,
  resume_text text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interview_preparations_user_created_idx
  on public.interview_preparations (user_id, created_at desc);
create index interview_preparations_inbound_email_idx
  on public.interview_preparations (inbound_email_id)
  where inbound_email_id is not null;
create index interview_preparations_application_idx
  on public.interview_preparations (application_id)
  where application_id is not null;

alter table public.interview_preparations enable row level security;
create policy interview_preparations_own on public.interview_preparations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.interview_preparations to authenticated;

create trigger interview_preparations_updated_at
  before update on public.interview_preparations
  for each row execute function private.set_updated_at();

alter table public.ai_runs drop constraint if exists ai_runs_kind_check;
alter table public.ai_runs add constraint ai_runs_kind_check
  check (kind in ('resume_parse', 'job_match', 'resume_rewrite', 'email_extract', 'interview_prep'));

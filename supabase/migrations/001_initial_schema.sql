create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.application_status as enum (
  'saved', 'preparing', 'applied', 'assessment',
  'interview', 'offer', 'rejected', 'closed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  ai_daily_limit integer not null default 20 check (ai_daily_limit between 0 and 500),
  inbound_alias text unique not null default encode(gen_random_bytes(10), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (email = lower(email)),
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  parsed_text text,
  structured_data jsonb,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'processing', 'ready', 'failed')),
  parse_error text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content jsonb not null,
  source text not null check (source in ('upload', 'ai_suggestion', 'manual')),
  created_at timestamptz not null default now()
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  kind text not null,
  enabled boolean not null default true,
  restricted_reason text,
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.job_sources(id) on delete set null,
  external_id text,
  company text not null,
  title text not null,
  location text not null,
  salary_text text,
  experience text,
  education text,
  description text not null,
  published_at timestamptz,
  expires_at timestamptz,
  apply_url text not null check (apply_url ~ '^https?://'),
  normalized_url text,
  fingerprint text not null unique,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table public.saved_jobs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete restrict,
  resume_version_id uuid references public.resume_versions(id) on delete set null,
  status public.application_status not null default 'saved',
  applied_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  from_status public.application_status,
  to_status public.application_status not null,
  source text not null check (source in ('user', 'email', 'system', 'admin')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_id text unique not null,
  sender text,
  subject text,
  body_text text,
  category text not null check (category in ('application', 'assessment', 'interview', 'offer', 'rejection', 'other')),
  extracted_data jsonb,
  received_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  read_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  round text not null,
  scheduled_at timestamptz,
  interviewer text,
  meeting_url text,
  created_at timestamptz not null default now()
);

create table public.interview_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete set null,
  resume_version_id uuid references public.resume_versions(id) on delete set null,
  questions text,
  answer_summary text,
  highlights text,
  improvements text,
  next_tasks text,
  next_round_prep text,
  score integer check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('resume_parse', 'job_match', 'resume_rewrite', 'email_extract')),
  provider text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  input_fingerprint text,
  output jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create table public.source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed', 'restricted')),
  jobs_seen integer not null default 0 check (jobs_seen >= 0),
  jobs_added integer not null default 0 check (jobs_added >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index resumes_user_updated_idx on public.resumes (user_id, updated_at desc);
create index resume_versions_user_created_idx on public.resume_versions (user_id, created_at desc);
create index jobs_source_published_idx on public.jobs (source_id, published_at desc);
create index jobs_location_published_idx on public.jobs (location, published_at desc);
create index applications_user_status_updated_idx on public.applications (user_id, status, updated_at desc);
create index application_events_user_created_idx on public.application_events (user_id, created_at desc);
create index application_events_application_created_idx on public.application_events (application_id, created_at desc);
create index inbound_emails_user_received_idx on public.inbound_emails (user_id, received_at desc) where deleted_at is null;
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index interviews_user_scheduled_idx on public.interviews (user_id, scheduled_at desc);
create index interview_reviews_user_created_idx on public.interview_reviews (user_id, created_at desc);
create index ai_runs_user_created_idx on public.ai_runs (user_id, created_at desc);
create index source_runs_source_started_idx on public.source_runs (source_id, started_at desc);

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.resumes enable row level security;
alter table public.resume_versions enable row level security;
alter table public.job_sources enable row level security;
alter table public.jobs enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.applications enable row level security;
alter table public.application_events enable row level security;
alter table public.inbound_emails enable row level security;
alter table public.notifications enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_reviews enable row level security;
alter table public.ai_runs enable row level security;
alter table public.source_runs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy resumes_own on public.resumes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy resume_versions_own on public.resume_versions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy job_sources_read on public.job_sources for select to authenticated using (true);
create policy jobs_read on public.jobs for select to authenticated using (true);
create policy saved_jobs_own on public.saved_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy applications_own on public.applications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy application_events_select_own on public.application_events for select to authenticated using ((select auth.uid()) = user_id);
create policy application_events_insert_own on public.application_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy inbound_emails_own on public.inbound_emails for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notifications_own on public.notifications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interviews_own on public.interviews for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy interview_reviews_own on public.interview_reviews for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_runs_select_own on public.ai_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_runs_insert_own on public.ai_runs for insert to authenticated with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.resumes, public.resume_versions, public.saved_jobs, public.applications, public.inbound_emails, public.notifications, public.interviews, public.interview_reviews to authenticated;
grant select, insert on public.application_events, public.ai_runs to authenticated;
grant select on public.jobs, public.job_sources to authenticated;
revoke all on public.invites, public.source_runs from anon, authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger resumes_updated_at before update on public.resumes for each row execute function private.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();
create trigger applications_updated_at before update on public.applications for each row execute function private.set_updated_at();
create trigger interview_reviews_updated_at before update on public.interview_reviews for each row execute function private.set_updated_at();

create or replace function private.prevent_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'application events are append-only';
end;
$$;
create trigger application_events_append_only before update or delete on public.application_events for each row execute function private.prevent_event_mutation();

create or replace function private.limit_active_resumes()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if new.active and (select count(*) from public.resumes where user_id = new.user_id and active and id <> new.id) >= 3 then
    raise exception 'active resume limit reached';
  end if;
  return new;
end;
$$;
create trigger active_resume_limit before insert or update of active on public.resumes for each row execute function private.limit_active_resumes();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 'resumes', false, 10485760,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy resumes_storage_select on storage.objects for select to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_storage_update on storage.objects for update to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy resumes_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

insert into public.job_sources (name, kind) values
  ('企业官网', 'public_page'),
  ('公开聚合源', 'feed'),
  ('猎聘', 'public_page'),
  ('智联招聘', 'public_page'),
  ('前程无忧', 'public_page')
on conflict (name) do nothing;

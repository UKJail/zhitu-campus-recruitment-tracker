alter table public.interviews
  add column company text,
  add column role text,
  add column updated_at timestamptz not null default now();

alter table public.interviews
  add constraint interviews_company_length
    check (company is null or length(btrim(company)) between 1 and 160),
  add constraint interviews_role_length
    check (role is null or length(btrim(role)) between 1 and 160);

create unique index interview_reviews_interview_id_key
  on public.interview_reviews (interview_id)
  where interview_id is not null;

comment on column public.interviews.company is
  'Snapshot of the company name for standalone interview records.';
comment on column public.interviews.role is
  'Snapshot of the role name for standalone interview records.';

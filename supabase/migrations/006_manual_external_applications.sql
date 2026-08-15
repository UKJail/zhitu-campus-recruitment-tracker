grant insert on public.jobs to authenticated;

create policy jobs_insert_manual_external
on public.jobs
for insert
to authenticated
with check (
  source_id is null
  and external_id is null
  and coalesce(raw_data ->> 'manual', 'false') = 'true'
  and apply_url ~ '^https?://'
  and normalized_url ~ '^https?://'
);

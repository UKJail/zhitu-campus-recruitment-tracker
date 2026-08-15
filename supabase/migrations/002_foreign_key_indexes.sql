create index applications_job_id_idx on public.applications (job_id);
create index applications_resume_version_id_idx on public.applications (resume_version_id) where resume_version_id is not null;
create index interview_reviews_interview_id_idx on public.interview_reviews (interview_id) where interview_id is not null;
create index interview_reviews_resume_version_id_idx on public.interview_reviews (resume_version_id) where resume_version_id is not null;
create index interviews_application_id_idx on public.interviews (application_id) where application_id is not null;
create index invites_created_by_idx on public.invites (created_by) where created_by is not null;
create index resume_versions_resume_id_idx on public.resume_versions (resume_id);
create index saved_jobs_job_id_idx on public.saved_jobs (job_id);

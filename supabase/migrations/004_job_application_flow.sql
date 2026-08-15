create or replace function public.prepare_job_application(p_job_id uuid)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications;
  v_from public.application_status;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  select * into v_application
  from public.applications
  where user_id = v_user_id and job_id = p_job_id
  for update;

  if not found then
    insert into public.applications (user_id, job_id, status)
    values (v_user_id, p_job_id, 'preparing')
    returning * into v_application;

    insert into public.application_events (application_id, user_id, from_status, to_status, source, metadata)
    values (v_application.id, v_user_id, null, 'preparing', 'user', '{"action":"opened_apply_url"}'::jsonb);
  elsif v_application.status = 'saved' then
    v_from := v_application.status;
    update public.applications
    set status = 'preparing'
    where id = v_application.id and user_id = v_user_id
    returning * into v_application;

    insert into public.application_events (application_id, user_id, from_status, to_status, source, metadata)
    values (v_application.id, v_user_id, v_from, 'preparing', 'user', '{"action":"opened_apply_url"}'::jsonb);
  end if;

  return v_application;
end;
$$;

create or replace function public.record_application_result(p_application_id uuid, p_outcome text)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications;
  v_target public.application_status;
  v_metadata jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_outcome not in ('applied', 'failed', 'later') then
    raise exception 'invalid application outcome';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;
  if v_application.status <> 'preparing' then
    raise exception 'only preparing applications can be confirmed';
  end if;

  v_target := case when p_outcome = 'applied' then 'applied'::public.application_status
                   when p_outcome = 'failed' then 'closed'::public.application_status
                   else 'preparing'::public.application_status end;
  v_metadata := jsonb_build_object('outcome', p_outcome);

  update public.applications
  set status = v_target,
      applied_confirmed_at = case when p_outcome = 'applied' then now() else applied_confirmed_at end
  where id = v_application.id and user_id = v_user_id
  returning * into v_application;

  insert into public.application_events (application_id, user_id, from_status, to_status, source, metadata)
  values (v_application.id, v_user_id, 'preparing', v_target, 'user', v_metadata);

  return v_application;
end;
$$;

revoke execute on function public.prepare_job_application(uuid) from public, anon;
revoke execute on function public.record_application_result(uuid, text) from public, anon;
grant execute on function public.prepare_job_application(uuid) to authenticated;
grant execute on function public.record_application_result(uuid, text) to authenticated;

insert into public.jobs (
  source_id, external_id, company, title, location, salary_text, experience, education,
  description, published_at, apply_url, normalized_url, fingerprint, raw_data
)
values
  ((select id from public.job_sources where name = '企业官网'), 'mvp-bytedance-ai-pm', '字节跳动', 'AI 产品经理', '上海', '30–45K · 15薪', '3–5年', '本科', '负责大模型产品规划、用户研究与商业化落地，推动研发、算法和设计团队协作。', now(), 'https://jobs.bytedance.com/', 'https://jobs.bytedance.com/', '字节跳动|ai产品经理|上海', '{"seed":"mvp","match":92,"tags":["大模型","产品策略","数据分析"]}'::jsonb),
  ((select id from public.job_sources where name = '猎聘'), 'mvp-ant-smart-service-pm', '蚂蚁集团', '高级产品经理（智能服务）', '杭州', '28–40K · 16薪', '3–5年', '本科', '负责智能服务产品矩阵，完成需求洞察、方案设计、指标建设和跨团队项目推进。', now() - interval '1 day', 'https://www.liepin.com/', 'https://www.liepin.com/', '蚂蚁集团|高级产品经理（智能服务）|杭州', '{"seed":"mvp","match":88,"tags":["AI Agent","B端产品","增长"]}'::jsonb),
  ((select id from public.job_sources where name = '智联招聘'), 'mvp-red-commercial-pm', '小红书', '商业产品经理', '上海', '25–40K · 14薪', '3–5年', '本科', '围绕品牌客户建设商业产品能力，以数据分析驱动产品迭代和收入增长。', now() - interval '2 days', 'https://www.zhaopin.com/', 'https://www.zhaopin.com/', '小红书|商业产品经理|上海', '{"seed":"mvp","match":83,"tags":["商业化","策略产品","SQL"]}'::jsonb),
  ((select id from public.job_sources where name = '前程无忧'), 'mvp-dewu-growth-pm', '得物App', '用户增长产品经理', '上海', '25–35K · 14薪', '3–5年', '本科', '搭建用户增长链路，设计实验并分析关键转化指标。', now() - interval '3 days', 'https://www.51job.com/', 'https://www.51job.com/', '得物app|用户增长产品经理|上海', '{"seed":"mvp","match":79,"tags":["增长","A/B测试","用户运营"]}'::jsonb),
  ((select id from public.job_sources where name = '公开聚合源'), 'mvp-ctrip-global-pm', '携程集团', '产品经理（国际化）', '上海', '22–35K · 14薪', '3–5年', '本科', '负责国际化业务产品体验，协同海外运营和研发完成产品交付。', now() - interval '4 days', 'https://careers.ctrip.com/', 'https://careers.ctrip.com/', '携程集团|产品经理（国际化）|上海', '{"seed":"mvp","match":76,"tags":["国际化","用户体验","英语"]}'::jsonb)
on conflict (fingerprint) do update set
  description = excluded.description,
  salary_text = excluded.salary_text,
  raw_data = excluded.raw_data,
  updated_at = now();

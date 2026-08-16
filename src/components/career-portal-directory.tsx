"use client";

import { ArrowUpRight, Building2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { careerPortalIndustries, filterCareerPortals, type CareerPortal } from "@/lib/jobs/career-portals";

const PAGE_SIZE = 24;

export function CareerPortalDirectory({ notify }: { notify: (message: string) => void }) {
  const [portals, setPortals] = useState<CareerPortal[]>([]);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("全部行业");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/career-portals", { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.portals)) throw new Error(payload.error || "企业入口加载失败");
        setPortals(payload.portals as CareerPortal[]);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "企业入口加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const industries = useMemo(() => careerPortalIndustries(portals), [portals]);
  const filtered = useMemo(() => filterCareerPortals(portals, query, industry), [portals, query, industry]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount);
  const visible = filtered.slice((visiblePage - 1) * PAGE_SIZE, visiblePage * PAGE_SIZE);

  return <>
    <section className="portal-directory-intro">
      <div><p className="eyebrow">企业校招入口</p><h3>从官网开始找机会</h3><span>收录 {portals.length || 690} 家企业的官方招聘入口。具体岗位请以企业官网实时信息为准。</span></div>
      <span className="portal-directory-mark"><Building2 size={20} /></span>
    </section>
    <section className="portal-filter-card">
      <label className="search-large"><Search /><input aria-label="搜索企业或行业" placeholder="搜索企业名称或行业" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
      <label className="portal-industry-filter"><span>行业</span><select aria-label="行业" value={industry} onChange={(event) => { setIndustry(event.target.value); setPage(1); }}><option>全部行业</option>{industries.map((item) => <option key={item}>{item}</option>)}</select></label>
    </section>
    <section className="portal-directory" aria-busy={loading}>
      <header><span>共找到 <strong>{filtered.length}</strong> 家企业</span><small>只提供官网入口，不计入岗位与投递统计</small></header>
      {loading ? <div className="jobs-empty"><span className="loading-dot" />正在加载企业入口…</div> : error ? <div className="jobs-empty"><strong>企业入口暂时无法加载</strong><span>{error}</span><button className="text-button" onClick={() => window.location.reload()}>刷新页面</button></div> : visible.length === 0 ? <div className="jobs-empty"><Search size={22} /><strong>没有找到对应企业</strong><span>换一个名称或行业关键词试试。</span></div> : <div className="portal-grid">{visible.map((portal) => <article className="portal-card" key={portal.key}>
        <span className="portal-monogram" aria-hidden="true">{portal.name.slice(0, 1)}</span>
        <div><h4>{portal.name}</h4><p>{portal.industry}</p></div>
        <a href={portal.url} target="_blank" rel="noopener noreferrer" onClick={() => notify(`正在打开 ${portal.name} 官方招聘网站`)}>进入官方招聘网站 <ArrowUpRight size={15} /></a>
      </article>)}</div>}
      {!loading && !error && filtered.length > PAGE_SIZE && <div className="pagination"><button disabled={visiblePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button><span>{visiblePage} / {pageCount}</span><button disabled={visiblePage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页</button></div>}
    </section>
  </>;
}

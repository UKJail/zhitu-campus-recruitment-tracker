"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, FileText, MailCheck, Sparkles, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { InterviewPreparation } from "@/lib/ai/provider";
import type { AIQuota } from "@/lib/ai/quota";

type Invitation = {
  id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
  company?: string;
  role?: string;
  jobDescription?: string;
};

type Preparation = {
  id: string;
  company: string;
  role: string;
  job_description: string;
  resume_file_name: string;
  result: InterviewPreparation;
  inbound_email_id: string | null;
  created_at: string;
  updated_at: string;
};

export function InterviewPrepPage({ notify, aiQuota, onQuotaChanged }: {
  notify: (message: string) => void;
  aiQuota: AIQuota;
  onQuotaChanged: (quota: AIQuota) => void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [activeQuestion, setActiveQuestion] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/interview-preparations", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "面试准备加载失败");
      setInvitations(Array.isArray(payload.invitations) ? payload.invitations : []);
      setPreparations(Array.isArray(payload.preparations) ? payload.preparations : []);
      setSelectedId((current) => current || payload.preparations?.[0]?.id || null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "面试准备加载失败");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(() => preparations.find((item) => item.id === selectedId) || null, [preparations, selectedId]);

  function chooseInvitation(invitation: Invitation) {
    setSelectedId(null);
    setSelectedInvitationId(invitation.id);
    setCompany(invitation.company || "");
    setRole(invitation.role || "");
    setJobDescription(invitation.jobDescription || "");
    setActiveQuestion(0);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    setFile(next);
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!file) return notify("请上传该岗位实际投递的 PDF 或 DOCX 简历");
    setGenerationError("");
    const form = new FormData();
    form.set("operationId", crypto.randomUUID());
    form.set("company", company);
    form.set("role", role);
    form.set("jobDescription", jobDescription);
    form.set("file", file);
    if (selectedInvitationId) form.set("inboundEmailId", selectedInvitationId);
    setGenerating(true);
    try {
      const response = await fetch("/api/interview-preparations", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (payload.quota) onQuotaChanged(payload.quota as AIQuota);
      if (!response.ok) throw new Error(payload.error || "生成失败");
      setPreparations((current) => [payload.preparation, ...current]);
      setSelectedId(payload.preparation.id);
      setSelectedInvitationId(null);
      setActiveQuestion(0);
      notify("面试准备题已生成并保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
      setGenerationError(message);
      notify(message);
    } finally {
      setGenerating(false);
    }
  }

  return <div className="page-stack interview-prep-page">
    <section className="page-intro prep-intro">
      <div><p className="eyebrow">面试准备</p><h2>把邀请，变成一场有准备的对话</h2><span>识别面试岗位，结合实际投递简历与 JD 生成可追溯的问题和回答框架。</span></div>
    </section>

    <div className="prep-layout">
      <aside className="panel prep-rail">
        <header><div><p className="eyebrow">面试邀请</p><h3>待准备岗位</h3></div><b>{invitations.length}</b></header>
        {loading ? <div className="prep-rail-empty"><Clock3 size={18} />正在识别邀请…</div> : invitations.length === 0 ? <div className="prep-rail-empty"><MailCheck size={22} /><strong>还没有面试邀请</strong><span>将招聘邮件转发到专属邮箱，识别后会出现在这里。你也可以直接在右侧手动填写。</span></div> : invitations.map((invitation) => <button type="button" className="invitation-card" key={invitation.id} onClick={() => chooseInvitation(invitation)}>
          <span className="invite-mark">{(invitation.company || invitation.subject || "面").slice(0, 1)}</span>
          <span><strong>{invitation.company || "待确认公司"}</strong><em>{invitation.role || invitation.subject || "待确认岗位"}</em><time>{new Date(invitation.received_at).toLocaleDateString("zh-CN")}</time></span>
        </button>)}
        <div className="prep-history-head"><span>已生成</span><b>{preparations.length}</b></div>
        {preparations.map((item) => <button type="button" className={`prep-history ${selectedId === item.id ? "active" : ""}`} key={item.id} onClick={() => { setSelectedId(item.id); setActiveQuestion(0); }}><span><strong>{item.company}</strong><em>{item.role}</em></span><time>{new Date(item.created_at).toLocaleDateString("zh-CN")}</time></button>)}
      </aside>

      <section className="panel prep-workspace">
        {!selected ? <>
          <header className="prep-workspace-head"><div><p className="eyebrow">生成新的准备题</p><h3>先确认岗位，再上传实际投递版本</h3></div><span>01 / 材料</span></header>
          <form className="prep-form" onSubmit={generate}>
            <div className="prep-fields"><label>公司<input required maxLength={120} value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：腾讯" /></label><label>岗位<input required maxLength={120} value={role} onChange={(event) => setRole(event.target.value)} placeholder="例如：市场营销（校招）" /></label></div>
            <label>岗位 JD<textarea required minLength={20} maxLength={100000} value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="粘贴完整岗位职责和任职要求；如果邀请已匹配到职位库，会自动带入。" /></label>
            <label className={`prep-upload ${file ? "has-file" : ""}`}><input type="file" accept=".pdf,.docx" onChange={chooseFile} /><span className="upload-orbit">{file ? <CheckCircle2 size={23} /> : <Upload size={23} />}</span><span><strong>{file?.name || "上传该岗位实际投递的简历"}</strong><small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · 将作为本次面试准备依据` : "支持 PDF、DOCX，不超过 10MB；不要上传其他版本"}</small></span></label>
            {generationError && <div className="prep-generation-error" role="alert"><AlertTriangle size={16} /><span><strong>这次没有生成成功</strong><small>{generationError}</small></span></div>}
            <div className="prep-generate-row"><span><Sparkles size={15} />成功生成计 1 次，失败不扣 · 今日剩余 {aiQuota.remaining}/{aiQuota.limit}</span><button className="primary-button" disabled={generating}>{generating ? <><Clock3 size={16} />正在生成题目…</> : <><Sparkles size={16} />生成面试准备题</>}</button></div>
          </form>
        </> : <PrepResult preparation={selected} activeQuestion={activeQuestion} setActiveQuestion={setActiveQuestion} onNew={() => { setSelectedId(null); setSelectedInvitationId(null); setCompany(""); setRole(""); setJobDescription(""); setFile(null); }} />}
      </section>
    </div>
  </div>;
}

function PrepResult({ preparation, activeQuestion, setActiveQuestion, onNew }: { preparation: Preparation; activeQuestion: number; setActiveQuestion: (value: number) => void; onNew: () => void }) {
  const result = preparation.result;
  return <>
    <header className="prep-workspace-head result-head"><div><p className="eyebrow">模拟面试卷</p><h3>{preparation.company} · {preparation.role}</h3><span>{preparation.resume_file_name} · {result.questions.length} 道面试问题</span></div><button className="secondary-button" onClick={onNew}>生成新一套</button></header>
    <div className="prep-summary"><span className="prep-score"><strong>{result.questions.filter((item) => item.probability === "高").length}</strong><small>高概率题</small></span><div><p>{result.summary}</p><span>{result.roleSignals.map((signal) => <i key={signal}>{signal}</i>)}</span></div></div>
    <div className="question-paper">
      {result.questions.map((item, index) => <article className={`question-item ${activeQuestion === index ? "open" : ""}`} key={`${item.question}-${index}`}>
        <button type="button" onClick={() => setActiveQuestion(activeQuestion === index ? -1 : index)} aria-expanded={activeQuestion === index}>
          <span className="question-number">{String(index + 1).padStart(2, "0")}</span><span className="question-title"><em>{item.category} · {item.probability}概率</em><strong>{item.question}</strong></span><ChevronDown size={18} />
        </button>
        {activeQuestion === index && <div className="question-answer"><section><h4>为什么会问</h4><p>{item.why}</p><div className="evidence-chips">{item.evidence.map((value) => <span key={value}>{value}</span>)}</div></section><section><h4>回答结构</h4><ol>{item.answerFramework.map((step) => <li key={step}>{step}</li>)}</ol></section><section className="sample-answer"><h4>回答模板</h4><p>{item.sampleAnswer}</p></section>{item.followUps.length > 0 && <section><h4>可能追问</h4><ul>{item.followUps.map((followUp) => <li key={followUp}>{followUp}</li>)}</ul></section>}</div>}
      </article>)}
    </div>
    <div className="prep-foot-grid"><section><h4><CheckCircle2 size={16} />上场前清单</h4>{result.preparationChecklist.map((item) => <p key={item}>{item}</p>)}</section><section><h4><AlertTriangle size={16} />事实边界提醒</h4>{result.riskWarnings.length ? result.riskWarnings.map((item) => <p key={item}>{item}</p>) : <p>回答时保持简历中的职责、数据和经历层级，不扩大个人贡献。</p>}</section></div>
  </>;
}

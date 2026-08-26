import { useEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { ProfileEditor } from "../../src/components/ProfileEditor";
import { encryptBinary } from "../../src/lib/crypto";
import { createDiagnosticReport } from "../../src/lib/diagnostics";
import { createProfileCandidates, isUnnamedFieldLabel, matchFields, type FieldMatch } from "../../src/lib/field-matcher";
import { clearActivePageMarks, fillActivePage, markActivePage, scanActivePage, type ScanResult } from "../../src/lib/page-client";
import { deleteResumeRecord, putResumeRecord } from "../../src/lib/resume-store";
import {
  createVault,
  exportEncryptedBackup,
  forgetRememberedVaultKey,
  hasVault,
  importEncryptedBackup,
  saveVault,
  unlockVault,
  unlockRememberedVault,
  type UnlockedVault,
} from "../../src/lib/vault";
import {
  createEmptyProfile,
  createId,
  type AutofillProfileV1,
  type SiteRule,
  type VaultState,
} from "../../src/types/profile";

type Tab = "fill" | "profile" | "templates" | "data";

function isExistingMatch(match: FieldMatch) {
  return match.reason.includes("网页中已有内容");
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function cloneProfile(profile: AutofillProfileV1) {
  const next = structuredClone(profile);
  next.id = createId("profile");
  next.name = `${profile.name} · 副本`;
  next.profileVersion = 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

function activeProfile(state: VaultState) {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? state.profiles[0]!;
}

export function App() {
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const [draft, setDraft] = useState<VaultState | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [tab, setTab] = useState<Tab>("fill");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [matches, setMatches] = useState<FieldMatch[]>([]);
  const [scanStale, setScanStale] = useState(false);
  const [debugMarkersOn, setDebugMarkersOn] = useState(false);
  const [selectedMarkerToken, setSelectedMarkerToken] = useState("");
  const [manualPaths, setManualPaths] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      let exists = false;
      try {
        exists = await hasVault();
      } catch {
        if (active) {
          setVaultExists(false);
          setError("无法读取本地资料库，请重新加载插件后重试。");
        }
        return;
      }
      if (!active) return;
      setVaultExists(exists);
      if (!exists) return;
      try {
        const remembered = await unlockRememberedVault();
        if (!active || !remembered) return;
        setVault(remembered);
        setDraft(structuredClone(remembered.state));
        setNotice("已使用这台浏览器保存的设备密钥自动解锁。");
      } catch {
        if (active) setError("自动解锁失败，请输入原密码重新建立设备解锁。");
      }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const listener = (message: { type?: string; token?: string }) => {
      if (message.type === "ZHITU_PAGE_CHANGED") setScanStale(true);
      if (message.type === "ZHITU_MARKER_SELECTED" && message.token) {
        setTab("fill");
        setSelectedMarkerToken(message.token);
        requestAnimationFrame(() => document.getElementById(`match-${message.token}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const profile = draft ? activeProfile(draft) : null;
  const candidateOptions = useMemo(() => profile ? createProfileCandidates(profile) : [], [profile]);
  const stats = useMemo(() => ({
    fillable: matches.filter((item) => item.confidence !== "skipped" && item.profilePath && item.value).length,
    high: matches.filter((item) => item.confidence === "high" && !item.reviewRequired).length,
    medium: matches.filter((item) => item.confidence !== "skipped" && (item.confidence === "medium" || item.reviewRequired)).length,
    skipped: matches.filter((item) => item.confidence === "skipped").length,
  }), [matches]);

  function clearMessages() { setError(""); setNotice(""); }

  async function handleCreateVault() {
    clearMessages();
    if (passphrase !== confirmPassphrase) return setError("两次输入的密码不一致");
    setBusy("正在创建加密资料库…");
    try {
      const unlocked = await createVault(passphrase);
      setVault(unlocked);
      setDraft(structuredClone(unlocked.state));
      setVaultExists(true);
      setPassphrase("");
      setConfirmPassphrase("");
      setNotice("本地资料库已创建。先补充资料，再开始扫描网页。");
      setTab("profile");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建资料库失败"); }
    finally { setBusy(""); }
  }

  async function handleUnlock() {
    clearMessages();
    setBusy("正在解锁…");
    try {
      const unlocked = await unlockVault(passphrase);
      setVault(unlocked);
      setDraft(structuredClone(unlocked.state));
      setPassphrase("");
      setNotice("这台浏览器已记住解锁，之后打开侧边栏无需再次输入密码。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "解锁失败"); }
    finally { setBusy(""); }
  }

  async function persist(nextDraft = draft, message = "资料已加密保存") {
    if (!vault || !nextDraft) return;
    setBusy("正在加密保存…");
    try {
      const current = activeProfile(nextDraft);
      const nextProfile = { ...current, profileVersion: current.profileVersion + 1, updatedAt: new Date().toISOString() };
      const nextState = {
        ...nextDraft,
        profiles: nextDraft.profiles.map((item) => item.id === nextProfile.id ? nextProfile : item),
        updatedAt: new Date().toISOString(),
      };
      const saved = await saveVault(vault, nextState);
      setVault(saved);
      setDraft(structuredClone(saved.state));
      setNotice(message);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(""); }
  }

  function updateProfile(nextProfile: AutofillProfileV1) {
    if (!draft) return;
    setDraft({ ...draft, profiles: draft.profiles.map((item) => item.id === nextProfile.id ? nextProfile : item) });
  }

  function confirmParsedProfile() {
    if (!profile) return;
    const confirmed = new Set(profile.confirmedFields);
    if (profile.personal.fullName) confirmed.add("personal.fullName");
    if (profile.contact.email) confirmed.add("contact.email");
    if (profile.contact.phone) confirmed.add("contact.phone");
    profile.education.forEach((item, index) => {
      if (item.school) confirmed.add(`education.${index}.school`);
      if (item.degree) confirmed.add(`education.${index}.degree`);
      if (item.startDate) confirmed.add(`education.${index}.startDate`);
      if (item.endDate) confirmed.add(`education.${index}.endDate`);
    });
    updateProfile({ ...profile, confirmedFields: [...confirmed], uncertainItems: [] });
    setNotice("已标记当前解析资料为人工核对；请点击“保存资料”完成加密保存。");
  }

  async function handleResumeUpload(file: File) {
    if (!vault || !draft || !profile) return;
    clearMessages();
    if (file.size > 8 * 1024 * 1024) return setError("单份简历不能超过 8MB");
    if (!["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) {
      return setError("请选择 PDF 或 DOCX 文件");
    }
    setBusy("正在本地提取简历文字…");
    try {
      const { applyLocalResumeDraft, extractResumeText } = await import("../../src/lib/resume-parser");
      const text = await extractResumeText(file);
      if (text.length < 20) throw new Error("没有提取到足够文字；扫描版 PDF 请先进行 OCR");
      const id = createId("resume");
      const envelope = await encryptBinary(vault.key, new Uint8Array(await file.arrayBuffer()));
      await putResumeRecord({ id, name: file.name, mimeType: file.type, envelope, updatedAt: new Date().toISOString() });
      const resume = { id, name: file.name, mimeType: file.type as "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: file.size, language: profile.language, tags: [], addedAt: new Date().toISOString(), extractedText: text };
      const nextProfile = applyLocalResumeDraft(profile, text, resume);
      const nextState = { ...draft, profiles: draft.profiles.map((item) => item.id === profile.id ? nextProfile : item) };
      await persist(nextState, "简历已在本机解析并加密保存，请核对黄色提示和资料字段");
      setTab("profile");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取简历失败"); }
    finally { setBusy(""); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function handleScan() {
    if (!profile || !draft) return;
    clearMessages();
    setBusy("正在扫描当前页面…");
    try {
      const result = await scanActivePage();
      const origin = new URL(result.url).origin;
      const nextMatches = matchFields(result.fields, profile, draft.siteRules, origin);
      setScan(result);
      setMatches(nextMatches);
      if (debugMarkersOn) await markActivePage(nextMatches);
      setScanStale(false);
      setNotice(`识别到 ${result.fields.length} 个可填写控件。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "扫描失败"); }
    finally { setBusy(""); }
  }

  async function handleFill(list = matches) {
    clearMessages();
    const eligible = list.filter((item) => item.confidence !== "skipped" && item.profilePath && item.value);
    if (eligible.length === 0) return setError("当前没有可从资料库填写的字段");
    setBusy("正在一键填写资料库已有内容…");
    try {
      const results = await fillActivePage(eligible);
      const filled = results.filter((item) => item.ok).length;
      setNotice(`已填写 ${filled} 个字段；黄色边框字段请逐项复核。`);
      if (filled < eligible.length) setError(`${eligible.length - filled} 个字段未能填写，请查看页面中的红色边框。`);
      setScanStale(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "填写失败"); }
    finally { setBusy(""); }
  }

  async function toggleDebugMarkers() {
    if (!scan || matches.length === 0) return setError("请先扫描当前页面，再显示调试标记");
    clearMessages();
    setBusy(debugMarkersOn ? "正在清除网页标记…" : "正在给网页字段编号…");
    try {
      if (debugMarkersOn) {
        await clearActivePageMarks();
        setDebugMarkersOn(false);
        setSelectedMarkerToken("");
        setNotice("网页调试标记已清除。");
      } else {
        const result = await markActivePage(matches);
        setDebugMarkersOn(true);
        setNotice(`已在网页标记 ${result.marked} 个字段；点击编号可定位侧边栏记录。`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "切换调试标记失败"); }
    finally { setBusy(""); }
  }

  function exportDiagnostics() {
    if (!scan || matches.length === 0) return setError("请先扫描当前页面，再导出诊断报告");
    const report = createDiagnosticReport(scan, matches);
    downloadJson(`zhitu-diagnostics-${report.page.hostname}-${new Date().toISOString().slice(0, 10)}.json`, report);
    setNotice("已导出脱敏诊断报告；报告不包含网页现有值或资料库填写值。");
  }

  async function rememberRule(match: FieldMatch) {
    if (!draft || !scan) return;
    if (isUnnamedFieldLabel(match.label)) return setError("未命名字段不会保存映射规则，避免把姓名误填到其他位置");
    const path = manualPaths[match.token];
    if (!path) return setError("请先选择这个网页字段对应的资料项");
    const rule: SiteRule = { id: createId("rule"), origin: new URL(scan.url).origin, labelPattern: match.label, profilePath: path, createdAt: new Date().toISOString() };
    const nextState = { ...draft, siteRules: [...draft.siteRules.filter((item) => !(item.origin === rule.origin && item.labelPattern === rule.labelPattern)), rule] };
    await persist(nextState, "此网站的字段规则已记住");
    setMatches(matchFields(scan.fields, activeProfile(nextState), nextState.siteRules, new URL(scan.url).origin));
  }

  function addTemplate() {
    if (!draft) return;
    const next = createEmptyProfile(`简历模板 ${draft.profiles.length + 1}`);
    setDraft({ ...draft, activeProfileId: next.id, profiles: [...draft.profiles, next] });
    setTab("profile");
  }

  function duplicateTemplate() {
    if (!draft || !profile) return;
    const next = cloneProfile(profile);
    setDraft({ ...draft, activeProfileId: next.id, profiles: [...draft.profiles, next] });
  }

  function deleteTemplate() {
    if (!draft || !profile || draft.profiles.length === 1) return;
    if (!window.confirm(`删除模板“${profile.name}”？已加密保存的原简历文件不会自动删除。`)) return;
    const profiles = draft.profiles.filter((item) => item.id !== profile.id);
    setDraft({ ...draft, activeProfileId: profiles[0]!.id, profiles });
  }

  async function removeResume(id: string) {
    if (!profile || !draft) return;
    await deleteResumeRecord(id);
    const nextProfile = { ...profile, resumes: profile.resumes.filter((resume) => resume.id !== id) };
    await persist({ ...draft, profiles: draft.profiles.map((item) => item.id === profile.id ? nextProfile : item) }, "本地简历文件已删除");
  }

  async function exportBackup() {
    if (!vault) return;
    const backup = await exportEncryptedBackup(vault);
    downloadJson(`zhitu-autofill-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
    setNotice("加密备份已导出；恢复时仍需要当前解锁密码。");
  }

  async function importBackup(file: File) {
    clearMessages();
    try {
      await importEncryptedBackup(JSON.parse(await file.text()));
      setVaultExists(true);
      setVault(null);
      setDraft(null);
      setNotice("备份已导入，请使用备份原来的密码解锁。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败"); }
    finally { if (backupInput.current) backupInput.current.value = ""; }
  }

  async function handleLock() {
    if (debugMarkersOn) await clearActivePageMarks().catch(() => undefined);
    await forgetRememberedVaultKey();
    setVault(null);
    setDraft(null);
    setScan(null);
    setMatches([]);
    setDebugMarkersOn(false);
    setNotice("设备解锁已清除，下次需要输入密码。");
  }

  if (vaultExists === null) return <main className="shell shell--center"><div className="loading-mark">正在检查本地资料库…</div></main>;

  if (!vault) {
    return (
      <main className="shell unlock-shell">
        <div className="brand-lockup"><span className="brand-mark">填</span><div><strong>职途填表助手</strong><small>LOCAL AUTOFILL DESK</small></div></div>
        <div className="unlock-hero"><p className="eyebrow">只在这台电脑里</p><h1>{vaultExists ? "解锁你的资料夹" : "先建一个加密资料夹"}</h1><p>简历、字段规则和答案库不会发送到 Tracker 或任何云端。</p></div>
        {error && <div className="message message--error">{error}</div>}
        {notice && <div className="message message--notice">{notice}</div>}
        <label className="field field--wide"><span>解锁密码</span><input type="password" autoFocus value={passphrase} onChange={(event) => setPassphrase(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && vaultExists) void handleUnlock(); }} placeholder="至少 10 个字符" /></label>
        {!vaultExists && <label className="field field--wide"><span>再次输入</span><input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} placeholder="请妥善保存；无法找回" /></label>}
        <button className="primary-button" disabled={Boolean(busy)} onClick={() => void (vaultExists ? handleUnlock() : handleCreateVault())}>{busy || (vaultExists ? "解锁资料库" : "创建加密资料库")}</button>
        <div className="unlock-divider"><span>或</span></div>
        <input ref={backupInput} hidden type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); }} />
        <button className="secondary-button" onClick={() => backupInput.current?.click()}>导入加密备份</button>
        <p className="privacy-note">密码不会保存；成功解锁后，这台浏览器会保存不可导出的设备密钥。</p>
      </main>
    );
  }

  if (!draft || !profile) return null;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-lockup brand-lockup--small"><span className="brand-mark">填</span><div><strong>职途填表助手</strong><small>{profile.name}</small></div></div>
        <button className="lock-button" onClick={() => void handleLock()}>锁定并忘记</button>
      </header>
      <nav className="tabbar" aria-label="功能导航">
        {([['fill', '填写'], ['profile', '资料'], ['templates', '模板'], ['data', '本地数据']] as const).map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}
      </nav>
      {(error || notice || busy) && <div className="message-stack">{busy && <div className="message message--busy">{busy}</div>}{error && <div className="message message--error">{error}</div>}{notice && <div className="message message--notice">{notice}</div>}</div>}

      {tab === "fill" && <div className="panel-body fill-panel">
        <section className="scan-hero">
          <p className="eyebrow">当前网页</p>
          <h1>{scan?.title || "先扫描这一页"}</h1>
          <p>{scan ? new URL(scan.url).hostname : "打开北森、Moka 或普通网申页面，然后扫描可填写字段。"}</p>
          <div className="hero-actions"><button className="secondary-button" onClick={() => void handleScan()} disabled={Boolean(busy)}>{scanStale ? "页面变了，重新扫描" : "扫描当前页"}</button><button className="primary-button" onClick={() => void handleFill()} disabled={Boolean(busy) || stats.fillable === 0}>一键填写 {stats.fillable || ""} 个字段</button></div>
        </section>
        <div className="status-ledger" aria-label="字段匹配统计">
          <div className="ledger-item ledger-item--green"><strong>{stats.high}</strong><span>可靠匹配</span></div>
          <div className="ledger-item ledger-item--yellow"><strong>{stats.medium}</strong><span>待你复核</span></div>
          <div className="ledger-item ledger-item--gray"><strong>{stats.skipped}</strong><span>保持不动</span></div>
        </div>
        <section className="debug-console">
          <div><p className="eyebrow">调试标记</p><strong>把网页字段和侧边栏编号对齐</strong><small>诊断报告只保留字段结构与失败原因，不导出姓名、电话或填写值。</small></div>
          <div className="debug-actions"><button className={debugMarkersOn ? "secondary-button debug-button active" : "secondary-button debug-button"} onClick={() => void toggleDebugMarkers()}>{debugMarkersOn ? "清除网页标记" : "在网页显示编号"}</button><button className="secondary-button debug-button" onClick={exportDiagnostics}>导出脱敏诊断</button></div>
        </section>
        <section className="match-list">
          {matches.length === 0 && <div className="empty-state"><span>↳</span><p>扫描后，这里会按填写安全性列出每个字段。</p></div>}
          {matches.map((match, index) => <article id={`match-${match.token}`} className={`match-row match-row--${isExistingMatch(match) ? "existing" : match.confidence}${selectedMarkerToken === match.token ? " selected" : ""}`} key={match.token}>
            <div className="match-row__line"><span className="match-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{match.label}</strong><small>{match.reason}</small></div><span className="confidence-label">{isExistingMatch(match) ? "网页已有" : match.confidence === "high" ? (match.reviewRequired ? "填后复核" : "可填写") : match.confidence === "medium" ? "填后复核" : "跳过"}</span></div>
            {match.profilePath && <div className="match-value"><code>{match.profilePath}</code><span>{match.value.length > 70 ? `${match.value.slice(0, 70)}…` : match.value}</span></div>}
            {match.confidence === "skipped" && !isExistingMatch(match) && match.reason.includes("资料库中没有可靠匹配") && scan && <div className="manual-rule"><select value={manualPaths[match.token] || ""} onChange={(event) => setManualPaths({ ...manualPaths, [match.token]: event.target.value })}><option value="">选择对应资料项…</option>{candidateOptions.map((candidate) => <option key={`${candidate.path}-${candidate.semantic}`} value={candidate.path}>{candidate.path} · {candidate.value.slice(0, 28)}</option>)}</select><button onClick={() => void rememberRule(match)}>为此网站记住</button></div>}
          </article>)}
        </section>
      </div>}

      {tab === "profile" && <div className="panel-body">
        <section className="profile-toolbar"><div><p className="eyebrow">资料版本 {profile.profileVersion}</p><h1>{profile.name}</h1></div><button className="primary-button primary-button--small" onClick={() => void persist()}>保存资料</button></section>
        {profile.uncertainItems.length > 0 && <section className="review-banner"><strong>解析后需要确认</strong>{profile.uncertainItems.map((item) => <p key={item}>• {item}</p>)}<button className="review-button" onClick={confirmParsedProfile}>我已逐项核对当前资料</button></section>}
        <ProfileEditor profile={profile} onChange={updateProfile} />
      </div>}

      {tab === "templates" && <div className="panel-body">
        <section className="section-heading"><p className="eyebrow">多套资料</p><h1>按投递方向切换模板</h1><p>模板之间不会自动合并；当前选择决定本次网页填写内容。</p></section>
        <div className="template-list">{draft.profiles.map((item) => <button className={item.id === draft.activeProfileId ? "template-row active" : "template-row"} key={item.id} onClick={() => setDraft({ ...draft, activeProfileId: item.id })}><span className="template-language">{item.language === "en" ? "EN" : item.language === "zh-HK" ? "繁" : "简"}</span><span><strong>{item.name}</strong><small>版本 {item.profileVersion} · {item.resumes.length} 份文件</small></span>{item.id === draft.activeProfileId && <b>使用中</b>}</button>)}</div>
        <div className="button-row"><button className="secondary-button" onClick={addTemplate}>新建空白模板</button><button className="secondary-button" onClick={duplicateTemplate}>复制当前模板</button><button className="secondary-button danger-button" disabled={draft.profiles.length === 1} onClick={deleteTemplate}>删除当前模板</button></div>
        <button className="primary-button" onClick={() => void persist()}>保存模板变更</button>
      </div>}

      {tab === "data" && <div className="panel-body">
        <section className="section-heading"><p className="eyebrow">只在本机</p><h1>简历文件与加密备份</h1><p>PDF/DOCX 会先本地提取文字，再和原文件一起加密保存。</p></section>
        <input ref={fileInput} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleResumeUpload(file); }} />
        <button className="upload-zone" onClick={() => fileInput.current?.click()}><strong>上传 PDF / DOCX</strong><span>单份不超过 8MB；扫描版 PDF 需要先 OCR</span></button>
        <div className="resume-list">{profile.resumes.map((resume) => <article key={resume.id}><span className="file-chip">{resume.mimeType === "application/pdf" ? "PDF" : "DOCX"}</span><div><strong>{resume.name}</strong><small>{Math.ceil(resume.size / 1024)} KB · 已提取 {resume.extractedText.length} 字</small></div><button className="text-button danger" onClick={() => void removeResume(resume.id)}>删除</button></article>)}{profile.resumes.length === 0 && <p className="empty-copy">还没有本地简历文件。也可以直接在“资料”中手动录入。</p>}</div>
        <div className="data-actions"><button className="secondary-button" onClick={() => void exportBackup()}>导出加密备份</button><input ref={backupInput} hidden type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); }} /><button className="secondary-button" onClick={() => backupInput.current?.click()}>导入并替换本机数据</button></div>
        <section className="security-note"><strong>不会保存或填写</strong><p>身份证/护照、银行信息、招聘网站密码、家庭成员、健康信息、验证码、签名和协议勾选。</p></section>
      </div>}
    </main>
  );
}

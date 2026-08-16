"use client";

import {
  ArrowUpRight, Bell, Bookmark, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, ClipboardCheck, Clock3, FileCheck2, FilePenLine,
  Copy, Download, ExternalLink, FileText, Inbox, KeyRound, LayoutDashboard, Link2, LogOut, Mail, Menu, MessageSquareText, MoreHorizontal,
  PenLine, Plus, RefreshCw, Save, Search, Send, ShieldCheck, Sparkles, Star, Target, Trash2, Upload, UserPlus, X, XCircle, MailCheck, MessageCircleMore,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { applicationStatuses, applySuggestion, canTransition, confirmedApplicationCount, confirmedApplicationCountOnDate } from "@/lib/business";
import { initialSuggestions, jobs as seedJobs, journey, resumes as seedResumes, reviews as seedReviews } from "@/lib/demo-data";
import { formatLocalChineseDate, greetingWithId } from "@/lib/local-time";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { InterviewPrepPage } from "@/components/interview-prep-page";
import { BrandMascot } from "@/components/brand-mascot";
import { CareerPortalDirectory } from "@/components/career-portal-directory";
import { allowedConfirmationLinks, forwardingConfirmationProvider, forwardingVerificationState, gmailForwardingConfirmationCode, gmailRecruitmentFilterQuery, hasRecentInboundEmail, isGmailForwardingConfirmation, isQqForwardingConfirmation, recruitmentFilterKeywords } from "@/lib/mail/forwarding";
import type { JobAnalysis, StructuredResume } from "@/lib/ai/provider";
import type { InterviewReview, Job, Resume, Suggestion } from "@/lib/types";
import type { RecruitingCalendarEvent } from "@/lib/mail/calendar";
import { DEFAULT_DAILY_APPLICATION_TARGET, DEFAULT_JOB_PREFERENCES, hasJobPreferences, type JobPreferences } from "@/lib/account/preferences";
import { matchJobPreferences } from "@/lib/jobs/preferences";
import { ROLE_DIRECTION_OPTIONS } from "@/lib/jobs/preference-taxonomy";

type PageKey = "home" | "jobs" | "resumes" | "progress" | "prep" | "reviews";
type AccountProfile = { displayName: string | null; email: string; isAdmin: boolean; dailyApplicationTarget: number; jobPreferences: JobPreferences };
type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  scheduled_for: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  action_status: "pending" | "accepted" | "rejected" | null;
};
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const navItems = [
  { key: "home" as const, label: "首页", icon: LayoutDashboard },
  { key: "jobs" as const, label: "职位库", icon: BriefcaseBusiness },
  { key: "resumes" as const, label: "简历中心", icon: FileText },
  { key: "progress" as const, label: "求职进度", icon: Target },
  { key: "prep" as const, label: "面试准备", icon: Sparkles },
  { key: "reviews" as const, label: "面试复盘", icon: MessageSquareText },
];

export function TrackerApp() {
  const [page, setPage] = useState<PageKey>("home");
  const [sidebar, setSidebar] = useState(false);
  const [jobs, setJobs] = useState<Job[]>(isDemoMode ? seedJobs : []);
  const [jobsLoading, setJobsLoading] = useState(!isDemoMode);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(isDemoMode ? initialSuggestions : []);
  const [reviews, setReviews] = useState<InterviewReview[]>(isDemoMode ? seedReviews : []);
  const [toast, setToast] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(isDemoMode ? { displayName: "测试用户", email: "", isAdmin: false, dailyApplicationTarget: DEFAULT_DAILY_APPLICATION_TARGET, jobPreferences: DEFAULT_JOB_PREFERENCES } : null);
  const [progressClock, setProgressClock] = useState<Date | null>(null);
  const [dailyApplicationTarget, setDailyApplicationTarget] = useState(DEFAULT_DAILY_APPLICATION_TARGET);
  const [dailyTargetDraft, setDailyTargetDraft] = useState(String(DEFAULT_DAILY_APPLICATION_TARGET));
  const [editingDailyTarget, setEditingDailyTarget] = useState(false);
  const [savingDailyTarget, setSavingDailyTarget] = useState(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }, []);

  const loadJobs = useCallback(async () => {
    if (isDemoMode) return;
    setJobsLoading(true);
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "职位加载失败");
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "职位加载失败");
    } finally {
      setJobsLoading(false);
    }
  }, [notify]);

  const loadProfile = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "账号资料加载失败");
      const nextProfile = payload.profile as AccountProfile;
      setProfile(nextProfile);
      setDailyApplicationTarget(nextProfile.dailyApplicationTarget || DEFAULT_DAILY_APPLICATION_TARGET);
      setDailyTargetDraft(String(nextProfile.dailyApplicationTarget || DEFAULT_DAILY_APPLICATION_TARGET));
    } catch (profileError) {
      notify(profileError instanceof Error ? profileError.message : "账号资料加载失败");
    }
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadJobs(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProfile(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    const updateClock = () => setProgressClock(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function navigate(next: PageKey) {
    setPage(next);
    setSidebar(false);
  }

  const title = navItems.find((item) => item.key === page)?.label ?? "首页";
  const dailyApplicationCount = progressClock ? confirmedApplicationCountOnDate(jobs, progressClock) : 0;
  const dailyApplicationProgress = Math.min(100, Math.round(dailyApplicationCount / dailyApplicationTarget * 100));
  const dailyApplicationsRemaining = Math.max(0, dailyApplicationTarget - dailyApplicationCount);

  async function saveDailyApplicationTarget(event: FormEvent) {
    event.preventDefault();
    const target = Number(dailyTargetDraft);
    if (!Number.isInteger(target) || target < 1 || target > 200) return notify("投递目标需要是 1—200 的整数");
    if (isDemoMode) {
      setDailyApplicationTarget(target);
      setEditingDailyTarget(false);
      notify("今日投递目标已更新");
      return;
    }
    setSavingDailyTarget(true);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dailyApplicationTarget: target }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "投递目标保存失败");
      setDailyApplicationTarget(payload.dailyApplicationTarget);
      setProfile((current) => current ? { ...current, dailyApplicationTarget: payload.dailyApplicationTarget } : current);
      setEditingDailyTarget(false);
      notify("今日投递目标已保存");
    } catch (targetError) {
      notify(targetError instanceof Error ? targetError.message : "投递目标保存失败");
    } finally {
      setSavingDailyTarget(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
        <div className="brand"><BrandMascot /><span className="brand-lockup"><strong>职途 <em>tracker</em></strong><small>一个一站式求职助手网站</small></span></div>
        <button className="mobile-close" onClick={() => setSidebar(false)} aria-label="关闭菜单"><X /></button>
        <nav aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const activeApplications = jobs.filter((job) => job.status && !["saved", "closed", "rejected"].includes(job.status)).length;
            return <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => navigate(item.key)}><Icon size={19} /><span>{item.label}</span>{item.key === "progress" && activeApplications > 0 && <b>{activeApplications}</b>}</button>;
          })}
        </nav>
        <button className="feedback-entry" onClick={() => setFeedbackOpen(true)}><span><MessageCircleMore size={17} /></span><span><strong>有想法，告诉站长</strong><small>建议与 Bug 都欢迎</small></span><ArrowUpRight size={15} /></button>
        <div className="sidebar-companion">
          <div className="companion-progress-head"><div className="companion-orbit"><Target size={18} /></div><span>今日目标</span><button type="button" onClick={() => { setDailyTargetDraft(String(dailyApplicationTarget)); setEditingDailyTarget(true); }} aria-label="自定义今日投递目标" title="自定义今日投递目标"><PenLine size={12} />调整</button></div>
          {editingDailyTarget ? <form className="companion-target-form" onSubmit={saveDailyApplicationTarget}><label htmlFor="daily-application-target">目标份数</label><input id="daily-application-target" autoFocus type="number" min={1} max={200} step={1} value={dailyTargetDraft} onChange={(event) => setDailyTargetDraft(event.target.value)} /><span><button type="button" onClick={() => setEditingDailyTarget(false)}>取消</button><button type="submit" disabled={savingDailyTarget}>{savingDailyTarget ? "保存中" : "保存"}</button></span></form> : <>
          <div className="companion-progress-value"><p>确认投递</p><strong><b>{dailyApplicationCount}</b><span>/ {dailyApplicationTarget}</span></strong></div>
          <div className="companion-progress-track" role="progressbar" aria-label="今日确认投递进度" aria-valuemin={0} aria-valuemax={dailyApplicationTarget} aria-valuenow={Math.min(dailyApplicationCount, dailyApplicationTarget)}><i style={{ width: `${dailyApplicationProgress}%` }} /></div>
          <footer className="companion-progress-footer"><span>{dailyApplicationsRemaining > 0 ? `还差 ${dailyApplicationsRemaining} 份` : "今日目标已达成"}</span><em>{dailyApplicationProgress}%</em></footer>
          </>}
        </div>
        <button className="profile-chip" onClick={() => setAccountOpen(true)}><span>{profile?.displayName?.trim().slice(0, 1) || "我"}</span><span><strong>{profile?.displayName || "未设置用户 ID"}</strong><small>账号与管理</small></span><MoreHorizontal size={18} /></button>
      </aside>

      {sidebar && <button className="sidebar-scrim" onClick={() => setSidebar(false)} aria-label="关闭菜单" />}

      <section className="app-main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebar(true)} aria-label="打开菜单"><Menu /></button>
          <div><p>职途tracker</p><h1>{title}</h1></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={17} /><input aria-label="全局搜索" placeholder="搜索职位、公司或记录" /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap">
              <button className="icon-button has-dot" aria-label="通知" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={19} /></button>
              {notificationsOpen && <Notifications onClose={() => setNotificationsOpen(false)} notify={notify} onChanged={loadJobs} />}
            </div>
            <button className="icon-button" aria-label="面试邮件自动转发设置" title="面试邮件自动转发设置" onClick={() => setSettingsOpen(true)}><Mail size={19} /></button>
          </div>
        </header>

        <main className="page-content">
          {page === "home" && <HomePage jobs={jobs} displayName={profile?.displayName} onNavigate={navigate} />}
          {page === "jobs" && <JobsPage refreshActivity={loadJobs} notify={notify} preferences={profile?.jobPreferences || DEFAULT_JOB_PREFERENCES} onPreferencesUpdated={(jobPreferences) => setProfile((current) => current ? { ...current, jobPreferences } : current)} />}
          {page === "resumes" && <ResumesPage suggestions={suggestions} setSuggestions={setSuggestions} notify={notify} />}
          {page === "progress" && <ProgressPage jobs={jobs} refreshJobs={loadJobs} notify={notify} onOpenMailSettings={() => setSettingsOpen(true)} />}
          {page === "prep" && <InterviewPrepPage notify={notify} />}
          {page === "reviews" && <ReviewsPage reviews={reviews} setReviews={setReviews} notify={notify} />}
        </main>
      </section>
      {settingsOpen && <MailSettings onClose={() => setSettingsOpen(false)} notify={notify} />}
      {accountOpen && <AccountSettings profile={profile} onClose={() => setAccountOpen(false)} notify={notify} onUpdated={(displayName) => setProfile((current) => current ? { ...current, displayName } : current)} onOpenAdmin={() => { setAccountOpen(false); setAdminOpen(true); }} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} notify={notify} />}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} notify={notify} />}
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function HomePage({ jobs, displayName, onNavigate }: { jobs: Job[]; displayName?: string | null; onNavigate: (page: PageKey) => void }) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const applied = confirmedApplicationCount(jobs);
  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());
    updateCurrentTime();
    const timer = window.setInterval(updateCurrentTime, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dateLabel = currentTime ? formatLocalChineseDate(currentTime) : "今天";
  const greeting = currentTime ? greetingWithId(currentTime.getHours(), displayName) : displayName?.trim() ? `你好，${displayName.trim()}` : "你好";
  const journeyItems = isDemoMode ? journey : [
    { key: "saved", label: "已收藏", count: jobs.filter((job) => job.saved).length },
    { key: "preparing", label: "准备投递", count: jobs.filter((job) => job.status === "preparing").length },
    { key: "applied", label: "已投递", count: jobs.filter((job) => job.status === "applied").length },
    { key: "assessment", label: "测评", count: jobs.filter((job) => job.status === "assessment").length },
    { key: "interview", label: "面试", count: jobs.filter((job) => job.status === "interview").length },
    { key: "offer", label: "Offer", count: jobs.filter((job) => job.status === "offer").length },
    { key: "closed", label: "结束", count: jobs.filter((job) => job.status === "closed" || job.status === "rejected").length },
  ];
  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div><p className="eyebrow">{dateLabel}</p><h2>{greeting}。<br /><span>下一站正在靠近。</span></h2></div>
        <button className="primary-button" onClick={() => onNavigate("jobs")}><Search size={17} />发现新职位</button>
      </section>

      <section className="journey-card">
        <div className="section-heading"><div><p className="eyebrow">求职旅程地图</p><h3>你走过的每一步，都算数</h3></div><div className="journey-summary"><strong>{applied}</strong><span>份已确认投递</span></div></div>
        <div className="journey-map">
          <svg viewBox="0 0 1000 145" preserveAspectRatio="none" aria-hidden="true"><path className="journey-shadow" d="M35,105 C145,10 240,118 350,55 S575,95 690,36 S855,92 965,28" /><path className="journey-line" d="M35,105 C145,10 240,118 350,55 S575,95 690,36 S855,92 965,28" /></svg>
          {journeyItems.map((item, index) => <button key={item.key} className={`journey-stop stop-${index}`}><span>{item.count}</span><small>{item.label}</small></button>)}
        </div>
        <div className="journey-footer"><span><i className="legend coral" />{isDemoMode ? "本周新增 3 次进展" : "仅统计真实申请记录"}</span><button onClick={() => onNavigate("progress")}>查看完整进度 <ArrowUpRight size={15} /></button></div>
      </section>

      <div className="home-grid">
        <RecruitingCalendar />
        <section className="panel match-panel">
          <div className="section-heading compact"><div><p className="eyebrow">为你发现</p><h3>高匹配职位</h3></div><button className="text-button" onClick={() => onNavigate("jobs")}>职位库</button></div>
          {jobs.slice(0, 3).map((job) => <button className="mini-job" key={job.id} onClick={() => onNavigate("jobs")}><span className="company-logo">{job.company.slice(0, 1)}</span><span><strong>{job.title}</strong><small>{job.company} · {job.location}</small></span><em>{job.match > 0 ? `${job.match}%` : "待分析"}</em></button>)}
        </section>
      </div>

      {isDemoMode ? <section className="insight-strip"><span className="insight-icon"><Sparkles /></span><div><p className="eyebrow">本周洞察</p><strong>你的面试转化率比上周提升了 12%</strong><span>保持在投递后 48 小时内记录复盘，你的准备会越来越从容。</span></div><button onClick={() => onNavigate("reviews")}>开始复盘</button></section> : <section className="insight-strip"><span className="insight-icon"><Sparkles /></span><div><p className="eyebrow">本周洞察</p><strong>真实投递数据积累后，这里会生成专属洞察</strong><span>从职位库打开投递页并确认结果，即可开始记录转化率。</span></div><button onClick={() => onNavigate("jobs")}>浏览职位</button></section>}
    </div>
  );
}

const shanghaiDateKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
}).format(typeof value === "string" ? new Date(value) : value);

function demoCalendarEvents(now: Date): RecruitingCalendarEvent[] {
  const sampleAt = (days: number, hour: number, minute = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  return [
    { id: "demo-assessment", type: "assessment", title: "线上测评通知", company: "蚂蚁集团", role: "产品培训生", scheduledAt: sampleAt(1, 18), originalTimeText: null, meetingUrl: null, receivedAt: now.toISOString() },
    { id: "demo-interview", type: "interview", title: "业务面试邀请", company: "字节跳动", role: "产品经理", scheduledAt: sampleAt(3, 14, 30), originalTimeText: null, meetingUrl: null, receivedAt: now.toISOString() },
  ];
}

function RecruitingCalendar() {
  const [today] = useState(() => new Date());
  const [events, setEvents] = useState<RecruitingCalendarEvent[]>(() => isDemoMode ? demoCalendarEvents(today) : []);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState("");
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => shanghaiDateKey(today));

  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    void fetch("/api/calendar-events", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "求职日历加载失败");
        if (active) setEvents(Array.isArray(payload.events) ? payload.events : []);
      })
      .catch((calendarError) => { if (active) setError(calendarError instanceof Error ? calendarError.message : "求职日历加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const todayKey = shanghaiDateKey(today);
  const [todayYear, todayMonth] = todayKey.split("-").map(Number);
  const monthDate = new Date(Date.UTC(todayYear, todayMonth - 1 + monthOffset, 1));
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const leadingDays = (monthDate.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((leadingDays + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - leadingDays + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const datedEvents = events.filter((event) => event.scheduledAt);
  const undatedEvents = events.filter((event) => !event.scheduledAt);
  const selectedEvents = datedEvents.filter((event) => shanghaiDateKey(event.scheduledAt!) === selectedDate);
  const monthLabel = `${year}年${month + 1}月`;

  function changeMonth(delta: number) {
    const nextOffset = monthOffset + delta;
    const next = new Date(Date.UTC(todayYear, todayMonth - 1 + nextOffset, 1));
    setMonthOffset(nextOffset);
    setSelectedDate(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }

  return <section className="panel tasks-panel calendar-panel">
    <div className="calendar-head">
      <div className="calendar-title-row">
        <div><p className="eyebrow">接下来</p><h3>求职日历</h3></div>
        <div className="calendar-eta" aria-label="What's your ETA">
          <span className="calendar-eta-bunny" aria-hidden="true">
            <Image src="/newjeans-bunny.jpg" alt="" width={555} height={1200} sizes="48px" />
          </span>
          <span className="calendar-eta-copy">What&apos;s your ETA</span>
        </div>
      </div>
      <div className="calendar-legend"><span><i className="assessment-dot" />测评截止</span><span><i className="interview-dot" />面试日期</span></div>
    </div>
    <div className="calendar-toolbar">
      <strong>{monthLabel}</strong>
      <div><button onClick={() => changeMonth(-1)} aria-label="上个月"><ChevronLeft size={16} /></button><button onClick={() => { setMonthOffset(0); setSelectedDate(todayKey); }}>今天</button><button onClick={() => changeMonth(1)} aria-label="下个月"><ChevronRight size={16} /></button></div>
    </div>
    {error ? <div className="calendar-message error"><strong>日历暂时无法加载</strong><span>{error}</span></div> : loading ? <div className="calendar-loading"><span className="loading-dot" />正在整理邮件日程…</div> : <>
      <div className="calendar-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>周{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <span className="calendar-blank" key={`blank-${index}`} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = datedEvents.filter((event) => shanghaiDateKey(event.scheduledAt!) === key);
          return <button key={key} className={`calendar-day ${key === todayKey ? "is-today" : ""} ${key === selectedDate ? "is-selected" : ""}`} onClick={() => setSelectedDate(key)} aria-label={`${month + 1}月${day}日，${dayEvents.length}项日程`}>
            <time>{day}</time>
            <span className="calendar-markers">{dayEvents.slice(0, 3).map((event) => <i className={`${event.type}-dot`} key={event.id} />)}</span>
            {dayEvents[0] && <small>{dayEvents[0].type === "assessment" ? "截止" : "面试"} {dayEvents[0].company || dayEvents[0].title}</small>}
          </button>;
        })}
      </div>
      <div className="calendar-agenda">
        <div className="agenda-date"><CalendarDays size={17} /><span><strong>{selectedDate ? `${Number(selectedDate.slice(5, 7))}月${Number(selectedDate.slice(8, 10))}日` : "选择日期"}</strong><small>{selectedEvents.length ? `${selectedEvents.length} 项安排` : "暂无安排"}</small></span></div>
        {selectedEvents.length ? <div className="agenda-list">{selectedEvents.map((event) => <CalendarAgendaItem event={event} key={event.id} />)}</div> : <p className="agenda-empty">这一天没有测评截止或面试安排。</p>}
      </div>
      {undatedEvents.length > 0 && <details className="undated-events"><summary>有 {undatedEvents.length} 封招聘邮件的日期待确认</summary><div>{undatedEvents.map((event) => <span key={event.id}><i className={`${event.type}-dot`} /><strong>{event.company || event.title}</strong><small>{event.originalTimeText || "邮件中未识别到明确日期"}</small></span>)}</div></details>}
      {!datedEvents.length && !undatedEvents.length && <div className="calendar-message"><strong>日历里还没有安排</strong><span>收到测评或面试邮件后，会按截止日期或面试日期自动显示。</span></div>}
    </>}
  </section>;
}

function CalendarAgendaItem({ event }: { event: RecruitingCalendarEvent }) {
  const date = new Date(event.scheduledAt!);
  const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const assessment = event.type === "assessment";
  return <article className={`agenda-item ${event.type}`}>
    <span className="agenda-time"><Clock3 size={14} /><strong>{assessment ? `${time} 截止` : time}</strong></span>
    <span><strong>{event.company || event.title}</strong><small>{event.role || (assessment ? "线上测评" : "面试安排")}</small></span>
    <em>{assessment ? "测评" : "面试"}</em>
  </article>;
}

type JobCatalogMeta = { catalogTotal: number; total: number; page: number; pageSize: number; pageCount: number; generatedAt: string; cities: string[]; companies: string[] };

function JobsPage({ refreshActivity, notify, preferences, onPreferencesUpdated }: { refreshActivity: () => Promise<void>; notify: (text: string) => void; preferences: JobPreferences; onPreferencesUpdated: (preferences: JobPreferences) => void }) {
  const [view, setView] = useState<"jobs" | "portals">("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogMeta, setCatalogMeta] = useState<JobCatalogMeta>({ catalogTotal: 0, total: 0, page: 1, pageSize: 10, pageCount: 1, generatedAt: "", cities: [], companies: [] });
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("全部城市");
  const [company, setCompany] = useState("");
  const [education, setEducation] = useState("全部学历");
  const [recruitmentType, setRecruitmentType] = useState<"all" | "graduate" | "internship">("all");
  const [sortBy, setSortBy] = useState<"published" | "company">("published");
  const [pageNumber, setPageNumber] = useState(1);
  const [savedOnly, setSavedOnly] = useState(false);
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [preferenceOpen, setPreferenceOpen] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
  const [busyId, setBusyId] = useState("");
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: "catalog", page: String(pageNumber), pageSize: "10", recruitmentType, savedOnly: String(savedOnly), sort: sortBy });
      if (query.trim()) params.set("query", query.trim());
      if (city !== "全部城市") params.set("city", city);
      if (company.trim()) params.set("company", company.trim());
      if (preferredOnly) {
        params.set("preferredOnly", "true");
        if (preferences.graduationYear) params.set("preferenceGraduationYear", preferences.graduationYear);
        preferences.roleKeywords.forEach((value) => params.append("preferenceRole", value));
        preferences.cities.forEach((value) => params.append("preferenceCity", value));
        preferences.recruitmentTypes.forEach((value) => params.append("preferenceRecruitmentType", value));
        preferences.focusCompanies.forEach((value) => params.append("preferenceCompany", value));
        preferences.excludedKeywords.forEach((value) => params.append("preferenceExcluded", value));
      }
      const response = await fetch(`/api/jobs?${params}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "职位加载失败");
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
      setCatalogMeta(payload.meta as JobCatalogMeta);
    } catch (error) {
      notify(error instanceof Error ? error.message : "职位加载失败");
    } finally {
      setLoading(false);
    }
  }, [city, company, notify, pageNumber, preferences, preferredOnly, query, recruitmentType, savedOnly, sortBy]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadCatalog(); }, query || company ? 260 : 0);
    return () => window.clearTimeout(timer);
  }, [company, loadCatalog, query]);

  const preferenceMatches = useMemo(() => new Map(jobs.map((job) => [job.id, matchJobPreferences(job, preferences)])), [jobs, preferences]);
  const filtered = useMemo(() => jobs.filter((job) => education === "全部学历" || job.education === education), [jobs, education]);
  const cities = catalogMeta.cities;
  const educations = useMemo(() => Array.from(new Set(jobs.map((job) => job.education))).sort(), [jobs]);
  const pageCount = catalogMeta.pageCount;
  const visiblePage = catalogMeta.page;
  const pagedJobs = filtered;
  const comparedJobs = jobs.filter((job) => compare.includes(job.id));

  async function toggleSave(job: Job) {
    const next = !job.saved;
    setJobs(jobs.map((item) => item.id === job.id ? { ...item, saved: next } : item));
    try {
      if (!isDemoMode) {
        const response = await fetch(`/api/jobs/${job.id}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved: next }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "收藏操作失败");
      }
      await refreshActivity();
      notify(next ? "已收藏职位" : "已取消收藏");
    } catch (error) {
      setJobs(jobs);
      notify(error instanceof Error ? error.message : "收藏操作失败");
    }
  }

  async function prepare(job: Job) {
    const opened = window.open(job.applyUrl, "_blank", "noopener,noreferrer");
    if (!opened) notify("浏览器拦截了新页面，请允许弹窗后重试");
    setBusyId(job.id);
    try {
      if (isDemoMode) {
        setJobs(jobs.map((item) => item.id === job.id ? { ...item, status: "preparing", applicationId: item.applicationId || item.id } : item));
        setPendingJob({ ...job, status: "preparing", applicationId: job.applicationId || job.id });
      } else {
        const response = await fetch(`/api/jobs/${job.id}/prepare`, { method: "POST" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "无法记录准备投递");
        const next = { ...job, status: payload.application.status, applicationId: payload.application.id } as Job;
        setJobs(jobs.map((item) => item.id === job.id ? next : item));
        setPendingJob(next);
        await refreshActivity();
      }
      notify("已记录为“准备投递”，返回后请确认结果");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法记录准备投递");
    } finally {
      setBusyId("");
    }
  }

  async function recordResult() {
    if (!pendingJob?.applicationId) return;
    setBusyId(pendingJob.id);
    try {
      if (!isDemoMode) {
        const response = await fetch(`/api/applications/${pendingJob.applicationId}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "applied" }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "无法更新投递结果");
      }
      setPendingJob(null);
      if (isDemoMode) setJobs(jobs.map((item) => item.id === pendingJob.id ? { ...item, status: "applied" } : item));
      else {
        await Promise.all([loadCatalog(), refreshActivity()]);
      }
      notify("投递已确认，已计入投递总数");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法更新投递结果");
    } finally {
      setBusyId("");
    }
  }

  return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">{view === "jobs" ? `当前收录 ${catalogMeta.catalogTotal} 个岗位` : "690 家企业官方入口"}</p><h2>{view === "jobs" ? "找到值得认真准备的机会" : "去企业官网看看新的可能"}</h2>{view === "portals" && <span>没有开放职位接口的企业，也可以从这里直达官方招聘网站。</span>}</div></section>
    <nav className="jobs-view-switch" aria-label="职位库内容"><button type="button" aria-current={view === "jobs" ? "page" : undefined} onClick={() => setView("jobs")}><BriefcaseBusiness size={17} /><span><strong>具体岗位</strong><small>搜索可直接投递的职位</small></span></button><button type="button" aria-current={view === "portals" ? "page" : undefined} onClick={() => setView("portals")}><Building2 size={17} /><span><strong>企业校招入口</strong><small>进入企业官方招聘网站</small></span></button></nav>
    {view === "portals" ? <CareerPortalDirectory notify={notify} /> : <>
    <section className="preference-strip">
      <span className="preference-orbit"><Target size={18} /></span>
      <div><p className="eyebrow">我的求职偏好</p><strong>{hasJobPreferences(preferences) ? [preferences.roleKeywords.slice(0, 2).join(" / "), preferences.cities.slice(0, 2).join(" / "), preferences.graduationYear ? `${preferences.graduationYear} 届` : ""].filter(Boolean).join(" · ") || "已设置偏好" : "先告诉职途你想找什么"}</strong><small>{hasJobPreferences(preferences) ? "偏好只用于筛选与排序，不会改变简历匹配分。" : "设置岗位方向、城市和届别，职位库会优先呈现更合适的机会。"}</small></div>
      <button type="button" className="preference-edit" onClick={() => setPreferenceOpen(true)}><PenLine size={15} />{hasJobPreferences(preferences) ? "调整偏好" : "设置偏好"}</button>
    </section>
    <section className="filter-card">
      <label className="search-large"><Search /><input placeholder="搜索职位、公司或行业关键词" value={query} onChange={(e) => { setQuery(e.target.value); setPageNumber(1); }} /></label>
      <div className="filter-row">
        <label className="select-filter company-filter"><span>公司</span><input aria-label="公司" placeholder="全部公司 / 输入名称" value={company} onChange={(e) => { setCompany(e.target.value); setPageNumber(1); }} /></label>
        <label className="select-filter"><span>学历</span><select aria-label="学历" value={education} onChange={(e) => setEducation(e.target.value)}><option>全部学历</option>{educations.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="select-filter"><span>城市</span><select aria-label="城市" value={city} onChange={(e) => { setCity(e.target.value); setPageNumber(1); }}><option>全部城市</option>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="select-filter"><span>招聘类型</span><select aria-label="招聘类型" value={recruitmentType} onChange={(e) => { setRecruitmentType(e.target.value as typeof recruitmentType); setPageNumber(1); }}><option value="all">全部</option><option value="graduate">校招</option><option value="internship">实习</option></select></label>
        <button type="button" aria-pressed={preferredOnly} className={preferredOnly ? "filter-active preference-filter" : "preference-filter"} onClick={() => { if (!hasJobPreferences(preferences)) return setPreferenceOpen(true); setPreferredOnly(!preferredOnly); setPageNumber(1); }}><Target size={14} />符合我的偏好</button>
        <button type="button" aria-pressed={savedOnly} className={savedOnly ? "filter-active" : ""} onClick={() => { setSavedOnly(!savedOnly); setPageNumber(1); }}><Bookmark size={14} />仅看收藏</button>
      </div>
    </section>
    <section className="jobs-card">
      <div className="table-toolbar"><span>共找到 <strong>{catalogMeta.total}</strong> 个职位</span><span>{compare.length > 0 && <button className="compare-button" onClick={() => setCompareOpen(true)}>比较职位 ({compare.length})</button>}<label className="sort-control"><select aria-label="职位排序" value={sortBy} onChange={(event) => { setSortBy(event.target.value as typeof sortBy); setPageNumber(1); }}><option value="published">页面日期优先</option><option value="company">公司名称排序</option></select><ChevronDown size={14} /></label></span></div>
      <div className="job-table" role="table">
        <div className="job-table-head" role="row"><span>职位与公司</span><span>职位要求</span><span>来源 / 发布时间</span><span>匹配度</span><span>操作</span></div>
        {loading ? <div className="jobs-empty"><span className="loading-dot" />正在加载职位…</div> : filtered.length === 0 ? <div className="jobs-empty"><Search size={22} /><strong>没有符合条件的职位</strong><span>调整关键词或筛选条件后再试试。</span></div> : pagedJobs.map((job) => <div className="job-table-row" role="row" key={job.id}>
          <div className="job-main"><label className="check"><input type="checkbox" checked={compare.includes(job.id)} onChange={() => setCompare(compare.includes(job.id) ? compare.filter((id) => id !== job.id) : [...compare, job.id])} /><span /></label><span className="company-logo big">{job.company.slice(0, 1)}</span><span><strong>{job.title}</strong><small>{job.company} · {job.location}</small><em>{hasJobPreferences(preferences) && preferenceMatches.get(job.id)?.eligible && <i className={`preference-rank rank-${preferenceMatches.get(job.id)?.level.toLowerCase()}`}>{preferenceMatches.get(job.id)?.level} 偏好</i>}{job.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</em></span></div>
          <div className="requirements"><strong>{job.salary}</strong><span>{job.experience} · {job.education}</span></div>
          <div className="source-cell"><strong>{job.source}</strong><span>{job.publishedAt}</span></div>
          <div className={`match-score ${job.match >= 85 ? "high" : ""}`}>{job.match > 0 ? <><strong>{job.match}<small>%</small></strong><span>较匹配</span></> : <><strong>—</strong><span>待分析</span></>}</div>
          <div className="job-actions"><button className={`save-button ${job.saved ? "saved" : ""}`} aria-label={job.saved ? "取消收藏" : "收藏"} onClick={() => toggleSave(job)}><Bookmark size={17} fill={job.saved ? "currentColor" : "none"} /></button><button className="apply-button" disabled={busyId === job.id} onClick={() => prepare(job)}>{job.status === "preparing" ? "继续投递" : job.status && !["saved", "closed"].includes(job.status) ? "查看岗位" : "去投递"} <ArrowUpRight size={15} /></button></div>
        </div>)}
      </div>
      {catalogMeta.total > catalogMeta.pageSize && <div className="pagination"><button disabled={visiblePage === 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>上一页</button><span>{visiblePage} / {pageCount}</span><button disabled={visiblePage === pageCount} onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}>下一页</button></div>}
    </section>
    {pendingJob && <div className="modal-backdrop"><section className="application-confirm" role="dialog" aria-modal="true" aria-labelledby="application-confirm-title"><div className="application-route"><span>准备投递</span><i /><span>确认结果</span><i /><span>计入统计</span></div><button className="modal-x" onClick={() => setPendingJob(null)} aria-label="关闭"><X /></button><span className="company-logo big">{pendingJob.company.slice(0, 1)}</span><p className="eyebrow">刚刚打开了投递页面</p><h3 id="application-confirm-title">{pendingJob.company} · {pendingJob.title}</h3><p>你是否已经在招聘页面成功提交？只有确认成功后，才会计入投递数量。</p><div className="application-confirm-actions"><button onClick={() => setPendingJob(null)}>返回</button><button className="primary-button" disabled={busyId === pendingJob.id} onClick={() => recordResult()}><CheckCircle2 size={16} />确认已投递</button></div></section></div>}
    {compareOpen && <div className="modal-backdrop"><section className="job-compare" role="dialog" aria-modal="true" aria-labelledby="job-compare-title"><header><div><p className="eyebrow">职位比较</p><h3 id="job-compare-title">并排查看 {comparedJobs.length} 个机会</h3></div><button aria-label="关闭比较" onClick={() => setCompareOpen(false)}><X /></button></header><div className="compare-grid">{comparedJobs.map((job) => <article key={job.id}><span className="company-logo big">{job.company.slice(0,1)}</span><h4>{job.title}</h4><p>{job.company} · {job.location}</p><dl><div><dt>薪资</dt><dd>{job.salary}</dd></div><div><dt>经验</dt><dd>{job.experience}</dd></div><div><dt>学历</dt><dd>{job.education}</dd></div><div><dt>来源</dt><dd>{job.source}</dd></div><div><dt>匹配度</dt><dd>{job.match ? `${job.match}%` : "待分析"}</dd></div></dl><button className="secondary-button" onClick={() => void prepare(job)}>打开投递页</button></article>)}</div></section></div>}
    {preferenceOpen && <JobPreferenceDialog preferences={preferences} cityOptions={catalogMeta.cities} companyOptions={catalogMeta.companies} notify={notify} onClose={() => setPreferenceOpen(false)} onSaved={(next) => { onPreferencesUpdated(next); setPreferenceOpen(false); setPageNumber(1); notify("求职偏好已保存"); }} />}
    </>}
  </div>;
}

function splitPreferenceInput(value: string) {
  return [...new Set(value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
}

function JobPreferenceDialog({ preferences, cityOptions, companyOptions, notify, onClose, onSaved }: { preferences: JobPreferences; cityOptions: string[]; companyOptions: string[]; notify: (text: string) => void; onClose: () => void; onSaved: (preferences: JobPreferences) => void }) {
  const [graduationYear, setGraduationYear] = useState(preferences.graduationYear);
  const roleLabels = useMemo(() => new Set(ROLE_DIRECTION_OPTIONS.map((option) => option.label)), []);
  const [selectedRoles, setSelectedRoles] = useState(preferences.roleKeywords.filter((item) => roleLabels.has(item)));
  const [customRoles, setCustomRoles] = useState(preferences.roleKeywords.filter((item) => !roleLabels.has(item)).join("、"));
  const [cities, setCities] = useState(preferences.cities);
  const [focusCompanies, setFocusCompanies] = useState(preferences.focusCompanies.join("、"));
  const [excludedKeywords, setExcludedKeywords] = useState(preferences.excludedKeywords.join("、"));
  const [recruitmentTypes, setRecruitmentTypes] = useState(preferences.recruitmentTypes);
  const [saving, setSaving] = useState(false);
  const popularCities = useMemo(() => cityOptions.filter((item) => item !== "地点待确认").slice(0, 18), [cityOptions]);

  function toggleRecruitmentType(value: "graduate" | "internship") {
    setRecruitmentTypes((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleValue(value: string, current: string[], setter: (next: string[]) => void) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value].slice(0, 12));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (graduationYear && !/^20\d{2}$/.test(graduationYear)) return notify("届别请填写四位年份，例如 2027");
    const next: JobPreferences = {
      graduationYear,
      roleKeywords: [...new Set([...selectedRoles, ...splitPreferenceInput(customRoles)])].slice(0, 12),
      cities,
      recruitmentTypes,
      focusCompanies: splitPreferenceInput(focusCompanies),
      excludedKeywords: splitPreferenceInput(excludedKeywords),
    };
    if (isDemoMode) return onSaved(next);
    setSaving(true);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobPreferences: next }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "求职偏好保存失败");
      onSaved(payload.jobPreferences as JobPreferences);
    } catch (error) {
      notify(error instanceof Error ? error.message : "求职偏好保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop"><section className="job-preference-dialog" role="dialog" aria-modal="true" aria-labelledby="job-preference-title">
    <button className="modal-x" type="button" onClick={onClose} aria-label="关闭求职偏好"><X /></button>
    <span className="preference-dialog-icon"><Target size={20} /></span><p className="eyebrow">职位库真实标签</p><h3 id="job-preference-title">设置我的求职偏好</h3><p className="dialog-copy">直接选择职位库能够识别的方向和城市。同一方向会自动覆盖常见写法，例如“数据分析”也会识别商业分析、经营分析和 BI。</p>
    <form onSubmit={save} className="preference-form">
      <label><span>毕业届别</span><select value={graduationYear} onChange={(event) => setGraduationYear(event.target.value)}><option value="">不限届别</option>{[2026, 2027, 2028, 2029, 2030].map((year) => <option key={year} value={year}>{year} 届</option>)}</select></label>
      <fieldset><legend>招聘类型</legend><button type="button" aria-pressed={recruitmentTypes.includes("graduate")} onClick={() => toggleRecruitmentType("graduate")}>校招</button><button type="button" aria-pressed={recruitmentTypes.includes("internship")} onClick={() => toggleRecruitmentType("internship")}>实习</button></fieldset>
      <fieldset className="wide preference-choice-field"><legend>岗位方向 <small>可多选</small></legend><div className="preference-choice-grid">{ROLE_DIRECTION_OPTIONS.map((option) => <button type="button" key={option.label} aria-pressed={selectedRoles.includes(option.label)} onClick={() => toggleValue(option.label, selectedRoles, setSelectedRoles)}>{option.label}</button>)}</div><label className="preference-custom"><span>没有想要的方向？补充职位关键词</span><input placeholder="例如 ESG、精算、医药研发" value={customRoles} onChange={(event) => setCustomRoles(event.target.value)} /></label></fieldset>
      <fieldset className="wide preference-choice-field"><legend>意向城市 <small>选项来自当前职位库</small></legend><div className="preference-choice-grid city-choices">{popularCities.map((item) => <button type="button" key={item} aria-pressed={cities.includes(item)} onClick={() => toggleValue(item, cities, setCities)}>{item}</button>)}</div>{cities.some((item) => !popularCities.includes(item)) && <div className="preference-selected-list" aria-label="已选其他城市">{cities.filter((item) => !popularCities.includes(item)).map((item) => <button type="button" key={item} onClick={() => setCities(cities.filter((cityName) => cityName !== item))}>{item}<X size={12} /></button>)}</div>}{cityOptions.length > popularCities.length && <label className="preference-more"><span>更多城市</span><select value="" onChange={(event) => { if (event.target.value && !cities.includes(event.target.value)) setCities([...cities, event.target.value].slice(0, 12)); }}><option value="">从职位库选择</option>{cityOptions.filter((item) => item !== "地点待确认" && !cities.includes(item)).map((item) => <option key={item}>{item}</option>)}</select></label>}</fieldset>
      <label className="wide"><span>关注公司 <small>用于偏好加分，不会排除其他公司</small></span><input list="job-preference-companies" placeholder="输入公司名称，用逗号分隔" value={focusCompanies} onChange={(event) => setFocusCompanies(event.target.value)} /><datalist id="job-preference-companies">{companyOptions.map((item) => <option key={item} value={item} />)}</datalist></label>
      <label className="wide"><span>排除关键词</span><input placeholder="例如 销售、电话邀约、纯佣金" value={excludedKeywords} onChange={(event) => setExcludedKeywords(event.target.value)} /><small>命中这些词的岗位不会进入“符合我的偏好”。</small></label>
      <div className="preference-actions wide"><button type="button" onClick={() => { setGraduationYear(""); setSelectedRoles([]); setCustomRoles(""); setCities([]); setFocusCompanies(""); setExcludedKeywords(""); setRecruitmentTypes([]); }}>清空</button><button type="submit" className="primary-button" disabled={saving}><Save size={16} />{saving ? "保存中…" : "保存偏好"}</button></div>
    </form>
  </section></div>;
}

function ResumesPage({ suggestions, setSuggestions, notify }: { suggestions: Suggestion[]; setSuggestions: (s: Suggestion[]) => void; notify: (text: string) => void }) {
  const [resumeItems, setResumeItems] = useState<Resume[]>(isDemoMode ? seedResumes : []);
  const [selected, setSelected] = useState<Resume | null>(isDemoMode ? seedResumes[0] : null);
  const [realResumeId, setRealResumeId] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [structured, setStructured] = useState<StructuredResume | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<JobAnalysis | null>(null);
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatedVersion, setGeneratedVersion] = useState<{ versionId: string; targetCompany: string; targetRole: string; acceptedCount: number; createdAt: string; downloadUrl: string } | null>(null);
  const [manualApplicationUrl, setManualApplicationUrl] = useState("");
  const [recordingApplication, setRecordingApplication] = useState(false);
  const [applicationRecorded, setApplicationRecorded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const restoreWorkspace = useCallback(async (resumeId: string) => {
    setAnalysisSummary(null);
    setAnalysisRunId(null);
    setJobDescription("");
    setTargetCompany("");
    setTargetRole("");
    setGeneratedVersion(null);
    setManualApplicationUrl("");
    setApplicationRecorded(false);
    setSuggestions([]);
    const response = await fetch(`/api/resumes/${resumeId}/workspace`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "读取上次岗位分析失败");
    setAnalysisSummary(payload.analysis ?? null);
    setAnalysisRunId(payload.analysisRunId ?? null);
    setJobDescription(payload.jobDescription ?? "");
    setTargetCompany(payload.targetCompany ?? "");
    setTargetRole(payload.targetRole ?? "");
    setGeneratedVersion(payload.generatedVersion ?? null);
    const accepted = new Set<number>(Array.isArray(payload.acceptedSuggestionIndexes) ? payload.acceptedSuggestionIndexes : []);
    const hasGeneratedVersion = Boolean(payload.generatedVersion);
    setSuggestions(Array.isArray(payload.analysis?.suggestions) ? payload.analysis.suggestions.map((item: Omit<Suggestion, "id" | "state">, index: number) => ({
      ...item,
      sourceIndex: index,
      id: `deepseek-${payload.analysisRunId}-${index}`,
      state: accepted.has(index) ? "accepted" as const : hasGeneratedVersion ? "rejected" as const : "pending" as const,
    })) : []);
  }, [setSuggestions]);

  useEffect(() => {
    let active = true;
    fetch("/api/resumes", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "简历列表加载失败");
      if (!active || !Array.isArray(payload.resumes)) return;
      const mapped: Resume[] = payload.resumes.map((resume: { id: string; name: string; mime_type: string; updated_at: string }) => ({
        id: resume.id,
        name: resume.name,
        fileType: resume.mime_type === "application/pdf" ? "PDF" as const : "DOCX" as const,
        updatedAt: new Date(resume.updated_at).toLocaleDateString("zh-CN"),
        completeness: 0,
        skills: [],
      }));
      setResumeItems(mapped);
      setSelected(mapped[0] ?? null);
      setRealResumeId(mapped[0]?.id ?? null);
      setStructured((payload.resumes[0]?.structured_data as StructuredResume | null) ?? null);
      if (mapped.length === 0) setSuggestions([]);
      else await restoreWorkspace(mapped[0].id).catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : "读取上次岗位分析失败");
      });
    }).catch((error) => {
      if (!active || isDemoMode) return;
      setResumeItems([]);
      setSelected(null);
      setRealResumeId(null);
      setLoadError(error instanceof Error ? error.message : "简历列表加载失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [restoreWorkspace, setSuggestions]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return notify("文件不能超过 10MB");
    setUploadName(file.name);
    setUploading(true);
    notify("正在上传并安全解析简历");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/resumes", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "上传失败");
      const next = {
        id: payload.resume.id,
        name: payload.resume.name,
        fileType: payload.resume.mime_type === "application/pdf" ? "PDF" as const : "DOCX" as const,
        updatedAt: "刚刚",
        completeness: 0,
        skills: [],
      };
      setResumeItems((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      setSelected(next);
      setRealResumeId(next.id);
      setStructured(null);
      setAnalysisSummary(null);
      setAnalysisRunId(null);
      setGeneratedVersion(null);
      setSuggestions([]);
      notify("简历解析完成，可以开始匹配岗位");
    } catch (error) {
      notify(error instanceof Error ? error.message : "简历上传失败");
      setUploadName("");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function deleteResume(resume: Resume) {
    if (!window.confirm(`确定删除“${resume.name}”吗？原文件、解析结果和该简历生成的历史版本都会被永久删除。`)) return;
    setDeletingId(resume.id);
    try {
      if (!isDemoMode) {
        const response = await fetch(`/api/resumes/${resume.id}`, { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "删除简历失败");
      }

      const remaining = resumeItems.filter((item) => item.id !== resume.id);
      setResumeItems(remaining);
      if (selected?.id === resume.id) {
        const next = remaining[0] ?? null;
        setSelected(next);
        setRealResumeId(next && !next.id.startsWith("resume-") ? next.id : null);
        setStructured(null);
        setAnalysisSummary(null);
        setAnalysisRunId(null);
        setGeneratedVersion(null);
        setSuggestions([]);
        if (next && !next.id.startsWith("resume-")) {
          const listResponse = await fetch("/api/resumes", { cache: "no-store" });
          const listPayload = await listResponse.json().catch(() => ({}));
          const nextRecord = Array.isArray(listPayload.resumes)
            ? listPayload.resumes.find((item: { id: string }) => item.id === next.id)
            : null;
          setStructured((nextRecord?.structured_data as StructuredResume | null) ?? null);
          await restoreWorkspace(next.id);
        }
      }
      notify("简历已删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除简历失败");
    } finally {
      setDeletingId(null);
    }
  }

  async function parseWithDeepSeek() {
    if (!realResumeId) return notify("请先上传一份真实简历");
    setAnalyzing(true);
    try {
      const response = await fetch("/api/ai/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: realResumeId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "结构化解析失败");
      setStructured(payload.structured);
      notify(payload.cached ? "已读取 DeepSeek 结构化解析结果" : "DeepSeek 结构化解析完成");
    } catch (error) {
      notify(error instanceof Error ? error.message : "结构化解析失败");
    } finally {
      setAnalyzing(false);
    }
  }

  async function analyze() {
    if (!realResumeId) return notify("请先上传一份真实简历");
    if (jobDescription.trim().length < 20) return notify("请粘贴完整的目标岗位 JD");
    setAnalyzing(true);
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: realResumeId, jobDescription, targetCompany, targetRole }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "分析失败");
      setAnalysisSummary(payload);
      setAnalysisRunId(payload.runId);
      setGeneratedVersion(null);
      setSuggestions(payload.suggestions.map((item: Omit<Suggestion, "id" | "state">, index: number) => ({ ...item, sourceIndex: index, id: `deepseek-${payload.runId}-${index}`, state: "pending" as const })));
      notify(`DeepSeek 分析完成，匹配分 ${payload.score}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  }
  function decide(id: string, accept: boolean) {
    const suggestion = suggestions.find((item) => item.id === id);
    if (accept && suggestion?.requiresConfirmation && !window.confirm("这条建议包含原简历中未明确出现的内容。请确认其中新增的课程、技能、工具和经历全部真实，再选择“确定”。")) return;
    setSuggestions(applySuggestion(suggestions, id, accept));
    setGeneratedVersion(null);
    notify(accept ? "已接受并确认这条建议" : "已保留原文");
  }

  async function generateResume() {
    const acceptedItems = suggestions.filter((item) => item.state === "accepted" && item.sourceIndex !== undefined);
    if (!realResumeId || !analysisRunId) return notify("请先完成一次真实 JD 匹配分析");
    if (selected?.fileType !== "DOCX") return notify("保持原排版必须选择原始 DOCX 简历；PDF 只能用于阅读，无法原格式编辑");
    if (!targetCompany.trim() || !targetRole.trim()) return notify("请填写目标公司和岗位名称");
    if (!/[A-Za-z\u4e00-\u9fff]/.test(targetCompany) || !/[A-Za-z\u4e00-\u9fff]/.test(targetRole)) return notify("目标公司和岗位名称不能只填写数字");
    if (acceptedItems.length === 0) return notify("请先接受至少一条真实有效的建议");
    setGenerating(true);
    try {
      const response = await fetch("/api/ai/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: realResumeId,
          analysisRunId,
          acceptedSuggestionIndexes: acceptedItems.map((item) => item.sourceIndex),
          jobDescription,
          targetCompany: targetCompany.trim(),
          targetRole: targetRole.trim(),
          truthConfirmed: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "生成定制简历失败");
      setGeneratedVersion(payload);
      notify("岗位定制简历已生成并保存到版本历史");
    } catch (error) {
      notify(error instanceof Error ? error.message : "生成定制简历失败");
    } finally {
      setGenerating(false);
    }
  }

  async function recordManualApplication() {
    if (!generatedVersion) return notify("请先生成岗位定制简历");
    if (!/^https?:\/\//i.test(manualApplicationUrl.trim())) return notify("请填写完整的原始岗位链接");
    setRecordingApplication(true);
    try {
      const response = await fetch("/api/applications/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: generatedVersion.targetCompany,
          title: generatedVersion.targetRole,
          location: "中国",
          applyUrl: manualApplicationUrl.trim(),
          description: jobDescription.trim() || `${generatedVersion.targetCompany} ${generatedVersion.targetRole}，用户已通过外部招聘页面完成投递。`,
          match: analysisSummary?.score ?? 0,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "记录投递失败");
      setApplicationRecorded(true);
      notify(payload.duplicate ? "这次投递已经记录，无需重复添加" : "已记录为成功投递并加入求职进度");
    } catch (error) {
      notify(error instanceof Error ? error.message : "记录投递失败");
    } finally {
      setRecordingApplication(false);
    }
  }
  const accepted = suggestions.filter((s) => s.state === "accepted").length;
  return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">简历中心</p><h2>让经历被准确看见</h2><span>所有修改由你确认，职途不会编造任何经历或数据。</span></div><label className="primary-button file-button"><Upload size={17} />上传新简历<input type="file" accept=".pdf,.docx" onChange={upload} /></label></section>
    {uploadName && <div className="upload-banner"><FileCheck2 /><span><strong>{uploadName}</strong> {uploading ? "正在解析" : "已完成解析"}</span><em>{uploading ? "请勿关闭页面" : "已安全保存"}</em></div>}
    <div className="resume-layout">
      <aside className="resume-list panel"><div className="section-heading compact"><h3>我的简历</h3><span>{resumeItems.length}/3</span></div>{resumeItems.map((resume) => <article key={resume.id} className={`resume-entry ${selected?.id === resume.id ? "selected" : ""}`}><button className="resume-select" onClick={() => { setSelected(resume); setRealResumeId(resume.id.startsWith("resume-") ? null : resume.id); if (!resume.id.startsWith("resume-")) void restoreWorkspace(resume.id).catch((error) => notify(error instanceof Error ? error.message : "读取上次岗位分析失败")); }}><span className="file-type">{resume.fileType}</span><span><strong>{resume.name}</strong><small>{resume.updatedAt}{resume.completeness ? ` · 完整度 ${resume.completeness}%` : " · 已解析"}</small></span></button><button className="resume-delete" aria-label={`删除 ${resume.name}`} title="删除简历" disabled={deletingId === resume.id} onClick={() => void deleteResume(resume)}>{deletingId === resume.id ? <Clock3 size={15} /> : <Trash2 size={15} />}</button></article>)}<div className="privacy-note"><FileCheck2 size={17} /><span><strong>仅你可见</strong><small>文件使用私有存储和短时链接</small></span></div></aside>
      {loading ? <section className="resume-empty panel" aria-live="polite"><FileText size={30} /><h3>正在读取你的简历</h3><p>文件将通过私有存储安全加载。</p></section> : !selected ? <section className="resume-empty panel"><Upload size={32} /><h3>{loadError ? "简历列表暂时无法加载" : "上传第一份简历"}</h3><p>{loadError || "支持 PDF、DOCX，文件不超过 10MB。上传后即可解析经历并进行 JD 匹配。"}</p>{!loadError && <label className="primary-button file-button"><Upload size={17} />选择简历文件<input type="file" accept=".pdf,.docx" onChange={upload} /></label>}</section> : <section className="resume-workspace panel">
        <div className="resume-toolbar"><div><p className="eyebrow">当前简历</p><h3>{selected.name}</h3></div><span><button className="secondary-button"><FileText size={16} />预览</button><button className="secondary-button">导出 <ChevronDown size={15} /></button></span></div>
        <div className="ai-processing-note"><ShieldCheck size={16} /><span><strong>DeepSeek 只处理解析文本</strong><small>不发送原 PDF/DOCX；所有改写建议均需你逐条确认。</small></span></div>
        <div className="match-hero"><div className="score-ring"><strong>{structured ? <Check size={23} /> : "AI"}</strong><small>{structured ? "已解析" : "待解析"}</small></div><div><p>简历结构化解析</p><h4>{structured ? `${structured.experiences.length} 段经历 · ${structured.projects.length} 个项目` : "让 DeepSeek 提取教育、经历、项目与技能"}</h4><span>{structured ? <><i>{structured.skills.reduce((total, group) => total + group.items.length, 0)} 项技能</i><i className="warn">{structured.uncertainItems.length} 项待确认</i></> : <i>只提取原文明确出现的事实</i>}</span></div><button disabled={analyzing || Boolean(structured)} onClick={parseWithDeepSeek}>{analyzing ? "解析中…" : structured ? "解析完成" : "开始解析"}</button></div>
        <div className="jd-analyzer"><div><p className="eyebrow">目标岗位 JD</p><h4>粘贴真实岗位要求后再进行匹配</h4></div><div className="target-fields"><label>目标公司<input value={targetCompany} onChange={(event) => { setTargetCompany(event.target.value); setGeneratedVersion(null); }} placeholder="例如：字节跳动" /></label><label>岗位名称<input value={targetRole} onChange={(event) => { setTargetRole(event.target.value); setGeneratedVersion(null); }} placeholder="例如：推荐算法工程师" /></label></div><textarea value={jobDescription} onChange={(event) => { setJobDescription(event.target.value); setGeneratedVersion(null); }} placeholder="粘贴职位描述、岗位职责和任职要求…" /><button className="primary-button" disabled={analyzing || jobDescription.trim().length < 20} onClick={analyze}><Sparkles size={15} />{analyzing ? "分析中…" : "分析匹配度"}</button></div>
        {analysisSummary && <div className="match-hero match-result"><div className="score-ring"><strong>{analysisSummary.score}</strong><small>匹配分</small></div><div><p>真实 JD 分析结果</p><h4>已匹配 {analysisSummary.matchedKeywords.length} 个关键词</h4><span><i>{analysisSummary.matchedKeywords.slice(0, 3).join(" · ") || "暂无明确匹配词"}</i><i className="warn">待补充 {analysisSummary.missingKeywords.length} 项</i></span></div></div>}
        <div className="suggestion-heading"><div><h4>逐条优化建议</h4><span>已接受 {accepted}/{suggestions.length} 条</span></div><p>{suggestions.length ? "建议只基于你的原始经历，带数字的内容请确认真实有效。" : "完成真实 JD 分析后，建议会在这里逐条展示；每条都保留原文供你确认。"}</p></div>
        <div className="suggestion-list">{suggestions.map((item) => <article className={`suggestion ${item.state}`} key={item.id}><header><span>{item.section}</span><span className="suggestion-flags">{item.requiresConfirmation && <em className="confirm-flag">需确认真实性</em>}<em className={`impact impact-${item.impact}`}>{item.impact}影响</em></span></header><div className="copy-compare"><div><small>原文</small><p>{item.original}</p></div><div className="revised"><small><Sparkles size={13} />建议版本</small><p>{item.revised}</p></div></div><footer><span><Sparkles size={14} />{item.reason}</span>{item.state === "pending" ? <div><button onClick={() => decide(item.id, false)}><X size={15} />保留原文</button><button className="accept" onClick={() => decide(item.id, true)}><Check size={15} />接受建议</button></div> : <strong>{item.state === "accepted" ? <><CheckCircle2 size={15} />已接受</> : <><XCircle size={15} />已跳过</>}</strong>}</footer></article>)}</div>
        {suggestions.length > 0 && <section className={`delivery-version ${generatedVersion ? "ready" : ""} ${selected.fileType !== "DOCX" ? "needs-template" : ""}`}><div className="version-stamp"><FileCheck2 /><span>{generatedVersion ? "READY" : selected.fileType === "DOCX" ? "DRAFT" : "DOCX"}</span></div><div><p className="eyebrow">投递版本 · 原格式保真</p><h4>{generatedVersion ? `${generatedVersion.targetCompany} · ${generatedVersion.targetRole}` : selected.fileType === "DOCX" ? "在原始 Word 模板中替换已接受文字" : "请上传并选择原始 DOCX 简历"}</h4><span>{generatedVersion ? `采用 ${generatedVersion.acceptedCount} 条已确认建议 · 字体、字号、页边距与栏目结构继承原文件` : selected.fileType === "DOCX" ? `当前已接受 ${accepted} 条建议，只替换文字，不重新设计排版` : "PDF 无法进行原格式编辑，系统不会再用通用模板生成"}</span></div>{generatedVersion ? <div className="delivery-actions"><a className="primary-button" href={generatedVersion.downloadUrl}><Download size={16} />下载 DOCX</a><label><span>原始岗位链接</span><input aria-label="原始岗位链接" value={manualApplicationUrl} onChange={(event) => { setManualApplicationUrl(event.target.value); setApplicationRecorded(false); }} placeholder="https://…" /></label><button className="secondary-button" disabled={recordingApplication || applicationRecorded} onClick={recordManualApplication}>{applicationRecorded ? <><CheckCircle2 size={15} />已记录投递</> : recordingApplication ? "记录中…" : "记录已投递"}</button></div> : selected.fileType === "DOCX" ? <button className="primary-button" disabled={generating || accepted === 0} onClick={generateResume}><FilePenLine size={16} />{generating ? "生成中…" : "生成投递简历"}</button> : <label className="primary-button file-button"><Upload size={16} />上传原始 DOCX<input type="file" accept=".docx" onChange={upload} /></label>}</section>}
      </section>}
    </div>
  </div>;
}

function ProgressPage({ jobs, refreshJobs, notify, onOpenMailSettings }: { jobs: Job[]; refreshJobs: () => Promise<void>; notify: (text: string) => void; onOpenMailSettings: () => void }) {
  const columns = [
    { key: "preparing", label: "准备投递", tone: "apricot" }, { key: "applied", label: "已投递", tone: "blue" }, { key: "assessment", label: "测评", tone: "purple" }, { key: "interview", label: "面试", tone: "sage" }, { key: "offer", label: "Offer", tone: "coral" },
    { key: "rejected", label: "已拒绝", tone: "coral" }, { key: "closed", label: "已结束", tone: "blue" },
  ];
  const [busyId, setBusyId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);
  const [hiddenDemoJobIds, setHiddenDemoJobIds] = useState<string[]>([]);
  const visibleJobs = isDemoMode ? jobs.filter((job) => !hiddenDemoJobIds.includes(job.id)) : jobs;
  async function confirm(job: Job) {
    if (!job.applicationId) return notify("找不到投递记录，请从职位库重新打开投递页面");
    setBusyId(job.id);
    try {
      if (!isDemoMode) {
        const response = await fetch(`/api/applications/${job.applicationId}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outcome: "applied" }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "无法确认投递");
        await refreshJobs();
      }
      notify("投递已确认，已计入投递总数");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法确认投递");
    } finally {
      setBusyId("");
    }
  }
  async function changeStatus(job: Job, status: Job["status"]) {
    if (!job.applicationId || !status) return;
    setBusyId(job.id);
    try {
      if (isDemoMode) return notify("演示模式不会写入进度");
      const response = await fetch(`/api/applications/${job.applicationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "无法更新求职进度");
      await refreshJobs();
      notify(`已更新为“${statusLabel(status)}”，并写入时间线`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法更新求职进度");
    } finally {
      setBusyId("");
    }
  }
  async function deleteApplication() {
    if (!pendingDelete?.applicationId) return notify("找不到这条投递记录");
    setBusyId(pendingDelete.id);
    try {
      if (isDemoMode) {
        setHiddenDemoJobIds((current) => [...current, pendingDelete.id]);
      } else {
        const response = await fetch(`/api/applications/${pendingDelete.applicationId}`, { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "无法删除投递记录");
        await refreshJobs();
      }
      setPendingDelete(null);
      notify("投递记录已从看板删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法删除投递记录");
    } finally {
      setBusyId("");
    }
  }
  return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">求职进度</p><h2>下一步，总是清清楚楚</h2><span>邮件进展会先生成建议，确认后才改变申请状态。</span></div><button className="secondary-button" onClick={onOpenMailSettings}><Inbox size={17} />绑定邮箱</button></section>
    <div className="progress-stats"><div><span className="stat-icon coral"><ArrowUpRight /></span><p><strong>{confirmedApplicationCount(visibleJobs)}</strong><small>已确认投递</small></p><em>不含准备投递</em></div><div><span className="stat-icon sage"><CalendarDays /></span><p><strong>{visibleJobs.filter((job) => job.status === "interview").length}</strong><small>进行中面试</small></p><em>来自真实记录</em></div><div><span className="stat-icon apricot"><ClipboardCheck /></span><p><strong>{visibleJobs.filter((job) => job.status === "preparing").length}</strong><small>待确认投递</small></p><em>返回后确认结果</em></div><div><span className="stat-icon blue"><Target /></span><p><strong>{visibleJobs.length ? Math.round(visibleJobs.filter((job) => job.status === "interview" || job.status === "offer").length / Math.max(confirmedApplicationCount(visibleJobs), 1) * 100) : 0}%</strong><small>面试转化率</small></p><em>按已确认投递计算</em></div></div>
    <section className="kanban-wrap"><div className="kanban-toolbar"><h3>申请看板</h3><span><small>每次变化都会写入不可覆盖的时间线</small></span></div><div className="kanban">{columns.map((col) => { const items = visibleJobs.filter((job) => job.status === col.key); return <div className="kanban-column" key={col.key}><header><span><i className={col.tone} />{col.label}</span><b>{items.length}</b></header>{items.length === 0 ? <div className="empty-column"><span>这里还没有职位</span></div> : items.map((job) => <article className="kanban-card" key={job.id}><div className="kanban-card-head"><span className="company-logo">{job.company.slice(0, 1)}</span><span className="kanban-card-actions"><span className="event-count">{job.events?.length || 0} 条记录</span><button className="kanban-delete" type="button" disabled={busyId === job.id} aria-label={`删除 ${job.company} ${job.title} 的投递记录`} title="删除投递记录" onClick={() => setPendingDelete(job)}><Trash2 size={14} /></button></span></div><h4>{job.title}</h4><p>{job.company} · {job.location}</p><span className="kanban-tags"><i>{job.source}</i><i>{job.match}% 匹配</i></span>{job.status === "preparing" && <button className="confirm-button" disabled={busyId === job.id} onClick={() => confirm(job)}>确认已投递</button>}{job.status && job.applicationId && <label className="status-select"><span>更新阶段</span><select aria-label={`${job.company} ${job.title} 求职阶段`} disabled={busyId === job.id} value={job.status} onChange={(event) => void changeStatus(job, event.target.value as Job["status"])}>{applicationStatuses.filter((status) => canTransition(job.status!, status)).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>}<footer><Clock3 size={13} />{job.events?.[0] ? `${new Date(job.events[0].createdAt).toLocaleString("zh-CN")} · ${statusLabel(job.events[0].toStatus)}` : job.publishedAt + "更新"}</footer></article>)}</div>; })}</div></section>
    {pendingDelete && <div className="modal-backdrop"><section className="application-confirm delete-application-confirm" role="dialog" aria-modal="true" aria-labelledby="delete-application-title"><button className="modal-x" onClick={() => setPendingDelete(null)} aria-label="关闭"><X /></button><span className="delete-confirm-icon"><Trash2 /></span><p className="eyebrow">删除投递记录</p><h3 id="delete-application-title">{pendingDelete.company} · {pendingDelete.title}</h3><p>删除后，这条申请会从看板、投递统计和进度列表中隐藏。以后重新投递该岗位时可以再次恢复。</p><div className="delete-application-actions"><button onClick={() => setPendingDelete(null)}>返回</button><button className="danger-button" disabled={busyId === pendingDelete.id} onClick={() => void deleteApplication()}>{busyId === pendingDelete.id ? "删除中…" : "确认删除"}</button></div></section></div>}
  </div>;
}

function statusLabel(status: Job["status"]) {
  return ({ saved: "已收藏", preparing: "准备投递", applied: "已投递", assessment: "测评", interview: "面试", offer: "Offer", rejected: "已拒绝", closed: "已结束" } as Record<string, string>)[status || ""] || "状态更新";
}

function ReviewsPage({ reviews, setReviews, notify }: { reviews: InterviewReview[]; setReviews: (r: InterviewReview[]) => void; notify: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(!isDemoMode);
  const [saving, setSaving] = useState(false);
  const emptyForm = useCallback((): InterviewReview => ({
    id: "", company: "", role: "", round: "业务一面",
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()),
    interviewer: "", score: 3, questions: "", answerSummary: "", highlights: "", improvements: "", nextStep: "", nextRoundPrep: "",
  }), []);
  const [form, setForm] = useState<InterviewReview>(() => ({ id: "", company: "", role: "", round: "业务一面", date: "2026-08-13", interviewer: "", score: 3, questions: "", answerSummary: "", highlights: "", improvements: "", nextStep: "", nextRoundPrep: "" }));

  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    async function loadReviews() {
      try {
        const response = await fetch("/api/interview-reviews", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "面试复盘加载失败");
        if (active) setReviews(Array.isArray(payload.reviews) ? payload.reviews : []);
      } catch (error) {
        if (active) notify(error instanceof Error ? error.message : "面试复盘加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReviews();
    return () => { active = false; };
  }, [notify, setReviews]);

  function createReview() {
    setForm(emptyForm());
    setEditing(true);
  }

  function editReview(review: InterviewReview) {
    setForm({ ...emptyForm(), ...review });
    setEditing(true);
  }

  async function save() {
    if (!form.company.trim() || !form.role.trim()) return notify("请先填写公司和岗位");
    setSaving(true);
    try {
      if (isDemoMode) {
        const next = { ...form, id: form.id || crypto.randomUUID() };
        setReviews(form.id ? reviews.map((item) => item.id === form.id ? next : item) : [next, ...reviews]);
      } else {
        const response = await fetch(form.id ? `/api/interview-reviews/${form.id}` : "/api/interview-reviews", {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "面试复盘保存失败");
        const saved = payload.review as InterviewReview;
        setReviews(form.id ? reviews.map((item) => item.id === saved.id ? saved : item) : [saved, ...reviews]);
      }
      setEditing(false);
      notify("复盘已保存，刷新后也会保留");
    } catch (error) {
      notify(error instanceof Error ? error.message : "面试复盘保存失败");
    } finally {
      setSaving(false);
    }
  }
  return <div className="page-stack">
    <section className="page-intro"><div><p className="eyebrow">面试复盘</p><h2>把一次面试，变成长期能力</h2><span>趁记忆清晰时记下问题、表现和下一步。</span></div><button className="primary-button" onClick={createReview}><Plus size={17} />记录一次面试</button></section>
    {loading ? <section className="resume-empty panel"><Clock3 size={32} /><h3>正在加载复盘记录</h3><p>你的内容只对当前账号可见。</p></section> : reviews.length === 0 ? <section className="resume-empty panel"><MessageSquareText size={32} /><h3>还没有面试复盘</h3><p>完成一次真实面试后，在这里记录问题、表现亮点和下一步准备。</p><button className="primary-button" onClick={createReview}><Plus size={17} />记录第一次面试</button></section> : <div className="review-layout">
      <section className="panel review-list"><div className="section-heading compact"><div><h3>复盘记录</h3><span>共 {reviews.length} 次</span></div><button className="text-button">按时间排序</button></div>{reviews.map((review) => <article key={review.id}><div className="review-date"><strong>{review.date.slice(8)}</strong><span>{review.date.slice(5, 7)}月</span></div><div><p>{review.company}<span>{review.round}</span></p><h4>{review.role}</h4><small>自评分</small><span className="stars">{[1,2,3,4,5].map((n) => <Star key={n} size={15} fill={n <= review.score ? "currentColor" : "none"} />)}</span></div><button><ArrowUpRight /></button></article>)}</section>
      <section className="panel review-detail"><div className="detail-head"><div><p className="eyebrow">最近一次复盘</p><h3>{reviews[0]?.company} · {reviews[0]?.round}</h3><span>{reviews[0]?.role} · {reviews[0]?.date}{reviews[0]?.interviewer ? ` · ${reviews[0].interviewer}` : ""}</span></div><button className="secondary-button" onClick={() => editReview(reviews[0])}><PenLine size={16} />编辑</button></div><ReviewBlock title="遇到的问题" content={reviews[0]?.questions} tone="apricot" />{reviews[0]?.answerSummary && <ReviewBlock title="回答摘要" content={reviews[0].answerSummary} tone="blue" />}<div className="review-pair"><ReviewBlock title="做得不错" content={reviews[0]?.highlights} tone="sage" /><ReviewBlock title="可以更好" content={reviews[0]?.improvements} tone="coral" /></div><ReviewBlock title="下一步准备" content={reviews[0]?.nextStep} tone="blue" />{reviews[0]?.nextRoundPrep && <ReviewBlock title="下轮准备" content={reviews[0].nextRoundPrep} tone="sage" />}</section>
    </div>}
    {editing && <div className="modal-backdrop"><div className="review-modal" role="dialog" aria-modal="true"><header><div><p className="eyebrow">面试结束后 10 分钟</p><h3>{form.id ? "编辑面试复盘" : "记录这次面试"}</h3></div><button onClick={() => setEditing(false)}><X /></button></header><div className="form-grid"><label>公司<input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="例如：字节跳动" /></label><label>岗位<input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="例如：AI 产品经理" /></label><label>面试轮次<select value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })}><option>HR 初筛</option><option>业务一面</option><option>业务二面</option><option>终面</option></select></label><label>日期<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>面试官<input value={form.interviewer || ""} onChange={(e) => setForm({ ...form, interviewer: e.target.value })} placeholder="姓名或团队（选填）" /></label><label>自评分<select value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}>{[1,2,3,4,5].map((score) => <option key={score} value={score}>{score} 星</option>)}</select></label></div><label>遇到的问题<textarea value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} placeholder="每行记录一个问题" /></label><label>回答摘要<textarea value={form.answerSummary || ""} onChange={(e) => setForm({ ...form, answerSummary: e.target.value })} placeholder="记录关键回答与面试官反馈" /></label><div className="form-grid"><label>做得不错<textarea value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} /></label><label>可以更好<textarea value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} /></label></div><div className="form-grid"><label>后续任务<textarea value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} /></label><label>下轮准备<textarea value={form.nextRoundPrep || ""} onChange={(e) => setForm({ ...form, nextRoundPrep: e.target.value })} /></label></div><footer><span>内容仅你可见并保存到账号</span><div><button className="secondary-button" disabled={saving} onClick={() => setEditing(false)}>取消</button><button className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存复盘"}</button></div></footer></div></div>}
  </div>;
}

function ReviewBlock({ title, content, tone }: { title: string; content?: string; tone: string }) { return <div className={`review-block ${tone}`}><h4>{title}</h4>{content?.split("\n").map((line, i) => <p key={i}>{line}</p>)}</div>; }

function Notifications({ onClose, notify, onChanged }: { onClose: () => void; notify: (text: string) => void; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (isDemoMode) {
        setItems([
          { id: "demo-assessment", kind: "email_assessment", title: "线上测评即将截止", body: "蚂蚁集团 · 今天 18:00", read_at: null, scheduled_for: null, created_at: new Date().toISOString(), metadata: null, action_status: null },
          { id: "demo-interview", kind: "email_interview", title: "明天有一场业务面试", body: "字节跳动 · 14:30", read_at: null, scheduled_for: null, created_at: new Date().toISOString(), metadata: null, action_status: null },
        ]);
        setLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "通知加载失败");
        if (active) setItems(Array.isArray(payload.notifications) ? payload.notifications : []);
      } catch (error) {
        if (active) notify(error instanceof Error ? error.message : "通知加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [notify]);

  async function decide(id: string, accept: boolean) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/notifications/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "操作失败");
      setItems((current) => current.map((item) => item.id === id ? { ...item, action_status: accept ? "accepted" : "rejected", read_at: new Date().toISOString() } : item));
      if (accept) await onChanged();
      notify(accept ? "已确认并更新求职进度" : "已忽略这条状态建议");
    } catch (error) {
      notify(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusyId("");
    }
  }

  return <div className="notifications" role="dialog" aria-label="通知中心">
    <header><h3>通知</h3><button onClick={onClose} aria-label="关闭通知"><X size={17} /></button></header>
    {loading && <p className="notice-empty">正在读取通知…</p>}
    {!loading && items.length === 0 && <p className="notice-empty">暂时没有新通知。转发招聘邮件后，识别结果会显示在这里。</p>}
    {items.map((item) => {
      const isInterview = item.kind.includes("interview");
      const metadata = item.metadata || {};
      const company = typeof metadata.company === "string" ? metadata.company : "";
      const role = typeof metadata.role === "string" ? metadata.role : "";
      return <div className="notice-row" key={item.id}>
        <span className={`notice-icon ${isInterview ? "sage" : "apricot"}`}>{isInterview ? <CalendarDays /> : <ClipboardCheck />}</span>
        <p><strong>{item.title}</strong><small>{[company, role, item.body].filter(Boolean).join(" · ")}</small>{item.action_status === "pending" && <span className="notice-actions"><button disabled={busyId === item.id} onClick={() => decide(item.id, false)}>忽略</button><button disabled={busyId === item.id} onClick={() => decide(item.id, true)}>确认更新</button></span>}{item.action_status === "accepted" && <em className="notice-resolved">已确认</em>}{item.action_status === "rejected" && <em className="notice-resolved">已忽略</em>}</p>
      </div>;
    })}
  </div>;
}

function AccountSettings({ profile, onClose, notify, onUpdated, onOpenAdmin }: {
  profile: AccountProfile | null;
  onClose: () => void;
  notify: (text: string) => void;
  onUpdated: (displayName: string) => void;
  onOpenAdmin: () => void;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [firstPasswordSetup, setFirstPasswordSetup] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "用户 ID 保存失败");
      setDisplayName(payload.displayName);
      onUpdated(payload.displayName);
      notify("用户 ID 已更新");
    } catch (profileError) {
      notify(profileError instanceof Error ? profileError.message : "用户 ID 保存失败");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!profile?.email) return notify("账号邮箱尚未加载，请稍后重试");
    if (newPassword !== passwordConfirmation) return notify("两次输入的新密码不一致");
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return notify("新密码至少 8 位，并包含字母和数字");
    if (!firstPasswordSetup && newPassword === currentPassword) return notify("新密码不能与当前密码相同");

    setSavingPassword(true);
    try {
      if (firstPasswordSetup) {
        const response = await fetch("/api/auth/set-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: newPassword, confirmation: passwordConfirmation }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "密码设置失败");
        setNewPassword("");
        setPasswordConfirmation("");
        setFirstPasswordSetup(false);
        notify("密码已设置，下次可以使用邮箱和密码登录");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("登录服务尚未配置");
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
      if (verifyError) throw new Error("当前密码不正确");
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message.includes("weak") ? "新密码强度不足，请换一个更复杂的密码" : "密码修改失败");
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      notify("密码已修改，下次请使用新密码登录");
    } catch (passwordError) {
      notify(passwordError instanceof Error ? passwordError.message : "密码修改失败");
    } finally {
      setSavingPassword(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mail-settings account-settings" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <header><div><p className="eyebrow">账号与管理</p><h3 id="account-settings-title">管理你的账号</h3></div><button onClick={onClose} aria-label="关闭账号设置"><X /></button></header>
      <p className="mail-settings-lead">用户 ID 只用于站内显示，不是登录凭证；登录邮箱不会公开展示给其他用户。</p>
      <section className="account-section">
        <div className="account-section-heading"><span className="account-section-icon"><CircleUserRound size={18} /></span><div><h4>用户 ID</h4><p>{profile?.email || "正在读取账号邮箱…"}</p></div></div>
        <form className="account-form account-id-form" onSubmit={saveProfile}><label htmlFor="account-display-name">自定义用户 ID</label><div><input id="account-display-name" required minLength={2} maxLength={24} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="2—24 个字符" /><button className="primary-button" disabled={savingProfile || !profile}><Save size={15} />{savingProfile ? "保存中…" : "保存 ID"}</button></div></form>
      </section>
      <section className="account-section">
        <div className="account-section-heading"><span className="account-section-icon"><KeyRound size={18} /></span><div><h4>{firstPasswordSetup ? "首次设置密码" : "修改已有密码"}</h4><p>{firstPasswordSetup ? "适用于刚刚通过邮箱验证码登录、尚未设置密码的账号。" : "修改前需要验证当前密码。"}</p></div></div>
        <div className="password-mode-toggle" role="group" aria-label="密码设置方式"><button type="button" className={firstPasswordSetup ? "active" : ""} onClick={() => { setFirstPasswordSetup(true); setCurrentPassword(""); }}>首次设置</button><button type="button" className={!firstPasswordSetup ? "active" : ""} onClick={() => setFirstPasswordSetup(false)}>修改已有密码</button></div>
        <form className="account-form password-form" onSubmit={changePassword}>{!firstPasswordSetup && <><label htmlFor="current-password">当前密码</label><input id="current-password" type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></>}<label htmlFor="new-password">{firstPasswordSetup ? "设置密码" : "新密码"}</label><input id="new-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" /><label htmlFor="confirm-new-password">再次输入新密码</label><input id="confirm-new-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /><button className="primary-button" disabled={savingPassword}><KeyRound size={15} />{savingPassword ? "保存中…" : firstPasswordSetup ? "设置密码" : "确认修改密码"}</button></form>
      </section>
      {profile?.isAdmin && <button className="admin-entry-button" onClick={onOpenAdmin}><ShieldCheck size={17} /><span><strong>管理员控制台</strong><small>邀请、配额、来源状态与用户反馈</small></span><ArrowUpRight size={16} /></button>}
      <footer><button className="account-signout" disabled={signingOut} onClick={() => void signOut()}><LogOut size={15} />{signingOut ? "退出中…" : "退出登录"}</button><button className="primary-button" onClick={onClose}>完成</button></footer>
    </section>
  </div>;
}

type MailProvider = "gmail" | "outlook" | "qq";
type VerificationProvider = "gmail" | "qq";
type EmailRecord = { id: string; sender: string | null; subject: string | null; category: string; received_at: string };
type EmailDetail = EmailRecord & { body_text: string | null; confirmation_links?: string[] };

const forwardingKeywords = recruitmentFilterKeywords.join(" ");
const mailProviderGuides: Record<MailProvider, { label: string; note: string; steps: string[]; filterLabel: string; filterText: string }> = {
  gmail: {
    label: "Gmail",
    note: "Gmail 会把符合筛选条件的新邮件自动转发给职途。多个关键词必须使用下方带 { } 的格式，表示命中任意一个关键词。",
    steps: [
      "进入 Gmail 设置 → 查看所有设置 → 转发和 POP/IMAP，添加下方专属地址。",
      "回到本页面，打开标记为“待完成 Gmail 验证”的邮件，点击 Google 官方验证链接；也可以复制 8 位确认码回 Gmail 填写。",
      "验证成功后进入“过滤器和屏蔽的地址”并创建过滤器：发件人、收件人和主题全部留空，只在“包含字词”粘贴下方筛选条件。",
      "取消“带有附件”，不要设置大小；先点击“搜索”确认测试邮件能被找到，再继续并勾选“转发到”职途专属地址。",
    ],
    filterLabel: "Gmail「包含字词」内容",
    filterText: gmailRecruitmentFilterQuery(),
  },
  outlook: {
    label: "Outlook",
    note: "使用规则只转发招聘邮件，不建议打开整个邮箱的无条件转发。",
    steps: [
      "进入 Outlook 设置 → 邮件 → 规则，选择“添加新规则”。",
      "条件选择主题或正文包含招聘关键词；操作选择转发到下方专属地址。",
      "保存规则后，从另一邮箱发送一封主题为“面试通知测试”的邮件进行检测。",
    ],
    filterLabel: "建议筛选关键词",
    filterText: forwardingKeywords,
  },
  qq: {
    label: "QQ 邮箱",
    note: "QQ 邮箱会先验证新的外部转发地址；个人邮箱通常发送确认邮件，企业邮箱还可能要求微信二次验证。",
    steps: [
      "进入 QQ 邮箱设置，找到自动转发、收信规则或邮件过滤，添加下方专属地址。",
      "回到职途，在下方已接收邮件中打开 QQ 发来的转发验证邮件，并按邮件提示确认；企业邮箱如提示微信验证，也需要先完成。",
      "验证成功后返回 QQ 邮箱刷新设置页，再创建仅匹配招聘关键词的转发规则并保存。",
      "从另一邮箱发送主题为“面试通知测试”的邮件，确认关键词规则已经生效。",
    ],
    filterLabel: "建议筛选关键词",
    filterText: forwardingKeywords,
  },
};

function MailVerificationStatus({ provider, email, opened, opening, onOpen }: {
  provider: VerificationProvider;
  email: EmailRecord | null;
  opened: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
  const state = forwardingVerificationState(provider, email ? [email] : [], opened);
  return <div className={`mail-verification-status ${email ? "received" : "waiting"}`} aria-live="polite">
    <span className="mail-verification-icon" aria-hidden="true">{email ? <MailCheck /> : <Clock3 />}</span>
    <span>
      <strong>{state.title}</strong>
      <small>{state.description}</small>
    </span>
    {email && <button type="button" onClick={onOpen} disabled={opening}>{opening ? "读取中…" : "打开验证邮件"}</button>}
  </div>;
}

function MailSettings({ onClose, notify }: { onClose: () => void; notify: (text: string) => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [provider, setProvider] = useState<MailProvider>("gmail");
  const [checkingForwarding, setCheckingForwarding] = useState(false);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [openingEmailId, setOpeningEmailId] = useState("");
  const [deletingEmailId, setDeletingEmailId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [verificationOpened, setVerificationOpened] = useState<Record<VerificationProvider, boolean>>({ gmail: false, qq: false });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [response, emailResponse] = await Promise.all([fetch("/api/inbound-address", { cache: "no-store" }), fetch("/api/inbound-emails", { cache: "no-store" })]);
        const [payload, emailPayload] = await Promise.all([response.json().catch(() => ({})), emailResponse.json().catch(() => ({}))]);
        if (!response.ok) throw new Error(payload.error || "收件地址加载失败");
        if (!emailResponse.ok) throw new Error(emailPayload.error || "邮件记录加载失败");
        if (active) {
          setAddress(typeof payload.address === "string" ? payload.address : null);
          setConfigured(Boolean(payload.configured));
          setEmails(Array.isArray(emailPayload.emails) ? emailPayload.emails : []);
        }
      } catch (error) {
        if (active) notify(error instanceof Error ? error.message : "收件地址加载失败");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [notify]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    notify("专属收件地址已复制");
  }

  async function copyKeywords() {
    await navigator.clipboard.writeText(providerGuide.filterText);
    notify(`${providerGuide.label} 筛选条件已复制`);
  }

  async function checkForwarding() {
    setCheckingForwarding(true);
    try {
      const response = await fetch("/api/inbound-emails", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "检测失败");
      const nextEmails = Array.isArray(payload.emails) ? payload.emails as EmailRecord[] : [];
      setEmails(nextEmails);
      notify(hasRecentInboundEmail(nextEmails) ? "已收到最近 10 分钟内的测试邮件，收件链路正常" : "暂未收到最近 10 分钟内的邮件，请检查规则后重试");
    } catch (error) {
      notify(error instanceof Error ? error.message : "检测失败");
    } finally {
      setCheckingForwarding(false);
    }
  }

  async function openEmail(id: string) {
    setOpeningEmailId(id);
    try {
      const response = await fetch(`/api/inbound-emails/${id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "邮件读取失败");
      setEmailDetail(payload.email as EmailDetail);
    } catch (error) {
      notify(error instanceof Error ? error.message : "邮件读取失败");
    } finally {
      setOpeningEmailId("");
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch("/api/account/export", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "个人数据导出失败");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `zhitu-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      notify("个人数据已导出");
    } catch (error) {
      notify(error instanceof Error ? error.message : "个人数据导出失败");
    } finally {
      setExporting(false);
    }
  }

  async function deleteEmail(id: string) {
    setDeletingEmailId(id);
    try {
      const response = await fetch(`/api/inbound-emails/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "邮件删除失败");
      setEmails((items) => items.filter((item) => item.id !== id));
      notify("邮件正文与记录已删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "邮件删除失败");
    } finally {
      setDeletingEmailId("");
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "注销") return notify("请输入“注销”确认操作");
    setDeleting(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation: deleteConfirmation }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "账号注销失败");
      router.replace("/");
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "账号注销失败");
      setDeleting(false);
    }
  }

  const providerGuide = mailProviderGuides[provider];
  const providerConfirmationEmail = provider === "gmail"
    ? emails.find(isGmailForwardingConfirmation) || null
    : provider === "qq"
      ? emails.find(isQqForwardingConfirmation) || null
      : null;
  const emailConfirmationProvider = emailDetail ? forwardingConfirmationProvider(emailDetail) : null;
  const emailIsGmailConfirmation = emailConfirmationProvider === "gmail";
  const emailIsQqConfirmation = emailConfirmationProvider === "qq";
  const confirmationLinks = emailConfirmationProvider ? [...new Set([
    ...(emailDetail?.confirmation_links || []),
    ...allowedConfirmationLinks(emailDetail?.body_text, null, emailConfirmationProvider),
  ])] : [];
  const gmailConfirmationCode = emailIsGmailConfirmation ? gmailForwardingConfirmationCode(emailDetail?.body_text) : null;

  async function copyGmailConfirmationCode() {
    if (!gmailConfirmationCode) return;
    await navigator.clipboard.writeText(gmailConfirmationCode);
    notify("Gmail 8 位确认码已复制，请返回 Gmail 填写");
  }

  async function copyConfirmationLink(link: string) {
    await navigator.clipboard.writeText(link);
    notify("官方验证链接已复制");
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mail-settings" role="dialog" aria-modal="true" aria-labelledby="mail-settings-title">
      <header><div><p className="eyebrow">邮件求职跟踪</p><h3 id="mail-settings-title">面试邮件自动转发设置</h3></div><button onClick={onClose} aria-label="关闭设置"><X /></button></header>
      <p className="mail-settings-lead">只需在你的邮箱中设置一次规则，以后的投递、测评、面试和 Offer 邮件会自动进入职途。我们不会获取或保存你的邮箱密码。</p>
      <div className="inbound-address">
        <span>你的专属收件地址</span>
        <strong>{loading ? "正在生成…" : address || "等待管理员完成 Resend 收件域名配置"}</strong>
        {address && <button onClick={copyAddress}>复制地址</button>}
      </div>
      {!loading && !configured && <p className="settings-warning">网页功能已经接通；管理员还需要在部署环境填写 Resend 收件域名后，地址才会正式可用。</p>}
      <section className="forwarding-setup" aria-labelledby="forwarding-setup-title">
        <header><div><h4 id="forwarding-setup-title">选择你的邮箱</h4><span>按照对应步骤设置，不需要把账号密码交给职途。</span></div><em className={emails.length ? "working" : ""}>{emails.length ? "收件链路正常" : "等待测试"}</em></header>
        <div className="provider-tabs" role="tablist" aria-label="邮箱类型">{(Object.keys(mailProviderGuides) as MailProvider[]).map((key) => <button key={key} type="button" role="tab" aria-selected={provider === key} className={provider === key ? "active" : ""} onClick={() => setProvider(key)}>{mailProviderGuides[key].label}</button>)}</div>
        <p className="provider-note">{providerGuide.note}</p>
        <ol>{providerGuide.steps.map((step) => <li key={step}><strong>{step}</strong></li>)}</ol>
        {(provider === "gmail" || provider === "qq") && <MailVerificationStatus
          provider={provider}
          email={providerConfirmationEmail}
          opened={verificationOpened[provider]}
          opening={Boolean(providerConfirmationEmail && openingEmailId === providerConfirmationEmail.id)}
          onOpen={() => { if (providerConfirmationEmail) void openEmail(providerConfirmationEmail.id); }}
        />}
        <div className="forward-keywords"><span><strong>{providerGuide.filterLabel}</strong><small>{providerGuide.filterText}</small></span><button type="button" onClick={copyKeywords}><Copy size={14} />复制筛选条件</button></div>
        <div className="forward-test"><span><strong>最后一步：测试收件</strong><small>从另一个邮箱向你的私人邮箱发送主题为“面试通知测试”的邮件，等待约一分钟后检测。</small></span><button className="secondary-button" type="button" disabled={checkingForwarding || !configured} onClick={() => void checkForwarding()}><RefreshCw size={14} />{checkingForwarding ? "检测中…" : "检测是否收到"}</button></div>
      </section>
      <section className="email-records" aria-labelledby="email-records-title"><div><h4 id="email-records-title">已接收的招聘邮件</h4><span>邮箱服务商发送的转发验证邮件也会显示在这里；完成验证后，招聘邮件会继续用于求职跟踪。</span></div>{emails.length === 0 ? <p>暂时没有邮件记录。添加并验证专属转发地址后，请等待 1–3 分钟再检查。</p> : emails.map((item) => { const confirmationProvider = forwardingConfirmationProvider(item); return <article className={confirmationProvider ? "verification-email" : ""} key={item.id}><div><strong>{item.subject || "无主题邮件"}</strong><span>{item.sender || "未知发件人"} · {new Date(item.received_at).toLocaleString("zh-CN")}</span></div><em>{confirmationProvider ? `待完成 ${confirmationProvider === "gmail" ? "Gmail" : "QQ 邮箱"}验证` : item.category}</em><span className="email-record-actions"><button disabled={openingEmailId === item.id} onClick={() => void openEmail(item.id)}>{openingEmailId === item.id ? "读取中…" : confirmationProvider ? "打开验证" : "打开"}</button><button disabled={deletingEmailId === item.id} onClick={() => void deleteEmail(item.id)}>{deletingEmailId === item.id ? "删除中…" : "删除"}</button></span></article>; })}</section>
      <section className="privacy-settings" aria-labelledby="privacy-settings-title">
        <div><p className="eyebrow">隐私与数据</p><h4 id="privacy-settings-title">你的数据，由你掌控</h4><span>可导出全部个人记录；注销后会删除简历文件、邮件正文和业务记录，且无法恢复。</span></div>
        <button className="secondary-button" disabled={exporting} onClick={() => void exportData()}><Download size={15} />{exporting ? "导出中…" : "导出个人数据"}</button>
        <div className="delete-account"><label htmlFor="delete-confirmation">如需注销，请输入“注销”</label><span><input id="delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="注销" /><button disabled={deleting || deleteConfirmation !== "注销"} onClick={() => void deleteAccount()}>{deleting ? "注销中…" : "永久注销账号"}</button></span></div>
      </section>
      <footer><span>邮件正文仅用于你的求职跟踪，可在设置中删除。</span><button className="primary-button" onClick={onClose}>完成</button></footer>
    </section>
    {emailDetail && <section className="email-detail" role="dialog" aria-modal="true" aria-labelledby="email-detail-title"><header><div><p className="eyebrow">{emailIsGmailConfirmation ? "Gmail 转发地址验证" : emailIsQqConfirmation ? "QQ 邮箱转发地址验证" : "邮件内容"}</p><h3 id="email-detail-title">{emailDetail.subject || "无主题邮件"}</h3><span>{emailDetail.sender || "未知发件人"} · {new Date(emailDetail.received_at).toLocaleString("zh-CN")}</span></div><button onClick={() => setEmailDetail(null)} aria-label="关闭邮件内容"><X /></button></header>{emailConfirmationProvider && <div className="verification-safety"><ShieldCheck size={16} /><span><strong>这是 {emailIsGmailConfirmation ? "Gmail" : "QQ 邮箱"}发往你专属地址的验证邮件</strong><small>职途不会代替你授权，只会展示经过官方域名校验的链接。点击下方按钮完成后，请返回原邮箱刷新设置页。</small></span></div>}<pre>{emailDetail.body_text || "这封邮件没有可显示的纯文本内容。"}</pre>{emailConfirmationProvider && confirmationLinks.length === 0 && !gmailConfirmationCode && <p className="verification-missing">未识别到安全验证入口。没有从邮件原始内容中找到可安全打开的{emailIsGmailConfirmation ? " Google 官方验证链接或 8 位确认码" : " QQ 邮箱官方验证链接"}。请在原邮箱重新生成验证邮件后再试。</p>}{(confirmationLinks.length > 0 || gmailConfirmationCode) && <footer><span>仅展示通过官方域名校验的验证入口。</span>{gmailConfirmationCode && <button type="button" className="secondary-button" onClick={() => void copyGmailConfirmationCode()}><Copy size={14} />复制确认码 {gmailConfirmationCode}</button>}{confirmationLinks.map((link) => <span className="confirmation-actions" key={link}><button type="button" className="secondary-button" onClick={() => void copyConfirmationLink(link)}><Copy size={14} />复制验证入口</button><a className="primary-button" href={link} target="_blank" rel="noopener noreferrer" onClick={() => { if (emailConfirmationProvider) setVerificationOpened((current) => ({ ...current, [emailConfirmationProvider]: true })); }}>{emailIsQqConfirmation ? "打开 QQ 官方验证入口" : "打开 Google 官方验证入口"}<ExternalLink size={14} /></a></span>)}</footer>}</section>}
  </div>;
}

function FeedbackModal({ onClose, notify }: { onClose: () => void; notify: (text: string) => void }) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submitFeedback() {
    const trimmed = content.trim();
    if (trimmed.length < 2) return notify("请至少写 2 个字");
    setSending(true);
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: trimmed }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "反馈提交失败");
      setSent(true);
      notify("反馈已送达站长");
    } catch (feedbackError) {
      notify(feedbackError instanceof Error ? feedbackError.message : "反馈提交失败");
    } finally {
      setSending(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <header><span className="feedback-orbit"><MessageCircleMore size={19} /></span><button onClick={onClose} aria-label="关闭反馈窗口"><X /></button></header>
      {sent ? <div className="feedback-sent"><span><Check size={22} /></span><p className="eyebrow">已经收到</p><h3 id="feedback-title">谢谢你让职途变得更好</h3><p>站长会在管理员后台阅读这条反馈。反馈内容不会展示给其他用户。</p><button className="primary-button" onClick={onClose}>完成</button></div> : <>
        <div className="feedback-copy"><p className="eyebrow">站长信箱</p><h3 id="feedback-title">有好的想法，可以私信站长，欢迎共创</h3><p>功能建议、使用困惑或 Bug 都可以告诉我们。</p></div>
        <label className="feedback-field"><span>你的反馈</span><textarea autoFocus maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="例如：希望职位库可以保存常用筛选条件……" /><small>{content.length}/2000</small></label>
        <footer><button className="primary-button" disabled={sending || content.trim().length < 2} onClick={() => void submitFeedback()}><Send size={15} />{sending ? "发送中…" : "发送给站长"}</button></footer>
      </>}
    </section>
  </div>;
}

type AdminOverview = {
  users: Array<{ id: string; email: string; display_name: string | null; is_admin: boolean; ai_daily_limit: number; created_at: string }>;
  invites: Array<{ id: string; email: string; expires_at: string; used_at: string | null; created_at: string }>;
  sources: Array<{ id: string; name: string; kind: string; enabled: boolean; restricted_reason: string | null; last_success_at: string | null; latestRun: null | { status: string; jobs_seen: number; jobs_added: number; error_code: string | null; started_at: string } }>;
  feedback: Array<{ id: string; user_id: string; email: string; content: string; created_at: string }>;
};

function AdminPanel({ onClose, notify }: { onClose: () => void; notify: (text: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "管理员数据加载失败");
      setOverview(payload as AdminOverview);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "管理员数据加载失败");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function copyInviteLink(link = inviteLink) {
    try {
      await navigator.clipboard.writeText(link);
      notify("邀请链接已复制");
    } catch {
      notify("自动复制失败，请手动复制链接");
    }
  }

  async function invite() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "邀请失败");
      if (typeof payload.activationUrl !== "string") throw new Error("激活链接生成失败");
      setInviteLink(payload.activationUrl);
      await copyInviteLink(payload.activationUrl);
      await load();
    } catch (inviteError) {
      notify(inviteError instanceof Error ? inviteError.message : "邀请失败");
    } finally {
      setBusy(false);
    }
  }

  async function updateQuota(id: string, dailyLimit: number) {
    try {
      const response = await fetch(`/api/admin/users/${id}/quota`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dailyLimit }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "配额更新失败");
      setOverview((current) => current ? { ...current, users: current.users.map((user) => user.id === id ? { ...user, ai_daily_limit: dailyLimit } : user) } : current);
      notify("AI 配额已更新");
    } catch (quotaError) {
      notify(quotaError instanceof Error ? quotaError.message : "配额更新失败");
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
      <header><div><p className="eyebrow">受限后台</p><h3 id="admin-panel-title"><ShieldCheck size={20} />管理员控制台</h3></div><button onClick={onClose} aria-label="关闭管理员后台"><X /></button></header>
      {error && <div className="admin-error"><strong>{error}</strong><span>{error.includes("密钥") ? "本地整改环境尚未填写管理员只读密钥。请仅写入本机 .env.local，切勿发送到聊天或提交 Git。" : "普通用户无法查看其他用户、邀请、反馈或采集运行信息。"}</span></div>}
      {!error && !overview && <p className="notice-empty">正在读取管理员数据…</p>}
      {overview && <>
        <section className="admin-invite">
          <div><h4>发放测试邀请</h4><span>生成一次性激活链接；用户填写受邀邮箱并设置密码后即可登录。</span></div>
          <div className="admin-invite-controls">
            <label><UserPlus size={16} /><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setInviteLink(""); }} placeholder="candidate@example.com" /></label>
            <button disabled={busy || !email} onClick={() => void invite()}><Link2 size={15} />{busy ? "生成中…" : "生成激活链接并复制"}</button>
          </div>
          {inviteLink && <div className="invite-link-result" role="status"><input aria-label="已生成的激活链接" readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /><button className="secondary-button" onClick={() => void copyInviteLink()}><Copy size={15} />复制</button><small>链接只可使用一次，24 小时内有效；新用户和已有测试账号都可用它设置密码。</small></div>}
        </section>
        <div className="admin-grid">
          <section><header><h4>用户与每日 AI 配额</h4><span>{overview.users.length} 位用户</span></header><div className="admin-list">{overview.users.map((user) => <article key={user.id}><div><strong>{user.display_name || user.email || "未命名用户"}{user.is_admin && <em>管理员</em>}</strong><span>{user.email}</span></div><label>每日<input type="number" min={0} max={500} defaultValue={user.ai_daily_limit} onBlur={(event) => void updateQuota(user.id, Number(event.target.value))} />次</label></article>)}</div></section>
          <section><header><h4>采集来源健康度</h4><span>{overview.sources.filter((source) => source.latestRun?.status === "completed").length}/{overview.sources.length} 正常</span></header><div className="admin-list source-health">{overview.sources.map((source) => <article key={source.id}><i className={source.latestRun?.status === "completed" ? "healthy" : source.latestRun?.status === "restricted" ? "restricted" : "unknown"} /><div><strong>{source.name}</strong><span>{source.latestRun ? `${source.latestRun.status} · 发现 ${source.latestRun.jobs_seen} / 新增 ${source.latestRun.jobs_added}` : source.restricted_reason || "等待首次运行"}</span></div><time>{source.latestRun ? new Date(source.latestRun.started_at).toLocaleString("zh-CN") : "—"}</time></article>)}</div></section>
        </div>
        <section className="admin-feedback"><header><div><h4>建议与 Bug 反馈</h4><span>仅管理员可见 · 共 {overview.feedback.length} 条</span></div><MessageCircleMore size={18} /></header>{overview.feedback.length === 0 ? <p className="admin-feedback-empty">还没有收到用户反馈。</p> : <div>{overview.feedback.map((item) => <article key={item.id}><p>{item.content}</p><footer><span>{item.email || "已注销用户"}</span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></footer></article>)}</div>}</section>
        <section className="invite-history"><h4>最近邀请</h4>{overview.invites.length === 0 ? <span>尚未创建邀请记录</span> : overview.invites.slice(0, 8).map((inviteItem) => <p key={inviteItem.id}><strong>{inviteItem.email}</strong><span>{inviteItem.used_at ? "已使用" : new Date(inviteItem.expires_at) > new Date() ? "等待接受" : "已过期"}</span></p>)}</section>
      </>}
    </section>
  </div>;
}

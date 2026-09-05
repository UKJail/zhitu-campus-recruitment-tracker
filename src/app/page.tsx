"use client";

import { ArrowLeft, ArrowRight, Check, FileSearch, KeyRound, LockKeyhole, Mail, MailCheck, Sparkles, UserPlus } from "lucide-react";
import { BrandMascot } from "@/components/brand-mascot";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SHOW_AUTH_BRAND_LOGO = false;

export default function LoginPage() {
  const router = useRouter();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [registrationConfirmPassword, setRegistrationConfirmPassword] = useState("");
  const [registrationDisplayName, setRegistrationDisplayName] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [confirmationNotice, setConfirmationNotice] = useState("");
  const [registrationOtp, setRegistrationOtp] = useState("");
  const [confirmationCooldown, setConfirmationCooldown] = useState(0);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authServiceError, setAuthServiceError] = useState("");
  const [screen, setScreen] = useState<"login" | "register" | "registration-sent" | "otp" | "recovery" | "recovery-sent">("login");

  useEffect(() => {
    if (confirmationCooldown <= 0) return;
    const timer = window.setTimeout(() => setConfirmationCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [confirmationCooldown]);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" }).then((response) => {
      if (active && response.ok) router.replace("/app");
    }).catch(() => {
      // If the server cannot verify the session, leave the user on the login page.
    });

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    let active = true;
    void fetch("/api/health/auth", { cache: "no-store" }).then((response) => {
      if (!active) return;
      setAuthServiceError(response.ok ? "" : "认证服务暂时不可用，请稍后重试；持续失败请联系管理员。");
    }).catch(() => {
      if (active) setAuthServiceError("认证服务暂时不可用，请稍后重试；持续失败请联系管理员。");
    });
    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ method: "password", email: loginEmail, password: loginPassword }),
    }).catch(() => null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: string; code?: string } | null;
      if (result?.code === "auth_service_unreachable") setAuthServiceError(result.error || "无法连接认证服务。");
      setError(result?.error || "登录服务暂时不可用，请稍后重试。");
      setLoading(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (registrationPassword !== registrationConfirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    const normalizedEmail = registrationEmail.trim().toLowerCase();
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: normalizedEmail, displayName: registrationDisplayName, password: registrationPassword }),
    }).catch(() => null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: string } | null;
      setError(result?.error || "注册服务暂时不可用，请稍后重试。");
      setLoading(false);
      return;
    }

    const result = await response.json().catch(() => null) as { requiresEmailConfirmation?: boolean } | null;
    setLoading(false);
    if (typeof result?.requiresEmailConfirmation !== "boolean") {
      setError("注册服务未返回完整结果，请稍后重试；已有账号可直接登录。");
      return;
    }
    if (result?.requiresEmailConfirmation) {
      setRegistrationEmail(normalizedEmail);
      setRegistrationPassword("");
      setRegistrationConfirmPassword("");
      setRegistrationOtp("");
      setConfirmationNotice("");
      setConfirmationCooldown(60);
      setScreen("registration-sent");
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  async function resendRegistrationConfirmation() {
    if (resendingConfirmation || loading || confirmationCooldown > 0) return;
    if (!registrationEmail.trim()) {
      setError("请先填写注册时使用的邮箱地址");
      return;
    }
    setError("");
    setResendingConfirmation(true);
    setConfirmationNotice("");
    const response = await fetch("/api/auth/resend-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: registrationEmail.trim().toLowerCase() }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null) as { error?: string; message?: string } | null;
    setResendingConfirmation(false);
    if (response?.ok || response?.status === 429) {
      const retryAfter = Number(response.headers?.get("Retry-After"));
      setConfirmationCooldown(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
    }
    setConfirmationNotice(response?.ok
      ? (result?.message || "如果账号尚未确认，新的验证邮件会发送到该邮箱。")
      : (result?.error || "暂时无法重新发送，请稍后再试。"));
  }

  async function verifyRegistrationCode(event: FormEvent) {
    event.preventDefault();
    if (loading || resendingConfirmation) return;
    if (!/^\d{6}$/.test(registrationOtp)) {
      setError("请输入邮件中的 6 位数字验证码");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ method: "otp", email: registrationEmail.trim().toLowerCase(), token: registrationOtp }),
    }).catch(() => null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: string } | null;
      setError(result?.error || "验证暂时失败，请稍后重试；已验证的账号可以返回密码登录。");
      setLoading(false);
      return;
    }
    setRegistrationOtp("");
    router.replace("/app");
    router.refresh();
  }

  function openRegistrationVerification() {
    setError("");
    setLoginPassword("");
    setRegistrationEmail(loginEmail.trim().toLowerCase());
    setRegistrationOtp("");
    setConfirmationNotice("");
    setScreen("registration-sent");
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("登录服务尚未配置，请联系管理员。");
      setLoading(false);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim().toLowerCase(), { redirectTo }).catch(() => ({ error: new Error("network_error") }));
    setLoading(false);
    if (resetError) {
      setError("暂时无法发送重置邮件，请稍后再试。");
      return;
    }
    setScreen("recovery-sent");
  }

  async function requestLoginCode(event: FormEvent) {
    event.preventDefault();
    if (loading || confirmationCooldown > 0) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ method: "request-otp", email: otpEmail.trim().toLowerCase() }),
    }).catch(() => null);
    setLoading(false);
    if (response?.ok || response?.status === 429) {
      const retryAfter = Number(response.headers?.get("Retry-After"));
      setConfirmationCooldown(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60);
    }
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: string } | null;
      setError(result?.error || "验证码发送失败，请确认邮箱已完成注册后重试。");
      return;
    }
    setOtpSent(true);
  }

  async function verifyLoginCode(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("请输入邮件中的 6 位数字验证码");
      return;
    }
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        method: "otp",
        email: otpEmail.trim().toLowerCase(),
        token: otp.trim(),
      }),
    }).catch(() => null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: string } | null;
      setError(result?.error || "验证码验证失败，请重新发送。");
      setLoading(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  function returnToLogin() {
    setError("");
    setLoginPassword("");
    setRegistrationPassword("");
    setRegistrationConfirmPassword("");
    setOtp("");
    setRegistrationOtp("");
    setOtpSent(false);
    setConfirmationNotice("");
    setResendingConfirmation(false);
    setScreen("login");
  }

  function openRegistration() {
    setError("");
    setLoginPassword("");
    setRegistrationEmail("");
    setRegistrationPassword("");
    setRegistrationConfirmPassword("");
    setRegistrationDisplayName("");
    setScreen("register");
  }

  function openLoginCode(email = "") {
    if (loading || resendingConfirmation) return;
    setError("");
    setLoginPassword("");
    setRegistrationPassword("");
    setRegistrationConfirmPassword("");
    setOtpEmail(email.trim().toLowerCase());
    setOtp("");
    setOtpSent(false);
    setScreen("otp");
  }

  return <main className="login-page">
    <section className="login-story">
      {SHOW_AUTH_BRAND_LOGO && <div className="brand brand-large">
        <BrandMascot />
        <span className="login-brand-lockup"><strong>职途<em>tracker</em></strong><small>一个一站式求职助手网站。</small></span>
      </div>}
      <div className="story-copy"><p className="eyebrow">你的求职旅程，不再散落各处</p><h1>把每一次尝试，<br />都变成下一步的方向。</h1><p className="story-lead">从简历优化、职位发现到面试复盘，职途陪你把复杂的求职过程整理成一条清晰的路。</p><div className="route-preview" aria-hidden="true"><span><FileSearch size={17} /> 简历</span><i /><span><Sparkles size={17} /> 匹配</span><i /><span><Mail size={17} /> 面试</span><i /><span><Check size={17} /> Offer</span></div></div>
      <p className="login-note">公开测试 · 你的数据只属于你</p>
    </section>
    <section className="login-panel"><div className="login-card">
      {authServiceError && <p className="auth-service-alert" role="alert">{authServiceError}</p>}
      {screen === "login" && <>
        <span className="mini-icon"><LockKeyhole size={18} /></span><h2>欢迎回来</h2><p>已有账号可直接登录，新用户可以使用邮箱免费注册。</p><form onSubmit={signIn}>
          <label htmlFor="email">邮箱地址</label><input id="email" name="login-email" type="email" required autoComplete="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="name@example.com" />
          <div className="password-label-row"><label htmlFor="password">密码</label><button type="button" onClick={() => { setError(""); setLoginPassword(""); setRecoveryEmail(""); setScreen("recovery"); }}>忘记密码？</button></div><input id="password" name="login-password" type="password" required autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="输入登录密码" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在登录…" : "登录"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="secondary-button wide auth-method-button" type="button" disabled={loading} onClick={openRegistration}><UserPlus size={16} />注册新账号</button><button className="secondary-button wide auth-method-button" type="button" disabled={loading} onClick={() => openLoginCode(loginEmail)}><Mail size={16} />使用邮箱验证码登录</button><button className="auth-back-button" type="button" disabled={loading} onClick={openRegistrationVerification}>继续验证注册邮箱</button><p className="activation-hint">公开测试期间可直接注册；旧激活链接仍可继续使用。</p><p className="legal-copy">继续即代表你同意《服务条款》和《隐私政策》。</p>
      </>}
      {screen === "register" && <>
        <span className="mini-icon recovery-icon"><KeyRound size={18} /></span><h2>注册职途</h2><p>无需邀请码，使用邮箱创建你的公开测试账号。</p><form onSubmit={register}>
          <label htmlFor="register-email">邮箱地址</label><input id="register-email" name="register-email" type="email" required autoComplete="email" value={registrationEmail} onChange={(event) => setRegistrationEmail(event.target.value)} placeholder="name@example.com" />
          <label htmlFor="register-display-name">用户 ID</label><input id="register-display-name" name="register-display-name" type="text" required minLength={2} maxLength={24} autoComplete="nickname" value={registrationDisplayName} onChange={(event) => setRegistrationDisplayName(event.target.value)} placeholder="例如：秋招小李" />
          <label htmlFor="register-password">设置密码</label><input id="register-password" name="register-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={registrationPassword} onChange={(event) => setRegistrationPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" />
          <label htmlFor="register-confirm-password">确认密码</label><input id="register-confirm-password" name="register-confirm-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={registrationConfirmPassword} onChange={(event) => setRegistrationConfirmPassword(event.target.value)} placeholder="再次输入密码" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在注册…" : "注册账号"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="auth-back-button" type="button" disabled={loading} onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </>}
      {screen === "registration-sent" && <div className="recovery-sent-state">
        <span className="mail-orbit"><MailCheck size={27} /></span><h2>输入邮箱验证码</h2><p>输入最新邮件中的 6 位数字，无需点击验证链接。新账号验证后完成注册；如果这个邮箱已经注册或完成验证，验证码用于登录原账号，本次填写的密码和用户 ID 不会覆盖原账号。没有收到？请检查垃圾邮件，或改用下方的登录验证码入口。</p>
        <form onSubmit={verifyRegistrationCode}>
          <label htmlFor="confirmation-email">注册邮箱</label><input id="confirmation-email" name="confirmation-email" type="email" required autoComplete="email" disabled={loading || resendingConfirmation} value={registrationEmail} onChange={(event) => { setRegistrationEmail(event.target.value); setRegistrationOtp(""); setError(""); setConfirmationNotice(""); }} placeholder="name@example.com" />
          <label htmlFor="registration-otp">6 位验证码</label><input id="registration-otp" name="registration-otp" type="text" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} disabled={loading || resendingConfirmation} value={registrationOtp} onChange={(event) => setRegistrationOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入邮件中的验证码" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading || resendingConfirmation}>{loading ? "正在验证…" : "验证并进入职途"}</button>
        </form>
        {confirmationNotice && <p className="form-notice" role="status">{confirmationNotice}</p>}
        <button className="secondary-button wide" type="button" disabled={loading || resendingConfirmation} onClick={() => openLoginCode(registrationEmail)}>已注册？改用登录验证码</button>
        <button className="secondary-button wide" type="button" disabled={loading || resendingConfirmation || confirmationCooldown > 0} onClick={() => void resendRegistrationConfirmation()}>{resendingConfirmation ? "正在重新发送…" : confirmationCooldown > 0 ? `${confirmationCooldown} 秒后可重新发送` : "重新发送验证码"}</button><button className="auth-back-button" type="button" disabled={loading || resendingConfirmation} onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </div>}
      {screen === "otp" && <>
        <span className="mini-icon recovery-icon"><Mail size={18} /></span><h2>验证码登录</h2><p>如果该邮箱已注册，验证码会发送到你的邮箱。请检查收件箱和垃圾邮件，使用最新的 6 位数字；未注册的邮箱请先注册。</p><form onSubmit={otpSent ? verifyLoginCode : requestLoginCode}>
          <label htmlFor="otp-email">邮箱地址</label><input id="otp-email" name="otp-email" type="email" required autoComplete="email" readOnly={otpSent} value={otpEmail} onChange={(event) => setOtpEmail(event.target.value)} placeholder="name@example.com" />
          {otpSent && <><label htmlFor="login-otp">6 位验证码</label><input id="login-otp" type="text" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入邮件中的验证码" /></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading || (!otpSent && confirmationCooldown > 0)}>{loading ? (otpSent ? "正在验证…" : "正在发送…") : otpSent ? "验证并登录" : confirmationCooldown > 0 ? `${confirmationCooldown} 秒后可重新发送` : "发送登录验证码"}{!loading && <ArrowRight size={17} />}</button>
        </form>{otpSent && <button className="auth-back-button" type="button" disabled={loading || confirmationCooldown > 0} onClick={() => { setError(""); setOtp(""); setOtpSent(false); }}>{confirmationCooldown > 0 ? `${confirmationCooldown} 秒后可重新发送` : "重新发送验证码"}</button>}<button className="auth-back-button" type="button" disabled={loading} onClick={returnToLogin}><ArrowLeft size={15} />返回密码登录</button>
      </>}
      {screen === "recovery" && <>
        <span className="mini-icon recovery-icon"><Mail size={18} /></span><h2>找回密码</h2><p>输入账号使用的邮箱，我们会向该邮箱发送密码重置链接。</p><form onSubmit={requestPasswordReset}>
          <label htmlFor="recovery-email">邮箱地址</label><input id="recovery-email" name="recovery-email" type="email" required autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="name@example.com" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在发送…" : "发送重置邮件"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="auth-back-button" type="button" disabled={loading} onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </>}
      {screen === "recovery-sent" && <div className="recovery-sent-state">
        <span className="mail-orbit"><MailCheck size={27} /></span><h2>请检查邮箱</h2><p>如果该邮箱已注册，你会收到密码重置邮件。请在邮件有效期内打开链接并设置新密码。</p><button className="secondary-button wide" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </div>}
    </div>
      <footer className="icp-footer">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">湘ICP备2026036134号</a>
      </footer>
    </section>
  </main>;
}

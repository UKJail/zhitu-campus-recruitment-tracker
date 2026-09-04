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
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authServiceError, setAuthServiceError] = useState("");
  const [screen, setScreen] = useState<"login" | "register" | "registration-sent" | "otp" | "recovery" | "recovery-sent">("login");

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
      setAuthServiceError(response.ok ? "" : "无法连接认证服务，请从可联网的本地终端重新启动职途。");
    }).catch(() => {
      if (active) setAuthServiceError("无法连接认证服务，请从可联网的本地终端重新启动职途。");
    });
    return () => {
      active = false;
    };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
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
    if (result?.requiresEmailConfirmation) {
      setScreen("registration-sent");
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  async function resendRegistrationConfirmation() {
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
    setConfirmationNotice(response?.ok
      ? (result?.message || "如果账号尚未确认，新的验证邮件会发送到该邮箱。")
      : (result?.error || "暂时无法重新发送，请稍后再试。"));
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("登录服务尚未配置，请联系管理员。");
      setLoading(false);
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim().toLowerCase(), { redirectTo });
    setLoading(false);
    if (resetError) {
      setError("暂时无法发送重置邮件，请稍后再试。");
      return;
    }
    setScreen("recovery-sent");
  }

  async function requestLoginCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ method: "request-otp", email: otpEmail.trim().toLowerCase() }),
    }).catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: string } | null;
      setError(result?.error || "验证码发送失败，请确认邮箱已完成注册后重试。");
      return;
    }
    setOtpSent(true);
  }

  async function verifyLoginCode(event: FormEvent) {
    event.preventDefault();
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
        </form><button className="secondary-button wide auth-method-button" type="button" onClick={openRegistration}><UserPlus size={16} />注册新账号</button><button className="secondary-button wide auth-method-button" type="button" onClick={() => { setError(""); setLoginPassword(""); setOtpEmail(""); setScreen("otp"); }}><Mail size={16} />使用邮箱验证码登录</button><p className="activation-hint">公开测试期间可直接注册；旧激活链接仍可继续使用。</p><p className="legal-copy">继续即代表你同意《服务条款》和《隐私政策》。</p>
      </>}
      {screen === "register" && <>
        <span className="mini-icon recovery-icon"><KeyRound size={18} /></span><h2>注册职途</h2><p>无需邀请码，使用邮箱创建你的公开测试账号。</p><form onSubmit={register}>
          <label htmlFor="register-email">邮箱地址</label><input id="register-email" name="register-email" type="email" required autoComplete="email" value={registrationEmail} onChange={(event) => setRegistrationEmail(event.target.value)} placeholder="name@example.com" />
          <label htmlFor="register-display-name">用户 ID</label><input id="register-display-name" name="register-display-name" type="text" required minLength={2} maxLength={24} autoComplete="nickname" value={registrationDisplayName} onChange={(event) => setRegistrationDisplayName(event.target.value)} placeholder="例如：秋招小李" />
          <label htmlFor="register-password">设置密码</label><input id="register-password" name="register-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={registrationPassword} onChange={(event) => setRegistrationPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" />
          <label htmlFor="register-confirm-password">确认密码</label><input id="register-confirm-password" name="register-confirm-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={registrationConfirmPassword} onChange={(event) => setRegistrationConfirmPassword(event.target.value)} placeholder="再次输入密码" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在注册…" : "注册账号"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="auth-back-button" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </>}
      {screen === "registration-sent" && <div className="recovery-sent-state">
        <span className="mail-orbit"><MailCheck size={27} /></span><h2>请检查注册邮箱</h2><p>如果这是新账号，验证邮件会发送到 <strong>{registrationEmail.trim().toLowerCase()}</strong>。请同时检查垃圾邮件；如果这个邮箱已经注册或完成验证，系统不会重复发送，请直接登录或找回密码。</p>{confirmationNotice && <p className="form-notice" role="status">{confirmationNotice}</p>}<button className="primary-button wide" type="button" disabled={resendingConfirmation} onClick={() => void resendRegistrationConfirmation()}>{resendingConfirmation ? "正在重新发送…" : "重新发送验证邮件"}</button><button className="secondary-button wide" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </div>}
      {screen === "otp" && <>
        <span className="mini-icon recovery-icon"><Mail size={18} /></span><h2>验证码登录</h2><p>已注册账号可以使用，验证码会发送到你的登录邮箱。</p><form onSubmit={otpSent ? verifyLoginCode : requestLoginCode}>
          <label htmlFor="otp-email">邮箱地址</label><input id="otp-email" name="otp-email" type="email" required autoComplete="email" readOnly={otpSent} value={otpEmail} onChange={(event) => setOtpEmail(event.target.value)} placeholder="name@example.com" />
          {otpSent && <><label htmlFor="login-otp">6 位验证码</label><input id="login-otp" type="text" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入邮件中的验证码" /></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? (otpSent ? "正在验证…" : "正在发送…") : (otpSent ? "验证并登录" : "发送登录验证码")}{!loading && <ArrowRight size={17} />}</button>
        </form>{otpSent && <button className="auth-back-button" type="button" onClick={() => { setError(""); setOtp(""); setOtpSent(false); }}>重新发送验证码</button>}<button className="auth-back-button" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回密码登录</button>
      </>}
      {screen === "recovery" && <>
        <span className="mini-icon recovery-icon"><Mail size={18} /></span><h2>找回密码</h2><p>输入账号使用的邮箱，我们会向该邮箱发送密码重置链接。</p><form onSubmit={requestPasswordReset}>
          <label htmlFor="recovery-email">邮箱地址</label><input id="recovery-email" name="recovery-email" type="email" required autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="name@example.com" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在发送…" : "发送重置邮件"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="auth-back-button" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
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

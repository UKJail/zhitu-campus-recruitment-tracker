"use client";

import { ArrowLeft, ArrowRight, Check, FileSearch, LockKeyhole, Mail, MailCheck, Sparkles } from "lucide-react";
import { BrandMascot } from "@/components/brand-mascot";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [screen, setScreen] = useState<"login" | "otp" | "recovery" | "recovery-sent">("login");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/app");
    });
  }, [router]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("登录服务尚未配置，请联系管理员。");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError("邮箱或密码错误；新用户请先使用管理员发送的激活链接设置密码。");
      setLoading(false);
      return;
    }
    router.replace("/app");
    router.refresh();
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
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
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
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("登录服务尚未配置，请联系管理员。");
      setLoading(false);
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (otpError) {
      setError("验证码发送失败，请确认这是已受邀的邮箱后重试。");
      return;
    }
    setOtpSent(true);
  }

  async function verifyLoginCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("登录服务尚未配置，请联系管理员。");
      setLoading(false);
      return;
    }

    const { error: otpError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: "email",
    });
    if (otpError) {
      setError("验证码错误或已过期，请重新发送。");
      setLoading(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  function returnToLogin() {
    setError("");
    setOtp("");
    setOtpSent(false);
    setScreen("login");
  }

  return <main className="login-page">
    <section className="login-story">
      <div className="brand brand-large">
        <BrandMascot />
        <span className="login-brand-lockup"><strong>职途<em>tracker</em></strong><small>一个一站式求职助手网站。</small></span>
      </div>
      <div className="story-copy"><p className="eyebrow">你的求职旅程，不再散落各处</p><h1>把每一次尝试，<br />都变成下一步的方向。</h1><p className="story-lead">从简历优化、职位发现到面试复盘，职途陪你把复杂的求职过程整理成一条清晰的路。</p><div className="route-preview" aria-hidden="true"><span><FileSearch size={17} /> 简历</span><i /><span><Sparkles size={17} /> 匹配</span><i /><span><Mail size={17} /> 面试</span><i /><span><Check size={17} /> Offer</span></div></div>
      <p className="login-note">邀请制内测 · 你的数据只属于你</p>
    </section>
    <section className="login-panel"><div className="login-card">
      {screen === "login" && <>
        <span className="mini-icon"><LockKeyhole size={18} /></span><h2>欢迎回来</h2><p>测试版使用受邀邮箱和激活时设置的密码登录。</p><form onSubmit={signIn}>
          <label htmlFor="email">邮箱地址</label><input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          <div className="password-label-row"><label htmlFor="password">密码</label><button type="button" onClick={() => { setError(""); setScreen("recovery"); }}>忘记密码？</button></div><input id="password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入登录密码" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在登录…" : "登录"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="secondary-button wide auth-method-button" type="button" onClick={() => { setError(""); setScreen("otp"); }}><Mail size={16} />使用邮箱验证码登录</button><p className="activation-hint">还没有密码？请先打开管理员发送的一次性激活链接。</p><p className="legal-copy">继续即代表你同意《服务条款》和《隐私政策》。</p>
      </>}
      {screen === "otp" && <>
        <span className="mini-icon recovery-icon"><Mail size={18} /></span><h2>验证码登录</h2><p>仅已受邀账号可以使用。验证码会发送到你的登录邮箱。</p><form onSubmit={otpSent ? verifyLoginCode : requestLoginCode}>
          <label htmlFor="otp-email">邮箱地址</label><input id="otp-email" type="email" required autoComplete="email" readOnly={otpSent} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          {otpSent && <><label htmlFor="login-otp">6 位验证码</label><input id="login-otp" type="text" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入邮件中的验证码" /></>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? (otpSent ? "正在验证…" : "正在发送…") : (otpSent ? "验证并登录" : "发送登录验证码")}{!loading && <ArrowRight size={17} />}</button>
        </form>{otpSent && <button className="auth-back-button" type="button" onClick={() => { setError(""); setOtp(""); setOtpSent(false); }}>重新发送验证码</button>}<button className="auth-back-button" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回密码登录</button>
      </>}
      {screen === "recovery" && <>
        <span className="mini-icon recovery-icon"><Mail size={18} /></span><h2>找回密码</h2><p>输入账号使用的邮箱，我们会向该邮箱发送密码重置链接。</p><form onSubmit={requestPasswordReset}>
          <label htmlFor="recovery-email">邮箱地址</label><input id="recovery-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={loading}>{loading ? "正在发送…" : "发送重置邮件"}{!loading && <ArrowRight size={17} />}</button>
        </form><button className="auth-back-button" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </>}
      {screen === "recovery-sent" && <div className="recovery-sent-state">
        <span className="mail-orbit"><MailCheck size={27} /></span><h2>请检查邮箱</h2><p>如果该邮箱已注册，你会收到密码重置邮件。请在邮件有效期内打开链接并设置新密码。</p><button className="secondary-button wide" type="button" onClick={returnToLogin}><ArrowLeft size={15} />返回登录</button>
      </div>}
    </div></section>
  </main>;
}

"use client";

import { ArrowRight, Check, FileSearch, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { BrandMascot } from "@/components/brand-mascot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SHOW_AUTH_BRAND_LOGO = false;

export function ActivateAccount({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(token ? "" : "激活链接不完整，请联系管理员重新生成。");
  const [loading, setLoading] = useState(false);

  async function activate(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email, displayName, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "账号激活失败");

      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("登录服务尚未配置，请联系管理员。");
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error("账号已激活，请返回登录页使用刚设置的密码登录。");
      router.replace("/app");
      router.refresh();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "账号激活失败");
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="login-story">
      {SHOW_AUTH_BRAND_LOGO && <div className="brand brand-large"><BrandMascot /><span>职途<em>tracker</em></span></div>}
      <div className="story-copy"><p className="eyebrow">接受邀请，开始整理你的求职旅程</p><h1>设置一个密码，<br />下一次回来更简单。</h1><p className="story-lead">激活链接只用于确认管理员邀请。设置完成后，你将使用受邀邮箱和密码登录，不需要等待邮件验证码。</p><div className="route-preview" aria-hidden="true"><span><FileSearch size={17} /> 简历</span><i /><span><Sparkles size={17} /> 匹配</span><i /><span><Mail size={17} /> 面试</span><i /><span><Check size={17} /> Offer</span></div></div>
      <p className="login-note">邀请制内测 · 激活链接仅可使用一次</p>
    </section>
    <section className="login-panel"><div className="login-card"><span className="mini-icon"><LockKeyhole size={18} /></span><h2>激活你的账号</h2><p>请输入收到邀请的邮箱，并设置以后登录使用的密码。</p><form onSubmit={activate}>
      <label htmlFor="activation-email">受邀邮箱</label><input id="activation-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
      <label htmlFor="activation-id">用户 ID</label><input id="activation-id" type="text" required minLength={2} maxLength={24} autoComplete="nickname" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="2—24 个字符，可随时修改" />
      <label htmlFor="activation-password">设置密码</label><input id="activation-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" />
      <label htmlFor="activation-confirmation">再次输入密码</label><input id="activation-confirmation" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="再次输入密码" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" type="submit" disabled={loading || !token}>{loading ? "正在激活…" : "激活并进入账号"}{!loading && <ArrowRight size={17} />}</button>
    </form><Link className="demo-link activation-login-link" href="/">已经激活？返回登录</Link></div></section>
  </main>;
}

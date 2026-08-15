"use client";

import { ArrowLeft, Check, FileSearch, KeyRound, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMascot } from "@/components/brand-mascot";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { validateNewPassword } from "@/lib/auth/password";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ResetPasswordProps = {
  recoveryAuthorized: boolean;
};

export function ResetPassword({ recoveryAuthorized }: ResetPasswordProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState(recoveryAuthorized ? "" : "重置链接无效或已过期，请重新申请密码重置邮件。");

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmation }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(result.error || "新密码保存失败，请重新申请重置邮件。");
      setSaving(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setSaving(false);
    setUpdated(true);
  }

  return <main className="login-page">
    <section className="login-story">
      <div className="brand brand-large">
        <BrandMascot />
        <span className="login-brand-lockup"><strong>职途<em>tracker</em></strong><small>一个一站式求职助手网站。</small></span>
      </div>
      <div className="story-copy"><p className="eyebrow">密码更新后，所有求职记录保持不变</p><h1>重新拿好钥匙，<br />继续走下一步。</h1><p className="story-lead">你的简历、岗位收藏、投递进度和面试记录不会因为修改密码而改变。</p><div className="route-preview" aria-hidden="true"><span><FileSearch size={17} /> 简历</span><i /><span><Sparkles size={17} /> 匹配</span><i /><span><Mail size={17} /> 面试</span><i /><span><Check size={17} /> Offer</span></div></div>
      <p className="login-note">安全重置 · 链接仅可在有效期内使用</p>
    </section>
    <section className="login-panel"><div className="login-card">
      {updated && <div className="recovery-sent-state"><span className="mail-orbit"><Check size={27} /></span><h2>密码已更新</h2><p>新密码已经生效。请返回登录页，使用邮箱和新密码登录。</p><Link className="primary-button wide" href="/">返回登录</Link></div>}
      {!updated && recoveryAuthorized && <>
        <span className="mini-icon recovery-icon"><KeyRound size={18} /></span><h2>设置新密码</h2><p>新密码至少 8 位，并同时包含英文字母和数字。</p><form onSubmit={updatePassword}>
          <label htmlFor="reset-password">新密码</label><input id="reset-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" />
          <label htmlFor="reset-confirmation">再次输入新密码</label><input id="reset-confirmation" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="再次输入新密码" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" type="submit" disabled={saving}>{saving ? "正在保存…" : "确认新密码"}</button>
        </form>
      </>}
      {!updated && !recoveryAuthorized && <div className="recovery-sent-state recovery-invalid"><span className="mail-orbit"><ShieldCheck size={27} /></span><h2>链接无法使用</h2><p>{error}</p><Link className="secondary-button wide" href="/"><ArrowLeft size={15} />返回登录并重新申请</Link></div>}
    </div></section>
  </main>;
}

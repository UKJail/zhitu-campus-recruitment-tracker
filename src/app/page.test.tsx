import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const authMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: authMocks.replace, refresh: authMocks.refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => null,
}));

describe("LoginPage session redirect", () => {
  beforeEach(() => {
    authMocks.fetch.mockReset();
    authMocks.replace.mockReset();
    authMocks.refresh.mockReset();
    vi.stubGlobal("fetch", authMocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a stale local session on the login page", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    await waitFor(() => expect(authMocks.fetch).toHaveBeenCalledWith("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    }));
    expect(authMocks.replace).not.toHaveBeenCalled();
  });

  it("redirects only after the server verifies the session", async () => {
    authMocks.fetch.mockResolvedValue({ ok: true });
    render(<LoginPage />);

    await waitFor(() => expect(authMocks.replace).toHaveBeenCalledWith("/app"));
  });

  it("shows the approved public-security filing beside the existing ICP filing", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    const icp = screen.getByRole("link", { name: "湘ICP备2026036134号" });
    const securityFiling = screen.getByRole("link", { name: "粤公网安备44030002016360号" });
    expect(icp.getAttribute("href")).toBe("https://beian.miit.gov.cn/");
    expect(securityFiling.getAttribute("href")).toBe("https://beian.mps.gov.cn/#/query/webSearch?code=44030002016360");
    expect(securityFiling.closest("footer")).toBe(icp.closest("footer"));
    for (const link of [icp, securityFiling]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")?.split(" ")).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    }
    const icon = securityFiling.querySelector("img");
    expect(icon?.getAttribute("src")).toBe("/beian-icon.png");
    expect(icon?.getAttribute("width")).toBe("18");
    expect(icon?.getAttribute("height")).toBe("20");
    expect(securityFiling.firstElementChild).toBe(icon);
  });

  it("restores the brand logo without redundant login and public-test copy", () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    const { container } = render(<LoginPage />);

    expect(container.querySelector(".login-story .brand img")?.getAttribute("src")).toContain("brand-rabbit-3d-v2.webp");
    expect(container.querySelector(".login-brand-lockup strong")?.textContent).toBe("职途tracker");
    expect(screen.queryByText("已有账号可直接登录，新用户可以使用邮箱免费注册。")).toBeNull();
    expect(screen.queryByText(/公开测试/)).toBeNull();
    expect(screen.queryByText(/旧激活链接/)).toBeNull();
    expect(screen.getByRole("button", { name: "继续验证注册邮箱" })).toBeTruthy();
    expect(screen.getByText(/《服务条款》和《隐私政策》/)).toBeTruthy();
  });

  it.each(["注册新账号", "使用邮箱验证码登录", "忘记密码？"])("keeps the filing visible when opening %s", async (buttonName) => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(screen.getByRole("link", { name: "粤公网安备44030002016360号" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "湘ICP备2026036134号" })).toBeTruthy();
  });

  it("offers public email registration without an invitation code", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /注册新账号/ }));

    expect(screen.getByRole("heading", { name: "注册职途" })).toBeTruthy();
    expect(screen.queryByText(/无需邀请码/)).toBeNull();
    expect(screen.queryByText(/公开测试/)).toBeNull();
    expect(screen.queryByLabelText("邀请码")).toBeNull();
    expect(screen.getByRole("button", { name: /注册账号/ })).toBeTruthy();
  });

  it("does not carry login credentials into the registration form", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "existing@example.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "ExistingPass2026" } });
    fireEvent.click(screen.getByRole("button", { name: /注册新账号/ }));

    expect((screen.getByLabelText("邮箱地址") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("设置密码") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("确认密码") as HTMLInputElement).value).toBe("");
  });

  it("does not promise delivery for an existing email and offers a safe resend", async () => {
    authMocks.fetch.mockImplementation((input: string) => {
      if (input === "/api/auth/register") return Promise.resolve({
        ok: true,
        json: async () => ({ requiresEmailConfirmation: true }),
      });
      return Promise.resolve({ ok: false });
    });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /注册新账号/ }));
    fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "candidate@example.com" } });
    fireEvent.change(screen.getByLabelText("用户 ID"), { target: { value: "秋招小李" } });
    fireEvent.change(screen.getByLabelText("设置密码"), { target: { value: "career2026" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "career2026" } });
    fireEvent.click(screen.getByRole("button", { name: /注册账号/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "输入邮箱验证码" })).toBeTruthy());
    expect(screen.getByText(/如果这个邮箱已经注册或完成验证/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /秒后可重新发送/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("注册邮箱") as HTMLInputElement).value).toBe("candidate@example.com");
    expect(screen.getByLabelText("6 位验证码")).toBeTruthy();
  });

  function openPendingRegistration() {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "继续验证注册邮箱" }));
    fireEvent.change(screen.getByLabelText("注册邮箱"), { target: { value: "Candidate@Example.com" } });
  }

  it("verifies a signup code via the existing secure OTP endpoint", async () => {
    authMocks.fetch.mockImplementation((input: string) => Promise.resolve({ ok: input === "/api/auth/sign-in" }));
    openPendingRegistration();
    fireEvent.change(screen.getByLabelText("6 位验证码"), { target: { value: "001234" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并进入职途" }));
    await waitFor(() => expect(authMocks.replace).toHaveBeenCalledWith("/app"));
    expect(authMocks.fetch).toHaveBeenCalledWith("/api/auth/sign-in", expect.objectContaining({
      credentials: "same-origin", body: JSON.stringify({ method: "otp", email: "candidate@example.com", token: "001234" }),
    }));
  });

  it("keeps the email and shows invalid-code errors without navigating", async () => {
    authMocks.fetch.mockImplementation(() => Promise.resolve({ ok: false, json: async () => ({ error: "验证码错误或已过期" }) }));
    openPendingRegistration();
    fireEvent.change(screen.getByLabelText("6 位验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并进入职途" }));
    await waitFor(() => expect(screen.getByText("验证码错误或已过期")).toBeTruthy());
    expect(authMocks.replace).not.toHaveBeenCalled();
    expect((screen.getByLabelText("注册邮箱") as HTMLInputElement).value).toBe("Candidate@Example.com");
  });

  it("resends without submitting passwords and starts a cooldown", async () => {
    authMocks.fetch.mockImplementation((input: string) => Promise.resolve({
      ok: input === "/api/auth/resend-confirmation", json: async () => ({ message: "请检查最新验证码邮件" }),
    }));
    openPendingRegistration();
    fireEvent.click(screen.getByRole("button", { name: "重新发送验证码" }));
    await waitFor(() => expect(screen.getByText("请检查最新验证码邮件")).toBeTruthy());
    expect(authMocks.fetch).toHaveBeenCalledWith("/api/auth/resend-confirmation", expect.objectContaining({ body: JSON.stringify({ email: "candidate@example.com" }) }));
    expect((screen.getByRole("button", { name: /秒后可重新发送/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears a pending code when the email changes or the user leaves", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    openPendingRegistration();
    fireEvent.change(screen.getByLabelText("6 位验证码"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("注册邮箱"), { target: { value: "another@example.com" } });
    expect((screen.getByLabelText("6 位验证码") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("6 位验证码"), { target: { value: "001234" } });
    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));
    fireEvent.click(screen.getByRole("button", { name: "继续验证注册邮箱" }));
    expect((screen.getByLabelText("6 位验证码") as HTMLInputElement).value).toBe("");
  });

  it("keeps the address when switching a pending registration to login codes", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    openPendingRegistration();
    fireEvent.click(screen.getByRole("button", { name: "已注册？改用登录验证码" }));
    expect(screen.getByRole("heading", { name: "验证码登录" })).toBeTruthy();
    expect((screen.getByLabelText("邮箱地址") as HTMLInputElement).value).toBe("candidate@example.com");
  });

  it("starts a login code cooldown and cannot bypass it by reopening the screen", async () => {
    authMocks.fetch.mockImplementation((input: string) => Promise.resolve({ ok: input === "/api/auth/sign-in" }));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: "使用邮箱验证码登录" }));
    fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "candidate@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送登录验证码" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "验证并登录" })).toBeTruthy());
    expect((screen.getByRole("button", { name: /秒后可重新发送/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "返回密码登录" }));
    fireEvent.click(screen.getByRole("button", { name: "使用邮箱验证码登录" }));
    expect((screen.getByRole("button", { name: /秒后可重新发送/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not navigate to the app after a malformed successful registration response", async () => {
    authMocks.fetch.mockImplementation((input: string) => Promise.resolve({ ok: input === "/api/auth/register", json: async () => ({}) }));
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /注册新账号/ }));
    fireEvent.change(screen.getByLabelText("邮箱地址"), { target: { value: "candidate@example.com" } });
    fireEvent.change(screen.getByLabelText("用户 ID"), { target: { value: "秋招小李" } });
    fireEvent.change(screen.getByLabelText("设置密码"), { target: { value: "career2026" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "career2026" } });
    fireEvent.click(screen.getByRole("button", { name: /注册账号/ }));
    await waitFor(() => expect(screen.getByText(/注册服务未返回完整结果/)).toBeTruthy());
    expect(authMocks.replace).not.toHaveBeenCalled();
  });
});

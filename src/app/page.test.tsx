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

  it("offers public email registration without an invitation code", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /注册新账号/ }));

    expect(screen.getByRole("heading", { name: "注册职途" })).toBeTruthy();
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "请检查注册邮箱" })).toBeTruthy());
    expect(screen.getByText(/如果这个邮箱已经注册或完成验证/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新发送验证邮件" })).toBeTruthy();
  });
});

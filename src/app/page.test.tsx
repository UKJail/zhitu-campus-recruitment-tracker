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

  it("offers invitation-code registration without requiring an activation link", async () => {
    authMocks.fetch.mockResolvedValue({ ok: false });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /使用邀请码注册/ }));

    expect(screen.getByRole("heading", { name: "邀请码注册" })).toBeTruthy();
    expect(screen.getByLabelText("邀请码")).toBeTruthy();
    expect(screen.getByRole("button", { name: /注册并进入职途/ })).toBeTruthy();
  });
});

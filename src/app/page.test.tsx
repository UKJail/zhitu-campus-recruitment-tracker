import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const authMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: authMocks.replace }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => null,
}));

describe("LoginPage session redirect", () => {
  beforeEach(() => {
    authMocks.fetch.mockReset();
    authMocks.replace.mockReset();
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
});

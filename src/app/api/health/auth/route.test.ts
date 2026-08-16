import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/health/auth", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("confirms real Auth reachability", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "supabase-auth" });
    expect(fetchMock).toHaveBeenCalledWith("https://project.supabase.co/auth/v1/health", expect.objectContaining({
      cache: "no-store",
      headers: { apikey: "sb_publishable_test" },
    }));
  });

  it("reports blocked outbound access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      service: "supabase-auth",
      code: "auth_service_unreachable",
    });
  });
});

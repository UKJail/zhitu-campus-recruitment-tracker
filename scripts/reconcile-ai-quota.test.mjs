// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readOptions, runReconciliation, verifiedConfiguration } from "./reconcile-ai-quota.mjs";

const ref = "abcdefghijklmnopqrst";
const env = { SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic_not_real" };
const counts = { completed: 1, released: 1, examined: 2, skippedLocked: 0 };
const options = { projectRef: ref, limit: 50 };
function client(response = { data: counts, error: null }) {
  const abortSignal = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => ({ abortSignal }));
  return { factory: vi.fn(() => ({ rpc })), rpc, abortSignal };
}

describe("trusted one-shot AI quota maintenance", () => {
  it("does not run without explicit execution and project selection", () => {
    expect(readOptions([])).toBeNull();
    expect(readOptions(["--help"])).toBeNull();
    expect(() => readOptions(["--run"])).toThrow("EXPLICIT_TARGET_REQUIRED");
    expect(() => readOptions(["--expected-project-ref",ref])).toThrow("EXPLICIT_TARGET_REQUIRED");
    expect(readOptions(["--run","--expected-project-ref",ref])).toEqual(options);
  });
  it.each(["0","101","1.2","NaN"])("rejects invalid batch limit %s", (limit) => {
    expect(() => readOptions(["--run","--expected-project-ref",ref,"--limit",limit])).toThrow("INVALID_BATCH_LIMIT");
  });
  it("rejects unknown/duplicate arguments", () => {
    expect(() => readOptions(["--run","--expected-project-ref",ref,"--token","private"])).toThrow("UNKNOWN_OPTION");
    expect(() => readOptions(["--run","--run","--expected-project-ref",ref])).toThrow("INVALID_OPTIONS");
  });
  it.each([
    { SUPABASE_URL: "https://anotherprojectrefabcd.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://anotherprojectrefabcd.supabase.co" },
    { SUPABASE_URL: `http://${ref}.supabase.co` },
    { SUPABASE_URL: `https://${ref}.supabase.co?token=private` },
    { SUPABASE_URL: `https://private@${ref}.supabase.co` },
    { SUPABASE_URL: `https://${ref}.supabase.co/rest/v1` },
  ])("rejects effective target mismatch before constructing a client", async (override) => {
    const mocks = client();
    await expect(runReconciliation(options,{ ...env,...override },mocks.factory)).rejects.toThrow("PROJECT_TARGET_MISMATCH");
    expect(mocks.factory).not.toHaveBeenCalled();
  });
  it("requires a server credential, not an anonymous user token", () => {
    const jwt = payload => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
    expect(() => verifiedConfiguration({ ...env,SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "authenticated" }) },ref)).toThrow("SERVER_CREDENTIAL_REQUIRED");
    expect(() => verifiedConfiguration({ ...env,SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role",ref: "wrong" }) },ref)).toThrow("SERVER_CREDENTIAL_REQUIRED");
    expect(verifiedConfiguration({ ...env,SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role",ref }) },ref).url).toBe(env.SUPABASE_URL);
  });
  it("calls exactly one bounded RPC, has a timeout, and returns sanitized counts only", async () => {
    const mocks = client({ data: { ...counts, user: "not returned" }, error: null });
    await expect(runReconciliation(options,env,mocks.factory)).resolves.toEqual(counts);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("reconcile_ai_usage_server",{ p_limit: 50 });
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(mocks.factory).toHaveBeenCalledWith(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{ auth: { persistSession: false,autoRefreshToken: false } });
  });
  it("does not expose raw provider errors and never retries uncertain mutations itself", async () => {
    const mocks = client({ data: null,error: { message: "private token and URL" } });
    await expect(runReconciliation(options,env,mocks.factory)).rejects.toThrow("RECONCILIATION_RPC_FAILED");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{ ...counts,completed: -1 },{ ...counts,examined: 0 },{ ...counts,completed: 51 },null])("rejects malformed counters", async (data) => {
    const mocks = client({ data,error: null });
    await expect(runReconciliation(options,env,mocks.factory)).rejects.toThrow("INVALID_RECONCILIATION_RESPONSE");
  });
});

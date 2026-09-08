import { beforeEach, describe, expect, it, vi } from "vitest";
import { Blob } from "node:buffer";

const { getAuthenticatedUserId } = vi.hoisted(() => ({ getAuthenticatedUserId: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId }));
import { GET } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const request = new Request(`https://example.test/api/resumes/${id}/file`);
const context = { params: Promise.resolve({ id }) };
function fixture() {
  const resume = { name: "我的简历.pdf", mime_type: "application/pdf", storage_path: `${userId}/source.pdf` };
  const chain = { select: vi.fn(), eq: vi.fn(), single: vi.fn(async () => ({ data: resume, error: null })) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  const download = vi.fn().mockResolvedValue({ data: new Blob(["original bytes"]), error: null });
  getAuthenticatedUserId.mockResolvedValue({ userId, supabase: { from: () => chain, storage: { from: () => ({ download }) } } });
  return { resume, chain, download };
}

describe("private original resume download", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns unchanged bytes with ownership checks and private download headers", async () => {
    const { chain, download } = fixture();
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("original bytes");
    expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(chain.eq).toHaveBeenCalledWith("id", id);
    expect(download).toHaveBeenCalledWith(`${userId}/source.pdf`, {}, { signal: expect.any(AbortSignal), cache: "no-store" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
  });
  it("rejects logged-out requests", async () => {
    getAuthenticatedUserId.mockResolvedValue({ userId: null });
    expect((await GET(request, context)).status).toBe(401);
  });
  it.each(["other/source.pdf", `${userId}/../source.pdf`, `${userId}/..`, `${userId}/bad\\file.pdf`])("rejects an unsafe or cross-user path %s", async (path) => {
    const { resume, download } = fixture(); resume.storage_path = path;
    expect((await GET(request, context)).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });
  it("does not expose storage errors", async () => {
    const { download } = fixture(); download.mockRejectedValue(new Error("private storage detail"));
    const response = await GET(request, context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private storage");
  });
});

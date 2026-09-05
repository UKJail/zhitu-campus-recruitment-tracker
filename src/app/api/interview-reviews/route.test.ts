import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { PATCH } from "./[id]/route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId: mocks.auth }));

const reviewId = "11111111-1111-4111-8111-111111111111";
const referenceId = "22222222-2222-4222-8222-222222222222";
const input = { company: "测试公司", role: "分析实习生", round: "一面", date: "2026-09-06", score: 3 };
function request(body: unknown) {
  return new Request("http://localhost/api/interview-reviews", { method: "POST", body: JSON.stringify(body) });
}
function query(data: unknown, error: unknown = null) {
  const response = { data, error };
  const chain = {
    select: vi.fn(), eq: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    single: vi.fn().mockResolvedValue(response), maybeSingle: vi.fn().mockResolvedValue(response),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  for (const method of [chain.select, chain.eq, chain.insert, chain.update, chain.delete]) method.mockReturnValue(chain);
  return chain;
}

describe("interview review route ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner-a", supabase: { from: mocks.from } });
  });

  it("rejects signed-out requests without touching records", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request(input))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["applicationId", "resumeVersionId"])("rejects a foreign or missing %s before inserting anything", async (key) => {
    const reference = query(null);
    mocks.from.mockReturnValueOnce(reference);
    expect((await POST(request({ ...input, [key]: referenceId }))).status).toBe(400);
    expect(reference.eq).toHaveBeenCalledWith("user_id", "owner-a");
    expect(reference.insert).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("does not expose database errors or save on reference lookup failure", async () => {
    mocks.from.mockReturnValueOnce(query(null, { message: "private database detail" }));
    const response = await POST(request({ ...input, applicationId: referenceId }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private");
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("creates a review with its own optional reference", async () => {
    mocks.from.mockReturnValueOnce(query({ id: referenceId }))
      .mockReturnValueOnce(query({ id: "interview-a" }))
      .mockReturnValueOnce(query({ id: reviewId, updated_at: "2026-09-06" }));
    expect((await POST(request({ ...input, applicationId: referenceId }))).status).toBe(201);
  });

  it("rejects cross-user references before updating either existing row", async () => {
    const existing = query({ id: reviewId, interview_id: "interview-a" });
    const reference = query(null);
    mocks.from.mockReturnValueOnce(existing).mockReturnValueOnce(reference);
    const response = await PATCH(request({ ...input, resumeVersionId: referenceId }), { params: Promise.resolve({ id: reviewId }) });
    expect(response.status).toBe(400);
    expect(existing.eq).toHaveBeenCalledWith("user_id", "owner-a");
    expect(reference.eq).toHaveBeenCalledWith("user_id", "owner-a");
    expect(reference.update).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid record IDs without querying the database", async () => {
    expect((await PATCH(request(input), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

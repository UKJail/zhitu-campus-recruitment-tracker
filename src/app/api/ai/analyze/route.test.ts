import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserId } = vi.hoisted(() => ({ getAuthenticatedUserId: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId }));
vi.mock("@/lib/ai/provider", () => ({ getAIProvider: vi.fn() }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/analyze", () => {
  beforeEach(() => {
    getAuthenticatedUserId.mockResolvedValue({ supabase: {}, userId: "user-1" });
  });

  it("只把客户端输入错误标记为分析参数错误", async () => {
    const response = await POST(request({
      resumeId: "not-a-uuid",
      jobDescription: "太短",
      targetCompany: "示例公司",
      targetRole: "实习生",
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_ANALYSIS_INPUT");
    expect(payload.error).toContain("简历");
    expect(payload.error).toContain("岗位 JD");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserId, extractResumeText, validateResumeFile } = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(), extractResumeText: vi.fn(), validateResumeFile: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId }));
vi.mock("@/lib/resumes/parse", () => ({ extractResumeText, validateResumeFile }));
import { GET, POST } from "./route";

function fixture(options: { versionError?: boolean; rollbackError?: boolean; countError?: boolean } = {}) {
  const userId = "11111111-1111-4111-8111-111111111111";
  const filters: Array<[string, string, unknown]> = [];
  const operations: string[] = [];
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockImplementation(async () => { operations.push("remove-file"); return { error: null }; });
  const from = vi.fn((table: string) => {
    let action = "select";
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((field: string, value: unknown) => { filters.push([table, field, value]); return chain; }),
      order: vi.fn(() => chain),
      insert: vi.fn(() => { action = "insert"; operations.push(`insert-${table}`); return chain; }),
      delete: vi.fn(() => { action = "delete"; operations.push(`delete-${table}`); return chain; }),
      single: vi.fn(async () => ({ data: { id: "new-resume-id", name: "test.docx" }, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        count: 0, data: [],
        error: (table === "resume_versions" && options.versionError)
          || (table === "resumes" && action === "delete" && options.rollbackError)
          || (table === "resumes" && action === "select" && options.countError)
          ? { message: "simulated failure" } : null,
      })),
    };
    return chain;
  });
  getAuthenticatedUserId.mockResolvedValue({ userId, supabase: { from, storage: { from: () => ({ upload, remove }) } } });
  return { userId, filters, operations, upload, remove };
}

function request() {
  return { formData: async () => ({ get: () => new File(["resume content"], "test.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }) }) } as unknown as Request;
}

describe("resume upload rollback and ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractResumeText.mockResolvedValue("课程项目中整理样本、核对数据并提交分析报告。");
  });

  it("creates the original file and version successfully", async () => {
    const { remove } = fixture();
    expect((await POST(request())).status).toBe(201);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes a newly inserted resume before deleting its file if version creation fails", async () => {
    const { operations, filters, userId } = fixture({ versionError: true });
    expect((await POST(request())).status).toBe(400);
    expect(operations).toEqual(["insert-resumes", "insert-resume_versions", "delete-resumes", "remove-file"]);
    expect(filters).toContainEqual(["resumes", "id", "new-resume-id"]);
    expect(filters).toContainEqual(["resumes", "user_id", userId]);
  });

  it("retains the blob when metadata rollback fails instead of breaking the surviving record", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { remove } = fixture({ versionError: true, rollbackError: true });
    expect((await POST(request())).status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[resume-upload] metadata rollback failed");
    log.mockRestore();
  });

  it("does not upload files if the ownership-scoped resume count cannot be read", async () => {
    const { upload, filters, userId } = fixture({ countError: true });
    expect((await POST(request())).status).toBe(500);
    expect(upload).not.toHaveBeenCalled();
    expect(filters).toContainEqual(["resumes", "user_id", userId]);
  });

  it("explicitly scopes the list to the authenticated user as well as relying on RLS", async () => {
    const { filters, userId } = fixture();
    expect((await GET()).status).toBe(200);
    expect(filters).toContainEqual(["resumes", "user_id", userId]);
  });
});

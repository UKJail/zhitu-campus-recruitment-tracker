import { describe, expect, it, vi } from "vitest";
import { deleteUserFiles } from "./delete-user";

function client() {
  const list = vi.fn().mockResolvedValue({ data: [], error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ list, remove }));
  return { list, remove, from, admin: { storage: { from } } as unknown as Parameters<typeof deleteUserFiles>[0] };
}
describe("deleteUserFiles", () => {
  it("cleans nested and orphaned files in only the target user's folder", async () => {
    const c = client();
    c.list.mockResolvedValueOnce({ data: [{ id: "1", name: "orphan.pdf" }, { id: null, name: "interview-prep" }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "2", name: "prep.docx" }], error: null });
    await deleteUserFiles(c.admin, "target");
    expect(c.from).toHaveBeenCalledWith("resumes");
    expect(c.list.mock.calls.map(([folder]) => folder)).toEqual(["target", "target/interview-prep"]);
    expect(c.remove).toHaveBeenCalledExactlyOnceWith(["target/orphan.pdf", "target/interview-prep/prep.docx"]);
  });
  it("enumerates all pages before removing files in batches", async () => {
    const c = client();
    c.list.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `${i}.pdf` })), error: null })
      .mockResolvedValueOnce({ data: [{ id: "101", name: "last.pdf" }], error: null });
    await deleteUserFiles(c.admin, "target");
    expect(c.list.mock.calls[1][1].offset).toBe(100);
    expect(c.remove.mock.calls.map(([paths]) => paths.length)).toEqual([100, 1]);
    expect(c.list.mock.invocationCallOrder[1]).toBeLessThan(c.remove.mock.invocationCallOrder[0]);
  });
  it("handles accounts with no uploads", async () => {
    const c = client();
    await deleteUserFiles(c.admin, "target");
    expect(c.remove).not.toHaveBeenCalled();
  });
  it("does not delete anything on a listing error", async () => {
    const c = client();
    c.list.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(deleteUserFiles(c.admin, "target")).rejects.toThrow("无法读取");
    expect(c.remove).not.toHaveBeenCalled();
  });
  it.each(["../other.pdf", "..", "folder\\other.pdf"])("rejects unsafe path %s", async (name) => {
    const c = client();
    c.list.mockResolvedValue({ data: [{ id: "1", name }], error: null });
    await expect(deleteUserFiles(c.admin, "target")).rejects.toThrow("路径异常");
    expect(c.remove).not.toHaveBeenCalled();
  });
  it("reports partial file cleanup rather than silent success", async () => {
    const c = client();
    c.list.mockResolvedValue({ data: [{ id: "1", name: "resume.pdf" }], error: null });
    c.remove.mockResolvedValue({ error: { message: "offline" } });
    await expect(deleteUserFiles(c.admin, "target")).rejects.toThrow("账号尚未删除");
  });
});

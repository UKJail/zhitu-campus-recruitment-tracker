import { describe, expect, it, vi } from "vitest";
import { JOB_QUERY_FILTER_ENCODED_SIZE, JOB_QUERY_FILTER_SIZE, JOB_QUERY_MAX_PAGES, JOB_QUERY_PAGE_SIZE, jobQueryValueChunks, readJobQueryChunks, readJobQueryPages } from "./query-pages";

describe("job query paging boundaries", () => {
  it("bounds filter count/encoded Chinese length, deduplicates and skips empty inputs", () => {
    const values = Array.from({ length: 201 }, (_, i) => "示例公司与职位".repeat(12) + i);
    const chunks = jobQueryValueChunks([...values, ...values]);
    expect(chunks.flat()).toEqual(values);
    expect(chunks.every((chunk) => chunk.length <= JOB_QUERY_FILTER_SIZE)).toBe(true);
    expect(chunks.every((chunk) => chunk.reduce((size, value) => size + encodeURIComponent(JSON.stringify(value)).length + 3, 0) <= JOB_QUERY_FILTER_ENCODED_SIZE)).toBe(true);
    expect(jobQueryValueChunks([])).toEqual([]);
    expect(() => jobQueryValueChunks([""])).toThrow();
    expect(() => jobQueryValueChunks(["中".repeat(1000)])).toThrow();
  });

  it("handles embedded quotes and filter syntax as data without constructing raw filter strings", () => {
    const values = ['company,"title")', "id.eq.other", "公司\\职位"];
    expect(jobQueryValueChunks(values).flat()).toEqual(values);
  });

  it("continues through short pages until empty and uses the exact last key", async () => {
    const pages = vi.fn().mockResolvedValueOnce({ data: [{ id: "a" }, { id: "b" }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "c" }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    await expect(readJobQueryPages(pages, (row: { id: string }) => row.id)).resolves.toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(pages.mock.calls).toEqual([[undefined], ["b"], ["c"]]);
  });

  it("rejects repeated/non-ascending cursors instead of looping or duplicating", async () => {
    const page = vi.fn().mockResolvedValue({ data: [{ id: "a" }], error: null });
    await expect(readJobQueryPages(page, (row: { id: string }) => row.id)).rejects.toThrow();
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("rejects missing data, private database errors and oversized pages", async () => {
    await expect(readJobQueryPages(async () => ({ data: null, error: null }), (row: { id: string }) => row.id)).rejects.toThrow("职位数据读取失败");
    await expect(readJobQueryPages(async () => ({ data: [], error: { message: "private detail" } }), (row: { id: string }) => row.id)).rejects.not.toThrow("private detail");
    await expect(readJobQueryPages(async () => ({ data: Array.from({ length: JOB_QUERY_PAGE_SIZE + 1 }, (_, i) => ({ id: String(i).padStart(6, "0") })), error: null }), (row) => row.id)).rejects.toThrow();
  });

  it("returns an explicit error when the scan guard is exceeded, never a partial success", async () => {
    let next = 0;
    const page = vi.fn(async () => ({ data: [{ id: String(++next).padStart(6, "0") }], error: null }));
    await expect(readJobQueryPages(page, (row) => row.id)).rejects.toThrow("未能完整加载");
    expect(page).toHaveBeenCalledTimes(JOB_QUERY_MAX_PAGES);
  });

  it("preserves chunk order and bounds concurrent requests", async () => {
    let active = 0;
    let maximum = 0;
    const values = Array.from({ length: 501 }, (_, i) => String(i));
    const result = await readJobQueryChunks(values, async (chunk) => {
      active += 1;
      maximum = Math.max(active, maximum);
      await Promise.resolve();
      active -= 1;
      return chunk;
    });
    expect(result).toEqual(values);
    expect(maximum).toBeLessThanOrEqual(4);
    const empty = vi.fn();
    await expect(readJobQueryChunks([], empty)).resolves.toEqual([]);
    expect(empty).not.toHaveBeenCalled();
  });
});

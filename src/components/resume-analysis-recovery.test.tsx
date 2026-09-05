import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumesPage } from "./tracker-app";

const fetchMock = vi.fn();
const notify = vi.fn();
const setSuggestions = vi.fn();
const resumeId = "11111111-1111-4111-8111-111111111111";
const quota = { limit: 20, used: 1, remaining: 19, resetAt: "" };

describe("explicitly recover missing resume analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/resumes") return Promise.resolve({ ok: true, json: async () => ({ resumes: [{ id: resumeId, name: "candidate.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", updated_at: "2026-09-06T00:00:00Z" }] }) });
      if (url.endsWith("/workspace")) return Promise.resolve({ ok: true, json: async () => ({}) });
      return Promise.resolve({ ok: false, json: async () => ({ code: "AI_RESULT_UNAVAILABLE", error: "旧分析结果已不可用", quota }) });
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("waits for another explicit click, then sends a fresh operation with forceRefresh", async () => {
    render(<ResumesPage suggestions={[]} setSuggestions={setSuggestions} notify={notify} aiQuota={quota} onQuotaChanged={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "分析并获取建议（计 1 次）" });
    fireEvent.change(screen.getByPlaceholderText("粘贴职位描述、岗位职责和任职要求…"), { target: { value: "寻找能够整理样本、核对数据并撰写分析报告的应届毕业生。" } });
    fireEvent.click(button);
    await screen.findByRole("button", { name: "重新分析（计 1 次）" });
    expect(screen.getByRole("status").textContent).toContain("不会自动生成");
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/ai/analyze")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "重新分析（计 1 次）" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/ai/analyze")).toHaveLength(2));
    const bodies = fetchMock.mock.calls.filter(([url]) => url === "/api/ai/analyze").map(([, options]) => JSON.parse(options.body));
    expect(bodies[0].forceRefresh).toBe(false);
    expect(bodies[1].forceRefresh).toBe(true);
    expect(bodies[1].operationId).not.toBe(bodies[0].operationId);
  });

  it("clearly disables the unavailable original-file actions instead of presenting working buttons", async () => {
    render(<ResumesPage suggestions={[]} setSuggestions={setSuggestions} notify={notify} aiQuota={quota} onQuotaChanged={vi.fn()} />);
    const preview = await screen.findByRole("button", { name: "预览（暂未开放）" });
    expect((preview as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "导出（暂未开放）" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("原文件预览与导出暂未开放；定制版本生成后可下载 DOCX。")).toBeTruthy();
  });
});

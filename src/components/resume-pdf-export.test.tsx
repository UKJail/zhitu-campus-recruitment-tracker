import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Suggestion } from "@/lib/types";
import { analysisSchema } from "@/lib/ai/provider";

const { downloadResumePdf } = vi.hoisted(() => ({ downloadResumePdf: vi.fn() }));
vi.mock("@/lib/resumes/pdf-download", () => ({ downloadResumePdf }));
import { ResumesPage } from "./tracker-app";

const fetchMock = vi.fn();
const notify = vi.fn();
const resumeId = "11111111-1111-4111-8111-111111111111";
const otherResumeId = "44444444-4444-4444-8444-444444444444";
const version = { versionId: "22222222-2222-4222-8222-222222222222", targetCompany: "示例公司", targetRole: "分析实习生", acceptedCount: 1, createdAt: "2026-09-08T00:00:00Z", qualityChecks: [], downloadUrl: "/api/resumes/versions/version/download" };
const quota = { limit: 20, used: 1, remaining: 19, resetAt: "" };
const analysis = analysisSchema.parse({ score: 70, matchedKeywords: [], missingKeywords: [], risks: [], suggestions: [{ section: "课程项目", original: "整理样本", revised: "使用表格整理课程项目样本", reason: "表达清晰", impact: "中", requiresConfirmation: false }] });

function Harness() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  return <ResumesPage suggestions={suggestions} setSuggestions={setSuggestions} notify={notify} aiQuota={quota} onQuotaChanged={vi.fn()} />;
}

function fixture(hasVersion: boolean, multipleResumes = false) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/resumes") return { ok: true, json: async () => ({ resumes: [{ id: resumeId, name: "candidate.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", updated_at: "2026-09-08T00:00:00Z" }, ...(multipleResumes ? [{ id: otherResumeId, name: "second.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", updated_at: "2026-09-08T00:00:00Z" }] : [])] }) };
    if (url.endsWith("/workspace")) return { ok: true, json: async () => ({ analysisRunId: "33333333-3333-4333-8333-333333333333", analysis, targetCompany: "示例公司", targetRole: "分析实习生", jobDescription: "寻找能够整理样本、核对数据并撰写分析报告的应届毕业生。", acceptedSuggestionIndexes: hasVersion ? [0] : [], generatedVersion: hasVersion ? { ...version, versionId: url.includes(otherResumeId) ? "55555555-5555-4555-8555-555555555555" : version.versionId } : null }) };
    if (url === "/api/ai/generate-resume") return { ok: true, json: async () => version };
    throw new Error(`Unexpected request ${url}`);
  });
}

function deferGeneration() {
  const base = fetchMock.getMockImplementation()!;
  let complete!: (response: unknown) => void;
  const pending = new Promise((resolve) => { complete = resolve; });
  fetchMock.mockImplementation((url: string) => url === "/api/ai/generate-resume" ? pending : base(url));
  return () => complete({ ok: true, json: async () => version });
}

describe("one-page PDF delivery UI", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); downloadResumePdf.mockResolvedValue(undefined); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("does not convert restored history until the user explicitly clicks", async () => {
    fixture(true); render(<Harness />);
    const button = await screen.findByRole("button", { name: "下载一页 PDF" });
    expect(downloadResumePdf).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "下载 DOCX" }).getAttribute("href")).toBe(version.downloadUrl);
    fireEvent.click(button);
    await waitFor(() => expect(downloadResumePdf).toHaveBeenCalledWith(version.versionId, expect.any(AbortSignal)));
    await screen.findByText(/PDF 已通过一页 A4 和文字保留检查/);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/ai/"))).toBe(false);
  });

  it("starts PDF delivery after an explicit generation while preserving confirmed content", async () => {
    fixture(false); render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "接受建议" }));
    fireEvent.click(screen.getByRole("button", { name: "生成投递简历" }));
    await waitFor(() => expect(downloadResumePdf).toHaveBeenCalledTimes(1));
    expect(downloadResumePdf).toHaveBeenCalledWith(version.versionId, expect.any(AbortSignal));
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/ai/generate-resume")).toHaveLength(1);
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/ai/generate-resume")?.[1]?.body);
    expect(body.acceptedSuggestionIndexes).toEqual([0]);
    expect(await screen.findByRole("link", { name: "下载 DOCX" })).toBeTruthy();
  });

  it("preserves DOCX and explains failed PDF checks, then retries only on another click", async () => {
    fixture(true); downloadResumePdf.mockRejectedValueOnce(new Error("保留原排版后，PDF 不止一页"));
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "下载一页 PDF" }));
    const retry = await screen.findByRole("button", { name: "重试导出 PDF" });
    expect(screen.getByRole("status").textContent).toContain("已确认文字和 DOCX 版本均已保留");
    expect(screen.getByRole("status").textContent).toContain("PDF 不止一页");
    expect(screen.getByRole("link", { name: "下载 DOCX" })).toBeTruthy();
    expect(downloadResumePdf).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(downloadResumePdf).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/api/ai/"))).toBe(false);
  });

  it("prevents double-click conversion and cancels the client request on navigation", async () => {
    fixture(true); downloadResumePdf.mockImplementation(() => new Promise(() => {}));
    const view = render(<Harness />);
    const button = await screen.findByRole("button", { name: "下载一页 PDF" });
    fireEvent.click(button); fireEvent.click(button);
    expect(downloadResumePdf).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "正在检查 PDF…" }) as HTMLButtonElement).disabled).toBe(true);
    const signal = downloadResumePdf.mock.calls[0][1] as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
  });

  it("clears abandoned loading state so returning to the same version can export again", async () => {
    fixture(true, true); downloadResumePdf.mockImplementation(() => new Promise(() => {}));
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "下载一页 PDF" }));
    const signal = downloadResumePdf.mock.calls[0][1] as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: /^DOCX.*second\.docx/ }));
    await screen.findByRole("heading", { name: "second.docx" });
    await screen.findByRole("button", { name: "下载一页 PDF" });
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^DOCX.*candidate\.docx/ }));
    const retry = await screen.findByRole("button", { name: "下载一页 PDF" });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    expect(downloadResumePdf).toHaveBeenCalledTimes(2);
  });

  it("does not start a stale generated-version download after switching resumes", async () => {
    fixture(false, true); const complete = deferGeneration();
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "接受建议" }));
    fireEvent.click(screen.getByRole("button", { name: "生成投递简历" }));
    const signal = fetchMock.mock.calls.find(([url]) => url === "/api/ai/generate-resume")?.[1]?.signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: /^DOCX.*second\.docx/ }));
    await screen.findByRole("heading", { name: "second.docx" });
    expect(signal.aborted).toBe(true);
    await act(async () => complete());
    expect(downloadResumePdf).not.toHaveBeenCalled();
  });

  it("does not start an automatic download when generation finishes after leaving the page", async () => {
    fixture(false); const complete = deferGeneration();
    const view = render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: "接受建议" }));
    fireEvent.click(screen.getByRole("button", { name: "生成投递简历" }));
    const signal = fetchMock.mock.calls.find(([url]) => url === "/api/ai/generate-resume")?.[1]?.signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete());
    expect(downloadResumePdf).not.toHaveBeenCalled();
  });

  it("ignores an out-of-order restored workspace instead of exporting the wrong version", async () => {
    fixture(true, true);
    const base = fetchMock.getMockImplementation()!;
    let finishSecond!: (response: unknown) => void;
    const second = new Promise((resolve) => { finishSecond = resolve; });
    fetchMock.mockImplementation((url: string) => url === `/api/resumes/${otherResumeId}/workspace` ? second : base(url));
    render(<Harness />);
    await screen.findByRole("button", { name: "下载一页 PDF" });
    fireEvent.click(screen.getByRole("button", { name: /^DOCX.*second\.docx/ }));
    await screen.findByRole("heading", { name: "second.docx" });
    fireEvent.click(screen.getByRole("button", { name: /^DOCX.*candidate\.docx/ }));
    await screen.findByRole("button", { name: "下载一页 PDF" });
    await act(async () => finishSecond(await base(`/api/resumes/${otherResumeId}/workspace`)));
    fireEvent.click(screen.getByRole("button", { name: "下载一页 PDF" }));
    expect(downloadResumePdf).toHaveBeenCalledWith(version.versionId, expect.any(AbortSignal));
  });
});

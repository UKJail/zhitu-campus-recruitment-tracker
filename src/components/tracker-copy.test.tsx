import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackerApp } from "./tracker-app";
import { InterviewPrepPage } from "./interview-prep-page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe("navigation copy", () => {
  it("keeps interview generation without repeating quota copy beside its button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invitations: [], preparations: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<InterviewPrepPage notify={vi.fn()} aiQuota={{ limit: 20, used: 0, remaining: 20, resetAt: "" }} onQuotaChanged={vi.fn()} />);
    await screen.findByText("还没有面试邀请");
    expect(screen.queryByText(/成功生成计|失败不扣|今日剩余/)).toBeNull();
    expect(screen.getByRole("button", { name: "生成面试准备题" })).toBeTruthy();
    expect(screen.getByLabelText("公司")).toBeTruthy();
    expect(screen.getByLabelText("岗位 JD")).toBeTruthy();
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST")).toBe(true);
  });

  it("removes the unused global search while retaining the working job search", async () => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      jobs: [],
      meta: { catalogTotal: 0, total: 0, page: 1, pageSize: 10, pageCount: 1, generatedAt: "", cities: [], companies: [], batches: [], industries: [] },
    }) }));
    render(<TrackerApp />);
    expect(screen.queryByPlaceholderText("全局搜索暂未开放")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /全局搜索/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation", { name: "主要导航" })).getByRole("button", { name: "职位库" }));
    const search = await screen.findByPlaceholderText("搜索职位、公司或行业关键词");
    fireEvent.change(search, { target: { value: "字节" } });
    expect((search as HTMLInputElement).value).toBe("字节");
  });
});

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewReview } from "@/lib/types";

vi.hoisted(() => { vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false"); });
import { ReviewsPage } from "./tracker-app";

const fetchMock = vi.fn();
const notify = vi.fn();
const reviews: InterviewReview[] = [
  { id: "review-new", company: "新公司", role: "分析实习生", round: "业务一面", date: "2026-09-05", score: 3, questions: "最新记录的问题", highlights: "最新记录的优点", improvements: "最新改进", nextStep: "最新下一步" },
  { id: "review-old", company: "旧公司", role: "研究实习生", round: "业务二面", date: "2026-09-01", score: 4, questions: "历史记录的问题", highlights: "历史记录的优点", improvements: "历史改进", nextStep: "历史下一步" },
];

function Harness() {
  const [items, setItems] = useState(reviews);
  return <ReviewsPage reviews={items} setReviews={setItems} notify={notify} />;
}

describe("select and edit historical interview reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === "PATCH"
        ? { review: { ...JSON.parse(String(init.body)), updatedAt: "2026-09-06T00:00:00Z" } }
        : { reviews },
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens either record and shows the selected record rather than always the latest one", async () => {
    render(<Harness />);
    const old = await screen.findByRole("button", { name: /查看 旧公司/ });
    expect(within(screen.getByRole("region", { name: "选中复盘详情" })).getByText("最新记录的问题")).toBeTruthy();
    fireEvent.click(old);
    expect(within(screen.getByRole("region", { name: "选中复盘详情" })).getByText("历史记录的问题")).toBeTruthy();
    expect(old.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /查看 新公司/ }));
    expect(within(screen.getByRole("region", { name: "选中复盘详情" })).getByText("最新记录的问题")).toBeTruthy();
  });

  it("saves edits to the selected historical ID and keeps that record selected", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /查看 旧公司/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByLabelText("公司") as HTMLInputElement).value).toBe("旧公司");
    fireEvent.change(within(dialog).getByLabelText("遇到的问题"), { target: { value: "补充历史面试问题" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存复盘" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/api/interview-reviews/review-old");
    expect(JSON.parse(String(writes[0][1].body))).toMatchObject({ id: "review-old", company: "旧公司", questions: "补充历史面试问题" });
    expect(screen.getByRole("button", { name: /查看 旧公司/ }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("region", { name: "选中复盘详情" })).getByText("补充历史面试问题")).toBeTruthy();
  });

  it("preserves selection when list data refreshes and falls back if the selected record disappears", async () => {
    const setReviews = vi.fn();
    const { rerender } = render(<ReviewsPage reviews={reviews} setReviews={setReviews} notify={notify} />);
    fireEvent.click(await screen.findByRole("button", { name: /查看 旧公司/ }));
    const updatedOld = { ...reviews[1], questions: "刷新后的历史问题" };
    rerender(<ReviewsPage reviews={[reviews[0], updatedOld]} setReviews={setReviews} notify={notify} />);
    expect(within(screen.getByRole("region", { name: "选中复盘详情" })).getByText("刷新后的历史问题")).toBeTruthy();
    rerender(<ReviewsPage reviews={[reviews[0]]} setReviews={setReviews} notify={notify} />);
    expect(within(screen.getByRole("region", { name: "选中复盘详情" })).getByText("最新记录的问题")).toBeTruthy();
    expect(screen.getByRole("button", { name: /查看 新公司/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "按时间排序" })).toBeNull();
    expect(screen.getByText("最近更新优先")).toBeTruthy();
  });
});

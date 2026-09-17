import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareerPortalDirectory } from "./career-portal-directory";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("career portal reachability", () => {
  it("keeps unavailable companies searchable without an active broken link or recruiting claim", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ portals: [
      { key: "live", name: "可访问企业", industry: "科技", url: "https://example.test/live", status: "active" },
      { key: "broken", name: "失效企业", industry: "科技", url: "https://example.test/broken", status: "unavailable" },
      { key: "limited", name: "受限企业", industry: "科技", url: "https://example.test/limited", status: "restricted" },
    ] })));
    render(<CareerPortalDirectory notify={vi.fn()} />);
    await screen.findByText("失效企业");
    expect(screen.getByText("入口可访问")).toBeTruthy();
    expect(screen.getByText("访问受限")).toBeTruthy();
    const broken = screen.getByText("失效企业").closest("article")!;
    expect(within(broken).queryByRole("link")).toBeNull();
    expect(within(broken).getByText("入口暂不可用")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("搜索企业或行业"), { target: { value: "失效" } });
    expect(screen.getByText("失效企业")).toBeTruthy();
    expect(screen.queryByText("可访问企业")).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const executeScript = vi.fn();
const sendMessage = vi.fn();
const contains = vi.fn();
const request = vi.fn();

vi.mock("wxt/browser", () => ({
  browser: {
    tabs: { query, sendMessage },
    scripting: { executeScript },
    permissions: { contains, request },
  },
}));

describe("active tab connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([{ id: 42, url: undefined }]);
    executeScript.mockResolvedValue([]);
    sendMessage.mockResolvedValue({ fields: [], url: "http://127.0.0.1:4173/", title: "测试页" });
    contains.mockResolvedValue(true);
    request.mockResolvedValue(true);
  });

  it("does not mistake a temporarily unavailable tab URL for a system page", async () => {
    const { scanActivePage } = await import("../src/lib/page-client");
    await expect(scanActivePage()).resolves.toMatchObject({ url: "http://127.0.0.1:4173/" });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 42 }, files: ["/page-bridge.js"] });
  });

  it("reports a restricted page only when Chrome rejects script access", async () => {
    const { scanActivePage } = await import("../src/lib/page-client");
    executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
    await expect(scanActivePage()).rejects.toThrow("浏览器受限页面");
  });

  it("distinguishes a missing website permission from a restricted browser page", async () => {
    const { scanActivePage } = await import("../src/lib/page-client");
    query.mockResolvedValue([{ id: 42, url: "https://goertek.hotjob.cn/apply" }]);
    contains.mockResolvedValue(false);
    request.mockResolvedValue(false);
    await expect(scanActivePage()).rejects.toThrow("尚未获得当前招聘网站的访问权限");
    expect(request).toHaveBeenCalledWith({ origins: ["https://goertek.hotjob.cn/*"] });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("remembers an approved recruitment-site permission", async () => {
    const { scanActivePage } = await import("../src/lib/page-client");
    query.mockResolvedValue([{ id: 42, url: "https://goertek.hotjob.cn/apply" }]);
    contains.mockResolvedValue(false);
    request.mockResolvedValue(true);
    await expect(scanActivePage()).resolves.toMatchObject({ title: "测试页" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledTimes(1);
  });

  it("sends marker and clear-marker commands to the current page", async () => {
    const { clearActivePageMarks, markActivePage } = await import("../src/lib/page-client");
    sendMessage.mockResolvedValueOnce({ marked: 1 });
    await expect(markActivePage([{ token: "field-1" } as never])).resolves.toEqual({ marked: 1 });
    expect(sendMessage).toHaveBeenLastCalledWith(42, { type: "ZHITU_MARK", matches: [{ token: "field-1" }] });
    sendMessage.mockResolvedValueOnce({ cleared: true });
    await expect(clearActivePageMarks()).resolves.toEqual({ cleared: true });
    expect(sendMessage).toHaveBeenLastCalledWith(42, { type: "ZHITU_CLEAR_MARKS" });
  });
});

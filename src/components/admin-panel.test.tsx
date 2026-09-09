import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "./tracker-app";

const fetchMock = vi.fn();
const notify = vi.fn();
const overview = {
  users: [
    { id: "admin", email: "admin@example.com", display_name: "管理员", is_admin: true, ai_daily_limit: 20 },
    { id: "test-user", email: "test@example.com", display_name: "测试账号", is_admin: false, ai_daily_limit: 20 },
  ], feedback: [],
};
describe("AdminPanel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    notify.mockReset();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => overview });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  async function openConfirmation() {
    render(<AdminPanel onClose={vi.fn()} notify={notify} />);
    fireEvent.click(await screen.findByRole("button", { name: "删除用户 test@example.com" }));
  }
  it("keeps quota management and feedback without collection health content", async () => {
    render(<AdminPanel onClose={vi.fn()} notify={notify} />);
    expect(await screen.findByText("用户与每日 AI 配额")).toBeTruthy();
    expect(screen.getByText("建议与 Bug 反馈")).toBeTruthy();
    expect(screen.queryByText("采集来源健康度")).toBeNull();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });
  it.each([0, 1])("refreshes the current user's quota immediately after saving row %s", async (index) => {
    const onQuotaUpdated = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ updated: true }) });
    render(<AdminPanel onClose={vi.fn()} notify={notify} onQuotaUpdated={onQuotaUpdated} />);
    const input = (await screen.findAllByRole("spinbutton"))[index];
    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onQuotaUpdated).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/admin/users/${overview.users[index].id}/quota`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ dailyLimit: 50 }) }));
    expect(notify).toHaveBeenCalledWith("AI 配额已更新");
  });
  it("does not report a refresh or success when saving quota fails", async () => {
    const onQuotaUpdated = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "配额更新失败" }) });
    render(<AdminPanel onClose={vi.fn()} notify={notify} onQuotaUpdated={onQuotaUpdated} />);
    fireEvent.blur((await screen.findAllByRole("spinbutton"))[0]);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("配额更新失败"));
    expect(onQuotaUpdated).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith("AI 配额已更新");
  });
  it("hides deletion for administrators and cancellation never sends a delete", async () => {
    await openConfirmation();
    expect(screen.queryByRole("button", { name: "删除用户 admin@example.com" })).toBeNull();
    expect((screen.getByRole("button", { name: "永久删除账号" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("form", { name: "删除用户确认" })).toBeNull();
  });
  it("requires the matching email then removes the account from the list", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ deleted: true }) });
    await openConfirmation();
    const input = screen.getByLabelText("输入上方完整邮箱确认");
    fireEvent.change(input, { target: { value: "wrong@example.com" } });
    expect((screen.getByRole("button", { name: "永久删除账号" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "永久删除账号" }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/users/test-user", {
      method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmationEmail: "test@example.com" }),
    });
    expect(screen.queryByText("测试账号")).toBeNull();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
  });
  it("shows failures without claiming successful deletion", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "账号删除失败，请重试" }) });
    await openConfirmation();
    fireEvent.change(screen.getByLabelText("输入上方完整邮箱确认"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "永久删除账号" }));
    expect(await screen.findByText("账号删除失败，请重试")).toBeTruthy();
    expect(notify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("测试账号")).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "./tracker-app";

const fetchMock = vi.fn();
const notify = vi.fn();
const overview = {
  users: [
    { id: "admin", email: "admin@example.com", display_name: "管理员", is_admin: true, ai_daily_limit: 20 },
    { id: "test-user", email: "test@example.com", display_name: "测试账号", is_admin: false, ai_daily_limit: 20 },
  ], sources: [], feedback: [],
};
describe("AdminPanel delete confirmation", () => {
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

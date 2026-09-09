import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
let limit = 20;
const quota = () => ({ limit, used: 3, remaining: Math.max(0, limit - 3), resetAt: "2026-09-10T16:00:00Z" });
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  limit = 20;
  fetchMock.mockReset().mockImplementation(async (url: string, options?: RequestInit) => {
    let payload: unknown = {};
    if (url === "/api/ai/quota") payload = { quota: quota() };
    if (url === "/api/account") payload = { profile: { displayName: "Quota Tester", email: "quota@example.invalid", isAdmin: true, dailyApplicationTarget: 20 } };
    if (url === "/api/admin/overview") payload = { users: [{ id: "admin", email: "quota@example.invalid", display_name: "Quota Tester", is_admin: true, ai_daily_limit: limit }], feedback: [] };
    if (url === "/api/admin/users/admin/quota") { limit = JSON.parse(String(options?.body)).dailyLimit; payload = { updated: true }; }
    return { ok: true, json: async () => payload };
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("updates the header after a self quota save without reloading, retaining used count", async () => {
  const { TrackerApp } = await import("./tracker-app");
  const { container } = render(<TrackerApp />);
  await waitFor(() => expect(container.querySelector(".ai-quota-chip")?.textContent).toContain("17/ 20"));
  fireEvent.click(await screen.findByText("Quota Tester"));
  fireEvent.click(await screen.findByRole("button", { name: /管理员控制台/ }));
  const input = await screen.findByRole("spinbutton");
  fireEvent.change(input, { target: { value: "50" } });
  fireEvent.blur(input);
  await waitFor(() => expect(container.querySelector(".ai-quota-chip")?.textContent).toContain("47/ 50"));
});

it("rereads changed quotas when a user returns to the tab", async () => {
  const { TrackerApp } = await import("./tracker-app");
  const { container } = render(<TrackerApp />);
  await waitFor(() => expect(container.querySelector(".ai-quota-chip")?.textContent).toContain("17/ 20"));
  limit = 100;
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(container.querySelector(".ai-quota-chip")?.textContent).toContain("97/ 100"));
});

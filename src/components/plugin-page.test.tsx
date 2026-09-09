import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PluginPage } from "./plugin-page";
import { TrackerApp } from "./tracker-app";
import { pluginDownloadUrl } from "@/lib/plugin-release";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("keeps an unpublished plugin visible without a fake download", () => {
  render(<PluginPage />);
  expect(screen.getByRole("heading", { name: "职途网申助手" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("即将上线");
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

it("opens a real download once its URL is configured", () => {
  render(<PluginPage downloadUrl="https://downloads.example.com/plugin.zip" />);
  const link = screen.getByRole("link", { name: "下载插件" });
  expect(link.getAttribute("href")).toBe("https://downloads.example.com/plugin.zip");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(screen.queryByText("即将上线")).toBeNull();
  expect(screen.queryByText("插件发布后，将在这里开放下载。")).toBeNull();
});

it.each(["", "   ", "javascript:alert(1)", "data:text/html,test", "http://example.com/a.zip", "//example.com/a.zip", "https://user:password@example.com/a.zip", "not a url"])("does not activate an invalid download: %s", (url) => {
  expect(pluginDownloadUrl(url)).toBeNull();
  render(<PluginPage downloadUrl={url} />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("即将上线");
});

it("adds a working dashboard destination and keeps other navigation intact", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  render(<TrackerApp />);
  const nav = screen.getByRole("navigation", { name: "主要导航" });
  const plugin = within(nav).getByRole("button", { name: "填表插件" });
  expect(within(nav).getAllByRole("button").at(-1)).toBe(plugin);
  fireEvent.click(plugin);
  expect(plugin.classList.contains("active")).toBe(true);
  expect(screen.getByRole("heading", { level: 1, name: "填表插件" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("即将上线");
  fireEvent.click(within(nav).getByRole("button", { name: "首页" }));
  expect(screen.queryByRole("heading", { name: "职途网申助手" })).toBeNull();
});

it("passes the configured download from the dashboard to the plugin page", () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  render(<TrackerApp pluginUrl="https://downloads.example.com/ready.zip" />);
  fireEvent.click(within(screen.getByRole("navigation", { name: "主要导航" })).getByRole("button", { name: "填表插件" }));
  expect(screen.getByRole("link", { name: "下载插件" }).getAttribute("href")).toBe("https://downloads.example.com/ready.zip");
});

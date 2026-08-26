import { browser } from "wxt/browser";
import type { FieldDescriptor, FieldMatch } from "./field-matcher";

export type ScanResult = {
  fields: FieldDescriptor[];
  url: string;
  title: string;
};

type ActivePage = { id: number; url?: string };

async function activePage(): Promise<ActivePage> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("没有找到当前网页");
  return { id: tab.id, url: tab.url };
}

function sitePattern(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("当前标签页属于浏览器受限页面，请在普通 http/https 网申页面中使用");
  }
  return `${parsed.protocol}//${parsed.hostname}/*`;
}

async function ensureSitePermission(page: ActivePage) {
  if (!page.url) return;
  const origins = [sitePattern(page.url)];
  if (await browser.permissions.contains({ origins })) return;
  const granted = await browser.permissions.request({ origins });
  if (!granted) {
    throw new Error("插件尚未获得当前招聘网站的访问权限。请重新点击扫描，并在 Chrome 弹窗中选择允许");
  }
}

async function ensureBridge(page: ActivePage) {
  await ensureSitePermission(page);
  try {
    await browser.scripting.executeScript({
      target: { tabId: page.id },
      files: ["/page-bridge.js"],
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/manifest must request permission|missing host permission|not allowed to access/i.test(message)) {
      throw new Error("Chrome 尚未向插件开放这个招聘网站。请到扩展详情的“网站访问权限”中允许该站点后重试");
    }
    if (/cannot access|cannot be scripted|chrome:\/\/|edge:\/\/|web store|extensions page/i.test(message)) {
      throw new Error("当前标签页属于浏览器受限页面，请在普通 http/https 网申页面中使用");
    }
    throw new Error(`插件无法连接当前网页，请刷新页面后重试（${message}）`);
  }
}

export async function scanActivePage(): Promise<ScanResult> {
  const page = await activePage();
  await ensureBridge(page);
  const response = await browser.tabs.sendMessage(page.id, { type: "ZHITU_SCAN" }) as ScanResult | undefined;
  if (!response || !Array.isArray(response.fields)) throw new Error("没有收到网页字段，请刷新页面后重试");
  return response;
}

export async function fillActivePage(matches: FieldMatch[]) {
  const page = await activePage();
  await ensureBridge(page);
  return browser.tabs.sendMessage(page.id, { type: "ZHITU_FILL", matches }) as Promise<Array<{ token: string; ok: boolean; message: string }>>;
}

export async function markActivePage(matches: FieldMatch[]) {
  const page = await activePage();
  await ensureBridge(page);
  return browser.tabs.sendMessage(page.id, { type: "ZHITU_MARK", matches }) as Promise<{ marked: number }>;
}

export async function clearActivePageMarks() {
  const page = await activePage();
  await ensureBridge(page);
  return browser.tabs.sendMessage(page.id, { type: "ZHITU_CLEAR_MARKS" }) as Promise<{ cleared: boolean }>;
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import type { OfferstarRecord } from "@/lib/jobs/offerstar-catalog";
import { JOB_QUERY_FILTER_SIZE, JOB_QUERY_PAGE_SIZE } from "@/lib/jobs/query-pages";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), catalog: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId: mocks.auth }));
vi.mock("@/lib/jobs/offerstar-catalog", async (original) => ({
  ...await original<typeof import("@/lib/jobs/offerstar-catalog")>(),
  loadOfferstarCatalog: mocks.catalog,
}));
import { GET } from "./route";

type Row = Record<string, unknown>;
type Table = "jobs" | "saved_jobs" | "applications" | "application_events";
type Call = { table: Table; select: string; filters: Record<string, string>; order: string; limit: number; url: string };
const uid = "11111111-1111-4111-8111-111111111111";
let fixtureIndex = 0;
const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");

function record(n: number): OfferstarRecord {
  return { externalId: "offerstar-" + n, company: "示例公司" + n, title: "分析实习生", location: "深圳", experience: "实习", applyUrl: "https://example.test/jobs/" + n,
    normalizedUrl: "https://example.test/jobs/" + n, businessFingerprint: "fp-" + n, recruitmentType: "实习", offerstarType: "2027届", position: "分析岗", industry: "互联网",
    category: "", postDate: "09-07", deadline: "尽快投递", applyUrlIsWechat: false };
}
function job(n: number): Row {
  return { id: id(n), company: "示例公司" + n, title: "分析实习生", location: "深圳", salary_text: null, experience: null, education: null, description: "公开岗位说明",
    published_at: "2026-09-07T00:00:00Z", apply_url: "https://example.test/jobs/" + n, fingerprint: "fp-" + n, raw_data: {}, job_sources: { name: "示例公开来源" } };
}
function application(n: number): Row {
  return { id: id(100_000 + n), job_id: id(n), status: "applied", applied_confirmed_at: "2026-09-07T01:00:00Z", user_id: uid };
}
function event(n: number, app: number, action?: string, date = "2026-09-07T01:00:00Z"): Row {
  return { id: id(200_000 + n), application_id: id(100_000 + app), from_status: "saved", to_status: "applied", source: "user", metadata: action ? { action } : {},
    created_at: date, user_id: uid };
}
function request(query = "") {
  return new NextRequest("http://localhost/api/jobs" + query);
}
function fixture(input: Partial<Record<Table, Row[]>> = {}, options: { serverCap?: number; fail?: (call: Call) => boolean } = {}) {
  const tables: Record<Table, Row[]> = { jobs: [], saved_jobs: [], applications: [], application_events: [], ...input };
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1) as Table;
    const filterEntries = [...url.searchParams].filter(([key]) => !["select", "order", "limit"].includes(key));
    const filters = Object.fromEntries([...filterEntries].reverse());
    const call: Call = { table, select: url.searchParams.get("select") || "", filters, order: url.searchParams.get("order") || "", limit: Number(url.searchParams.get("limit") || 1000), url: url.toString() };
    calls.push(call);
    if (options.fail?.(call)) return Response.json({ message: "private database detail", code: "TEST_ERROR" }, { status: 400 });
    let rows = [...tables[table]];
    // PostgREST ANDs repeated query keys (e.g. id=in.(...) AND id=gt....).
    for (const [key, filter] of filterEntries) {
      if (filter.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === filter.slice(3));
      else if (filter.startsWith("gt.")) rows = rows.filter((row) => String(row[key]) > filter.slice(3));
      else if (filter.startsWith("in.(")) {
        const values = filter.slice(4, -1).split(",").map((value) => value.replace(/^"|"$/g, ""));
        rows = rows.filter((row) => values.includes(String(row[key])));
      } else throw new Error("Unexpected test filter " + key + ": " + filter);
    }
    const [orderKey, direction] = call.order.split(".");
    if (orderKey) rows.sort((a, b) => String(a[orderKey]).localeCompare(String(b[orderKey])) * (direction === "desc" ? -1 : 1));
    rows = rows.slice(0, Math.min(call.limit, options.serverCap ?? 1000));
    return Response.json(rows);
  };
  const supabase = createClient<Database>("https://example.test", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "job-route-test-" + ++fixtureIndex }, global: { fetch: fetcher },
  });
  mocks.auth.mockResolvedValue({ userId: uid, supabase });
  return { tables, calls };
}
function setCatalog(records: OfferstarRecord[]) {
  mocks.catalog.mockResolvedValue({ data: { records, generatedAt: "2026-09-07T11:58:35Z" }, byId: new Map(records.map((row) => [row.externalId, row])) });
}
function filterValues(call: Call, key: string) {
  return call.filters[key]?.slice(4, -1).split(",") || [];
}
function expectBounded(calls: Call[]) {
  for (const call of calls) {
    expect(call.limit).toBe(JOB_QUERY_PAGE_SIZE);
    expect(call.order).toBe((call.table === "saved_jobs" ? "job_id" : "id") + ".asc");
    expect(call.url.length).toBeLessThan(8_000);
    if (call.table !== "jobs") expect(call.filters.user_id).toBe("eq." + uid);
    if (call.table === "jobs") expect(call.filters.id?.startsWith("in.(") || call.filters.fingerprint?.startsWith("in.(") || call.filters.fingerprint?.startsWith("eq.")).toBe(true);
    for (const value of Object.values(call.filters).filter((value) => value.startsWith("in.("))) {
      expect(value.slice(4, -1).split(",").length).toBeLessThanOrEqual(JOB_QUERY_FILTER_SIZE);
    }
  }
}

describe("GET /api/jobs bounded user queries", () => {
  beforeEach(() => { vi.clearAllMocks(); setCatalog([]); });

  it("loads more than 1,000 saved jobs and applications without reading unrelated jobs", async () => {
    const count = 1005;
    const { calls } = fixture({
      jobs: [...Array.from({ length: count }, (_, i) => job(i + 1)), ...Array.from({ length: 2000 }, (_, i) => job(i + 10_000))],
      saved_jobs: Array.from({ length: count }, (_, i) => ({ user_id: uid, job_id: id(i + 1) })),
      applications: Array.from({ length: count }, (_, i) => application(i + 1)),
      application_events: [event(1, count), { ...event(2, count), user_id: "another-user" }],
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.jobs).toHaveLength(count);
    expect(body.jobs.at(-1)).toMatchObject({ id: id(count), saved: true, applicationId: id(100_000 + count), status: "applied" });
    expect(body.jobs.at(-1).events).toHaveLength(1);
    expect(body.jobs.some((row: Row) => String(row.id) >= id(10_000))).toBe(false);
    expect(calls.filter((call) => call.table === "saved_jobs")).toHaveLength(4);
    expect(calls.filter((call) => call.table === "applications")).toHaveLength(4);
    expect(calls.filter((call) => call.table === "jobs").every((call) => !call.filters.fingerprint)).toBe(true);
    expectBounded(calls);
  });

  it("reads later catalogue page interactions only and completes multi-page visibility histories", async () => {
    const records = Array.from({ length: 1010 }, (_, i) => record(i + 1));
    setCatalog(records);
    const { calls } = fixture({
      jobs: records.map((_, i) => job(i + 1)),
      saved_jobs: records.map((_, i) => ({ user_id: uid, job_id: id(i + 1) })),
      applications: records.map((_, i) => application(i + 1)),
      application_events: [
        ...Array.from({ length: 1001 }, (_, i) => event(i + 1, 1001)),
        event(1002, 1001, "deleted_by_user", "2026-09-08T01:00:00Z"),
        event(1003, 1002, "deleted_by_user", "2026-09-08T01:00:00Z"),
        event(1004, 1002, "restored_by_user", "2026-09-08T02:00:00Z"),
        event(1005, 1),
      ],
    });
    const response = await GET(request("?scope=catalog&page=101&pageSize=10"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.jobs.map((row: Row) => row.id)).toEqual(records.slice(1000).map((row) => row.externalId));
    expect(body.meta).toMatchObject({ total: 1010, page: 101, pageSize: 10, catalogTotal: 1010 });
    expect(body.jobs[0]).toMatchObject({ databaseJobId: id(1001), saved: true, events: [] });
    expect(body.jobs[0].applicationId).toBeUndefined();
    expect(body.jobs[1]).toMatchObject({ applicationId: id(101002), status: "applied" });
    expect(body.jobs[1].events.map((row: Row) => row.id)).toEqual([id(201004), id(201003)]);
    const jobCalls = calls.filter((call) => call.table === "jobs");
    expect(jobCalls.every((call) => filterValues(call, "fingerprint").every((value) => records.slice(1000).some((row) => row.businessFingerprint === value)))).toBe(true);
    expect(calls.filter((call) => call.table === "application_events").every((call) => !filterValues(call, "application_id").includes(id(100001)))).toBe(true);
    expectBounded(calls);
  });

  it("continues after short server-capped pages and keeps restored activities visible", async () => {
    const { calls } = fixture({
      jobs: [job(1), job(2), job(3)],
      saved_jobs: [{ user_id: uid, job_id: id(2) }],
      applications: [application(1), application(2), application(3)],
      application_events: [
        event(1, 1, "deleted_by_user"), event(2, 2, "deleted_by_user"),
        ...Array.from({ length: 65 }, (_, i) => event(i + 3, 3)),
        event(68, 3, "deleted_by_user", "2026-09-08T01:00:00Z"),
        event(69, 3, "restored_by_user", "2026-09-08T02:00:00Z"),
      ],
    }, { serverCap: 7 });
    const response = await GET(request("?scope=activity"));
    const body = await response.json();
    expect(body.jobs.map((row: Row) => row.id)).toEqual([id(2), id(3)]);
    expect(body.jobs[0]).toMatchObject({ saved: true, events: [] });
    expect(body.jobs[0].applicationId).toBeUndefined();
    expect(body.jobs[1].events).toHaveLength(67);
    expect(body.jobs[1].events[0].metadata.action).toBe("restored_by_user");
    expect(calls.filter((call) => call.table === "application_events").length).toBeGreaterThan(10);
    expectBounded(calls);
  });

  it("builds saved-only catalogue filters from all saved IDs using lightweight reads", async () => {
    const count = 1005;
    setCatalog([record(2), record(count), record(1), record(9999)]);
    const { calls } = fixture({
      jobs: Array.from({ length: count }, (_, i) => job(i + 1)),
      saved_jobs: Array.from({ length: count }, (_, i) => ({ user_id: uid, job_id: id(i + 1) })),
    });
    const body = await (await GET(request("?scope=catalog&savedOnly=true"))).json();
    expect(body.jobs.map((row: Row) => row.id)).toEqual(["offerstar-2", "offerstar-1005", "offerstar-1"]);
    expect(body.jobs.every((row: Row) => row.saved)).toBe(true);
    expect(body.meta).toMatchObject({ total: 3, catalogTotal: 4 });
    const idCalls = calls.filter((call) => call.table === "jobs" && call.filters.id?.startsWith("in.("));
    expect(idCalls.length).toBeGreaterThan(10);
    expect(idCalls.every((call) => call.select === "id,fingerprint")).toBe(true);
    expectBounded(calls);
  });

  it("returns empty activity without any jobs/events read and never reads another user's links", async () => {
    const { calls } = fixture({
      jobs: [job(1)], saved_jobs: [{ user_id: "another-user", job_id: id(1) }],
      applications: [{ ...application(1), user_id: "another-user" }],
    });
    expect(await (await GET(request())).json()).toEqual({ jobs: [] });
    expect(calls.map((call) => call.table).sort()).toEqual(["applications", "saved_jobs"]);
  });

  it("uses exact bounded queries for fingerprints with quotes/backslashes instead of malformed in lists", async () => {
    const fingerprints = ['company,"title")|深圳', "公司\\项目|深圳", "普通公司|深圳"];
    setCatalog(fingerprints.map((fingerprint, index) => ({ ...record(index + 1), businessFingerprint: fingerprint })));
    const { calls } = fixture({ jobs: fingerprints.map((fingerprint, index) => ({ ...job(index + 1), fingerprint })) });
    const response = await GET(request("?scope=catalog"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.jobs.map((row: Row) => row.databaseJobId)).toEqual([id(1), id(2), id(3)]);
    const exactValues = calls.filter((call) => call.table === "jobs" && call.filters.fingerprint?.startsWith("eq.")).map((call) => call.filters.fingerprint.slice(3));
    expect(new Set(exactValues)).toEqual(new Set(fingerprints.slice(0, 2)));
    expectBounded(calls);
  });

  it("retains seed filtering and deterministic descending publication order", async () => {
    fixture({
      jobs: [{ ...job(1), published_at: "2026-08-01T00:00:00Z" }, { ...job(2), published_at: null }, job(3), { ...job(4), raw_data: { seed: "mvp" } }],
      saved_jobs: [1, 2, 3, 4].map((n) => ({ user_id: uid, job_id: id(n) })),
    });
    const body = await (await GET(request())).json();
    expect(body.jobs.map((row: Row) => row.id)).toEqual([id(2), id(3), id(1)]);
  });

  it.each(["NaN", "Infinity", "-1", "0", "1.5", "9007199254740992"])("normalizes malformed pagination %s without hiding records", async (page) => {
    setCatalog([record(1), record(2)]);
    fixture();
    const body = await (await GET(request("?scope=catalog&page=" + page + "&pageSize=" + page))).json();
    expect(body.jobs).toHaveLength(2);
    expect(body.meta).toMatchObject({ page: 1, pageSize: 10 });
  });

  it("caps pageSize at 50 and clamps past-last page through the existing catalogue search", async () => {
    setCatalog(Array.from({ length: 70 }, (_, i) => record(i + 1)));
    fixture();
    const body = await (await GET(request("?scope=catalog&page=1000&pageSize=100000"))).json();
    expect(body.jobs).toHaveLength(20);
    expect(body.meta).toMatchObject({ page: 2, pageSize: 50 });
  });

  it("fails closed on a later database page without returning a partial list or private error", async () => {
    fixture({ saved_jobs: Array.from({ length: 510 }, (_, i) => ({ user_id: uid, job_id: id(i + 1) })) }, {
      fail: (call) => call.table === "saved_jobs" && Boolean(call.filters.job_id),
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "职位数据读取失败，请稍后重试" });
  });

  it("does not query the database for unauthenticated callers", async () => {
    const { calls } = fixture();
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request())).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

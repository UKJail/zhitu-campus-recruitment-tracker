import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { OfferstarRecord } from "./offerstar-catalog";
import { OfferstarIdentityError } from "./offerstar-identity";

const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("./offerstar-catalog", () => ({ findOfferstarRecord: mocks.find }));
import { materializeOfferstarJob } from "./materialize-offerstar";

const record: OfferstarRecord = { externalId: "offerstar-legacy", sourceId: "source-1", company: "测试企业", title: "校招", location: "北京、上海", experience: "应届生",
  applyUrl: "https://example.test/job?id=1#apply", normalizedUrl: "https://example.test/job?id=1#apply", businessFingerprint: "new-display-fp", legacyFingerprints: ["old-display-fp"],
  recruitmentType: "校招", offerstarType: "2027届", position: "开发", industry: "科技", category: "", postDate: "09-16", deadline: "尽快投递", applyUrlIsWechat: false };
type Row = { id: string; fingerprint: string; apply_url: string; raw_data: Record<string, unknown> };
const oldRow = (raw: Record<string, unknown> = {}): Row => ({ id: "old-job", fingerprint: "old-display-fp", apply_url: record.applyUrl, raw_data: raw });
function database(initial: Row[], options: { race?: boolean; readError?: boolean } = {}) {
  const rows = [...initial];
  const writes: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      const created = { ...body, id: "new-job" };
      rows.push(created);
      return options.race ? Response.json({ code: "23505", message: "duplicate" }, { status: 409 }) : Response.json(created);
    }
    if (options.readError) return Response.json({ message: "private failure" }, { status: 400 });
    let result = rows.slice();
    const valueAt = (row: Row, key: string) => key.startsWith("raw_data->>") ? row.raw_data[key.slice(11)] : row[key as keyof Row];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) result = result.filter((row) => String(valueAt(row, key)) === value.slice(3));
      if (value.startsWith("gt.")) result = result.filter((row) => String(valueAt(row, key)) > value.slice(3));
      if (value.startsWith("in.(")) result = result.filter((row) => value.slice(4, -1).split(",").includes(String(valueAt(row, key))));
    }
    result.sort((a, b) => a.id.localeCompare(b.id));
    const single = new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object");
    return Response.json(single ? result[0] : result);
  };
  const client = createClient<Database>("https://example.test", "test-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
  return { client, rows, writes };
}

describe("OfferStar materialization identity compatibility", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(record); });

  it.each([{}, { offerstarExternalId: record.externalId }, { offerstarSourceId: record.sourceId }])("reuses the original database ID after city expansion (%j)", async (raw) => {
    const db = database([oldRow(raw)]);
    expect(await materializeOfferstarJob(db.client, record.externalId)).toMatchObject({ id: "old-job" });
    expect(db.writes).toHaveLength(0);
    expect(db.rows[0].fingerprint).toBe("old-display-fp");
  });

  it("keeps hash-routed announcements distinct without explicit identity", async () => {
    const db = database([{ ...oldRow(), apply_url: "https://example.test/job?id=1#different-job" }]);
    expect(await materializeOfferstarJob(db.client, record.externalId)).toMatchObject({ id: "new-job" });
    expect(db.writes[0]).toMatchObject({ fingerprint: "offerstar:source-1", raw_data: { offerstarSourceId: "source-1", offerstarExternalId: record.externalId } });
  });

  it("finds a pre-baseline fingerprint through the stable external identity", async () => {
    const db = database([{ ...oldRow({ offerstarExternalId: record.externalId }), fingerprint: "older-than-catalog" }]);
    expect(await materializeOfferstarJob(db.client, record.externalId)).toMatchObject({ id: "old-job" });
    expect(db.writes).toHaveLength(0);
  });

  it("does not reuse another announcement merely because its fingerprint and URL coincide", async () => {
    const db = database([oldRow({ offerstarExternalId: "another-announcement" })]);
    expect(await materializeOfferstarJob(db.client, record.externalId)).toMatchObject({ id: "new-job" });
    expect(db.rows).toHaveLength(2);
  });

  it("does not choose between conflicting legacy and stable rows or insert a third row", async () => {
    const db = database([oldRow({ offerstarExternalId: record.externalId }), { ...oldRow(), id: "second", fingerprint: "offerstar:source-1", raw_data: { offerstarSourceId: "source-1" } }]);
    await expect(materializeOfferstarJob(db.client, record.externalId)).rejects.toBeInstanceOf(OfferstarIdentityError);
    expect(db.writes).toHaveLength(0);
  });

  it("resolves a concurrent insert using the stable source fingerprint", async () => {
    const db = database([], { race: true });
    expect(await materializeOfferstarJob(db.client, record.externalId)).toMatchObject({ id: "new-job" });
    expect(db.writes).toHaveLength(1);
  });

  it("stops before inserting if legacy lookup fails", async () => {
    const db = database([], { readError: true });
    await expect(materializeOfferstarJob(db.client, record.externalId)).rejects.toThrow("职位数据读取失败");
    expect(db.writes).toHaveLength(0);
  });
});

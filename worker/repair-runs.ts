import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const staleMinutes = Number(process.argv[2] || 30);
  if (!url || !serviceKey) throw new Error("修复脚本缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  if (!Number.isFinite(staleMinutes) || staleMinutes < 1) throw new Error("过期分钟数必须不小于 1");

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const stale = await db.from("source_runs")
    .select("id")
    .eq("status", "running")
    .lt("started_at", cutoff);
  if (stale.error) throw new Error(`无法读取过期采集记录：${stale.error.message}`);

  const ids = (stale.data || []).map((run) => run.id);
  if (ids.length) {
    const repaired = await db.from("source_runs")
      .update({ status: "failed", error_code: "stale_run_recovered", finished_at: new Date().toISOString() })
      .in("id", ids);
    if (repaired.error) throw new Error(`无法修复过期采集记录：${repaired.error.message}`);
  }

  console.log(JSON.stringify({ cutoff, repaired: ids.length }));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

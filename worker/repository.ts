import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CollectionResult, JobSourceAdapter } from "./types.js";

type SourceRow = { id: string; name: string; enabled: boolean; restricted_reason: string | null };

export class JobRepository {
  constructor(private readonly db: SupabaseClient) {}

  static fromEnvironment() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error("Worker 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
    return new JobRepository(createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
  }

  private async source(adapter: JobSourceAdapter) {
    const selected = await this.db.from("job_sources").select("id,name,enabled,restricted_reason").eq("name", adapter.sourceName).maybeSingle<SourceRow>();
    if (selected.error) throw new Error(`职位来源读取失败：${selected.error.message}`);
    if (selected.data) return selected.data;

    const created = await this.db.from("job_sources")
      .insert({ name: adapter.sourceName, kind: adapter.sourceKind || "public_page" })
      .select("id,name,enabled,restricted_reason")
      .single<SourceRow>();
    if (created.error || !created.data) throw new Error(`无法创建职位来源：${created.error?.message || adapter.sourceName}`);
    return created.data;
  }

  async startRun(adapter: JobSourceAdapter) {
    const source = await this.source(adapter);
    if (!source.enabled) return { paused: true as const, source, reason: source.restricted_reason || "管理员已暂停该来源" };
    const { data, error } = await this.db.from("source_runs").insert({ source_id: source.id, status: "running" }).select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`无法创建采集运行记录：${error?.message || adapter.adapterName}`);
    return { paused: false as const, runId: data.id, source };
  }

  async finishRun(runId: string, source: SourceRow, result: CollectionResult) {
    if (result.restricted) {
      const runUpdate = await this.db.from("source_runs")
        .update({ status: "restricted", error_code: result.reason || "restricted", finished_at: new Date().toISOString() })
        .eq("id", runId);
      if (runUpdate.error) throw new Error(`无法结束受限来源运行记录：${runUpdate.error.message}`);

      const sourceUpdate = await this.db.from("job_sources")
        .update({ enabled: false, restricted_reason: result.reason || "来源受限" })
        .eq("id", source.id);
      if (sourceUpdate.error) throw new Error(`无法暂停受限职位来源：${sourceUpdate.error.message}`);
      return { seen: 0, added: 0, restricted: true };
    }

    let added = 0;
    for (const job of result.jobs) {
      const externalMatch = await this.db.from("jobs").select("id").eq("source_id", source.id).eq("external_id", job.externalId).maybeSingle<{ id: string }>();
      if (externalMatch.error) throw new Error(`职位去重失败：${externalMatch.error.message}`);
      const fingerprintMatch = externalMatch.data ? { data: null, error: null } : await this.db.from("jobs").select("id").eq("fingerprint", job.fingerprint).maybeSingle<{ id: string }>();
      if (fingerprintMatch.error) throw new Error(`职位指纹检查失败：${fingerprintMatch.error.message}`);
      const existing = externalMatch.data || fingerprintMatch.data;
      const payload = {
        source_id: source.id,
        external_id: job.externalId,
        company: job.company,
        title: job.title,
        location: job.location,
        salary_text: job.salaryText,
        experience: job.experience,
        education: job.education,
        description: job.description,
        published_at: job.publishedAt,
        expires_at: job.expiresAt,
        apply_url: job.applyUrl,
        normalized_url: job.normalizedUrl,
        fingerprint: job.fingerprint,
        raw_data: job.rawData,
      };
      const { error } = existing
        ? await this.db.from("jobs").update(payload).eq("id", existing.id)
        : await this.db.from("jobs").insert(payload);
      if (error) throw new Error(`职位写入失败：${error.message}`);
      if (!existing) added += 1;
    }

    const finishedAt = new Date().toISOString();
    const runUpdate = await this.db.from("source_runs")
      .update({ status: "completed", jobs_seen: result.jobs.length, jobs_added: added, finished_at: finishedAt })
      .eq("id", runId);
    if (runUpdate.error) throw new Error(`无法结束采集运行记录：${runUpdate.error.message}`);

    const sourceUpdate = await this.db.from("job_sources")
      .update({ enabled: true, restricted_reason: null, last_success_at: finishedAt })
      .eq("id", source.id);
    if (sourceUpdate.error) throw new Error(`无法更新职位来源健康状态：${sourceUpdate.error.message}`);
    return { seen: result.jobs.length, added, restricted: false };
  }

  async failRun(runId: string, message: string) {
    const result = await this.db.from("source_runs")
      .update({ status: "failed", error_code: message.slice(0, 160), finished_at: new Date().toISOString() })
      .eq("id", runId);
    if (result.error) throw new Error(`无法记录采集失败状态：${result.error.message}`);
  }
}

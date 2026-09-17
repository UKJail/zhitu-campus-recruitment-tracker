import { NextResponse } from "next/server";
import { z } from "zod";
import { APPLICATION_DELETED_ACTION, APPLICATION_RESTORED_ACTION, isApplicationHidden } from "@/lib/applications/visibility";
import { materializeOfferstarJob } from "@/lib/jobs/materialize-offerstar";
import { OfferstarIdentityError } from "@/lib/jobs/offerstar-identity";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/jobs/[id]/prepare">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  let materialized;
  try {
    materialized = z.string().uuid().safeParse(id).success ? { id } : await materializeOfferstarJob(supabase, id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof OfferstarIdentityError ? error.message : "职位关联暂时无法读取，请稍后重试" }, { status: error instanceof OfferstarIdentityError ? 409 : 503 });
  }
  if (!materialized) return NextResponse.json({ error: "职位编号无效" }, { status: 400 });
  const { data, error } = await supabase.rpc("prepare_job_application", { p_job_id: materialized.id });
  if (error || !data) return NextResponse.json({ error: error?.message || "无法创建准备投递记录" }, { status: 400 });

  const { data: lifecycleEvents, error: lifecycleError } = await supabase
    .from("application_events")
    .select("metadata")
    .eq("application_id", data.id)
    .in("metadata->>action", [APPLICATION_DELETED_ACTION, APPLICATION_RESTORED_ACTION])
    .order("created_at", { ascending: false });
  if (lifecycleError) return NextResponse.json({ error: lifecycleError.message }, { status: 500 });

  if (isApplicationHidden(lifecycleEvents || [])) {
    const { error: restoreError } = await supabase.from("application_events").insert({
      application_id: data.id,
      user_id: userId,
      from_status: data.status,
      to_status: data.status,
      source: "user",
      metadata: { action: APPLICATION_RESTORED_ACTION, reason: "opened_apply_url" },
    });
    if (restoreError) return NextResponse.json({ error: "恢复投递记录失败" }, { status: 500 });
  }

  return NextResponse.json({ application: data, jobId: materialized.id });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ ok: false, service: "supabase-auth", code: "auth_not_configured" }, {
      status: 503,
      headers: responseHeaders,
    });
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      cache: "no-store",
      headers: { apikey: key },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      return NextResponse.json({ ok: false, service: "supabase-auth", code: "auth_service_unavailable" }, {
        status: 503,
        headers: responseHeaders,
      });
    }
    return NextResponse.json({ ok: true, service: "supabase-auth" }, { headers: responseHeaders });
  } catch (error) {
    console.warn("Supabase Auth health check failed", {
      provider: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ ok: false, service: "supabase-auth", code: "auth_service_unreachable" }, {
      status: 503,
      headers: responseHeaders,
    });
  }
}

import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ authenticated: false }, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return NextResponse.json({ authenticated: true }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

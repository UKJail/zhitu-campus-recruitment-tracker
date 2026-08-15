import { NextResponse } from "next/server";

export function GET() {
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publicKey);
  return NextResponse.json({ ok: true, service: "zhitutracker", mode: process.env.NEXT_PUBLIC_DEMO_MODE === "false" && configured ? "production" : "demo" });
}

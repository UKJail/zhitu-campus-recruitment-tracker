import { TrackerApp } from "@/components/tracker-app";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppPage() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) redirect("/?next=/app");
  }

  return <TrackerApp />;
}

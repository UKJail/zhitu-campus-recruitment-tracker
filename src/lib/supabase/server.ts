import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

function getPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing");
  return { url, key };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = getPublicConfig();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. proxy.ts handles refreshes.
        }
      },
    },
  });
}

export function createSupabaseAuthClient() {
  const { url, key } = getPublicConfig();
  return createClient<Database>(url, key, {
    auth: {
      flowType: "implicit",
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function getAuthenticatedUserId() {
  const supabase = await createSupabaseServerClient();
  // Check with Auth so deleted accounts cannot keep using an unexpired JWT.
  const { data, error } = await supabase.auth.getUser();
  const userId = !error && data.user ? data.user.id : null;
  return { supabase, userId, error };
}

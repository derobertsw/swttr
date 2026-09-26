import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Server-side Supabase client authenticated with the service-role key.
 *
 * The database grants nothing to the public anon role; every read and write
 * goes through API routes, which enforce per-user access. The service-role key
 * bypasses row-level security, so it must never reach the browser: the
 * server-only import makes any client-side import of this module a build error.
 *
 * Returns null when the database is not configured.
 */
export function getSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return supabaseInstance;
}

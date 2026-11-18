import type { SupabaseClient } from "@supabase/supabase-js";
import { request } from "./state";

/** Stands in for src/lib/supabase.ts: the request's fixture database. */
export function getSupabase(): SupabaseClient | null {
  return request.supabase;
}

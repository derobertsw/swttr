/**
 * What the fixture API server (../api.mjs) sets for each request it hands a
 * route: who's signed in and the trip's database. These modules stand in
 * for src/lib/auth.ts, src/lib/supabase.ts and src/lib/rate-limit.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const request: { userId: string | null; supabase: SupabaseClient | null } = { userId: null, supabase: null };

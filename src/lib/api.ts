import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export interface AuthedContext {
  userId: string;
  supabase: SupabaseClient;
}

/**
 * The signed-in user and a database client, or the error response to return:
 * 401 when signed out, 503 when the database is not configured.
 */
export async function requireUser(): Promise<AuthedContext | NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) return jsonError("Authentication required", 401);

  const supabase = getSupabase();
  if (!supabase) return jsonError("Database not configured", 503);

  return { userId, supabase };
}

/** Parse a JSON request body; null when it is missing or malformed. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

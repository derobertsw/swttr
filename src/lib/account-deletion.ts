import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Clerk's user IDs, such as `user_2abc…`. Legacy device IDs (`user-<uuid>`) don't match. */
const CLERK_USER_ID = /^user_[A-Za-z0-9]+$/;

export function isClerkUserId(value: unknown): value is string {
  return typeof value === "string" && CLERK_USER_ID.test(value);
}

/** Rows removed (or, on trips the account didn't own, anonymized) per table. */
type AccountDeletionCounts = Record<string, number>;

type AccountDeletionResult =
  | { status: "deleted"; counts: AccountDeletionCounts }
  // Migration 20261116150000 isn't applied yet, so the function doesn't exist.
  | { status: "unavailable" }
  | { status: "failed"; code: string | null };

/**
 * Deletes an account's SWTTR data in one transaction (delete_user_data, migration
 * 20261116150000). Safe to repeat: a second call for the same account, or a call
 * for an account with no data, changes nothing. See docs/account-deletion.md.
 */
export async function deleteAccountData(supabase: SupabaseClient, userId: string): Promise<AccountDeletionResult> {
  const { data, error } = await supabase.rpc("delete_user_data", { p_user_id: userId });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { status: "unavailable" };
    return { status: "failed", code: error.code ?? null };
  }
  return { status: "deleted", counts: (data ?? {}) as AccountDeletionCounts };
}

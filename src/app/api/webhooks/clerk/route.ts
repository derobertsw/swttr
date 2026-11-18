import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { jsonError } from "@/lib/api";
import { deleteAccountData, isClerkUserId } from "@/lib/account-deletion";
import { getSupabase } from "@/lib/supabase";

/**
 * POST /api/webhooks/clerk
 *
 * Clerk's webhooks (#139). There's no Clerk session: the request is trusted
 * only once its signature checks out against CLERK_WEBHOOK_SIGNING_SECRET.
 * `user.deleted` deletes the account's SWTTR data; every other event is
 * acknowledged and ignored.
 *
 * A non-2xx answer makes Clerk retry the event later, so anything that a retry
 * could fix (configuration, the database, a missing migration) answers 5xx,
 * and a request that will never verify answers 400. Logs carry no user IDs or
 * payloads. See docs/account-deletion.md.
 */
export async function POST(request: NextRequest) {
  // verifyWebhook throws without a secret too; tell that apart from a bad signature.
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    console.error("[clerk webhook] CLERK_WEBHOOK_SIGNING_SECRET is not set");
    return jsonError("Webhook not configured", 503);
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch {
    console.warn("[clerk webhook] rejected a request that failed signature verification");
    return jsonError("Invalid webhook signature", 400);
  }

  if (event.type !== "user.deleted") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const userId = event.data.id;
  if (!isClerkUserId(userId)) {
    console.warn("[clerk webhook] user.deleted without a Clerk user ID");
    return jsonError("user.deleted needs a Clerk user ID", 400);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.error("[clerk webhook] database not configured; user.deleted not processed");
    return jsonError("Database not configured", 503);
  }

  const result = await deleteAccountData(supabase, userId);
  if (result.status === "unavailable") {
    console.error("[clerk webhook] delete_user_data is missing: apply migration 20261116150000_delete_user_data.sql");
    return jsonError("Account deletion isn't installed yet", 503);
  }
  if (result.status === "failed") {
    console.error("[clerk webhook] delete_user_data failed", { code: result.code });
    return jsonError("Couldn't delete the account's data", 500);
  }

  console.info("[clerk webhook] user.deleted processed", result.counts);
  return NextResponse.json({ received: true, deleted: result.counts });
}

import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/lib/api";

/**
 * Legacy IDs were generated client-side as `user-${crypto.randomUUID()}`.
 * Only that shape is accepted: Clerk IDs (`user_...`) are visible to other
 * users (e.g. trip members), so allowing them would let anyone claim another
 * account's data.
 */
const LEGACY_USER_ID = /^user-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/migrate-user
 * Migrates data from a legacy localStorage UUID to the authenticated Clerk user ID.
 * Accepts { legacyUserId: string } in the request body.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId: clerkUserId } = auth;

  const body = await readJson<{ legacyUserId?: unknown }>(request);
  if (!body) {
    return jsonError("Invalid JSON", 400);
  }

  const { legacyUserId } = body;
  if (!legacyUserId || typeof legacyUserId !== "string") {
    return jsonError("legacyUserId is required", 400);
  }
  if (!LEGACY_USER_ID.test(legacyUserId)) {
    return jsonError("legacyUserId is not a legacy user ID", 400);
  }

  // Don't migrate if legacy ID is the same as Clerk ID (already migrated)
  if (legacyUserId === clerkUserId) {
    return NextResponse.json({ status: "already_current" });
  }

  try {
    // Check if Clerk user already has wardrobe data (avoid duplicating)
    const { data: existingWardrobe } = await supabase
      .from("user_wardrobe")
      .select("id")
      .eq("user_id", clerkUserId)
      .limit(1);

    if (existingWardrobe && existingWardrobe.length > 0) {
      return NextResponse.json({ status: "clerk_user_has_data" });
    }

    // Check if legacy user has any data to migrate
    const { data: legacyWardrobe } = await supabase
      .from("user_wardrobe")
      .select("id")
      .eq("user_id", legacyUserId)
      .limit(1);

    if (!legacyWardrobe || legacyWardrobe.length === 0) {
      return NextResponse.json({ status: "no_legacy_data" });
    }

    // Migrate user_wardrobe rows
    await supabase
      .from("user_wardrobe")
      .update({ user_id: clerkUserId })
      .eq("user_id", legacyUserId);

    // Migrate user_item_mappings rows
    await supabase
      .from("user_item_mappings")
      .update({ user_id: clerkUserId })
      .eq("user_id", legacyUserId);

    // Migrate user_preferences rows
    await supabase
      .from("user_preferences")
      .update({ user_id: clerkUserId })
      .eq("user_id", legacyUserId);

    return NextResponse.json({ status: "migrated" });
  } catch (err) {
    console.error("Migration error:", err);
    return jsonError("Migration failed", 500);
  }
}

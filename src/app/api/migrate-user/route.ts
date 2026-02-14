import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";

/**
 * POST /api/migrate-user
 * Migrates data from a legacy localStorage UUID to the authenticated Clerk user ID.
 * Accepts { legacyUserId: string } in the request body.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const clerkUserId = await getAuthUserId();

  if (!clerkUserId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: { legacyUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { legacyUserId } = body;
  if (!legacyUserId || typeof legacyUserId !== "string") {
    return NextResponse.json({ error: "legacyUserId is required" }, { status: 400 });
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
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { tripActivityFromRecommendationKey } from "@/lib/trip-activities";
import { destinationToday, kitChanges, outfitDate, parseSaveKitRequest, tripDestination, tripEffort } from "@/lib/trip-saved-kits";
import { classifyTripStatus } from "@/lib/trips";
import type { SaveKitConflict, SaveKitResponse } from "@/types/savedKit";

/** Generous for one outfit with two phases; anything bigger isn't one. */
const MAX_BODY_LENGTH = 100_000;

/**
 * Save to trip (#170): saves an outing's outfit as the signed-in member's kit
 * for the trip day it's for, on an existing trip or a new one made from the
 * outing. A day that already has a kit stops the save with a 409 listing it,
 * until the request names it in `replace`. A retry with the same `save_id`
 * and body returns the first answer. See docs/trip-saved-kits.md.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const raw = await request.text();
  if (raw.length > MAX_BODY_LENGTH) return jsonError("This outfit is too large to save.", 413);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* reported below */ }
  const input = parseSaveKitRequest(body);
  if (typeof input === "string") return jsonError(input, 400);

  const { outfit } = input;
  const date = outfitDate(outfit);
  if (!date) return jsonError("Couldn't tell the date at this place. Get layers for a later time there, then save.", 400);
  const activity = tripActivityFromRecommendationKey(outfit.outing.activity);
  const days = [{ date, effort: tripEffort(outfit.outing.exertion), activity, outfit }];
  const newTrip = input.newTripName === undefined ? null : {
    name: input.newTripName,
    start_date: date,
    end_date: date,
    // Today where the trip is, not on the server's clock.
    status: classifyTripStatus(date, date, destinationToday(outfit)),
    destination: tripDestination(outfit.outing.place),
    activity,
  };

  const { data, error } = await supabase.rpc("save_trip_kits", {
    p_save_id: input.saveId,
    p_user_id: userId,
    p_trip_id: input.tripId,
    p_new_trip: newTrip,
    p_days: days,
    p_replace: input.replace,
  });
  if (error || !data) {
    switch (error?.code) {
      case "P0002": return jsonError("Trip not found. It may have been deleted, or you're no longer on it.", 404);
      case "22008": return jsonError("That trip doesn't include this outing's date.", 422);
      // The save's or new trip's identity is already used for something else.
      case "42501":
      case "22023": return NextResponse.json({ error: "This save can't be repeated. Start it again.", code: "identity" }, { status: 409 });
      default: return jsonError("Couldn't save to the trip. Retry with the same save.", 500);
    }
  }

  const result = data as SaveKitResponse;
  if (result.status === "conflict") {
    const conflicts: SaveKitConflict[] = result.conflicts.map((conflict) => ({
      ...conflict,
      changes: kitChanges(conflict.kit, outfit),
    }));
    return NextResponse.json(
      { error: "You already have a kit for that day.", ...result, conflicts },
      { status: 409 }
    );
  }
  return NextResponse.json(result, { status: result.created && !result.replayed ? 201 : 200 });
}

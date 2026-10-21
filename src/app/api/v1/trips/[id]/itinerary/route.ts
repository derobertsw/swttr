import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { parseAccessPointsCheck, parseItineraryEdit, parseItineraryRequest, parseTourPlansCheck, previewItinerary, requestFor, type TourPlansCheck } from "@/lib/trip-itinerary";
import { loadTripFull, requireTripAccess, tripFullFor } from "@/lib/trips";
import type { TripItineraryRequest } from "@/types/trips";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Reviews or saves a change to the shared itinerary (#176): `preview: true`
 * returns the options for the change, and otherwise the body is the action
 * plus the payload of the option chosen in that review.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  // Any member on the trip may change the shared itinerary.
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const preview = async (change: TripItineraryRequest) => {
    const full = await loadTripFull(supabase, id);
    return full ? previewItinerary(tripFullFor(full, userId), change, userId) : { error: "Not found", status: 404 as const };
  };

  const body = await readJson<Record<string, unknown>>(request);
  if (body?.preview === true) {
    const change = parseItineraryRequest(body);
    if ("error" in change) return jsonError(change.error, 400);
    try {
      const review = await preview(change);
      return "error" in review ? jsonError(review.error, review.status) : NextResponse.json(review);
    } catch {
      return jsonError("Couldn't load the review. Try again.", 500);
    }
  }

  const edit = parseItineraryEdit(body);
  if ("error" in edit) return jsonError(edit.error, 400);
  const accessPoints = parseAccessPointsCheck(body);
  const tourPlans = parseTourPlansCheck(body);
  if (accessPoints === null || tourPlans === null) return jsonError("Reload the trip and try again.", 400);
  const copiesPlan = edit.action === "copy_day" && edit.payload.plan !== "none";
  // Copying a day can bring the user's kit, so it has its own function.
  const unchecked = () => edit.action === "copy_day"
    ? supabase.rpc("copy_trip_day", { p_trip_id: id, p_user_id: userId, p_payload: edit.payload })
    : supabase.rpc("edit_trip_itinerary", { p_trip_id: id, p_user_id: userId, p_action: edit.action, p_payload: edit.payload });
  // Something changed since the review. Show the change as it would be now.
  const reviewAgain = async () => {
    const current = await preview(requestFor(edit)).catch(() => null);
    return NextResponse.json({
      error: "The trip changed since you reviewed it. Review the changes again.",
      ...(current && !("error" in current) ? current : {}),
    }, { status: 409 });
  };
  // A reviewed change is refused when an access point it noted changed since
  // (#208), and one whose review didn't record them (from before #208) is
  // reviewed again. Reordering saves without a review and never changes a
  // day's access point, so it sends none. Before migration 027 there are no
  // access points, and no function to check them.
  if (!accessPoints && edit.action !== "reorder_stops") return reviewAgain();
  // A copy of a tour plan (#210) needs a review that saw the trip's tour plans.
  if (copiesPlan && !tourPlans) return reviewAgain();
  const missing = (code: string | undefined) => code === "PGRST202" || code === "42883";
  const reviewed = (plans?: TourPlansCheck) => supabase.rpc("edit_trip_itinerary_reviewed", {
    p_trip_id: id, p_user_id: userId, p_action: edit.action, p_payload: edit.payload, p_access_points: accessPoints,
    ...(plans ? { p_tour_plans: plans } : {}),
  });
  // The review noted tour plans too (#210), so they're checked from migration
  // 030 on. Before it, a copy can't bring a tour plan; anything else falls
  // back to 027's check of access points, and before 027 to none.
  const save = async () => {
    if (!accessPoints) return unchecked();
    if (tourPlans) {
      const result = await reviewed(tourPlans);
      if (!missing(result.error?.code) || copiesPlan) return result;
    }
    const result = await reviewed();
    return missing(result.error?.code) ? unchecked() : result;
  };
  const { error } = await save();
  if (copiesPlan && missing(error?.code)) return jsonError("Copying a tour plan isn't available yet. Nothing was changed.", 503);
  if (error?.code === "40001" || error?.code === "PT409") return reviewAgain();
  if (error?.code === "42501") return jsonError("Not found", 404);
  if (error?.code === "P0002") return jsonError("That stop or day isn't on this trip anymore. Reload the trip.", 404);
  if (error?.code === "22023") return jsonError("Check the change and try again.", 400);
  if (error) return jsonError("Couldn't save the change. Nothing was changed; try again.", 500);
  return NextResponse.json({ ok: true });
}

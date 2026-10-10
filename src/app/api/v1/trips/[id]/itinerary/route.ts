import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { parseItineraryEdit, parseItineraryRequest, previewItinerary, requestFor } from "@/lib/trip-itinerary";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
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
    return full ? previewItinerary(full, change, userId) : { error: "Not found", status: 404 as const };
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
  // Copying a day can bring the user's kit, so it has its own function.
  const { error } = edit.action === "copy_day"
    ? await supabase.rpc("copy_trip_day", { p_trip_id: id, p_user_id: userId, p_payload: edit.payload })
    : await supabase.rpc("edit_trip_itinerary", { p_trip_id: id, p_user_id: userId, p_action: edit.action, p_payload: edit.payload });
  if (error?.code === "40001") {
    // Something changed since the review. Show the change as it would be now.
    const current = await preview(requestFor(edit)).catch(() => null);
    return NextResponse.json({
      error: "The trip changed since you reviewed it. Review the changes again.",
      ...(current && !("error" in current) ? current : {}),
    }, { status: 409 });
  }
  if (error?.code === "42501") return jsonError("Not found", 404);
  if (error?.code === "P0002") return jsonError("That stop or day isn't on this trip anymore. Reload the trip.", 404);
  if (error?.code === "22023") return jsonError("Check the change and try again.", 400);
  if (error) return jsonError("Couldn't save the change. Nothing was changed; try again.", 500);
  return NextResponse.json({ ok: true });
}

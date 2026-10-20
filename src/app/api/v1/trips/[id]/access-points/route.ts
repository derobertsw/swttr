import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { parseAccessPointEdit, parseAccessPointRequest, previewAccessPoint } from "@/lib/trip-access-points";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import type { TripAccessPointRequest } from "@/types/trips";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Reviews or saves a day's access point (#208): `preview: true` returns the
 * options, only this day or every day at its stop, and otherwise the body is
 * the payload of the option chosen in that review. Organizer only, like every
 * logistics edit.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const preview = async (change: TripAccessPointRequest) => {
    const full = await loadTripFull(supabase, id);
    return full ? previewAccessPoint(full, change) : { error: "Not found", status: 404 as const };
  };

  const body = await readJson<Record<string, unknown>>(request);
  if (body?.preview === true) {
    const change = parseAccessPointRequest(body);
    if ("error" in change) return NextResponse.json(change, { status: 400 });
    try {
      const review = await preview(change);
      return "error" in review ? jsonError(review.error, review.status) : NextResponse.json(review);
    } catch {
      return jsonError("Couldn't load the review. Try again.", 500);
    }
  }

  const edit = parseAccessPointEdit(body);
  if ("error" in edit) return NextResponse.json(edit, { status: 400 });
  const { error } = await supabase.rpc("set_trip_access_point", { p_trip_id: id, p_user_id: userId, p_payload: edit });
  if (error?.code === "40001" || error?.code === "PT409") {
    // Something changed since the review. Show the change as it would be now.
    const current = await preview({ action: "set_access_point", date: edit.date, location: edit.location }).catch(() => null);
    return NextResponse.json({
      error: "The trip changed since you reviewed it. Review the access point again.",
      ...(current && !("error" in current) ? current : {}),
    }, { status: 409 });
  }
  // Before migration 027 the function doesn't exist.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return NextResponse.json({ error: "Access points can't be saved yet. Try again later.", field: "location" }, { status: 503 });
  }
  if (error?.code === "42501") return jsonError("Organizer only", 403);
  if (error?.code === "P0002") return jsonError("This day isn't on the trip anymore. Reload the trip.", 404);
  if (error?.code === "22023") return jsonError("Check the access point and try again.", 400);
  if (error) return jsonError("Couldn't save the access point. Nothing was changed; try again.", 500);
  return NextResponse.json({ ok: true });
}

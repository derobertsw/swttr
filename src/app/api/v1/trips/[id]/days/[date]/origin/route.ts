import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { parseDayOriginEdit } from "@/lib/trip-drive-edits";
import { isCalendarDate } from "@/lib/trip-lodging";
import { requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string; date: string }> };

/**
 * Sets where the day's drive starts (#209): `{origin, no_drive, expected}`.
 * `origin` is a saved stay (`{stay_id}`), any place (`{location}`), or null to
 * use the crew stay of the night before again. Organizer only, like every
 * logistics edit; `expected` is the day as the editor showed it.
 */
export async function PUT(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const edit = parseDayOriginEdit(await readJson(request));
  if ("error" in edit) return NextResponse.json(edit, { status: 400 });

  const { error } = await auth.supabase.rpc("set_trip_day_origin", { p_trip_id: id, p_user_id: auth.userId, p_payload: { date, ...edit } });
  if (error?.code === "40001") return jsonError("The starting point changed since you opened this. Check it, then try again.", 409);
  // Before migration 029 the function doesn't exist.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return NextResponse.json({ error: "Starting points can't be saved yet. Try again later.", field: "origin" }, { status: 503 });
  }
  if (error?.code === "42501") return jsonError("Organizer only", 403);
  if (error?.code === "P0002") return jsonError("This day isn't on the trip anymore. Reload the trip.", 404);
  if (error?.code === "22023") return NextResponse.json({ error: "Check the starting point and try again.", field: "origin" }, { status: 400 });
  if (error) return jsonError("Couldn't save the starting point. Nothing was changed; try again.", 500);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { parseDayNotesEdit } from "@/lib/trip-day-notes";
import { isCalendarDate } from "@/lib/trip-lodging";
import { requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string; date: string }> };

/**
 * Sets or clears the day's notes (#334), for every sport: `{day_id, notes,
 * expected}`, with `notes` null or blank to clear them. Organizer only, like
 * every logistics edit; `expected` is the notes as the editor showed them.
 */
export async function PUT(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);
  const edit = parseDayNotesEdit(await readJson(request));
  if ("error" in edit) return NextResponse.json(edit, { status: 400 });

  const { error } = await auth.supabase.rpc("set_trip_day_notes",
    { p_trip_id: id, p_user_id: auth.userId, p_payload: { date, ...edit } });
  if (error?.code === "40001" || error?.code === "PT409") return jsonError("The notes changed since you opened them. Check them, then try again.", 409);
  // Before migration 20261028130000 the function doesn't exist.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return NextResponse.json({ error: "Day notes can't be saved yet. Try again later.", field: "notes" }, { status: 503 });
  }
  if (error?.code === "42501") return jsonError("Organizer only", 403);
  if (error?.code === "P0002") return jsonError("This day isn't on the trip anymore. Reload the trip.", 404);
  if (error?.code === "22023") return NextResponse.json({ error: "Check the notes and try again.", field: "notes" }, { status: 400 });
  if (error) return jsonError("Couldn't save the notes. Nothing was changed; try again.", 500);
  return NextResponse.json({ ok: true });
}

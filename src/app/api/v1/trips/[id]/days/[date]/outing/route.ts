import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { isCalendarDate } from "@/lib/trip-lodging";
import { tripDayOutingFor, tripDayTimeZone } from "@/lib/trip-day-outing";

type Context = { params: Promise<{ id: string; date: string }> };

/**
 * The signed-in person's outing for a trip day (#335): what Gear up asks for
 * layers for when they plan their kit from the day, or why it can't, with the
 * day as it was planned for, which the save sends back to catch a change.
 */
export async function GET(_request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  if (!isCalendarDate(date)) return jsonError("Not found", 404);

  let full;
  try { full = await loadTripFull(auth.supabase, auth.trip); }
  catch { return jsonError("Couldn't load the trip. Try again.", 500); }
  const day = full?.days.find((entry) => entry.date === date);
  if (!full || !day) return jsonError("This day is no longer on the trip. Reload the trip.", 404);
  const outing = tripDayOutingFor(full, auth.userId, date, await tripDayTimeZone(full, day));
  if (!outing) return jsonError("Not found", 404);
  return NextResponse.json(outing);
}

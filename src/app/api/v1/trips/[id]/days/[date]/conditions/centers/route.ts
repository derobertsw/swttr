import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { avalancheCenterDirectory } from "@/lib/avalanche-centers";
import { accessPointFor } from "@/lib/trip-location";
import { enumerateDates, loadTripFull, requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string; date: string }> };

/**
 * The verified list of official avalanche forecast centers for the source
 * editor (#211), with suggestions for the day's place that the organizer has
 * to confirm. Organizer only, like adding a source. Reads nothing back into
 * the trip: a center becomes a source only when the organizer saves it.
 */
export async function GET(_request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id, { organizerOnly: true });
  if (auth instanceof NextResponse) return auth;
  const full = await loadTripFull(auth.supabase, auth.trip);
  if (!full || !enumerateDates(full.trip.start_date, full.trip.end_date).includes(date)) return jsonError("Not found", 404);

  // The same place a review records: the day's access point, else its destination (the base without a stop).
  const day = full.days.find((entry) => entry.date === date) ?? { stop_id: null, access_point: null, access_point_stop_id: null };
  const stop = full.stops.find((entry) => entry.id === day.stop_id) ?? full.stops[0];
  const access = accessPointFor(full.stops, day)?.location;
  const place = access ? { kind: "access_point" as const, latitude: access.latitude, longitude: access.longitude }
    : stop && stop.latitude != null && stop.longitude != null ? { kind: "destination" as const, latitude: stop.latitude, longitude: stop.longitude }
    : null;
  return NextResponse.json(await avalancheCenterDirectory(place));
}

import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/lib/api";
import { kitsToSave, readSaveSource, tripDestination } from "@/lib/trip-saved-kits";
import { enumerateDates, listTripsForUser } from "@/lib/trips";
import type { SaveKitOptions } from "@/types/savedKit";

/**
 * Where an outing's outfit or a multi-day plan can be saved (#170): the trip
 * dates it makes kits for, on the destination's calendar, and the signed-in
 * user's trips, each with the day the first date would be, or null when the
 * trip doesn't include every date.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const body = await readJson(request);
  const source = readSaveSource(body);
  if (!source) return jsonError("This outing's layers can't be saved. Get layers again and retry.", 400);
  const planned = kitsToSave(source);
  if (!planned) return jsonError("Couldn't tell the date at this place. Get layers for a later time there, then save.", 400);

  const trips = await listTripsForUser(supabase, userId);
  const { place } = source.outing;
  const dates = planned.kits.map((kit) => kit.date);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const options: SaveKitOptions = {
    dates,
    start_date: planned.startDate,
    end_date: planned.endDate,
    suggested_name: `${place.id === 0 && !place.country ? "Outing" : place.name} trip`.slice(0, 200),
    destination: tripDestination(place).name,
    trips: trips.map((trip) => {
      const index = first >= trip.start_date && last <= trip.end_date
        ? enumerateDates(trip.start_date, first).length
        : null;
      return { id: trip.id, name: trip.name, start_date: trip.start_date, end_date: trip.end_date, member_count: trip.member_count, day_number: index };
    }),
  };
  return NextResponse.json(options);
}

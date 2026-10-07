import { NextRequest, NextResponse } from "next/server";
import { jsonError, readJson, requireUser } from "@/lib/api";
import { outfitDate, readSavedOutfit, tripDestination } from "@/lib/trip-saved-kits";
import { enumerateDates, listTripsForUser } from "@/lib/trips";
import type { SaveKitOptions } from "@/types/savedKit";

/**
 * Where an outing's outfit can be saved (#170): the trip date it's for, on
 * the destination's calendar, and the signed-in user's trips, each with the
 * day it would be, or null when the trip doesn't include that date.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, userId } = auth;

  const body = await readJson(request);
  const outfit = readSavedOutfit(body?.outfit);
  if (!outfit) return jsonError("This outing's layers can't be saved. Get layers again and retry.", 400);
  const date = outfitDate(outfit);
  if (!date) return jsonError("Couldn't tell the date at this place. Get layers for a later time there, then save.", 400);

  const trips = await listTripsForUser(supabase, userId);
  const { place } = outfit.outing;
  const options: SaveKitOptions = {
    date,
    suggested_name: `${place.id === 0 && !place.country ? "Outing" : place.name} trip`.slice(0, 200),
    destination: tripDestination(place).name,
    trips: trips.map((trip) => {
      const index = date >= trip.start_date && date <= trip.end_date
        ? enumerateDates(trip.start_date, date).length
        : null;
      return { id: trip.id, name: trip.name, start_date: trip.start_date, end_date: trip.end_date, member_count: trip.member_count, day_number: index };
    }),
  };
  return NextResponse.json(options);
}

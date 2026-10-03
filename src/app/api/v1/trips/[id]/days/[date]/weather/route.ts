import { NextRequest, NextResponse } from "next/server";
import { enumerateDates, loadTripFull, requireTripAccess } from "@/lib/trips";
import { fetchTripForecast, hasTripCoordinates, resolveTripStop, tripDayForecast } from "@/lib/trip-forecast";

type RouteContext = { params: Promise<{ id: string; date: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id, date } = await ctx.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return auth;
  const full = await loadTripFull(auth.supabase, id);
  if (!full || !enumerateDates(full.trip.start_date, full.trip.end_date).includes(date)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const day = full.days.find((day) => day.date === date);
  const stop = resolveTripStop(day ?? { stop_id: null }, full.stops);
  const source = hasTripCoordinates(stop) ? await fetchTripForecast(stop) : undefined;
  const { forecast, weather } = tripDayForecast(date, source);
  return NextResponse.json({ forecast, weather });
}

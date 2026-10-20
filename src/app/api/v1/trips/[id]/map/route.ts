import { NextResponse } from "next/server";
import { allowRequest } from "@/lib/rate-limit";
import { isCalendarDate } from "@/lib/trip-lodging";
import { loadTripMap } from "@/lib/trip-map";
import { requireTripAccess } from "@/lib/trips";

type Context = { params: Promise<{ id: string }> };
const PRIVATE = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

/** Saved itinerary only. Opening/panning a map never calculates routes. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) {
    Object.entries(PRIVATE).forEach(([key, value]) => auth.headers.set(key, value));
    return auth;
  }
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVATE });
  if (!allowRequest(`trip-map:${auth.userId}`, 60, 60_000)) return json({ error: "Too many requests. Try again in a minute." }, 429);
  const date = new URL(request.url).searchParams.get("date");
  if (date !== null && !isCalendarDate(date)) return json({ error: "Choose a valid trip date." }, 400);
  try {
    const map = await loadTripMap(auth.supabase, auth.trip, date);
    return map ? json(map) : json({ error: "Day not found" }, 404);
  } catch {
    return json({ error: "Couldn't load trip places. Try again." }, 500);
  }
}

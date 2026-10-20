import { NextResponse } from "next/server";
import { allowRequest } from "@/lib/rate-limit";
import { requireTripAccess } from "@/lib/trips";
import { drivePlans } from "@/lib/trip-drive";
import { loadTripMapContext } from "@/lib/trip-map";
import { tripMapGeometry } from "@/lib/trip-map-geometry";
import { mapJson, privateMapResponse } from "@/lib/trip-map-response";

type Context = { params: Promise<{ id: string; date: string }> };
const changed = () => mapJson({ error: "The day's places changed. Refresh the trip map.", code: "revision_changed" }, 409);

export async function GET(request: Request, context: Context) {
  const { id, date } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return privateMapResponse(auth);
  if (!allowRequest(`trip-map-geometry:${auth.userId}`, 20, 60_000)) return mapJson({ error: "Wait a minute, then try again.", code: "rate_limited" }, 429);
  const expected = new URL(request.url).searchParams.get("revision");
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return mapJson({ error: "A current day revision is required." }, 400);
  try {
    const context = await loadTripMapContext(auth.supabase, auth.trip, date);
    const day = context?.map.days.find((d) => d.date === date);
    if (!context || !day) return mapJson({ error: "Day not found" }, 404);
    if ((day.geometry.revision ?? day.revision) !== expected) return changed();
    const result = await tripMapGeometry(id, day, drivePlans(context.full).find((p) => p.date === date));
    // Access or endpoints may change during the bounded provider request.
    const currentAuth = await requireTripAccess(id);
    if (currentAuth instanceof NextResponse) return privateMapResponse(currentAuth);
    const current = await loadTripMapContext(currentAuth.supabase, currentAuth.trip, date);
    const currentDay = current?.map.days.find((d) => d.id === day.id && d.date === date);
    if (!currentDay) return mapJson({ error: "Day not found" }, 404);
    if ((currentDay.geometry.revision ?? currentDay.revision) !== expected) return changed();
    return mapJson(result);
  } catch { return mapJson({ error: "Couldn't load the route line. Try again." }, 500); }
}

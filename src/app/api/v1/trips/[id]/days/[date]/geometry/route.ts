import { NextResponse } from "next/server";
import { allowRequest } from "@/lib/rate-limit";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { supabaseDriveStore } from "@/lib/trip-drive-estimates";
import { mapDrivePlans, tripMapData } from "@/lib/trip-map";
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
    const full = await loadTripFull(auth.supabase, auth.trip);
    if (!full || !full.days.some((d) => d.date === date)) return mapJson({ error: "Day not found" }, 404);
    const map = await tripMapData(full, supabaseDriveStore(auth.supabase, id), date);
    const day = map.selected_day!;
    if (day.revision !== expected) return changed();
    const result = await tripMapGeometry(id, day, mapDrivePlans(full).find((p) => p.date === date));
    // Access or endpoints may change during the bounded provider request.
    const currentAuth = await requireTripAccess(id);
    if (currentAuth instanceof NextResponse) return privateMapResponse(currentAuth);
    const current = await loadTripFull(currentAuth.supabase, currentAuth.trip);
    if (!current || !current.days.some((d) => d.id === day.id && d.date === date)) return mapJson({ error: "Day not found" }, 404);
    const currentMap = await tripMapData(current, supabaseDriveStore(currentAuth.supabase, id), date);
    if (currentMap.selected_day?.revision !== expected) return changed();
    return mapJson(result);
  } catch { return mapJson({ error: "Couldn't load the route line. Try again." }, 500); }
}

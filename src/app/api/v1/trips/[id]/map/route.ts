import { NextResponse } from "next/server";
import { allowRequest } from "@/lib/rate-limit";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { supabaseDriveStore } from "@/lib/trip-drive-estimates";
import { tripMapData } from "@/lib/trip-map";
import { mapJson, privateMapResponse } from "@/lib/trip-map-response";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const auth = await requireTripAccess(id);
  if (auth instanceof NextResponse) return privateMapResponse(auth);
  if (!allowRequest(`trip-map:${auth.userId}`, 30, 60_000)) return mapJson({ error: "Wait a minute, then try again.", code: "rate_limited" }, 429);
  try {
    const full = await loadTripFull(auth.supabase, auth.trip);
    if (!full) return mapJson({ error: "Not found" }, 404);
    const date = new URL(request.url).searchParams.get("date") ?? undefined;
    if (date !== undefined && !full.days.some((d) => d.date === date)) return mapJson({ error: "Day not found" }, 404);
    return mapJson(await tripMapData(full, supabaseDriveStore(auth.supabase, id), date));
  } catch { return mapJson({ error: "Couldn't load trip places. Try again." }, 500); }
}

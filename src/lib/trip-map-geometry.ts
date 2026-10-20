import "server-only";
import { driveGeometry } from "@/lib/locations/geometry";
import { allowRequest } from "@/lib/rate-limit";
import type { DrivePlan } from "@/lib/trip-drive";
import { GEOAPIFY_CREDIT, OSM_CREDIT } from "@/lib/trip-location";
import type { TripMapDay, TripMapRoadGeometry as TripMapGeometry } from "@/types/trip-map";

const CACHE_MS = 5 * 60_000;
const MAX_ENTRIES = 128;
const MAX_IN_FLIGHT = 8;
const cached = new Map<string, { expires: number; result: TripMapGeometry }>();
const pending = new Map<string, Promise<TripMapGeometry>>();

/** Auth is always checked by the route, including before serving a cache hit. */
export async function tripMapGeometry(tripId: string, day: TripMapDay, plan: DrivePlan | undefined): Promise<TripMapGeometry> {
  const base = { trip_id: tripId, day_id: day.id, date: day.date, revision: day.geometry.revision ?? day.revision, mode: "drive" as const,
    origin_place_id: day.origin_place_id, access_place_id: day.access_place_id };
  // A fresh explicit no-route matrix answer needs no additional provider request.
  if (day.drive.state === "no_route") return { ...base, state: "no_route", geometry: null };
  if (!plan || plan.state !== "ready" || day.geometry.state === "not_applicable") return { ...base, state: "not_applicable", geometry: null };
  const key = JSON.stringify([tripId, day.id, base.revision]);
  const now = Date.now();
  for (const [id, entry] of cached) if (entry.expires <= now) cached.delete(id);
  const hit = cached.get(key);
  if (hit) return hit.result;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  if (pending.size >= MAX_IN_FLIGHT || !allowRequest("trip-map-geometry:provider", 4, 1_000)) return { ...base, state: "unavailable", geometry: null };
  const work = (async (): Promise<TripMapGeometry> => {
    try {
      const geometry = await driveGeometry(plan.origin!.location!, plan.destination!.location, plan.closures.flatMap((c) => c.points));
      const result: TripMapGeometry = geometry
        ? { ...base, state: "available", geometry, provider: "geoapify", calculated_at: new Date().toISOString(), attribution: [GEOAPIFY_CREDIT, OSM_CREDIT] }
        : { ...base, state: "no_route", geometry: null };
      if (cached.size >= MAX_ENTRIES) cached.delete(cached.keys().next().value!);
      cached.set(key, { result, expires: Date.now() + CACHE_MS });
      return result;
    } catch { return { ...base, state: "unavailable", geometry: null }; }
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

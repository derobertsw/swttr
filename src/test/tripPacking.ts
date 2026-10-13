import { savedOutfit } from "@/test/savedKit";
import { ORGANIZER, tripFull } from "@/test/tripApi";
import type { TripFull } from "@/types/trips";

export function packingTrip(): TripFull {
  const dates = ["2026-10-10", "2026-10-11", "2026-10-12"];
  return tripFull({ days: dates.map(date => ({ id: date, trip_id: "trip-1", date, activity: "Alpine", stop_id: null })),
    kits: dates.map((date, index) => ({ id: `kit-${index}`, trip_day_id: date, trip_member_id: ORGANIZER.id,
      effort: "steady", items: [], note: null, state: "ok", updated_at: "2026-10-10T00:00Z", outfit: savedOutfit() })) });
}

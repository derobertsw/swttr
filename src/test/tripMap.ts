import { projectTripMap } from "@/lib/trip-map";
import { drivePlans, type StoredDriveEstimate } from "@/lib/trip-drive";
import { tripDriveEstimates, type ManualEstimateRow } from "@/lib/trip-drive-estimates";
import { driveTrip } from "@/test/driveTrip";
import type { TripFull } from "@/types/trips";

/** The drive trip's map, from saved estimates only: no routing provider call. */
export async function tripMapFixture(full: TripFull = driveTrip(), { rows = [], manual = [], now }: { rows?: StoredDriveEstimate[]; manual?: ManualEstimateRow[]; now?: number } = {}) {
  const estimates = await tripDriveEstimates(full, { read: async () => rows, write: async () => {}, manual: async () => manual }, { refresh: false, now });
  return projectTripMap(full, estimates);
}

/** A saved 30 min / 24 km estimate, or a no-route answer, for the day's current pair. */
export function storedDrive(full: TripFull, date: string, calculatedAt: string, status: "ok" | "no_route" = "ok"): StoredDriveEstimate {
  const plan = drivePlans(full).find((day) => day.date === date)!;
  return { date, route_key: plan.route_key!, origin_label: plan.origin!.label, destination_label: plan.destination!.label, status,
    duration_seconds: status === "ok" ? 1800 : null, distance_meters: status === "ok" ? 24000 : null, calculated_at: calculatedAt };
}

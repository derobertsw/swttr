import { projectTripMap } from "@/lib/trip-map";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { driveTrip } from "@/test/driveTrip";

export async function tripMapFixture() {
  const full = driveTrip();
  const estimates = await tripDriveEstimates(full, { read: async () => [], write: async () => {} }, { refresh: false });
  return projectTripMap(full, estimates);
}

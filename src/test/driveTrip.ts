import { buildLodging } from "@/lib/trip-lodging";
import type { Trip, TripDay, TripFull, TripLocation, TripLodgingNight, TripStay, TripStop } from "@/types/trips";

/**
 * A January trip for drive estimate tests (#209): Fri–Mon, Stowe then
 * Smugglers' Notch, with a stay that has a location and one that doesn't.
 * - Fri Jan 8: no stay the night before.
 * - Sat Jan 9: Stowe Motel → Spruce Peak lot.
 * - Sun Jan 10: Stowe Motel's checkout morning → Smuggs lot, past the closed Notch.
 * - Mon Jan 11: Village Inn, which has no location yet.
 */
export const place = (label: string, latitude: number, longitude: number, precision: TripLocation["precision"] = "exact"): TripLocation => ({
  label, address: `${label}, Vermont`, latitude, longitude, precision, time_zone: "America/New_York",
  source: "search", provider: "geoapify", provider_id: `place-${latitude}`, attribution: "© OpenStreetMap contributors",
});
export const MOTEL = place("Stowe Motel", 44.4875, -72.7262);
export const SPRUCE_LOT = place("Spruce Peak lot", 44.53, -72.7816);
export const SMUGGS_LOT = place("Smuggs lot", 44.587, -72.7837);

const TRIP: Trip = {
  id: "trip-drive", owner_user_id: "user-1", name: "Vermont", start_date: "2027-01-08", end_date: "2027-01-11",
  status: "planning", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", lodging_revision: 3,
};
const stop = (id: string, position: number, name: string, accessPoint: TripLocation | null): TripStop => ({
  id, trip_id: TRIP.id, position, name, latitude: 44.5, longitude: -72.7, activities: ["Backcountry"],
  created_at: "2026-10-01T00:00:00Z", access_point: accessPoint,
});
const day = (date: string, stopId: string): TripDay => ({ id: `day-${date}`, trip_id: TRIP.id, stop_id: stopId, date, activity: "Backcountry", access_point: null, access_point_stop_id: null });
const stay = (id: string, name: string, checkIn: string, checkOut: string, location: TripLocation | null): TripStay => ({
  id, trip_id: TRIP.id, name, check_in: checkIn, check_out: checkOut, type: "hotel", address: null, property_url: null,
  check_in_time: null, check_out_time: null, notes: null, booking_status: "booked", location,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
});
const night = (date: string, stayId: string): TripLodgingNight => ({ trip_id: TRIP.id, date, stay_id: stayId, status: "assigned" });

/** The trip, with any stays or days replaced. */
export function driveTrip({ stays, days, stops }: { stays?: TripStay[]; days?: TripDay[]; stops?: TripStop[] } = {}): TripFull {
  const savedStays = stays ?? [
    stay("stay-motel", "Stowe Motel", "2027-01-08", "2027-01-10", MOTEL),
    stay("stay-inn", "Village Inn", "2027-01-10", "2027-01-11", null),
  ];
  const nights = savedStays.flatMap((saved) => saved.id === "stay-motel" ? [night("2027-01-08", saved.id), night("2027-01-09", saved.id)]
    : saved.id === "stay-inn" ? [night("2027-01-10", saved.id)] : []);
  return {
    trip: TRIP,
    stops: stops ?? [stop("stop-stowe", 0, "Stowe, Vermont", SPRUCE_LOT), stop("stop-smuggs", 1, "Smugglers' Notch, Vermont", SMUGGS_LOT)],
    members: [],
    days: days ?? [day("2027-01-08", "stop-stowe"), day("2027-01-09", "stop-stowe"), day("2027-01-10", "stop-smuggs"), day("2027-01-11", "stop-smuggs")],
    kits: [],
    gear: [],
    lodging: buildLodging(TRIP, savedStays, nights),
  };
}

export { stay as driveStay, day as driveDayRow };

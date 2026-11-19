// Fictional fixtures for the #235 trip map checks. Every response comes from
// the production server projections (tripFullFor, tripDriveEstimates,
// projectTripMap) over the deterministic test trips, with saved or fake-matrix
// estimates only: no database, no routing provider and no real itinerary.
import { buildLodging } from "@/lib/trip-lodging";
import { buildDayMeets } from "@/lib/trip-meets";
import { projectTripMap } from "@/lib/trip-map";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { buildTourPlanSummary } from "@/lib/trip-tour-plans";
import { briefChoices, buildOfflineBrief } from "@/lib/trip-offline-brief";
import { tripFullFor } from "@/lib/trips";
import { driveDayRow, driveStay, driveTrip, MOTEL, place, splitDriveTrip } from "@/test/driveTrip";
import { storedDrive } from "@/test/tripMap";
import { ALEX, CASEY, ELI, SPLIT_MEMBERS } from "@/test/splitStays";
import type { TripMap } from "@/types/trip-map";
import type { TripOfflineBriefResponse } from "@/types/trip-offline-brief";
import type { TripDriveEstimates, TripFull, TripLodgingNight, TripMember, TripStop } from "@/types/trips";

export interface QaTrip {
  /** The trip API's response for each signed-in viewer. */
  full: Record<string, TripFull>;
  map: TripMap;
  estimates: TripDriveEstimates;
  /** Hand-drawn fictional road lines by geometry revision, standing in for the provider. */
  lines: Record<string, number[][][]>;
  /** #214's brief API for each viewer, built by the production builder for the default days. */
  brief?: Record<string, TripOfflineBriefResponse>;
}

const member = (tripId: string, id: string, userId: string, name: string, role: TripMember["role"] = "member", status: TripMember["status"] = "joined"): TripMember =>
  ({ id, trip_id: tripId, user_id: userId, display_name: name, role, status, invite_token: null, created_at: "2026-09-28T00:00:00Z" });

/** A gently bent fictional line between two places; never a provider answer. */
function fictionalLine(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number[][][] {
  const steps = 6;
  return [[...Array(steps + 1).keys()].map((step) => {
    const t = step / steps, bend = Math.sin(Math.PI * t) * 0.006;
    return [from.longitude + (to.longitude - from.longitude) * t + bend, from.latitude + (to.latitude - from.latitude) * t - bend];
  })];
}

function linesFor(map: TripMap): Record<string, number[][][]> {
  const lines: Record<string, number[][][]> = {};
  const coordinates = (id: string | null) => map.places.find((entry) => entry.id === id)?.coordinates ?? null;
  for (const day of map.days) {
    for (const drive of [{ geometry: day.geometry }, ...day.departures ?? []]) {
      const { revision, origin_place_id, access_place_id, state } = drive.geometry;
      const from = coordinates(origin_place_id), to = coordinates(access_place_id);
      if (revision && state === "unavailable" && from && to) lines[revision] = fictionalLine(from, to);
    }
  }
  return lines;
}

/**
 * Vermont, Fri Jan 8 – Mon Jan 11 2027 (src/test/driveTrip.ts): a first day
 * with no starting point, Saturday's tour with a meet time, Sunday's checkout
 * and hotel change, and Monday from a stay with no location.
 */
async function driveFixture(now: number): Promise<QaTrip> {
  const base = driveTrip();
  const tripId = base.trip.id;
  const days = base.days.map((day) => day.date === "2027-01-09" ? { ...day, meet_time: "08:00:00", meet_day_offset: 0 as const, meet_time_zone: "America/New_York" } : day);
  const stays = base.lodging!.stays.map((stay) => stay.id === "stay-inn" ? { ...stay, name: "The exceptionally long Green Mountain Village Inn and Backcountry Learning Center" } : stay);
  const nights = base.lodging!.assignments;
  const full: TripFull = {
    ...base, days,
    members: [member(tripId, "member-org", "user-1", "Organizer", "organizer"), member(tripId, "member-sam", "user-sam", "Sam")],
    lodging: buildLodging(base.trip, stays, nights),
    tour_plans: [buildTourPlanSummary({ id: "tour", trip_id: tripId, trip_day_id: days[1].id, objective: "Spruce Peak north glades", route_url: "https://example.com/fictional-tour",
      meet_time: "08:00", meet_day_offset: 0, return_time: null, time_zone: "America/New_York", revision: 1, updated_at: "2027-01-01T12:00:00Z",
      access_notes: "Fictional: uphill travel pass required at the ticket window.", pickup_notes: "Fictional: second car waits at the lower lot.",
      approach_notes: "Fictional: skin about 40 minutes up the summer road.",
      // A saved row always has these; #214's brief reads both.
      backup_plan: "Fictional: lower-angle trees by the Sterling lot if the glades are wind loaded.", checkin_notes: null } as Parameters<typeof buildTourPlanSummary>[0], "2027-01-09")],
  };
  full.meets = buildDayMeets(full.days, []);
  const hour = new Date(now - 3_600_000).toISOString();
  const rows = [storedDrive(full, "2027-01-09", hour), storedDrive(full, "2027-01-10", hour)];
  const estimates = await tripDriveEstimates(full, { read: async () => rows, write: async () => {}, manual: async () => [] }, { refresh: false, now });
  const map = projectTripMap(full, estimates);
  const viewed = tripFullFor(full, "user-1");
  // The organizer's copy (#214), as the brief route builds it: no packing list was saved.
  const choices = briefChoices(viewed, now);
  const brief = { brief: buildOfflineBrief({ full: viewed, userId: "user-1", dates: choices.default_dates, drive: estimates, equipment: null, now }), ...choices };
  return { full: { "user-1": viewed, "user-sam": tripFullFor(full, "user-sam") }, map, estimates, lines: linesFor(map), brief: { "user-1": brief } };
}

/**
 * Edge states on one fictional trip, Fri Jan 15 – Mon Jan 18 2027:
 * - Fri: a day-only starting point (a café, not a stay) to an unroutable hut.
 * - Sat: an approximate access point; the night after is No stay needed.
 * - Sun: No drive planned, at the same destination.
 * - Mon: from a lodge to an access
 *   point at zero latitude and zero longitude (a valid coordinate).
 */
async function edgeFixture(now: number): Promise<QaTrip> {
  const seed = driveTrip();
  const trip = { ...seed.trip, id: "trip-edge", name: "Edge states", start_date: "2027-01-15", end_date: "2027-01-18" };
  const hut = place("Bolton backcountry hut", 44.4063, -72.8706);
  const approximate = place("Jay Peak area", 44.9379, -72.5045, "approximate");
  const zero = place("Zero-coordinate test point", 0, 0);
  const lodgePlace = { ...place("Mountain Road lodge", 44.5301, -72.7811), provider_id: "place-lodge" };
  const cafe = place("Trailhead café", 44.4302, -72.8411);
  const stop = (id: string, position: number, name: string, accessPoint: typeof hut): TripStop => ({ id, trip_id: trip.id, position, name, latitude: accessPoint.latitude, longitude: accessPoint.longitude,
    activities: ["Backcountry"], created_at: "2026-10-01T00:00:00Z", access_point: accessPoint });
  const stops = [stop("stop-hut", 0, "Bolton Valley backcountry", hut), stop("stop-jay", 1, "Jay Peak", approximate), stop("stop-zero", 2, "Zero-coordinate test", zero)];
  const row = (date: string, stopId: string) => ({ ...driveDayRow(date, stopId), trip_id: trip.id });
  const days = [
    { ...row("2027-01-15", "stop-hut"), origin: cafe, origin_stay_id: null },
    row("2027-01-16", "stop-jay"),
    { ...row("2027-01-17", "stop-jay"), no_drive: true },
    row("2027-01-18", "stop-zero"),
  ];
  const stays = [
    { ...driveStay("stay-motel-edge", "Stowe Motel", "2027-01-15", "2027-01-16", MOTEL), trip_id: trip.id },
    { ...driveStay("stay-lodge", "Mountain Road lodge", "2027-01-17", "2027-01-18", lodgePlace), trip_id: trip.id },
  ];
  const nights: TripLodgingNight[] = [
    { trip_id: trip.id, date: "2027-01-15", stay_id: "stay-motel-edge", status: "assigned" },
    { trip_id: trip.id, date: "2027-01-16", stay_id: null, status: "no_stay" },
    { trip_id: trip.id, date: "2027-01-17", stay_id: "stay-lodge", status: "assigned" },
  ];
  const full: TripFull = { ...seed, trip, stops, days, members: [member(trip.id, "member-org-edge", "user-1", "Organizer", "organizer")], lodging: buildLodging(trip, stays, nights), tour_plans: [] };
  full.meets = buildDayMeets(full.days, []);
  const hour = new Date(now - 3_600_000).toISOString();
  const rows = [storedDrive(full, "2027-01-15", hour, "no_route"), storedDrive(full, "2027-01-18", hour)];
  const estimates = await tripDriveEstimates(full, { read: async () => rows, write: async () => {}, manual: async () => [] }, { refresh: false, now });
  const map = projectTripMap(full, estimates);
  return { full: { "user-1": tripFullFor(full, "user-1") }, map, estimates, lines: linesFor(map) };
}

/**
 * The downhill reference journey with split stays (#333, src/test/splitStays.ts):
 * Saturday, Alex, Blair and Dana leave the Pine rental while Eli and Fran leave
 * the Village hotel; Casey arrives that evening and isn't taking part.
 */
async function splitFixture(): Promise<QaTrip> {
  const now = Date.parse("2026-10-05T15:00:00Z");
  const seed = splitDriveTrip();
  const trip = { ...seed.trip, id: "trip-split", name: "Stowe weekend" };
  // Every saved row names its trip; the projection rejects any that don't match.
  const own = <Row extends { trip_id: string }>(rows: Row[]) => rows.map((entry) => ({ ...entry, trip_id: trip.id }));
  const base: TripFull = { ...seed, trip, stops: own(seed.stops), days: own(seed.days),
    lodging: { ...seed.lodging!, stays: own(seed.lodging!.stays), assignments: own(seed.lodging!.assignments) } };
  const users: Record<string, string> = { [ALEX.id]: "user-1", [ELI.id]: "user-eli", [CASEY.id]: "user-casey" };
  const members = SPLIT_MEMBERS.map((entry) => member(trip.id, entry.id, users[entry.id] ?? `user-${entry.display_name.toLowerCase()}`, entry.display_name,
    entry.role === "organizer" ? "organizer" : entry.role === "guest" ? "guest" : "member", entry.status === "invited" ? "invited" : entry.status === "guest" ? "guest" : "joined"));
  const full: TripFull = { ...base, members };
  full.meets = buildDayMeets(full.days, []);
  // As DayDepartures.test.tsx: a fake matrix, 12 min from the rental and 18 from the hotel.
  const minutes: Record<string, number> = { "44.4712": 12, "44.4654": 18, "44.5211": 3 };
  const matrix = async (sources: Array<{ latitude: number }>, targets: unknown[]) =>
    sources.map((source) => targets.map(() => ({ seconds: (minutes[String(source.latitude)] ?? 10) * 60, meters: 9_000 })));
  const estimates = await tripDriveEstimates(full, { read: async () => [], write: async () => undefined }, { now, matrix });
  const map = projectTripMap(full, estimates);
  return { full: Object.fromEntries(["user-1", "user-eli", "user-casey"].map((user) => [user, tripFullFor(full, user)])), map, estimates, lines: linesFor(map) };
}

export async function qaFixtures(now = Date.parse("2027-01-07T15:00:00Z")): Promise<Record<string, QaTrip>> {
  return { "trip-drive": await driveFixture(now), "trip-edge": await edgeFixture(now), "trip-split": await splitFixture() };
}

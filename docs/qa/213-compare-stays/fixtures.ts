/**
 * Fixture database for the #213 browser checks: trips as the rows the API
 * reads, so the real route handlers (loadTripFull, compareStays,
 * handleUseOption, the lodging preview) produce every response. Everything
 * here is fictional: people, places, links and prices.
 *
 * - qa213-weekend: the downhill reference journey (src/test/splitStays.ts),
 *   Fri Oct 9 – Mon Oct 12 2026, six people. Fri and Sat nights: Alex, Blair
 *   and Dana in the Pine rental (booked), Eli and Fran in the Village hotel
 *   (booking not confirmed), Casey joins the rental on Saturday. Sun and Mon
 *   nights: everyone in the Mountain lodge (booked), a mid-trip move.
 *   Friday is a travel day with No drive planned. Saturday and Monday are at
 *   Stowe's Spruce Peak lot (a repeated stop), Sunday at Smugglers' Notch.
 *   Seven options, each for one of the states the issue lists (see OPTIONS).
 * - qa213-one: one saved stay and no options, for the empty state.
 *
 * Drives: the routing provider is down for the whole run (api.mjs). Every
 * drive that should be known is stored in trip_stay_candidate_routes, worked
 * out at build time by compareStays itself with the fake matrix below, so
 * route keys and labels are the server's own.
 */
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, LODGE, MON, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, splitRows, SUN, VILLAGE } from "@/test/splitStays";
import { LODGE_PLACE, PINE_PLACE, place, SMUGGS_LOT, SPRUCE_LOT, VILLAGE_PLACE } from "@/test/driveTrip";
import { loadTripFull } from "@/lib/trips";
import { summarizeCandidate } from "@/lib/trip-stay-candidates";
import { compareStays, parseComparisonRequest } from "@/lib/trip-stay-comparison";
import type { StoredDriveEstimate } from "@/lib/trip-drive";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, TripDay, TripLocation, TripStop } from "@/types/trips";

type Row = object;
export type Tables = Record<string, Row[]>;

const CREATED = "2026-09-28T12:00:00Z";
const uuid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USERS: Record<string, string | null> = {
  [ALEX.id]: "user-alex", [BLAIR.id]: "user-blair", [CASEY.id]: "user-casey", [DANA.id]: null, [ELI.id]: "user-eli", [FRAN.id]: null,
};

/** Who the harness signs in as, by Clerk user id. */
export const VIEWERS = { organizer: "user-alex", member: "user-blair" } as const;

/** Each trip's fixed "now": the Monday before the trip, while the crew is still choosing. */
export const FIXTURE_TRIPS = {
  "qa213-weekend": { now: "2026-10-05T15:00:00Z" },
  "qa213-one": { now: "2026-10-05T15:00:00Z" },
} as const;
export type FixtureTripId = keyof typeof FIXTURE_TRIPS;

export const LONG_NAME = "The Very Long Name Of A Mountainside Chalet With Hot Tub, Sauna And A Ski-In Ski-Out Boot Room Near The Gondola Base (Upper-Mountain-Road-Number-Twelve-Thousand)";

/** The options on qa213-weekend, by what each one is for. */
export const OPTIONS = {
  /** Known drives, all three nights, the Sunday outlier (1 hr 10 min to Smuggs), a USD estimate. */
  ridge: uuid("3c", 1),
  /** Known drives, only Fri and Sat nights (differing dates), a CAD estimate. */
  brook: uuid("3c", 2),
  /** Known drives, Sat to Mon nights, a long name. */
  long: uuid("3c", 3),
  /** Exact place, nothing stored, and the provider is down: unavailable. */
  hilltop: uuid("3c", 4),
  /** No place: Location needed. */
  notch: uuid("3c", 5),
  /** Approximate place, no nights. */
  town: uuid("3c", 6),
  /** Stored eight days ago, and refreshing fails: not updated. */
  gondola: uuid("3c", 7),
} as const;

const RIDGE = place("Ridge chalet", 44.5012, -72.7519);
const BROOK = place("Brook inn", 44.4498, -72.6802);
const LONG = place("Mountainside chalet", 44.5101, -72.7603);
const HILLTOP = place("Hilltop barn", 44.4902, -72.7401);
const TOWN = place("Stowe village", 44.4655, -72.6850, "approximate");
const GONDOLA = place("Gondola condo", 44.5251, -72.7791);

/** Minutes from each starting point to each access point, by the starting point's latitude. */
const MINUTES: Record<string, Record<number, number>> = {
  [SPRUCE_LOT.label]: { [RIDGE.latitude]: 10, [BROOK.latitude]: 25, [LONG.latitude]: 18, [GONDOLA.latitude]: 6, [PINE_PLACE.latitude]: 12, [VILLAGE_PLACE.latitude]: 14, [LODGE_PLACE.latitude]: 3 },
  [SMUGGS_LOT.label]: { [RIDGE.latitude]: 70, [BROOK.latitude]: 20, [LONG.latitude]: 35, [GONDOLA.latitude]: 48, [PINE_PLACE.latitude]: 45, [VILLAGE_PLACE.latitude]: 40, [LODGE_PLACE.latitude]: 50 },
};
const TARGETS: Record<number, string> = { [SPRUCE_LOT.latitude]: SPRUCE_LOT.label, [SMUGGS_LOT.latitude]: SMUGGS_LOT.label };
const fakeMatrix = async (sources: Array<{ latitude: number }>, targets: Array<{ latitude: number }>) =>
  sources.map((source) => targets.map((target) => {
    const minutes = MINUTES[TARGETS[target.latitude]]?.[source.latitude];
    if (minutes === undefined) throw new Error(`No fixture drive from ${source.latitude} to ${target.latitude}`);
    return { seconds: minutes * 60, meters: Math.round(minutes * 900) };
  }));

const stop = (tripId: string, id: string, position: number, name: string, latitude: number, longitude: number, accessPoint: TripLocation): TripStop =>
  ({ id, trip_id: tripId, position, name, latitude, longitude, activities: ["Alpine"], created_at: CREATED, access_point: accessPoint });

const dayRow = (tripId: string, id: string, date: string, stopId: string, activity: string, extra: Partial<TripDay> = {}): TripDay => ({
  id, trip_id: tripId, stop_id: stopId, date, activity, access_point: null, access_point_stop_id: null,
  origin: null, origin_stay_id: null, no_drive: false, meet_time: null, meet_day_offset: 0, meet_time_zone: null, notes: null, ...extra,
});

const members = (tripId: string, only?: string[]) => SPLIT_MEMBERS.filter((member) => !only || only.includes(member.id)).map((member) => ({
  ...member, trip_id: tripId, user_id: USERS[member.id], invite_token: member.status === "invited" ? `qa213-invite-${member.id.slice(-2)}` : null,
}));

const option = (tripId: string, id: string, name: string, location: TripLocation | null, nights: [string, string] | null, extra: Row = {}) => ({
  id, trip_id: tripId, name, check_in: nights?.[0] ?? null, check_out: nights?.[1] ?? null, address: null,
  property_url: `https://example.com/qa213/${id.slice(-2)}`, notes: null, location, cost_amount: null, cost_currency: null,
  revision: 1, created_at: `2026-10-0${Number(id.slice(-1))}T12:00:00Z`, updated_at: `2026-10-0${Number(id.slice(-1))}T12:00:00Z`, ...extra,
});

/** The trip as loadTripFull reads it from `tables`. */
async function loaded(tables: Tables, trip: Trip) {
  const full = await loadTripFull(createFakeSupabase(structuredClone(tables) as Parameters<typeof createFakeSupabase>[0]) as unknown as SupabaseClient, trip);
  if (!full) throw new Error(`Fixture trip ${trip.id} didn't load`);
  return full;
}

/** The drives a comparison of `keys` over the trip's own nights calculates, as stored at `at`. */
async function storedRoutes(tables: Tables, trip: Trip, keys: string[], at: string): Promise<StoredDriveEstimate[]> {
  const full = await loaded(tables, trip);
  const candidates = (tables.trip_stay_candidates as Parameters<typeof summarizeCandidate>[1][]).map((row) => summarizeCandidate(trip, row));
  const request = parseComparisonRequest(new URLSearchParams({ options: keys.join(",") }), trip);
  if ("error" in request) throw new Error(request.error);
  const written: StoredDriveEstimate[] = [];
  const result = await compareStays(full, candidates, request, { read: async () => [], write: async (rows) => { written.push(...rows); }, manual: async () => [] },
    { now: Date.parse(at), matrix: fakeMatrix });
  if ("error" in result) throw new Error(result.error);
  return written;
}

async function weekend(): Promise<Tables> {
  const tripId = "qa213-weekend";
  const trip: Trip = { ...SPLIT_TRIP, id: tripId, owner_user_id: "user-alex", name: "Stowe long weekend", status: "live", created_at: CREATED, updated_at: CREATED, lodging_revision: 4 };
  const rows = splitRows();
  const located: Record<string, TripLocation> = { [PINE.id]: PINE_PLACE, [VILLAGE.id]: VILLAGE_PLACE, [LODGE.id]: LODGE_PLACE };
  const stays = rows.stays.map((stay) => ({ ...stay, trip_id: tripId, location: located[stay.id],
    booking_status: stay.id === VILLAGE.id ? "not_booked" : "booked",
    property_url: stay.id === PINE.id ? "https://example.com/qa213/pine-rental" : null }));
  const stowe = uuid("5d", 1), smuggs = uuid("5d", 2);
  const tables: Tables = {
    trips: [trip],
    trip_members: members(tripId),
    trip_stops: [
      stop(tripId, stowe, 0, "Stowe Mountain Resort, Vermont", 44.53, -72.78, SPRUCE_LOT),
      stop(tripId, smuggs, 1, "Smugglers' Notch Resort, Vermont", 44.588, -72.79, SMUGGS_LOT),
    ],
    trip_days: [
      dayRow(tripId, uuid("3d", 1), FRI, stowe, "Travel", { no_drive: true }),
      dayRow(tripId, uuid("3d", 2), SAT, stowe, "Alpine"),
      dayRow(tripId, uuid("3d", 3), SUN, smuggs, "Alpine"),
      dayRow(tripId, uuid("3d", 4), MON, stowe, "Alpine"),
    ],
    trip_stays: stays,
    trip_member_lodging_nights: rows.assignments.map((night) => ({ ...night, trip_id: tripId })),
    trip_member_attendance: rows.attendance.map((entry) => ({ ...entry, trip_id: tripId })),
    trip_stay_candidates: [
      option(tripId, OPTIONS.ridge, "Ridge chalet", RIDGE, [FRI, MON], { cost_amount: 1260, cost_currency: "USD",
        address: "12 Ridge Road, Stowe (fictional)", notes: "Hot tub. Sleeps 8. Fictional fixture." }),
      option(tripId, OPTIONS.brook, "Brook inn", BROOK, [FRI, SUN], { cost_amount: 900.5, cost_currency: "CAD" }),
      option(tripId, OPTIONS.long, LONG_NAME, LONG, [SAT, "2026-10-13"]),
      option(tripId, OPTIONS.hilltop, "Hilltop barn", HILLTOP, [FRI, MON]),
      option(tripId, OPTIONS.notch, "Notch cabin", null, [FRI, MON]),
      option(tripId, OPTIONS.town, "Town apartment", TOWN, null),
      option(tripId, OPTIONS.gondola, "Gondola condo", GONDOLA, [FRI, MON]),
    ],
    trip_stay_candidate_routes: [],
    trip_member_day_origins: [], trip_day_tour_plans: [], trip_conditions_sources: [], trip_day_conditions_sources: [], trip_conditions_reviews: [],
    trip_day_checks: [], trip_member_packing: [], trip_drive_estimates: [], trip_drive_manual_estimates: [], trip_member_day_kits: [], trip_group_gear: [],
  };
  const now = FIXTURE_TRIPS[tripId].now;
  const hoursAgo = (hours: number) => new Date(Date.parse(now) - hours * 3_600_000).toISOString();
  const key = (kind: "stay" | "candidate", id: string) => `${kind}:${id}`;
  const fresh = [
    ...await storedRoutes(tables, trip, [key("candidate", OPTIONS.ridge), key("candidate", OPTIONS.brook), key("candidate", OPTIONS.long)], hoursAgo(2)),
    ...await storedRoutes(tables, trip, [key("stay", PINE.id), key("stay", VILLAGE.id), key("stay", LODGE.id)], hoursAgo(2)),
  ];
  // Calculated eight days ago: more than a week, so it's due again, and the provider is down.
  const stale = (await storedRoutes(tables, trip, [key("candidate", OPTIONS.gondola), key("candidate", OPTIONS.ridge)], hoursAgo(8 * 24)))
    .filter((row) => row.origin_label === GONDOLA.label);
  tables.trip_stay_candidate_routes = [...fresh, ...stale].map((row) => ({ trip_id: tripId, route_key: row.route_key, origin_label: row.origin_label,
    destination_label: row.destination_label, status: row.status, duration_seconds: row.duration_seconds, distance_meters: row.distance_meters,
    calculated_at: row.calculated_at, provider: "geoapify" }));
  return tables;
}

function one(): Tables {
  const tripId = "qa213-one";
  const trip: Trip = { ...SPLIT_TRIP, id: tripId, owner_user_id: "user-alex", name: "Stowe Saturday", start_date: FRI, end_date: SUN, status: "live", created_at: CREATED, updated_at: CREATED, lodging_revision: 1 };
  const stowe = uuid("5e", 1);
  const people = [ALEX.id, BLAIR.id];
  return {
    trips: [trip],
    trip_members: members(tripId, people),
    trip_stops: [stop(tripId, stowe, 0, "Stowe Mountain Resort, Vermont", 44.53, -72.78, SPRUCE_LOT)],
    trip_days: [dayRow(tripId, uuid("3e", 1), FRI, stowe, "Travel", { no_drive: true }), dayRow(tripId, uuid("3e", 2), SAT, stowe, "Alpine"), dayRow(tripId, uuid("3e", 3), SUN, stowe, "Alpine")],
    trip_stays: [{ ...PINE, trip_id: tripId, location: PINE_PLACE }],
    trip_member_lodging_nights: people.flatMap((memberId) => [FRI, SAT].map((date) => ({ trip_id: tripId, member_id: memberId, date, stay_id: PINE.id, status: "assigned" }))),
    trip_member_attendance: [], trip_stay_candidates: [], trip_stay_candidate_routes: [],
  };
}

/** Every fixture trip's tables, keyed by trip id. Each trip is its own database. */
export async function buildFixtureDatabase(): Promise<Record<FixtureTripId, Tables>> {
  return { "qa213-weekend": await weekend(), "qa213-one": one() };
}

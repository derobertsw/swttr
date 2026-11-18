/**
 * Fixture database for the #337 browser validation: the two reference
 * journeys from #329 as the rows the API reads, so the real route handlers
 * (and loadTripFull, tripFullFor, the drive, focus, checklist and packing
 * builders) produce every response. Everything here is fictional.
 *
 * - qa337-downhill (Downhill skiing, stored as "Alpine"): Fri Oct 9 – Mon Oct 12 2026, six people (src/test/splitStays.ts):
 *   Pine rental (3) and Village hotel (2) Fri and Sat, Casey arriving Saturday
 *   evening and skipping Saturday, everyone in the Mountain lodge Sun and Mon.
 *   Saturday at Stowe, Sunday at Smugglers' Notch. Eli starts Sunday from a
 *   park and ride. Sunday's forecast and the Village hotel → Smuggs drive fail.
 * - qa337-backcountry: Fri Jan 8 – Mon Jan 11 2027: a rental and an inn on
 *   Friday night, one trailhead Saturday, a ski-in hut Saturday and Sunday
 *   nights (Sunday is No drive planned), a Monday drive out from the hut with
 *   no road route. Tour plans, three official sources (one current review,
 *   one stale, one absent), day checks, personal equipment and shared items.
 * - qa337-downhill-long: the downhill trip with long names.
 * - qa337-solo: one person, two days.
 *
 * Each trip has a fixed "now" (see `FIXTURE_TRIPS`) that the API server and
 * the browser both use, so forecast windows, the focus day and estimate ages
 * come out the same on every run.
 */
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, LODGE, MON, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, splitRows, SUN, VILLAGE } from "@/test/splitStays";
import { LODGE_PLACE, PINE_PLACE, place, SMUGGS_LOT, SPRUCE_LOT, VILLAGE_PLACE } from "@/test/driveTrip";
import { loadTripFull } from "@/lib/trips";
import { departurePlans } from "@/lib/trip-drive";
import { conditionsContext } from "@/lib/trip-conditions";
import { dayCheckContext, planReviewContext } from "@/lib/trip-day-checks";
import { sharedTouringGearId } from "@/lib/trip-shared-touring";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, TripConditionsSource, TripDay, TripFull, TripLocation, TripStay, TripStop } from "@/types/trips";

type Row = object;
export type Tables = Record<string, Row[]>;

const ZONE = "America/New_York";
const CREATED = "2026-09-28T12:00:00Z";
const uuid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USERS: Record<string, string | null> = {
  [ALEX.id]: "user-alex", [BLAIR.id]: "user-blair", [CASEY.id]: "user-casey", [DANA.id]: null, [ELI.id]: "user-eli", [FRAN.id]: null,
};

/** Who the harness signs in as, by Clerk user id. Zoe isn't on any trip. */
export const VIEWERS = { organizer: "user-alex", blair: "user-blair", casey: "user-casey", eli: "user-eli", stranger: "user-zoe", solo: "user-sam" } as const;

export const FIXTURE_TRIPS = {
  "qa337-downhill": { now: "2026-10-10T11:00:00Z", focus: SAT },
  "qa337-downhill-long": { now: "2026-10-10T11:00:00Z", focus: SAT },
  "qa337-backcountry": { now: "2027-01-09T12:00:00Z", focus: "2027-01-09" },
  "qa337-solo": { now: "2026-10-10T11:00:00Z", focus: SAT },
} as const;
export type FixtureTripId = keyof typeof FIXTURE_TRIPS;

const members = (tripId: string, names: Partial<Record<string, string>> = {}) => SPLIT_MEMBERS.map((member) => ({
  ...member, trip_id: tripId, user_id: USERS[member.id], display_name: names[member.id] ?? member.display_name,
  invite_token: member.status === "invited" ? `qa337-invite-${member.id.slice(-2)}` : null,
}));

const stop = (tripId: string, id: string, position: number, name: string, latitude: number, longitude: number, activity: string, accessPoint: TripLocation | null): TripStop =>
  ({ id, trip_id: tripId, position, name, latitude, longitude, activities: [activity], created_at: CREATED, access_point: accessPoint });

const dayRow = (tripId: string, id: string, date: string, stopId: string, activity: string, extra: Partial<TripDay> = {}): TripDay => ({
  id, trip_id: tripId, stop_id: stopId, date, activity, access_point: null, access_point_stop_id: null,
  origin: null, origin_stay_id: null, no_drive: false, meet_time: null, meet_day_offset: 0, meet_time_zone: null, notes: null, ...extra,
});

const kitRow = (tripId: string, dayId: string, memberId: string, items: string[], state: "ok" | "warn" = "ok") =>
  ({ id: `kit-${memberId.slice(-2)}-${dayId.slice(-2)}`, trip_id: tripId, trip_day_id: dayId, trip_member_id: memberId, effort: "steady", items, note: null, state,
    updated_at: "2026-10-08T20:00:00Z", outfit: null, outfit_saved_at: null });

const gearRow = (tripId: string, id: string, description: string, sort: number, assignee: string | null, extra: Row = {}) => ({
  id, trip_id: tripId, description, assignee_member_id: assignee, sort_order: sort, created_at: CREATED, revision: uuid("9e", sort + 1),
  accepted_at: null, accepted_by: null, packed_at: null, packed_by: null, assigned_at: assignee ? CREATED : null, assigned_by: assignee ? "user-alex" : null, ...extra,
});

const storedDrive = (date: string, routeKey: string, origin: string, destination: string, status: "ok" | "no_route", minutes: number | null, km: number | null, at: string) => ({
  trip_id: "", date, route_key: routeKey, origin_label: origin, destination_label: destination, status,
  duration_seconds: minutes === null ? null : minutes * 60, distance_meters: km === null ? null : km * 1000, calculated_at: at, provider: "geoapify",
});

/** The trip as loadTripFull reads it from `tables`. */
async function loaded(tables: Tables, trip: Trip): Promise<TripFull> {
  const fake = createFakeSupabase(structuredClone(tables) as Parameters<typeof createFakeSupabase>[0]);
  const full = await loadTripFull(fake as unknown as SupabaseClient, trip);
  if (!full) throw new Error(`Fixture trip ${trip.id} didn't load`);
  return full;
}

/** A departure's route key on a day, by the place it leaves from. */
function routeKey(full: TripFull, date: string, originLabel: string): string {
  const plan = departurePlans(full).flat().find((entry) => entry.date === date && entry.origin?.label === originLabel);
  if (!plan?.route_key) throw new Error(`No ${originLabel} departure on ${date}`);
  return plan.route_key;
}

const hoursBefore = (iso: string, hours: number) => new Date(Date.parse(iso) - hours * 3_600_000).toISOString();

// ---------------------------------------------------------------- downhill

const DOWNHILL_DAYS = { [FRI]: uuid("3d", 1), [SAT]: uuid("3d", 2), [SUN]: uuid("3d", 3), [MON]: uuid("3d", 4) };
const STOWE_ID = uuid("5d", 1);
const SMUGGS_ID = uuid("5d", 2);
/** Smugglers' Notch's weather location: the forecast stub fails for it. */
export const FAILING_FORECASTS = [{ latitude: 44.588, longitude: -72.79 }, { latitude: 44.644, longitude: -72.829 }];

async function downhill(tripId: string, names: Partial<Record<string, string>> = {}, stayNames: Partial<Record<string, string>> = {}): Promise<Tables> {
  const trip: Trip = { ...SPLIT_TRIP, id: tripId, owner_user_id: "user-alex", name: names.trip ?? "Stowe long weekend", status: "live", created_at: CREATED, updated_at: CREATED, lodging_revision: 4 };
  const rows = splitRows();
  const located: Record<string, TripLocation> = { [PINE.id]: PINE_PLACE, [VILLAGE.id]: VILLAGE_PLACE, [LODGE.id]: LODGE_PLACE };
  const details: Record<string, Partial<TripStay>> = {
    [PINE.id]: { type: "rental", check_in_time: "16:00", check_out_time: "10:00", notes: "Fictional: door code by text the day before." },
    [VILLAGE.id]: { type: "hotel", check_in_time: "15:00", check_out_time: "11:00" },
    [LODGE.id]: { type: "hotel", check_in_time: "15:00", check_out_time: "11:00" },
  };
  const stays = rows.stays.map((stay) => ({ ...stay, ...details[stay.id], name: stayNames[stay.id] ?? stay.name, trip_id: tripId, location: located[stay.id] }));
  const stops = [
    stop(tripId, STOWE_ID, 0, "Stowe Mountain Resort, Vermont", 44.53, -72.78, "Alpine", SPRUCE_LOT),
    stop(tripId, SMUGGS_ID, 1, "Smugglers' Notch Resort, Vermont", FAILING_FORECASTS[0].latitude, FAILING_FORECASTS[0].longitude, "Alpine", SMUGGS_LOT),
  ];
  const meet = (time: string) => ({ meet_time: `${time}:00`, meet_day_offset: 0 as const, meet_time_zone: ZONE });
  const days = [
    dayRow(tripId, DOWNHILL_DAYS[FRI], FRI, STOWE_ID, "Travel", { notes: "Pine rental check-in from 4 PM, Village hotel from 3 PM. Dinner at the rental at 7." }),
    dayRow(tripId, DOWNHILL_DAYS[SAT], SAT, STOWE_ID, "Alpine", { ...meet("08:30"),
      notes: "Lift tickets: will-call window 3, under Alex's name.\nRentals: Blair and Dana pick up skis at the Spruce Peak shop by 8:15." }),
    dayRow(tripId, DOWNHILL_DAYS[SUN], SUN, SMUGGS_ID, "Alpine", meet("09:00")),
    // Monday's meet time isn't set yet: incomplete details.
    dayRow(tripId, DOWNHILL_DAYS[MON], MON, STOWE_ID, "Alpine"),
  ];
  const tables: Tables = {
    trips: [trip],
    trip_members: members(tripId, names),
    trip_stops: stops,
    trip_days: days,
    trip_member_day_kits: [
      kitRow(tripId, DOWNHILL_DAYS[SAT], ALEX.id, ["shirt", "midlayer", "jacket", "pants", "gloves"]),
      kitRow(tripId, DOWNHILL_DAYS[SAT], ELI.id, ["shell"], "warn"),
      kitRow(tripId, DOWNHILL_DAYS[SAT], DANA.id, ["jacket"]),
    ],
    trip_group_gear: [
      gearRow(tripId, uuid("6d", 1), "Group first aid kit", 0, ALEX.id, { accepted_at: "2026-10-01T12:00:00Z", accepted_by: "user-alex" }),
      gearRow(tripId, uuid("6d", 2), "Ski wax and scraper", 1, BLAIR.id),
      gearRow(tripId, uuid("6d", 3), "Cooler for Sunday lunch", 2, null),
    ],
    trip_stays: stays,
    trip_member_lodging_nights: rows.assignments.map((night) => ({ ...night, trip_id: tripId })),
    trip_member_attendance: rows.attendance.map((entry) => ({ ...entry, trip_id: tripId })),
    trip_member_day_origins: [{ trip_id: tripId, trip_day_id: DOWNHILL_DAYS[SUN], member_id: ELI.id,
      origin: place("Waterbury park and ride", 44.3377, -72.7562), origin_stay_id: null, no_drive: false }],
    trip_day_tour_plans: [], trip_conditions_sources: [], trip_day_conditions_sources: [], trip_conditions_reviews: [],
    trip_day_checks: [], trip_member_packing: [], trip_drive_estimates: [], trip_drive_manual_estimates: [],
  };
  const full = await loaded(tables, trip);
  const now = FIXTURE_TRIPS["qa337-downhill"].now;
  const pine = stayNames[PINE.id] ?? "Pine rental", village = stayNames[VILLAGE.id] ?? "Village hotel", lodge = stayNames[LODGE.id] ?? "Mountain lodge";
  tables.trip_drive_estimates = [
    storedDrive(SAT, routeKey(full, SAT, pine), pine, "Spruce Peak lot", "ok", 14, 9, hoursBefore(now, 2)),
    storedDrive(SAT, routeKey(full, SAT, village), village, "Spruce Peak lot", "ok", 17, 11, hoursBefore(now, 2)),
    storedDrive(SUN, routeKey(full, SUN, pine), pine, "Smuggs lot", "ok", 41, 30, hoursBefore(now, 2)),
    // Village hotel → Smuggs and Eli's park and ride → Smuggs aren't stored, and the provider fails.
    // Monday's was calculated nine days ago: stale, and refreshing it fails too.
    storedDrive(MON, routeKey(full, MON, lodge), lodge, "Spruce Peak lot", "ok", 6, 3, hoursBefore(now, 9 * 24)),
  ].map((row) => ({ ...row, trip_id: tripId }));
  return tables;
}

// ------------------------------------------------------------ backcountry

const BC_TRIP: Trip = {
  id: "qa337-backcountry", owner_user_id: "user-alex", name: "Smugglers' Notch hut tour", start_date: "2027-01-08", end_date: "2027-01-11",
  status: "live", created_at: CREATED, updated_at: CREATED, lodging_revision: 2,
};
const [BC_FRI, BC_SAT, BC_SUN, BC_MON] = ["2027-01-08", "2027-01-09", "2027-01-10", "2027-01-11"];
const BC_DAYS = { [BC_FRI]: uuid("3b", 1), [BC_SAT]: uuid("3b", 2), [BC_SUN]: uuid("3b", 3), [BC_MON]: uuid("3b", 4) };
const NOTCH_ID = uuid("5b", 1);
const JEFF_ID = uuid("5b", 2);
export const TRAILHEAD = place("Sterling Pond trailhead", 44.5551, -72.7953);
const HUT_PLACE = place("Sterling Pond hut", 44.5562, -72.7779);
const JEFF_LOT = place("Jeffersonville park and ride", 44.6436, -72.829);
const SOURCES: TripConditionsSource[] = [
  ["avalanche", "Northern Greens avalanche advisory (fictional)", "Mansfield–Sterling zone"],
  ["weather", "Mountain point forecast (fictional)", "Smugglers' Notch summit"],
  ["access", "State park winter road status (fictional)", "Route 108 through the Notch"],
].map(([category, name, region], index) => ({
  id: uuid("7b", index + 1), trip_id: BC_TRIP.id, category: category as TripConditionsSource["category"], name, region,
  url: `https://example.com/qa337/${category}`, revision: 1, created_by: "user-alex", updated_by: "user-alex", created_at: CREATED, updated_at: CREATED,
}));
const [AVALANCHE, WEATHER, ACCESS] = SOURCES;

const tourPlan = (id: string, dayId: string, plan: Row) => ({
  id, trip_id: BC_TRIP.id, trip_day_id: dayId, route_url: null, distance: null, distance_unit: null, ascent: null, ascent_unit: null,
  duration_minutes: null, metrics_source: null, metrics_source_url: null, approach_notes: null, access_notes: null, access_url: null,
  backup_plan: null, return_time: null, return_day_offset: 0, checkin_notes: null, pickup_notes: null, time_zone: ZONE, revision: 1,
  created_by: "user-alex", updated_by: "user-alex", created_at: CREATED, updated_at: "2027-01-06T21:00:00Z", ...plan,
});

/** Blair's and Alex's own touring equipment: transceiver, probe, shovel and skins. */
const equipment = (addedAt: string) => Object.fromEntries(["transceiver", "probe", "shovel", "skins"].map((id) => [id, { status: "added", quantity: 1, added_at: addedAt }]));
const packed = (...ids: string[]) => Object.fromEntries(ids.map((id, index) => [`equipment:${id}`, { packed: true, quantity: 1, version: uuid("8b", index + 1) }]));

async function backcountry(): Promise<Tables> {
  const tripId = BC_TRIP.id;
  const stay = (id: string, name: string, type: TripStay["type"], checkIn: string, checkOut: string, location: TripLocation, extra: Partial<TripStay> = {}): TripStay => ({
    id, trip_id: tripId, name, check_in: checkIn, check_out: checkOut, type, address: null, property_url: null, check_in_time: null, check_out_time: null,
    notes: null, booking_status: "booked", location, created_at: CREATED, updated_at: CREATED, ...extra,
  });
  const RIDGE = stay(uuid("2b", 1), "Ridge rental", "rental", BC_FRI, BC_SAT, place("Ridge rental", 44.6005, -72.8102), { check_in_time: "16:00", check_out_time: "07:00" });
  const INN = stay(uuid("2b", 2), "Notch Brook inn", "hotel", BC_FRI, BC_SAT, place("Notch Brook inn", 44.5402, -72.7701), { check_out_time: "07:00" });
  const HUT = stay(uuid("2b", 3), "Sterling Pond hut", "hut", BC_SAT, BC_MON, HUT_PLACE,
    { notes: "Ski-in only: no road access. Fictional key code arrives by text on Friday.", check_in_time: "14:00", check_out_time: "09:00" });
  const night = (member: string, date: string, stayId: string | null) =>
    ({ trip_id: tripId, member_id: member, date, stay_id: stayId, status: stayId ? "assigned" : "no_stay" });
  const nights = [
    ...[ALEX, BLAIR, DANA].map((member) => night(member.id, BC_FRI, RIDGE.id)),
    ...[CASEY, ELI, FRAN].map((member) => night(member.id, BC_FRI, INN.id)),
    ...SPLIT_MEMBERS.flatMap((member) => [night(member.id, BC_SAT, HUT.id), night(member.id, BC_SUN, HUT.id), night(member.id, BC_MON, null)]),
  ];
  const meet = (time: string) => ({ meet_time: `${time}:00`, meet_day_offset: 0 as const, meet_time_zone: ZONE });
  const days = [
    dayRow(tripId, BC_DAYS[BC_FRI], BC_FRI, NOTCH_ID, "Travel", { notes: "Arrive by 9 PM. Transceiver and probe check at the Ridge rental at 8 PM." }),
    dayRow(tripId, BC_DAYS[BC_SAT], BC_SAT, NOTCH_ID, "Backcountry", meet("07:30")),
    // From the hut on skis: No drive planned, and the crew meets at the hut.
    dayRow(tripId, BC_DAYS[BC_SUN], BC_SUN, NOTCH_ID, "Backcountry", { ...meet("08:00"), no_drive: true, access_point: HUT_PLACE, access_point_stop_id: NOTCH_ID }),
    dayRow(tripId, BC_DAYS[BC_MON], BC_MON, JEFF_ID, "Travel", { notes: "Ski out by 10 AM; cars stay at the trailhead lot." }),
  ];
  const tables: Tables = {
    trips: [BC_TRIP],
    trip_members: members(tripId),
    trip_stops: [
      stop(tripId, NOTCH_ID, 0, "Smugglers' Notch, Vermont", 44.555, -72.795, "Backcountry", TRAILHEAD),
      stop(tripId, JEFF_ID, 1, "Jeffersonville, Vermont", FAILING_FORECASTS[1].latitude, FAILING_FORECASTS[1].longitude, "Travel", JEFF_LOT),
    ],
    trip_days: days,
    trip_member_day_kits: [kitRow(tripId, BC_DAYS[BC_SAT], ALEX.id, ["shirt", "midlayer", "shell", "pants", "gloves"])],
    trip_group_gear: [
      gearRow(tripId, sharedTouringGearId(tripId, "first_aid"), "Group first aid kit", 0, ALEX.id,
        { accepted_at: "2027-01-02T12:00:00Z", accepted_by: "user-alex", packed_at: "2027-01-07T22:00:00Z", packed_by: "user-alex" }),
      gearRow(tripId, sharedTouringGearId(tripId, "repair_kit"), "Repair kit", 1, BLAIR.id, { accepted_at: "2027-01-03T12:00:00Z", accepted_by: "user-blair" }),
      gearRow(tripId, sharedTouringGearId(tripId, "group_shelter"), "Group shelter", 2, null),
    ],
    trip_stays: [RIDGE, INN, HUT],
    trip_member_lodging_nights: nights,
    trip_member_attendance: [],
    trip_member_day_origins: [],
    trip_day_tour_plans: [
      tourPlan(uuid("4b", 1), BC_DAYS[BC_SAT], {
        objective: "Sterling Pond to Madonna Peak, then the hut", route_url: "https://example.com/qa337/route",
        distance: 9.5, distance_unit: "km", ascent: 850, ascent_unit: "m", duration_minutes: 330,
        approach_notes: "Skin 2.5 km up the Sterling Pond trail from the trailhead to the hut first, and leave overnight packs there.",
        access_notes: "Fictional: Route 108 is closed in winter past the trailhead lot. Park only in the plowed spaces.",
        backup_plan: "If avalanche danger is Considerable or higher on north aspects, ski the lower-angle glades below Sterling Pond and be back at the hut by 2 PM.",
        return_time: "15:30:00", checkin_notes: "Text Alex from the hut by 3:30 PM. If there's no word by 5 PM, Eli calls the (fictional) rescue line.",
        revision: 3,
      }),
      // Sunday's plan has no return time yet: incomplete details.
      tourPlan(uuid("4b", 2), BC_DAYS[BC_SUN], {
        objective: "Hut loop to Spruce Peak north glades", backup_plan: "Tree skiing beside the hut if visibility drops.",
      }),
    ],
    trip_conditions_sources: SOURCES,
    trip_day_conditions_sources: [
      ...[AVALANCHE, WEATHER, ACCESS].map((source, index) => ({ trip_id: tripId, trip_day_id: BC_DAYS[BC_SAT], source_id: source.id, created_at: `2027-01-05T12:0${index}:00Z` })),
      ...[AVALANCHE, WEATHER].map((source, index) => ({ trip_id: tripId, trip_day_id: BC_DAYS[BC_SUN], source_id: source.id, created_at: `2027-01-05T12:1${index}:00Z` })),
    ],
    trip_conditions_reviews: [],
    trip_day_checks: [],
    trip_member_packing: [
      { trip_id: tripId, trip_member_id: BLAIR.id, items: [], quantities: {}, seen: null, checks: packed("transceiver", "probe"), equipment: equipment("2027-01-04T20:00:00Z") },
      { trip_id: tripId, trip_member_id: ALEX.id, items: [], quantities: {}, seen: null, checks: packed("transceiver", "probe", "shovel", "skins"), equipment: equipment("2027-01-03T20:00:00Z") },
    ],
    trip_drive_estimates: [],
    trip_drive_manual_estimates: [],
  };

  const full = await loaded(tables, BC_TRIP);
  const now = FIXTURE_TRIPS["qa337-backcountry"].now;
  const day = (date: string) => full.days.find((entry) => entry.date === date)!;
  const current = conditionsContext(full, day(BC_SAT), AVALANCHE);
  const review = (n: number, user: string, source: TripConditionsSource, at: string, context: Row) => ({
    id: uuid("ab", n), entry_number: n, trip_id: tripId, trip_day_id: BC_DAYS[BC_SAT], source_id: source.id, user_id: user,
    action: "reviewed", note: null, reviewed_at: at, created_at: at, context,
  });
  tables.trip_conditions_reviews = [
    // Blair: avalanche current, weather recorded against Thursday's route (stale), access never reviewed.
    review(1, "user-blair", AVALANCHE, "2027-01-08T23:10:00Z", current),
    review(2, "user-blair", WEATHER, "2027-01-07T22:00:00Z",
      { ...conditionsContext(full, day(BC_SAT), WEATHER), route: { objective: "Sterling Pond only", route_url: null } }),
    review(3, "user-alex", AVALANCHE, "2027-01-09T11:15:00Z", current),
  ];
  const packing = tables.trip_member_packing as Array<{ trip_member_id: string; equipment: Parameters<typeof dayCheckContext>[3] }>;
  const equipmentOf = (memberId: string) => packing.find((row) => row.trip_member_id === memberId)?.equipment;
  const check = (n: number, member: string, kind: "plan_review" | "transceiver", by: string, at: string, revision: number | null, context?: Row) => ({
    id: uuid("cb", n), entry_number: n, trip_id: tripId, trip_day_id: BC_DAYS[BC_SAT], trip_member_id: member, kind, action: "recorded", recorded_by: by,
    context: context ?? dayCheckContext(kind, full, day(BC_SAT), equipmentOf(member)), plan_revision: revision, time_zone: ZONE, created_at: at,
  });
  const reviewed = planReviewContext(full, day(BC_SAT));
  tables.trip_day_checks = [
    check(1, ALEX.id, "plan_review", "user-alex", "2027-01-08T23:00:00Z", 3),
    check(2, ALEX.id, "transceiver", "user-alex", "2027-01-09T11:00:00Z", null),
    check(3, BLAIR.id, "plan_review", "user-blair", "2027-01-08T23:20:00Z", 3),
    // Recorded by the organizer for the managed guest.
    check(4, DANA.id, "plan_review", "user-alex", "2027-01-08T23:30:00Z", 3),
    // Eli reviewed before the backup plan changed.
    check(5, ELI.id, "plan_review", "user-eli", "2027-01-07T20:00:00Z", 2,
      { ...reviewed, plan: { ...reviewed.plan!, backup_plan: "Lower glades if it's windy." } }),
  ];
  tables.trip_drive_estimates = [
    storedDrive(BC_SAT, routeKey(full, BC_SAT, "Ridge rental"), "Ridge rental", TRAILHEAD.label, "ok", 19, 13, hoursBefore(now, 3)),
    // Notch Brook inn → trailhead isn't stored and the provider fails. Monday leaves the ski-in hut: no road route.
    storedDrive(BC_MON, routeKey(full, BC_MON, "Sterling Pond hut"), "Sterling Pond hut", JEFF_LOT.label, "no_route", null, null, hoursBefore(now, 3)),
  ].map((row) => ({ ...row, trip_id: tripId }));
  return tables;
}

// ------------------------------------------------------------------- solo

function solo(): Tables {
  const tripId = "qa337-solo";
  const trip: Trip = { id: tripId, owner_user_id: "user-sam", name: "Solo day at Stowe", start_date: SAT, end_date: SUN, status: "live", created_at: CREATED, updated_at: CREATED, lodging_revision: 0 };
  const stowe = stop(tripId, uuid("5e", 1), 0, "Stowe Mountain Resort, Vermont", 44.53, -72.78, "Alpine", SPRUCE_LOT);
  return {
    trips: [trip],
    trip_members: [{ id: uuid("1e", 1), trip_id: tripId, user_id: "user-sam", display_name: "Sam", role: "organizer", status: "joined", invite_token: null, created_at: CREATED }],
    trip_stops: [stowe],
    trip_days: [dayRow(tripId, uuid("3e", 1), SAT, stowe.id, "Alpine", { meet_time: "09:00:00", meet_day_offset: 0, meet_time_zone: ZONE }), dayRow(tripId, uuid("3e", 2), SUN, stowe.id, "Alpine")],
  };
}

const LONG_NAMES: Record<string, string> = {
  trip: "Stowe and Smugglers' Notch long weekend with the whole extended crew",
  [ALEX.id]: "Alexandria Montgomery-Fitzwilliam", [BLAIR.id]: "Blair Featherstonehaugh-Okonkwo", [CASEY.id]: "Casey Wolfeschlegelsteinhausen",
  [DANA.id]: "Dana Vanderbilt-Castellanos de la Vega", [ELI.id]: "Eliezer Papadopoulos-Nakamura", [FRAN.id]: "Francesca Bartholomew-Ashworth",
};
const LONG_STAYS: Record<string, string> = {
  [PINE.id]: "Pine Ridge Mountain Rental Cottage on Upper Mountain Road",
  [VILLAGE.id]: "The Village Hotel and Conference Center at Stowe",
  [LODGE.id]: "Mountain Lodge at Spruce Peak Village Residences",
};

/** Every fixture trip's tables, keyed by trip id. Each trip is its own database. */
export async function buildFixtureDatabase(): Promise<Record<FixtureTripId, Tables>> {
  return {
    "qa337-downhill": await downhill("qa337-downhill"),
    "qa337-downhill-long": await downhill("qa337-downhill-long", LONG_NAMES, LONG_STAYS),
    "qa337-backcountry": await backcountry(),
    "qa337-solo": solo(),
  };
}

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { drivePlans, type StoredDriveEstimate } from "@/lib/trip-drive";
import { tripDriveEstimates, type ManualEstimateRow } from "@/lib/trip-drive-estimates";
import { projectTripMap } from "@/lib/trip-map";
import { buildLodging } from "@/lib/trip-lodging";
import { buildDayMeets } from "@/lib/trip-meets";
import { buildTourPlanSummary } from "@/lib/trip-tour-plans";
import { driveTrip, driveStay, MOTEL, place, splitDriveTrip } from "@/test/driveTrip";
import { PINE, VILLAGE } from "@/test/splitStays";
import type { TripFull, TripTourPlan, TripTourPlanSummary } from "@/types/trips";

const SAT = "2027-01-09", SUN = "2027-01-10";
const NOW = Date.parse("2027-01-07T12:00:00Z");
const stayId = (id: string) => `stay:${id}:location`;
async function mapFor(full = driveTrip(), rows: StoredDriveEstimate[] = [], manual: ManualEstimateRow[] = [], date: string | null = null, now = NOW) {
  const write = vi.fn(), matrix = vi.fn();
  const estimates = await tripDriveEstimates(full, { read: async () => rows, write, manual: async () => manual }, { now, matrix, refresh: false });
  expect(matrix).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  return projectTripMap(full, estimates, date);
}
function stored(full: TripFull, date = SAT, status: "ok" | "no_route" = "ok"): StoredDriveEstimate {
  const plan = drivePlans(full).find((day) => day.date === date)!;
  return { date, route_key: plan.route_key!, origin_label: plan.origin!.label, destination_label: plan.destination!.label, status,
    duration_seconds: status === "ok" ? 1800 : null, distance_meters: status === "ok" ? 24000 : null, calculated_at: new Date(NOW).toISOString() };
}

describe("Trip map projection", () => {
  it("lists each departure with its own origin place, people and route revision (#333)", async () => {
    const full = splitDriveTrip();
    const map = await mapFor(full, [], [], "2026-10-10", Date.parse("2026-10-05T12:00:00Z"));
    const [saturday] = map.days;
    expect(saturday.departures.map((departure) => [departure.label, departure.crew, departure.origin_place_id, departure.drive.state,
      departure.people.map((person) => `${person.name}${person.pending ? " (pending)" : ""}`)])).toEqual([
      ["Pine rental", true, stayId(PINE.id), "unavailable", ["Alex", "Blair", "Dana"]],
      ["Village hotel", false, stayId(VILLAGE.id), "unavailable", ["Eli", "Fran (pending)"]],
    ]);
    // The crew's departure is the day's own drive and line; the hotel's is separate and not requested.
    expect(saturday.departures[0].geometry).toEqual(saturday.geometry);
    expect(saturday.departures[1].geometry).toMatchObject({ state: "unavailable", reason: "not_requested", origin_place_id: stayId(VILLAGE.id) });
    expect(saturday.departures[1].geometry.revision).not.toBe(saturday.geometry.revision);
    expect(saturday.drive).not.toHaveProperty("departures");
    // Both stays are on the day's map as starting points.
    expect(map.places.find((entry) => entry.id === stayId(VILLAGE.id))?.visits).toContainEqual(expect.objectContaining({ date: "2026-10-10", role: "origin" }));
  });
  it("keeps checkout morning separate from tonight and reuses one stay marker across roles/dates", async () => {
    const map = await mapFor();
    const moving = map.days.find((day) => day.date === SUN)!;
    expect(moving).toMatchObject({ origin_place_id: stayId("stay-motel"), tonight_place_id: stayId("stay-inn"), starting_from: "Stowe Motel", staying_tonight: "Village Inn" });
    const motel = map.places.find((entry) => entry.id === stayId("stay-motel"))!;
    expect(motel.roles).toEqual(["stay", "origin"]);
    expect(motel.nights).toEqual(["2027-01-08", SAT]);
    expect(motel.night_range).toEqual({ check_in: "2027-01-08", check_out: SUN });
    expect(motel.visits.filter((visit) => visit.role === "origin").map((visit) => visit.date)).toEqual([SAT, SUN]);
    expect(map.places.filter((entry) => entry.id === motel.id)).toHaveLength(1);
    expect(map.places.find((entry) => entry.id === stayId("stay-inn"))).toMatchObject({ mapping: "missing_coordinates", coordinates: null });
  });
  it("preserves repeated visits and co-located entities as distinct source identities", async () => {
    const map = await mapFor();
    const stops = map.places.filter((entry) => entry.source.slot === "destination");
    expect(stops).toHaveLength(2);
    expect(stops[0].coordinates).toEqual(stops[1].coordinates);
    expect(stops[0].id).not.toBe(stops[1].id);
    expect(stops[0].precision).toBe("unknown");
    expect(stops[0].provenance).toBeNull();
    expect(stops[0].visits.map((visit) => visit.date)).toEqual(["2027-01-08", SAT]);
  });
  it("resolves first-day origins and overrides without changing the shared access point", async () => {
    const full = driveTrip();
    full.days[0].origin = place("Home", 0, 0);
    full.days[1] = { ...full.days[1], origin: MOTEL, origin_stay_id: "stay-inn", access_point: place("East lot", 44.5, -72.8), access_point_stop_id: full.stops[0].id };
    const map = await mapFor(full);
    expect(map.days[0]).toMatchObject({ origin_place_id: `day:${full.days[0].id}:origin`, drive: { state: "unavailable", origin: { own: true } } });
    expect(map.days[1]).toMatchObject({ origin_place_id: stayId("stay-inn"), access_place_id: `day:${full.days[1].id}:access_point`, drive: { state: "origin_not_located" } });
    expect(map.days[0].access_place_id).toBe(`stop:${full.stops[0].id}:access_point`);
    expect(full.stops[0].access_point?.label).toBe("Spruce Peak lot");
  });
  it("includes the dated crew stay in a scoped moving day with its own origin", async () => {
    const full = driveTrip();
    full.days[2].origin = place("Own starting point", 44, -73);
    const map = await mapFor(full, [], [], SUN);
    const day = map.days[0];
    expect(day).toMatchObject({ origin_place_id: `day:${full.days[2].id}:origin`, crew_stay_place_id: stayId("stay-motel"), tonight_place_id: stayId("stay-inn") });
    const crewStay = map.places.find((entry) => entry.id === day.crew_stay_place_id);
    expect(crewStay?.visits).toContainEqual({ date: SUN, day_id: day.id, role: "stay" });
    expect(crewStay?.nights).toEqual(["2027-01-08", SAT]);
    const placeIds = new Set(map.places.map((entry) => entry.id));
    for (const reference of [day.destination_place_id, day.origin_place_id, day.access_place_id, day.tonight_place_id, day.crew_stay_place_id, day.meeting_place_id]) {
      if (reference) expect(placeIds.has(reference)).toBe(true);
    }
  });
  it("revises an overridden day's crew-stay location without invalidating its unchanged drive", async () => {
    const full = driveTrip();
    full.days[2].origin = place("Own starting point", 44, -73);
    const before = await mapFor(full, [], [], SUN);
    full.lodging!.stays.find((stay) => stay.id === "stay-motel")!.location = { ...MOTEL, longitude: -72.8 };
    const after = await mapFor(full, [], [], SUN);
    expect(after.places.find((entry) => entry.id === stayId("stay-motel"))?.coordinates?.longitude).toBe(-72.8);
    expect(after.days[0].revision).not.toBe(before.days[0].revision);
    expect(after.revision).not.toBe(before.revision);
    expect(before.days[0].geometry.revision).not.toBeNull();
    expect(after.days[0].geometry.revision).toBe(before.days[0].geometry.revision);
  });
  it("ignores a day access override left over from a previous destination", async () => {
    const full = driveTrip();
    full.days[1].access_point = place("Old lot", 10, 10);
    full.days[1].access_point_stop_id = "removed-stop";
    const map = await mapFor(full);
    expect(map.days[1].access_place_id).toBe(`stop:${full.stops[0].id}:access_point`);
    expect(map.places.some((entry) => entry.name === "Old lot")).toBe(false);
  });
  it.each([
    [null, null, "missing_coordinates"], [null, 0, "invalid_coordinates"], [NaN, 0, "invalid_coordinates"],
    [91, 0, "invalid_coordinates"], [0, -181, "invalid_coordinates"], [0, 0, "mapped"], [0, -72, "mapped"], [44, 0, "mapped"],
  ] as const)("distinguishes latitude %s longitude %s as %s", async (latitude, longitude, mapping) => {
    const full = driveTrip();
    full.stops[0] = { ...full.stops[0], latitude, longitude };
    const map = await mapFor(full);
    const entry = map.places.find((place) => place.id === `stop:${full.stops[0].id}:destination`)!;
    expect(entry.mapping).toBe(mapping);
    expect(entry.coordinates).toEqual(mapping === "mapped" ? { latitude, longitude } : null);
  });
  it("labels approximate points and withholds directions for them or invalid endpoints", async () => {
    const full = driveTrip();
    full.stops[0].access_point = place("Stowe area", 44.5, -72.7, "approximate");
    let map = await mapFor(full);
    expect(map.days[1].drive).toMatchObject({ state: "approximate_access_point", directions: null });
    expect(map.places.find((entry) => entry.name === "Stowe area")).toMatchObject({ precision: "approximate", mapping: "mapped" });
    full.stops[0].access_point = place("Invalid saved point", 99, 0);
    map = await mapFor(full);
    expect(map.days[1].drive.directions).toBeNull();
    expect(map.days[1].geometry.state).toBe("not_applicable");
  });
  it("excludes candidate stays while preserving an explicitly selected stay origin", async () => {
    const full = driveTrip();
    const candidate = driveStay("candidate", "Maybe hotel", SAT, SUN, MOTEL);
    full.lodging = buildLodging(full.trip, [...full.lodging!.stays, candidate], full.lodging!.assignments);
    expect((await mapFor(full)).places.some((entry) => entry.name === candidate.name)).toBe(false);
    full.days[0] = { ...full.days[0], origin: MOTEL, origin_stay_id: candidate.id };
    expect((await mapFor(full)).places.find((entry) => entry.name === candidate.name)).toMatchObject({ roles: ["stay", "origin"] });
  });
  it("keeps No drive planned, No stay needed and dates without places", async () => {
    const full = driveTrip();
    full.days[1].no_drive = true;
    full.lodging = buildLodging(full.trip, full.lodging!.stays, [{ trip_id: full.trip.id, date: SAT, stay_id: null, status: "no_stay" }]);
    const map = await mapFor(full);
    expect(map.days[1]).toMatchObject({ drive: { state: "no_drive" }, tonight_status: "no_stay", tonight_place_id: null, staying_tonight: "No stay needed" });
    expect(map.days[2].drive.state).toBe("missing_origin");
    const empty = driveTrip({ stops: [], days: [], stays: [] });
    const selected = await mapFor(empty, [], [], SAT);
    expect(selected).toMatchObject({ counts: { total: 0, mapped: 0 }, places: [], days: [{ date: SAT, drive: { state: "no_destination" } }] });
    expect(selected.dates).toHaveLength(4);
  });
  it("keeps a date without a saved day row selectable without assigning destination/access places", async () => {
    const full = driveTrip();
    full.days = full.days.filter((day) => day.date !== SAT);
    const map = await mapFor(full, [], [], SAT);
    expect(map.days[0]).toMatchObject({ id: `date:${SAT}`, destination_place_id: null, access_place_id: null, drive: { state: "no_destination" } });
    expect(map.dates).toHaveLength(4);
  });
  it("retains the deleted stay origin snapshot without exposing or resolving its old ID", async () => {
    const full = driveTrip();
    full.days[0] = { ...full.days[0], origin: MOTEL, origin_stay_id: "deleted-or-foreign-stay" };
    const map = await mapFor(full);
    expect(map.days[0].origin_place_id).toBe(`day:${full.days[0].id}:origin`);
    expect(JSON.stringify(map)).not.toContain("deleted-or-foreign-stay");
  });
  it("reports cached/manual/stale/no-route states without a provider call or a made-up line", async () => {
    const full = driveTrip();
    const row = stored(full);
    expect((await mapFor(full, [row])).days[1]).toMatchObject({ drive: { state: "available", source: "geoapify", estimate: { duration_label: "30 min" } }, geometry: { state: "unavailable", reason: "not_requested" } });
    expect((await mapFor(full, [row], [], null, NOW + 8 * 86400000)).days[1].drive.state).toBe("stale");
    expect((await mapFor(full, [stored(full, SAT, "no_route")])).days[1].drive.state).toBe("no_route");
    const manual: ManualEstimateRow = { trip_day_id: full.days[1].id, pair_key: drivePlans(full)[1].pair_key!, duration_seconds: 2400,
      origin_label: "Stowe Motel", destination_label: "Spruce Peak lot", entered_at: new Date(NOW).toISOString(), use_calculated: false, note: "Road conditions" };
    expect((await mapFor(full, [], [manual])).days[1].drive).toMatchObject({ state: "manual", source: "manual", manual: { duration_label: "40 min", current: true } });
    expect((await mapFor(full, [stored(full, SAT, "no_route")], [], null, NOW + 8 * 86400000)).days[1].drive.state).toBe("unavailable");
  });
  it("invalidates old endpoint estimates and route revisions while retaining pair-labelled previous details", async () => {
    const full = driveTrip();
    const row = stored(full);
    const before = await mapFor(full, [row]);
    full.days[1].origin = place("New origin", 44, -73);
    const after = await mapFor(full, [row]);
    expect(after.revision).not.toBe(before.revision);
    expect(after.days[1].geometry.revision).not.toBe(before.days[1].geometry.revision);
    expect(after.days[1].drive).toMatchObject({ state: "unavailable", estimate: null, previous: { origin_label: "Stowe Motel", duration_label: "30 min" } });
    expect(after.days[1].drive.directions?.google).toContain("origin=44,-73");
  });
  it("keeps scope revisions stable across selection/age labels, with all dates available", async () => {
    const full = driveTrip();
    const row = stored(full);
    const all = await mapFor(full, [row]);
    const selected = await mapFor(full, [row], [], SAT, NOW + 120000);
    expect(selected.revision).toBe(all.revision);
    expect(selected.scope.date).toBe(SAT);
    expect(selected.days).toHaveLength(1);
    expect(selected.places.every((place) => place.visits.some((visit) => visit.date === SAT))).toBe(true);
    expect(selected.dates).toEqual(all.dates);
  });
  it("revises refreshed estimate data while preserving geometry bound to unchanged endpoints", async () => {
    const full = driveTrip();
    const before = await mapFor(full);
    const refreshed = await mapFor(full, [stored(full)]);
    expect(refreshed.revision).not.toBe(before.revision);
    expect(refreshed.days[1].geometry.revision).toBe(before.days[1].geometry.revision);
  });
  it("provides touring meeting/access information and an honest notes-only pickup", async () => {
    const full = driveTrip();
    const plan = { id: "tour", trip_id: full.trip.id, trip_day_id: full.days[1].id, objective: "North Ridge", route_url: "https://example.com/tour", return_time: null,
      time_zone: "America/New_York", revision: 1, updated_at: "2027-01-01T12:00:00Z", access_notes: "Permit required", pickup_notes: "Meet at the lower lot",
      approach_notes: "Skin up the summer road" } as TripTourPlan;
    full.tour_plans = [buildTourPlanSummary(plan, SAT)];
    const map = await mapFor(full);
    expect(map.days[1]).toMatchObject({ tour: { objective: "North Ridge", access_notes: "Permit required", approach_notes: "Skin up the summer road" }, pickup: { state: "notes_only", place_id: null, notes: "Meet at the lower lot" } });
    // The entered approach is text only: no place, line or estimate comes from it.
    expect(JSON.stringify(map.places)).not.toContain("Skin up");
    expect(map.days[1].drive.manual).toBeNull();
    expect(map.days[1].meeting_place_id).toBe(map.days[1].access_place_id);
    expect(map.days[1].crew_stay_place_id).toBe(stayId("stay-motel"));
    expect(map.places.some((entry) => entry.roles.includes("pickup"))).toBe(false);
  });
  it("uses a saved tour plan only while the day's activity is touring, as the Day page does", async () => {
    const full = driveTrip();
    const plan = { id: "tour", trip_id: full.trip.id, trip_day_id: full.days[1].id, objective: "North Ridge", route_url: "https://example.com/tour",
      return_time: null, time_zone: "America/New_York", revision: 1, updated_at: "2027-01-01T12:00:00Z", access_notes: "Permit required", pickup_notes: "Lower lot", approach_notes: "Skin up" } as TripTourPlan;
    full.tour_plans = [buildTourPlanSummary(plan, SAT)];
    full.days[1] = { ...full.days[1], activity: "Alpine" };
    const inactive = (await mapFor(full)).days[1];
    expect(inactive).toMatchObject({ activity: "Alpine", tour: null, meeting_place_id: null, pickup: { state: "not_set", notes: null } });
    // A day without its own activity takes its destination's first, like the Day page header.
    full.days[1] = { ...full.days[1], activity: null };
    const inherited = (await mapFor(full)).days[1];
    expect(inherited).toMatchObject({ activity: "Backcountry", tour: { objective: "North Ridge" }, pickup: { state: "notes_only" } });
    expect(inherited.meeting_place_id).toBe(inherited.access_place_id);
  });
  it("gives any sport's day with a meet time its meet, at the access point (#333)", async () => {
    const full = driveTrip();
    full.days[1] = { ...full.days[1], activity: "Alpine", meet_time: "08:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York" };
    full.meets = buildDayMeets(full.days, []);
    const map = await mapFor(full);
    expect(map.days[1]).toMatchObject({ meet: { label: "8:30 AM EST · Sat Jan 9", time_zone_label: "Local time at the destination (America/New_York)." }, tour: null });
    expect(map.days[1].meeting_place_id).toBe(map.days[1].access_place_id);
    expect(map.days[0]).toMatchObject({ meet: null, meeting_place_id: null });
  });
  it.each(["stop", "day", "stay", "night", "stop-reference", "night-reference", "tour-reference"])("rejects cross-trip %s sources/references", async (kind) => {
    const full = driveTrip();
    if (kind === "stop") full.stops[0].trip_id = "other";
    if (kind === "day") full.days[0].trip_id = "other";
    if (kind === "stay") full.lodging!.stays[0].trip_id = "other";
    if (kind === "night") full.lodging!.assignments[0].trip_id = "other";
    if (kind === "stop-reference") full.days[0].stop_id = "foreign-stop";
    if (kind === "night-reference") full.lodging!.assignments[0].stay_id = "foreign-stay";
    if (kind === "tour-reference") full.tour_plans = [{ trip_id: full.trip.id, trip_day_id: "foreign-day" } as TripTourPlanSummary];
    await expect(mapFor(full)).rejects.toThrow("Invalid map");
  });
  it("does not project private kits, invite tokens, booking/property details or raw tour records", async () => {
    const full = driveTrip();
    full.lodging!.stays[0].notes = "BOOKING_SECRET";
    full.lodging!.stays[0].property_url = "https://example.com/BOOKING_SECRET";
    full.members = [{ invite_token: "INVITE_SECRET" } as TripFull["members"][number]];
    full.kits = [{ note: "KIT_SECRET" } as TripFull["kits"][number]];
    const json = JSON.stringify(await mapFor(full));
    for (const secret of ["BOOKING_SECRET", "INVITE_SECRET", "KIT_SECRET", "booking_status"]) expect(json).not.toContain(secret);
  });
});

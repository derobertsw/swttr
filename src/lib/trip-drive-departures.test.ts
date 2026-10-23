// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { departurePlans, drivePlans, stayDepartures, type StoredDriveEstimate } from "@/lib/trip-drive";
import { tripDriveEstimates, type DriveEstimateStore, type ManualEstimateRow } from "@/lib/trip-drive-estimates";
import { RoutingUnavailable, type DriveLeg } from "@/lib/locations/routing";
import { LODGE_PLACE, PINE_PLACE, place, splitDriveTrip, SPRUCE_LOT, VILLAGE_PLACE } from "@/test/driveTrip";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, MON, PINE, personNight, SAT, splitRows, SUN, VILLAGE } from "@/test/splitStays";
import type { TripFull, TripMemberDayOrigin } from "@/types/trips";

const NOW = Date.parse("2026-10-05T15:00:00Z");
const ids = (...people: Array<{ id: string }>) => people.map((person) => person.id);
const departuresOn = (full: TripFull, date: string) => departurePlans(full).find((day) => day[0].date === date)!;

/** Answers like Geoapify, by starting point: the rental 12 min from the lot, the hotel 18, the lodge 3. */
const MINUTES: Record<string, number> = { [PINE_PLACE.latitude]: 12, [VILLAGE_PLACE.latitude]: 18, [LODGE_PLACE.latitude]: 3 };
const fakeMatrix = () => vi.fn(async (sources: Array<{ latitude: number }>, targets: unknown[]) =>
  sources.map((source): Array<DriveLeg | null> => targets.map(() => MINUTES[source.latitude] ? { seconds: MINUTES[source.latitude] * 60, meters: 9_000 } : null)));
const failing = () => vi.fn(async () => { throw new RoutingUnavailable("timeout"); });

/** Keeps one estimate per day and pair, like trip_drive_estimates after the departures migration. */
function memoryStore(manual: ManualEstimateRow[] = []) {
  const saved = new Map<string, StoredDriveEstimate>();
  const store: DriveEstimateStore & { saved: typeof saved } = {
    saved,
    read: vi.fn(async () => [...saved.values()]),
    write: vi.fn(async (rows: StoredDriveEstimate[]) => { rows.forEach((row) => saved.set(`${row.date}|${row.route_key}`, row)); }),
    manual: async () => manual,
  };
  return store;
}

describe("Departures by origin (#333)", () => {
  it("groups the people taking part by the stay each slept in the night before", () => {
    const full = splitDriveTrip();
    const saturday = departuresOn(full, SAT);
    expect(saturday.map((plan) => [plan.key, plan.label, plan.member_ids, plan.crew, plan.state])).toEqual([
      [`stay:${PINE.id}`, "Pine rental", ids(ALEX, BLAIR, DANA), true, "ready"],
      // A pending invitation with a planned night counts; Casey isn't taking part yet.
      [`stay:${VILLAGE.id}`, "Village hotel", ids(ELI, FRAN), false, "ready"],
    ]);
    // The crew's departure is the day's drive as before.
    expect(saturday[0].route_key).toBe(drivePlans(full).find((plan) => plan.date === SAT)!.route_key);
    expect(saturday[1].route_key).toContain(`${VILLAGE_PLACE.latitude},${VILLAGE_PLACE.longitude}>${SPRUCE_LOT.latitude}`);
    // Checkout morning: Casey leaves the rental with the others.
    expect(departuresOn(full, SUN).map((plan) => plan.member_ids)).toEqual([ids(ALEX, BLAIR, CASEY, DANA), ids(ELI, FRAN)]);
    expect(departuresOn(full, MON).map((plan) => [plan.label, plan.member_ids.length])).toEqual([["Mountain lodge", 6]]);
  });
  it("keeps people with no stay the night before explicit, never in the crew's car", () => {
    // Friday: no pre-trip nights. The pending invitation has none, so isn't listed.
    expect(departuresOn(splitDriveTrip(), FRI).map((plan) => [plan.key, plan.label, plan.member_ids, plan.state])).toEqual([
      ["unset:not_set", "Not set", ids(ALEX, BLAIR, DANA, ELI), "missing_origin"],
    ]);
    // Casey arrives Saturday and takes part: no starting point yet, after the stays.
    const rows = splitRows({ attendance: [{ trip_id: "trip-1", member_id: CASEY.id, arrival_date: SAT, departure_date: null, skipped_dates: [] }] });
    const saturday = departuresOn(splitDriveTrip({ rows }), SAT);
    expect(saturday.map((plan) => [plan.label, plan.member_ids, plan.crew, plan.state])).toEqual([
      ["Pine rental", ids(ALEX, BLAIR, DANA), true, "ready"],
      ["Village hotel", ids(ELI, FRAN), false, "ready"],
      ["Arrives this day", ids(CASEY), false, "missing_origin"],
    ]);
    // Blair's Friday night isn't planned: Blair starts from Not set, not the rental.
    const unplanned = { ...splitRows(), assignments: splitRows().assignments.filter((night) => !(night.member_id === BLAIR.id && night.date === FRI)) };
    expect(departuresOn(splitDriveTrip({ rows: unplanned }), SAT).map((plan) => [plan.label, plan.member_ids])).toEqual([
      ["Pine rental", ids(ALEX, DANA)], ["Village hotel", ids(ELI, FRAN)], ["Not set", ids(BLAIR)],
    ]);
  });
  it("starts everyone from the day's own starting point while it has one", () => {
    const cabin = place("Ridge cabin", 44.51, -72.75);
    const base = splitDriveTrip();
    const full = splitDriveTrip({ days: base.days.map((day) => day.date === SAT ? { ...day, origin: cabin } : day) });
    expect(departuresOn(full, SAT).map((plan) => [plan.key, plan.label, plan.member_ids.length, plan.origin?.own])).toEqual([["place:44.51,-72.75", "Ridge cabin", 5, true]]);
  });
  it("leads with the larger stay when the crew is split evenly elsewhere", () => {
    // Sat night: Alex alone in the hotel, Blair and Dana in the rental, so Sunday's crew stay is the rental.
    const rows = splitRows();
    rows.assignments = rows.assignments.map((night) => night.member_id === ALEX.id && night.date === SAT ? personNight(ALEX.id, SAT, VILLAGE) : night);
    expect(departuresOn(splitDriveTrip({ rows }), SUN).map((plan) => [plan.label, plan.member_ids.length, plan.crew])).toEqual([
      ["Pine rental", 3, true], ["Village hotel", 3, false],
    ]);
  });
  it("lists a stay's mornings when anyone starts there", () => {
    expect(stayDepartures(splitDriveTrip(), NOW).map((stay) => [stay.stay_id, stay.dates])).toEqual([
      [PINE.id, [SAT, SUN]], [VILLAGE.id, [SAT, SUN]], ["2b000000-0000-4000-8000-000000000003", [MON]],
    ]);
  });
});

describe("Departure estimates (#333)", () => {
  it("gives the rental and the hotel their own estimates to the same meeting point, in one call", async () => {
    const matrix = fakeMatrix(), store = memoryStore();
    const result = await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix });
    const saturday = result.days.find((day) => day.date === SAT)!;
    expect(saturday).toMatchObject({ state: "available", origin: { label: "Pine rental" }, estimate: { duration_label: "12 min" } });
    expect(saturday.departures.map((departure) => [departure.label, departure.member_ids.length, departure.crew, departure.state, departure.estimate?.duration_label])).toEqual([
      ["Pine rental", 3, true, "available", "12 min"],
      ["Village hotel", 2, false, "available", "18 min"],
    ]);
    expect(saturday.departures[1].directions?.google).toContain(`origin=${VILLAGE_PLACE.latitude},${VILLAGE_PLACE.longitude}`);
    // One call: the three stays to the one lot.
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(matrix.mock.calls[0].map((points) => points.length)).toEqual([3, 1, 0]);
    // Each day and pair is kept: Sat and Sun from both stays, Mon from the lodge.
    expect(store.saved.size).toBe(5);
  });
  it("calculates only the drive that's new when one person moves", async () => {
    const store = memoryStore();
    await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    // Eli spends Friday night in the rental instead: no new pair, no call.
    const rows = splitRows();
    rows.assignments = rows.assignments.map((night) => night.member_id === ELI.id && night.date === FRI ? personNight(ELI.id, FRI, PINE) : night);
    const again = fakeMatrix();
    const moved = await tripDriveEstimates(splitDriveTrip({ rows }), store, { now: NOW + 60_000, matrix: again });
    expect(again).not.toHaveBeenCalled();
    expect(moved.days.find((day) => day.date === SAT)!.departures.map((departure) => [departure.member_ids, departure.estimate?.duration_label]))
      .toEqual([[ids(ALEX, BLAIR, DANA, ELI), "12 min"], [ids(FRAN), "18 min"]]);
    // The hotel's place is corrected: only its drives are calculated again.
    const corrected = splitDriveTrip();
    corrected.lodging!.stays = corrected.lodging!.stays.map((stay) => stay.id === VILLAGE.id ? { ...stay, location: place("Village hotel", 44.4662, -72.6881) } : stay);
    const once = fakeMatrix();
    await tripDriveEstimates(corrected, store, { now: NOW + 120_000, matrix: once });
    expect(once).toHaveBeenCalledTimes(1);
    expect(once.mock.calls[0][0]).toEqual([expect.objectContaining({ latitude: 44.4662 })]);
  });
  it("reuses an estimate for the same pair from another day", async () => {
    const store = memoryStore();
    await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    // Everyone goes back to the rental on Sunday night: Monday's drive was already calculated on Saturday.
    const rows = splitRows();
    rows.stays = rows.stays.map((stay) => stay.id === PINE.id ? { ...stay, check_out: "2026-10-13" } : stay);
    rows.assignments = rows.assignments.map((night) => night.date === SUN && night.stay_id ? { ...night, stay_id: PINE.id } : night);
    const again = fakeMatrix();
    const monday = (await tripDriveEstimates(splitDriveTrip({ rows }), store, { now: NOW + 60_000, matrix: again })).days.find((day) => day.date === MON)!;
    expect(again).not.toHaveBeenCalled();
    expect(monday).toMatchObject({ state: "available", origin: { label: "Pine rental" }, estimate: { duration_label: "12 min" } });
  });
  it("keeps each departure's own failure, and an earlier estimate only for its own starting point", async () => {
    const store = memoryStore();
    await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    const moved = splitDriveTrip();
    moved.stops[0] = { ...moved.stops[0], access_point: place("Mountain Road lot", 44.528, -72.7853) };
    const saturday = (await tripDriveEstimates(moved, store, { now: NOW + 60_000, matrix: failing() })).days.find((day) => day.date === SAT)!;
    expect(saturday.departures.map((departure) => [departure.label, departure.state, departure.previous?.origin_label, departure.previous?.duration_label])).toEqual([
      ["Pine rental", "unavailable", "Pine rental", "12 min"],
      ["Village hotel", "unavailable", "Village hotel", "18 min"],
    ]);
  });
  it("uses the organizer's estimate only for the departure it was entered for", async () => {
    const pinePair = drivePlans(splitDriveTrip()).find((plan) => plan.date === SAT)!.pair_key!;
    const manual: ManualEstimateRow = { trip_day_id: `day-${SAT}`, pair_key: pinePair, origin_label: "Pine rental", destination_label: "Spruce Peak lot",
      duration_seconds: 900, note: null, use_calculated: false, entered_at: "2026-10-04T12:00:00.000Z" };
    const saturday = (await tripDriveEstimates(splitDriveTrip(), memoryStore([manual]), { now: NOW, matrix: failing() })).days.find((day) => day.date === SAT)!;
    expect(saturday.departures.map((departure) => [departure.label, departure.state, departure.manual?.duration_label ?? null])).toEqual([
      ["Pine rental", "manual", "15 min"],
      ["Village hotel", "unavailable", null],
    ]);
  });
  it("reuses a fresh estimate for the same drive from another day over this day's expired one", async () => {
    const store = memoryStore();
    await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    // Saturday's rental drive was calculated over a week ago; Sunday's, for the same drive, an hour ago.
    const old = new Date(NOW - 8 * 86_400_000).toISOString(), recent = new Date(NOW - 3_600_000).toISOString();
    for (const [key, row] of store.saved) store.saved.set(key, { ...row, calculated_at: row.date === SAT && row.origin_label === "Pine rental" ? old : recent });
    const matrix = fakeMatrix();
    const saturday = (await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix })).days.find((day) => day.date === SAT)!;
    expect(matrix).not.toHaveBeenCalled();
    expect(saturday).toMatchObject({ state: "available", estimate: { calculated_at: recent, stale: false } });
    // It's stored as Saturday's own, so the expired row goes.
    expect(store.saved.get(`${SAT}|${departuresOn(splitDriveTrip(), SAT)[0].route_key}`)?.calculated_at).toBe(recent);
  });
  it("keeps each day's crew estimate in a table that keeps one per day, before the departures migration", async () => {
    // Like supabaseDriveStore's fallback: the first row written for a day wins.
    const saved = new Map<string, StoredDriveEstimate>();
    const perDay: DriveEstimateStore = {
      read: async () => [...saved.values()],
      write: async (rows) => { [...new Map([...rows].reverse().map((row) => [row.date, row])).values()].forEach((row) => saved.set(row.date, row)); },
    };
    await tripDriveEstimates(splitDriveTrip(), perDay, { now: NOW, matrix: fakeMatrix() });
    expect(saved.get(SAT)?.origin_label).toBe("Pine rental");
    // The next visit calculates the hotel's drive again, and the rental's stays.
    await tripDriveEstimates(splitDriveTrip(), perDay, { now: NOW + 60_000, matrix: fakeMatrix() });
    expect([saved.get(SAT)?.origin_label, saved.get(SUN)?.origin_label]).toEqual(["Pine rental", "Pine rental"]);
    const offline = (await tripDriveEstimates(splitDriveTrip(), perDay, { now: NOW + 120_000, matrix: failing() })).days.find((day) => day.date === SAT)!;
    expect(offline.departures.map((departure) => departure.state)).toEqual(["available", "unavailable"]);
  });
  it("labels a read-only view's expired estimates stale without calling the provider or writing", async () => {
    const store = memoryStore();
    await tripDriveEstimates(splitDriveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    vi.mocked(store.write).mockClear();
    const matrix = fakeMatrix();
    const later = await tripDriveEstimates(splitDriveTrip(), store, { now: NOW + 8 * 86_400_000, matrix, refresh: false });
    expect(matrix).not.toHaveBeenCalled();
    expect(store.write).not.toHaveBeenCalled();
    expect(later.days.find((day) => day.date === SAT)!.departures.map((departure) => departure.state)).toEqual(["stale", "stale"]);
  });
});

describe("A person's own starting point (#333)", () => {
  const cabin = place("Ridge cabin", 44.51, -72.75);
  /** The fixture with own starting points on Saturday. */
  const withOwn = (...rows: Array<Partial<TripMemberDayOrigin> & { member_id: string }>) => {
    const full = splitDriveTrip();
    full.member_origins = rows.map((row) => ({ trip_id: full.trip.id, trip_day_id: `day-${SAT}`, origin: null, origin_stay_id: null, no_drive: false, ...row }));
    return full;
  };

  it("starts only that person from their own place, leaving everyone else's", () => {
    const saturday = departuresOn(withOwn({ member_id: ELI.id, origin: cabin }), SAT);
    expect(saturday.map((plan) => [plan.key, plan.label, plan.member_ids, plan.own_member_ids, plan.crew])).toEqual([
      [`stay:${PINE.id}`, "Pine rental", ids(ALEX, BLAIR, DANA), [], true],
      [`stay:${VILLAGE.id}`, "Village hotel", ids(FRAN), [], false],
      ["place:44.51,-72.75", "Ridge cabin", ids(ELI), ids(ELI), false],
    ]);
    expect(saturday[2]).toMatchObject({ state: "ready", origin: { label: "Ridge cabin", own: true } });
  });
  it("joins the group already leaving from the stay picked for them", () => {
    const saturday = departuresOn(withOwn({ member_id: ELI.id, origin: { ...PINE_PLACE, label: "Pine rental" }, origin_stay_id: PINE.id }), SAT);
    expect(saturday.map((plan) => [plan.label, plan.member_ids, plan.own_member_ids])).toEqual([
      ["Pine rental", ids(ALEX, BLAIR, DANA, ELI), ids(ELI)], ["Village hotel", ids(FRAN), []],
    ]);
    // It's still where the others slept, not a place of Eli's own.
    expect(saturday[0].origin?.own).toBe(false);
  });
  it("plans no drive for one person without changing the others' drive", () => {
    const saturday = departuresOn(withOwn({ member_id: DANA.id, no_drive: true }), SAT);
    expect(saturday.map((plan) => [plan.key, plan.member_ids, plan.state])).toEqual([
      [`stay:${PINE.id}`, ids(ALEX, BLAIR), "ready"],
      [`stay:${VILLAGE.id}`, ids(ELI, FRAN), "ready"],
      [`stay:${PINE.id}:no_drive`, ids(DANA), "no_drive"],
    ]);
  });
  it("comes before the day's own starting point, and starts a late arrival from somewhere", () => {
    const base = withOwn({ member_id: ELI.id, origin: cabin });
    base.days = base.days.map((day) => day.date === SAT ? { ...day, origin: LODGE_PLACE } : day);
    expect(departuresOn(base, SAT).map((plan) => [plan.label, plan.member_ids.length])).toEqual([["Mountain lodge", 4], ["Ridge cabin", 1]]);
    // Casey arrives Saturday and takes part, from a motel on the way.
    const rows = splitRows({ attendance: [{ trip_id: "trip-1", member_id: CASEY.id, arrival_date: SAT, departure_date: null, skipped_dates: [] }] });
    const arriving = splitDriveTrip({ rows });
    arriving.member_origins = [{ trip_id: arriving.trip.id, trip_day_id: `day-${SAT}`, member_id: CASEY.id, origin: cabin, origin_stay_id: null, no_drive: false }];
    expect(departuresOn(arriving, SAT).map((plan) => plan.label)).toEqual(["Pine rental", "Village hotel", "Ridge cabin"]);
  });
  it("gives each departure its own estimate of yours, and shows one for a gone drive only on the crew's", async () => {
    const full = splitDriveTrip();
    const [pine, hotel] = departuresOn(full, SAT);
    const row = (pair: string, minutes: number): ManualEstimateRow => ({ trip_day_id: `day-${SAT}`, pair_key: pair, origin_label: "x", destination_label: "Spruce Peak lot",
      duration_seconds: minutes * 60, note: null, use_calculated: false, entered_at: "2026-10-04T12:00:00.000Z" });
    const store = memoryStore([row(pine.pair_key!, 15), row(hotel.pair_key!, 25), row("drive|1,1>2,2", 40)]);
    const saturday = (await tripDriveEstimates(full, store, { now: NOW, matrix: failing() })).days.find((day) => day.date === SAT)!;
    expect(saturday.departures.map((departure) => [departure.label, departure.state, departure.manual?.duration_label, departure.manual?.current])).toEqual([
      ["Pine rental", "manual", "15 min", true], ["Village hotel", "manual", "25 min", true],
    ]);
    const gone = (await tripDriveEstimates(full, memoryStore([row("drive|1,1>2,2", 40)]), { now: NOW, matrix: failing() })).days.find((day) => day.date === SAT)!;
    expect(gone.departures.map((departure) => departure.manual && [departure.manual.current, departure.manual.pair_key])).toEqual([[false, "drive|1,1>2,2"], null]);
  });
});

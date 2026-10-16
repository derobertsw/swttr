// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { distanceLabel, drivePlans, durationLabel, stayDepartures, type StoredDriveEstimate } from "@/lib/trip-drive";
import { tripDriveEstimates, type DriveEstimateStore, type ManualEstimateRow } from "@/lib/trip-drive-estimates";
import { RoutingUnavailable, type DriveLeg } from "@/lib/locations/routing";
import { driveDayRow, driveStay, driveTrip, MOTEL, place, SMUGGS_LOT, SPRUCE_LOT } from "@/test/driveTrip";
import type { TripDay } from "@/types/trips";

const NOW = Date.parse("2027-01-05T15:00:00Z");
const SAT = "2027-01-09", SUN = "2027-01-10";
const states = (full = driveTrip()) => Object.fromEntries(drivePlans(full).map((plan) => [plan.date, plan.state]));

/** Answers like Geoapify: Spruce Peak lot 12 min away, Smuggs lot the long way round the closed Notch. */
const LEGS: Record<string, DriveLeg | null> = {
  [`${SPRUCE_LOT.latitude}`]: { seconds: 720, meters: 9_000 },
  [`${SMUGGS_LOT.latitude}`]: { seconds: 4_440, meters: 64_000 },
};
const fakeMatrix = (legs = LEGS) => vi.fn(async (sources: Array<{ latitude: number }>, targets: Array<{ latitude: number }>) =>
  sources.map(() => targets.map((target) => legs[`${target.latitude}`] ?? null)));
function memoryStore(rows: StoredDriveEstimate[] = [], manual: ManualEstimateRow[] = []) {
  const saved = new Map(rows.map((row) => [row.date, row]));
  const store: DriveEstimateStore & { saved: typeof saved } = {
    saved,
    read: vi.fn(async () => [...saved.values()]),
    write: vi.fn(async (written: StoredDriveEstimate[]) => { written.forEach((row) => saved.set(row.date, row)); }),
    manual: async () => manual,
  };
  return store;
}
const CABIN = place("Ridge cabin", 44.51, -72.75);
const SPRUCE_PAIR = `drive|${MOTEL.latitude},${MOTEL.longitude}>${SPRUCE_LOT.latitude},${SPRUCE_LOT.longitude}`;
/** Your estimate as 029 stores it, on the fixture's day for `date`. */
const yours = (date: string, minutes: number, overrides: Partial<ManualEstimateRow> = {}): ManualEstimateRow => ({
  trip_day_id: `day-${date}`, pair_key: SPRUCE_PAIR, origin_label: "Stowe Motel", destination_label: "Spruce Peak lot",
  duration_seconds: minutes * 60, note: "Resort directions page", use_calculated: false, entered_at: "2027-01-04T12:00:00.000Z", ...overrides,
});

describe("Which drive each day has", () => {
  it("drives from the stay of the night before to the day's access point", () => {
    expect(states()).toEqual({
      "2027-01-08": "missing_origin", [SAT]: "ready", [SUN]: "ready", "2027-01-11": "origin_not_located",
    });
    const sunday = drivePlans(driveTrip()).find((plan) => plan.date === SUN)!;
    // Checkout morning still starts from the motel.
    expect(sunday.origin).toMatchObject({ label: "Stowe Motel", stay_id: "stay-motel" });
    expect(sunday.destination).toMatchObject({ label: "Smuggs lot" });
    expect(sunday.route_key).toBe(`drive|approximated|${MOTEL.latitude},${MOTEL.longitude}>${SMUGGS_LOT.latitude},${SMUGGS_LOT.longitude}|vt-108-smugglers-notch`);
  });
  it("asks for the exact property or entrance rather than estimating from an area", () => {
    const approximate = driveTrip({ stays: [driveStay("stay-motel", "Stowe Motel", "2027-01-08", "2027-01-10", { ...MOTEL, precision: "approximate" })] });
    expect(states(approximate)[SAT]).toBe("approximate_origin");
    const full = driveTrip();
    full.stops[0] = { ...full.stops[0], access_point: { ...SPRUCE_LOT, precision: "approximate" } };
    full.stops[1] = { ...full.stops[1], access_point: null };
    expect(states(full)).toMatchObject({ [SAT]: "approximate_access_point", [SUN]: "missing_access_point" });
  });
  it("uses a day's own access point, and has nothing to estimate without a day plan", () => {
    const own = place("Barnes Camp", 44.5408, -72.7895);
    const full = driveTrip({ days: [{ ...driveDayRow(SAT, "stop-stowe"), access_point: own, access_point_stop_id: "stop-stowe" }] });
    const plans = drivePlans(full);
    expect(plans.find((plan) => plan.date === SAT)?.destination?.label).toBe("Barnes Camp");
    expect(plans.find((plan) => plan.date === SUN)?.state).toBe("no_destination");
  });
  it("labels one-way time and distance without claiming precision", () => {
    expect([durationLabel(20), durationLabel(557), durationLabel(3600), durationLabel(4508)]).toEqual(["Under 1 min", "9 min", "1 hr", "1 hr 15 min"]);
    expect([distanceLabel(50), distanceLabel(8016), distanceLabel(61410)]).toEqual(["Under 0.1 mi", "5.0 mi", "38 mi"]);
  });
  it("lists each stay's departures, checkout morning included, and the next from today", () => {
    expect(stayDepartures(driveTrip(), NOW)).toEqual([
      { stay_id: "stay-motel", dates: [SAT, SUN], next: SAT },
      { stay_id: "stay-inn", dates: ["2027-01-11"], next: "2027-01-11" },
    ]);
    // 10 p.m. Saturday at the motel is already Sunday in UTC; Saturday's departure is still next there.
    expect(stayDepartures(driveTrip(), Date.parse("2027-01-10T03:00:00Z"))[0].next).toBe(SAT);
    expect(stayDepartures(driveTrip(), Date.parse("2027-01-10T06:00:00Z"))[0].next).toBe(SUN);
    expect(stayDepartures(driveTrip(), Date.parse("2027-01-12T15:00:00Z"))[0].next).toBeNull();
  });
});

describe("Drive estimates", () => {
  it("calculates every ready day in one call per set of closures, and stores them", async () => {
    const matrix = fakeMatrix(), store = memoryStore();
    const result = await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix });
    expect(result.days.map((day) => [day.date, day.state, day.estimate && `${day.estimate.duration_label} · ${day.estimate.distance_label}`])).toEqual([
      ["2027-01-08", "missing_origin", null],
      [SAT, "available", "12 min · 5.6 mi"],
      [SUN, "available", "1 hr 14 min · 40 mi"],
      ["2027-01-11", "origin_not_located", null],
    ]);
    // Both drives go up VT 108 towards the closed Notch, so they share one call that avoids it.
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(matrix.mock.calls[0].map((points) => points.length)).toEqual([1, 2, 1]);
    const sunday = result.days.find((day) => day.date === SUN)!;
    expect(sunday).toMatchObject({
      night_label: "Sat Jan 9", origin: { label: "Stowe Motel", stay_id: "stay-motel" }, destination: { label: "Smuggs lot" },
      closures: ["VT 108 through Smugglers' Notch, usually closed November to mid-May"], previous: null,
      directions: {
        apple: `https://maps.apple.com/?saddr=44.4875,-72.7262&daddr=44.587,-72.7837&dirflg=d`,
        google: `https://www.google.com/maps/dir/?api=1&origin=44.4875,-72.7262&destination=44.587,-72.7837&travelmode=driving`,
      },
    });
    expect(store.saved.get(SUN)).toEqual({
      date: SUN, route_key: drivePlans(driveTrip()).find((plan) => plan.date === SUN)!.route_key,
      origin_label: "Stowe Motel", destination_label: "Smuggs lot", status: "ok", duration_seconds: 4440, distance_meters: 64000,
      calculated_at: new Date(NOW).toISOString(),
    });
    expect(result.stays[0]).toEqual({ stay_id: "stay-motel", dates: [SAT, SUN], next: SAT });
  });
  it("reuses a stored estimate for the same pair for a week, then calculates again", async () => {
    const store = memoryStore();
    await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    const again = fakeMatrix();
    await tripDriveEstimates(driveTrip(), store, { now: NOW + 6 * 86_400_000, matrix: again });
    expect(again).not.toHaveBeenCalled();
    await tripDriveEstimates(driveTrip(), store, { now: NOW + 8 * 86_400_000, matrix: again });
    expect(again).toHaveBeenCalledTimes(1);
  });
  it("shows an old estimate for the same pair as stale when checking again fails", async () => {
    const store = memoryStore();
    await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    const failing = vi.fn(async () => { throw new RoutingUnavailable("429"); });
    const result = await tripDriveEstimates(driveTrip(), store, { now: NOW + 8 * 86_400_000, matrix: failing });
    expect(result.days.find((day) => day.date === SAT)).toMatchObject({ state: "stale", estimate: { duration_label: "12 min", calculated_at: new Date(NOW).toISOString() } });
  });
  it("never shows another pair's estimate as current: it's only the earlier estimate", async () => {
    const store = memoryStore();
    await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    const moved = driveTrip();
    moved.stops[0] = { ...moved.stops[0], access_point: place("Mountain Road lot", 44.528, -72.7853) };
    const failing = vi.fn(async () => { throw new RoutingUnavailable("timeout"); });
    const saturday = (await tripDriveEstimates(moved, store, { now: NOW + 60_000, matrix: failing })).days.find((day) => day.date === SAT)!;
    expect(saturday).toMatchObject({
      state: "unavailable", estimate: null, destination: { label: "Mountain Road lot" },
      previous: { origin_label: "Stowe Motel", destination_label: "Spruce Peak lot", duration_label: "12 min" },
    });
    expect(saturday.directions?.google).toContain("destination=44.528,-72.7853");
    // Once it works, the new pair replaces the stored one.
    const fixed = await tripDriveEstimates(moved, store, { now: NOW + 120_000, matrix: fakeMatrix({ "44.528": { seconds: 600, meters: 8_500 } }) });
    expect(fixed.days.find((day) => day.date === SAT)).toMatchObject({ state: "available", previous: null, estimate: { duration_label: "10 min" } });
  });
  it("stores no road route as its own answer, never as zero", async () => {
    const store = memoryStore();
    const result = await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: fakeMatrix({}) });
    expect(result.days.find((day) => day.date === SAT)).toMatchObject({ state: "no_route", estimate: null, directions: null });
    expect(store.saved.get(SAT)).toMatchObject({ status: "no_route", duration_seconds: null, distance_meters: null });
  });
  it("still answers when the table is missing or a write fails", async () => {
    const store: DriveEstimateStore = { read: async () => { throw new Error("relation does not exist"); }, write: async () => { throw new Error("no table"); } };
    const result = await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: fakeMatrix() });
    expect(result.days.find((day) => day.date === SAT)?.state).toBe("available");
  });
  it("shares one provider call between identical requests at the same time", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const inner = fakeMatrix();
    const matrix = vi.fn(async (...args: Parameters<typeof inner>) => { await held; return inner(...args); });
    const both = Promise.all([memoryStore(), memoryStore()].map((store) => tripDriveEstimates(driveTrip(), store, { now: NOW, matrix })));
    release();
    const [first, second] = await both;
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(second.days).toEqual(first.days);
  });
});

describe("Starting points (#209)", () => {
  const withDays = (...days: Array<Partial<TripDay> & { date: string }>) => {
    const full = driveTrip();
    full.days = full.days.map((day) => ({ ...day, ...days.find((own) => own.date === day.date) }));
    return full;
  };

  it("starts the first day from its own place, and only that day", () => {
    const plans = drivePlans(withDays({ date: "2027-01-08", origin: CABIN }));
    expect(plans[0]).toMatchObject({
      state: "ready", origin: { label: "Ridge cabin", stay_id: null, own: true }, crew_stay: null,
      pair_key: `drive|${CABIN.latitude},${CABIN.longitude}>${SPRUCE_LOT.latitude},${SPRUCE_LOT.longitude}`,
    });
    expect(plans[0].route_key).toContain(`${CABIN.latitude},${CABIN.longitude}>`);
    expect(plans[1].origin).toMatchObject({ label: "Stowe Motel", own: false });
  });
  it("follows a saved stay picked as the starting point, and keeps its place once the stay is gone", () => {
    const picked = { date: "2027-01-11", origin: { ...MOTEL, label: "Stowe Motel" }, origin_stay_id: "stay-motel" };
    const monday = drivePlans(withDays(picked))[3];
    expect(monday).toMatchObject({ state: "ready", origin: { label: "Stowe Motel", stay_id: "stay-motel", own: true }, crew_stay: { label: "Village Inn", stay_id: "stay-inn" } });
    // The stay's place changes: the day follows it.
    const moved = withDays(picked);
    moved.lodging!.stays[0] = { ...moved.lodging!.stays[0], name: "Stowe Motel & Snowdrift", location: { ...MOTEL, precision: "approximate" } };
    expect(drivePlans(moved)[3]).toMatchObject({ state: "approximate_origin", origin: { label: "Stowe Motel & Snowdrift" } });
    // The stay is removed: the day still starts there until the organizer resets it.
    const removed = withDays(picked);
    removed.lodging!.stays = removed.lodging!.stays.filter((stay) => stay.id !== "stay-motel");
    expect(drivePlans(removed)[3]).toMatchObject({ state: "ready", origin: { label: "Stowe Motel", stay_id: null, own: true } });
  });
  it("plans no drive when the organizer says so, keeping the starting point, even with no origin", () => {
    const plans = drivePlans(withDays({ date: SAT, no_drive: true }, { date: "2027-01-08", no_drive: true }));
    expect(plans[1]).toMatchObject({ state: "no_drive", origin: { label: "Stowe Motel" }, destination: { label: "Spruce Peak lot" }, route_key: null });
    expect(plans[0]).toMatchObject({ state: "no_drive", origin: null });
  });
  it("lists a morning under the stay it starts from, own starting points included", () => {
    const full = withDays({ date: SUN, origin: CABIN }, { date: "2027-01-11", origin: { ...MOTEL, label: "Stowe Motel" }, origin_stay_id: "stay-motel" });
    expect(stayDepartures(full, NOW)).toEqual([
      { stay_id: "stay-motel", dates: [SAT, "2027-01-11"], next: SAT },
      { stay_id: "stay-inn", dates: [], next: null },
    ]);
  });
});

describe("Your estimate (#209)", () => {
  const failing = () => vi.fn(async () => { throw new RoutingUnavailable("429"); });
  const day = async (store: DriveEstimateStore, date = SAT, matrix: ReturnType<typeof fakeMatrix> = failing(), full = driveTrip()) =>
    (await tripDriveEstimates(full, store, { now: NOW, matrix })).days.find((candidate) => candidate.date === date)!;

  it("is the day's estimate when routing has none, with the days it was saved for", async () => {
    const saturday = await day(memoryStore([], [yours(SAT, 40)]));
    expect(saturday).toMatchObject({
      state: "manual", estimate: null, pair_key: SPRUCE_PAIR, same_drive_dates: [SAT],
      manual: { duration_label: "40 min", duration_seconds: 2400, note: "Resort directions page", current: true, use_calculated: false, dates: [SAT] },
    });
    expect(saturday.directions?.google).toContain("origin=44.4875,-72.7262");
    // A hut with no road route can still have your own estimate.
    expect(await day(memoryStore([], [yours(SAT, 40)]), SAT, fakeMatrix({}))).toMatchObject({ state: "manual", estimate: null });
  });
  it("offers a calculated estimate for the same pair separately, and uses it only when chosen", async () => {
    const offered = await day(memoryStore([], [yours(SAT, 40)]), SAT, fakeMatrix());
    expect(offered).toMatchObject({ state: "manual", estimate: { duration_label: "12 min" }, manual: { duration_label: "40 min" } });
    const chosen = await day(memoryStore([], [yours(SAT, 40, { use_calculated: true })]), SAT, fakeMatrix());
    expect(chosen).toMatchObject({ state: "available", estimate: { duration_label: "12 min" }, manual: { duration_label: "40 min", use_calculated: true } });
    // Chosen, but routing has none now: yours is shown rather than nothing.
    expect(await day(memoryStore([], [yours(SAT, 40, { use_calculated: true })]))).toMatchObject({ state: "manual" });
  });
  it("is only for review once the day's drive is another pair", async () => {
    const full = driveTrip({ days: [driveDayRow("2027-01-08", "stop-stowe"), { ...driveDayRow(SAT, "stop-stowe"), origin: CABIN }] });
    const saturday = await day(memoryStore([], [yours(SAT, 40)]), SAT, fakeMatrix(), full);
    expect(saturday).toMatchObject({ state: "available", manual: { current: false, origin_label: "Stowe Motel", dates: [] } });
    // Not for a day with no drive to estimate.
    const noDrive = driveTrip({ days: [driveDayRow("2027-01-08", "stop-stowe"), { ...driveDayRow(SAT, "stop-stowe"), no_drive: true }] });
    expect(await day(memoryStore([], [yours(SAT, 40)]), SAT, fakeMatrix(), noDrive)).toMatchObject({ state: "no_drive", manual: null });
  });
  it("groups the days it was saved for together, and lists the days with the same drive", async () => {
    // Sunday also drives from the motel to Spruce Peak lot.
    const full = driveTrip();
    full.stops[1] = { ...full.stops[1], access_point: SPRUCE_LOT };
    const store = memoryStore([], [yours(SAT, 40), yours(SUN, 40), yours("2027-01-11", 40)]);
    const saturday = await day(store, SAT, failing(), full);
    expect(saturday).toMatchObject({ same_drive_dates: [SAT, SUN], manual: { dates: [SAT, SUN] } });
    const edited = memoryStore([], [yours(SAT, 40), yours(SUN, 40, { entered_at: "2027-01-04T13:00:00.000Z" })]);
    expect((await day(edited, SAT, failing(), full)).manual?.dates).toEqual([SAT]);
  });
  it("ignores your estimates before migration 029", async () => {
    const store = memoryStore();
    store.manual = async () => { throw new Error("relation does not exist"); };
    expect(await day(store)).toMatchObject({ state: "unavailable", manual: null });
  });
});


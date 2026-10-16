// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { distanceLabel, drivePlans, durationLabel, stayDepartures, type StoredDriveEstimate } from "@/lib/trip-drive";
import { tripDriveEstimates, type DriveEstimateStore } from "@/lib/trip-drive-estimates";
import { RoutingUnavailable, type DriveLeg } from "@/lib/locations/routing";
import { driveDayRow, driveStay, driveTrip, MOTEL, place, SMUGGS_LOT, SPRUCE_LOT } from "@/test/driveTrip";

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
function memoryStore(rows: StoredDriveEstimate[] = []) {
  const saved = new Map(rows.map((row) => [row.date, row]));
  const store: DriveEstimateStore & { saved: typeof saved } = {
    saved,
    read: vi.fn(async () => [...saved.values()]),
    write: vi.fn(async (written: StoredDriveEstimate[]) => { written.forEach((row) => saved.set(row.date, row)); }),
  };
  return store;
}

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

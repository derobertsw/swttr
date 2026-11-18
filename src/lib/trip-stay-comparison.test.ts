// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { RoutingUnavailable, type DriveLeg } from "@/lib/locations/routing";
import { drivePlans, type StoredDriveEstimate } from "@/lib/trip-drive";
import { summarizeCandidate } from "@/lib/trip-stay-candidates";
import { compareStays, parseComparisonRequest, type ComparisonStore } from "@/lib/trip-stay-comparison";
import { LODGE_PLACE, PINE_PLACE, place, SMUGGS_LOT, splitDriveTrip, SPRUCE_LOT } from "@/test/driveTrip";
import { ALEX, FRI, LODGE, MON, PINE, SAT, SPLIT_TRIP, SUN, VILLAGE } from "@/test/splitStays";
import type { TripFull, TripLocation, TripStayCandidate, TripStayComparison } from "@/types/trips";

const NOW = Date.parse("2026-10-05T15:00:00Z");
const RIDGE = place("Ridge chalet", 44.5012, -72.7519);
const BROOK = place("Brook inn", 44.4498, -72.6802);
const A = "3c000000-0000-4000-8000-000000000001", B = "3c000000-0000-4000-8000-000000000002";

const candidate = (id: string, name: string, location: TripLocation | null, extra: Partial<TripStayCandidate> = {}) => summarizeCandidate(SPLIT_TRIP, {
  id, trip_id: SPLIT_TRIP.id, name, check_in: FRI, check_out: SUN, address: null, property_url: null, notes: null, location,
  cost_amount: null, cost_currency: null, revision: 1, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...extra,
});

/** Minutes from each starting point to each access point, by latitude. */
const MINUTES: Record<string, number> = {
  [`${RIDGE.latitude}>${SPRUCE_LOT.latitude}`]: 10, [`${BROOK.latitude}>${SPRUCE_LOT.latitude}`]: 25,
  [`${PINE_PLACE.latitude}>${SPRUCE_LOT.latitude}`]: 12, [`${LODGE_PLACE.latitude}>${SPRUCE_LOT.latitude}`]: 3,
  [`${RIDGE.latitude}>${SMUGGS_LOT.latitude}`]: 70, [`${BROOK.latitude}>${SMUGGS_LOT.latitude}`]: 20,
};
const fakeMatrix = () => vi.fn(async (sources: Array<{ latitude: number }>, targets: Array<{ latitude: number }>) =>
  sources.map((source): Array<DriveLeg | null> => targets.map((target) => {
    const minutes = MINUTES[`${source.latitude}>${target.latitude}`];
    return minutes ? { seconds: minutes * 60, meters: 9_000 } : null;
  })));
const failing = () => vi.fn(async () => { throw new RoutingUnavailable("timeout"); });

function memoryStore(rows: StoredDriveEstimate[] = []) {
  const saved = [...rows];
  const store: ComparisonStore & { saved: StoredDriveEstimate[] } = {
    saved,
    read: vi.fn(async () => [...saved]),
    write: vi.fn(async (written: StoredDriveEstimate[]) => { saved.push(...written.map((row) => ({ ...row, date: "" }))); }),
    manual: async () => [],
  };
  return store;
}

const request = (options: string[], window: { first_night?: string; checkout?: string } = { first_night: FRI, checkout: SUN }) => {
  const parsed = parseComparisonRequest(new URLSearchParams({ options: options.join(","), ...window }), SPLIT_TRIP);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
};

async function compare(options: string[], { full = splitDriveTrip(), candidates = [candidate(A, "Ridge chalet", RIDGE), candidate(B, "Brook inn", BROOK)],
  store = memoryStore(), matrix = fakeMatrix(), window }: {
  full?: TripFull; candidates?: TripStayCandidate[]; store?: ReturnType<typeof memoryStore>; matrix?: ReturnType<typeof fakeMatrix>;
  window?: { first_night?: string; checkout?: string };
} = {}) {
  const result = await compareStays(full, candidates, request(options, window), store, { now: NOW, matrix });
  if ("error" in result) throw new Error(result.error);
  return result;
}
const labels = (comparison: TripStayComparison) => comparison.days.map((day) => [day.date, day.shared ?? day.drives.map((drive) => drive.label)]);

describe("Stay comparison (#213)", () => {
  it("compares two options over the mornings after the same nights, asking only for their drives", async () => {
    const store = memoryStore(), matrix = fakeMatrix();
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { store, matrix });
    expect(comparison.window).toMatchObject({ label: "Fri Oct 9 → Sun Oct 11 · 2 nights", mornings_label: "Mornings compared: Sat Oct 10 and Sun Oct 11 (check-out)" });
    // Friday's morning follows Thursday's night, which isn't compared.
    expect(labels(comparison)).toEqual([[SAT, ["10 min · 5.6 mi", "25 min · 5.6 mi"]], [SUN, ["10 min · 5.6 mi", "25 min · 5.6 mi"]]]);
    expect(comparison.days[0]).toMatchObject({ destination_label: "Spruce Peak lot", stop_label: "Stowe, Vermont", activity_label: "Downhill", checkout: false });
    expect(comparison.days[1].checkout).toBe(true);
    // A repeat visit is counted on each day.
    expect(comparison.days[1].notes).toEqual(["Same access point as Sat Oct 10. Each day's drive counts."]);
    expect(comparison.options.map((option) => [option.name, option.coverage_label, option.longest_label, option.sum_label])).toEqual([
      ["Ridge chalet", "All 2 drives known", "10 min · Sat Oct 10 to Spruce Peak lot", "20 min"],
      ["Brook inn", "All 2 drives known", "25 min · Sat Oct 10 to Spruce Peak lot", "50 min"],
    ]);
    expect(comparison.days[0].drives.map((drive) => drive.shortest)).toEqual([true, false]);
    expect(comparison).toMatchObject({ comparable: true, credit: true, summary: "Ridge chalet has the lowest sum of planned outbound drives, 20 min. Brook inn: 30 min more." });
    // One call for both options and the one access point, stored once per pair.
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(matrix.mock.calls[0][0]).toEqual([expect.objectContaining({ latitude: BROOK.latitude }), expect.objectContaining({ latitude: RIDGE.latitude })]);
    expect(matrix.mock.calls[0][1]).toEqual([expect.objectContaining({ latitude: SPRUCE_LOT.latitude })]);
    expect(store.write).toHaveBeenCalledWith([expect.objectContaining({ origin_label: "Brook inn" }), expect.objectContaining({ origin_label: "Ridge chalet" })]);
    // The next look reuses them.
    const again = fakeMatrix();
    await compare([`candidate:${A}`, `candidate:${B}`], { store, matrix: again });
    expect(again).not.toHaveBeenCalled();
  });

  it("keeps the order chosen and never changes the trip's plan", async () => {
    const full = splitDriveTrip();
    const before = structuredClone(full);
    const comparison = await compare([`candidate:${B}`, `candidate:${A}`], { full });
    expect(comparison.options.map((option) => option.name)).toEqual(["Brook inn", "Ridge chalet"]);
    expect(comparison.summary).toBe("Ridge chalet has the lowest sum of planned outbound drives, 20 min. Brook inn: 30 min more.");
    expect(full).toEqual(before);
  });

  it("shows unknown drives beside known ones and compares no sums until every drive is known", async () => {
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { candidates: [candidate(A, "Ridge chalet", RIDGE), candidate(B, "Brook inn", null)] });
    expect(labels(comparison)).toEqual([[SAT, ["10 min · 5.6 mi", "Location needed"]], [SUN, ["10 min · 5.6 mi", "Location needed"]]]);
    expect(comparison.options[1]).toMatchObject({ location_note: "Location needed for drive times", coverage_label: "0 of 2 drives known",
      longest_label: null, sum_label: "Not totaled: 2 drives aren't known", sum_complete: false });
    // The known option still has its own figures, but nothing ranks it against gaps.
    expect(comparison.options[0]).toMatchObject({ sum_label: "20 min", sum_complete: true });
    expect(comparison.days.flatMap((day) => day.drives.map((drive) => drive.shortest))).toEqual([false, false, false, false]);
    expect(comparison).toMatchObject({ comparable: false,
      summary: "Sums aren't compared until every drive is known. Not known yet: Brook inn (no location). A missing drive never counts as zero." });
  });

  it("says a failed or approximate drive isn't known, never zero minutes", async () => {
    const town = { ...BROOK, precision: "approximate" as const };
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { candidates: [candidate(A, "Ridge chalet", RIDGE), candidate(B, "Brook inn", town)], matrix: failing() });
    expect(labels(comparison)).toEqual([[SAT, ["Drive estimate unavailable", "Approximate location"]], [SUN, ["Drive estimate unavailable", "Approximate location"]]]);
    expect(comparison.options.map((option) => [option.coverage_label, option.sum_label])).toEqual([
      ["0 of 2 drives known", "Not totaled: 2 drives aren't known"], ["0 of 2 drives known", "Not totaled: 2 drives aren't known"]]);
    expect(comparison.credit).toBe(false);
    expect(comparison.summary).toBe("Sums aren't compared until every drive is known. Not known yet: Ridge chalet (2 drives) and Brook inn (no location). A missing drive never counts as zero.");
  });

  it("marks a week-old drive not updated when checking again fails, and doesn't count it", async () => {
    const old = new Date(NOW - 8 * 86_400_000).toISOString();
    const ridgeKey = `drive|approximated|${RIDGE.latitude},${RIDGE.longitude}>${SPRUCE_LOT.latitude},${SPRUCE_LOT.longitude}|none`;
    const store = memoryStore([{ date: "", route_key: ridgeKey, origin_label: "Ridge chalet", destination_label: "Spruce Peak lot", status: "ok", duration_seconds: 600, distance_meters: 9000, calculated_at: old }]);
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { store, matrix: failing() });
    expect(comparison.days[0].drives[0]).toMatchObject({ state: "stale", label: "10 min · 5.6 mi", known: false,
      detail: "Not updated: calculated 8 days ago, and checking again failed" });
    expect(comparison.options[0].sum_complete).toBe(false);
  });

  it("labels a booked stay chosen for these nights beside an option that overlaps it, reusing the trip's own estimate", async () => {
    const full = splitDriveTrip();
    const pineSaturday = drivePlans(full).find((plan) => plan.date === SAT)!;
    const store = memoryStore([{ date: SAT, route_key: pineSaturday.route_key!, origin_label: "Pine rental", destination_label: "Spruce Peak lot", status: "ok", duration_seconds: 720, distance_meters: 9000, calculated_at: new Date(NOW - 3_600_000).toISOString() }]);
    const matrix = fakeMatrix();
    const comparison = await compare([`stay:${PINE.id}`, `candidate:${A}`], { full, store, matrix });
    expect(comparison.options.map((option) => [option.kind, option.status_label, option.booking_label, option.date_label, option.dates_note])).toEqual([
      ["stay", "Chosen for these nights · 4 people", "Booked", "Saved for Fri Oct 9 → Sun Oct 11 · 2 nights", null],
      ["candidate", "Option you're considering · Not chosen for any nights", "No booking recorded", "Considered for Fri Oct 9 → Sun Oct 11 · 2 nights", null],
    ]);
    expect(comparison.window.nights).toEqual([
      { date: FRI, date_label: "Fri Oct 9", current: "Pine rental (3) · Village hotel (2)", booked: ["Pine rental", "Village hotel"] },
      { date: SAT, date_label: "Sat Oct 10", current: "Pine rental (4) · Village hotel (2)", booked: ["Pine rental", "Village hotel"] },
    ]);
    expect(labels(comparison)).toEqual([[SAT, ["12 min · 5.6 mi", "10 min · 5.6 mi"]], [SUN, ["12 min · 5.6 mi", "10 min · 5.6 mi"]]]);
    // Only the option's drive was new.
    expect(matrix.mock.calls.map(([sources]) => sources.map((source) => source.latitude))).toEqual([[RIDGE.latitude]]);
  });

  it("shows a long drive as the option's longest, even when its other drive is short", async () => {
    const base = splitDriveTrip();
    const smuggs = { ...base.stops[0], id: "stop-smuggs", position: 1, name: "Smugglers' Notch, Vermont", access_point: SMUGGS_LOT };
    const full: TripFull = { ...base, stops: [...base.stops, smuggs], days: base.days.map((day) => day.date === SUN ? { ...day, stop_id: smuggs.id } : day) };
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { full });
    expect(labels(comparison)).toEqual([[SAT, ["10 min · 5.6 mi", "25 min · 5.6 mi"]], [SUN, ["1 hr 10 min · 5.6 mi", "20 min · 5.6 mi"]]]);
    expect(comparison.days[1].notes).toEqual([]);
    expect(comparison.options.map((option) => [option.longest_label, option.sum_label])).toEqual([
      ["1 hr 10 min · Sun Oct 11 to Smuggs lot", "1 hr 20 min"], ["25 min · Sat Oct 10 to Spruce Peak lot", "45 min"]]);
    expect(comparison.days[1].drives.map((drive) => drive.longest)).toEqual([true, false]);
    expect(comparison.summary).toBe("Brook inn has the lowest sum of planned outbound drives, 45 min. Ridge chalet: 35 min more.");
  });

  it("covers a mid-trip move: the nights now, and each option's nights against them", async () => {
    const comparison = await compare([`stay:${LODGE.id}`, `candidate:${A}`], { window: { first_night: FRI, checkout: "2026-10-13" } });
    expect(comparison.window.label).toBe("Fri Oct 9 → Tue Oct 13 · 4 nights");
    // Tuesday's check-out morning isn't a trip day, so it has no drive.
    expect(comparison.window.mornings_label).toBe("Mornings compared: Sat Oct 10, Sun Oct 11 and Mon Oct 12");
    expect(comparison.window.nights.map((night) => night.current)).toEqual(["Pine rental (3) · Village hotel (2)", "Pine rental (4) · Village hotel (2)", "Mountain lodge", "Mountain lodge"]);
    expect(comparison.options.map((option) => [option.status_label, option.dates_note])).toEqual([
      ["Chosen for 2 of these 4 nights · 6 people", "Its dates don't include the nights of Fri Oct 9 and Sat Oct 10."],
      ["Option you're considering · Not chosen for any nights", "Its nights don't include the nights of Sun Oct 11 and Mon Oct 12."],
    ]);
    // Each is tried as everyone's stay for all four nights.
    expect(labels(comparison)).toEqual([[SAT, ["3 min · 5.6 mi", "10 min · 5.6 mi"]], [SUN, ["3 min · 5.6 mi", "10 min · 5.6 mi"]], [MON, ["3 min · 5.6 mi", "10 min · 5.6 mi"]]]);
    expect(comparison.summary).toBe("Mountain lodge has the lowest sum of planned outbound drives, 9 min. Ridge chalet: 21 min more.");
  });

  it("shows each option's cost with its nights and currency, and never compares across currencies", async () => {
    const candidates = [
      candidate(A, "Ridge chalet", RIDGE, { check_in: SAT, check_out: SUN, cost_amount: 300, cost_currency: "USD" }),
      candidate(B, "Brook inn", BROOK, { cost_amount: 900.5, cost_currency: "CAD" }),
    ];
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { candidates });
    expect(comparison.options.map((option) => [option.date_label, option.dates_note, option.cost])).toEqual([
      ["Considered for Sat Oct 10 → Sun Oct 11 · 1 night", "Its nights don't include the night of Fri Oct 9.",
        { label: "About $300 total for Sat Oct 10 → Sun Oct 11 · 1 night", note: "Its estimate is for other nights than these." }],
      ["Considered for Fri Oct 9 → Sun Oct 11 · 2 nights", null, { label: "About CA$900.50 total for Fri Oct 9 → Sun Oct 11 · 2 nights", note: null }],
    ]);
    expect(comparison.cost_note).toBe("Costs are in different currencies, so they aren't compared.");
  });

  it("follows the day's own plans: No drive planned and a day's own starting point are the same for every option", async () => {
    const base = splitDriveTrip();
    const full: TripFull = { ...base, days: base.days.map((day) => day.date === SAT ? { ...day, no_drive: true }
      : day.date === SUN ? { ...day, origin: PINE_PLACE, origin_stay_id: PINE.id } : day) };
    const matrix = fakeMatrix();
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { full, matrix });
    expect(labels(comparison)).toEqual([[SAT, "No drive planned"], [SUN, "Everyone starts from Pine rental that day, its own starting point"]]);
    expect(comparison.options.map((option) => [option.coverage_label, option.sum_label])).toEqual([["No drives to compare", "No drives to total"], ["No drives to compare", "No drives to total"]]);
    expect(comparison.summary).toBe("There are no drives to compare on these mornings.");
    expect(matrix).not.toHaveBeenCalled();
  });

  it("notes people with their own starting point that morning", async () => {
    const base = splitDriveTrip();
    const saturday = base.days.find((day) => day.date === SAT)!;
    const full: TripFull = { ...base, member_origins: [{ trip_id: base.trip.id, trip_day_id: saturday.id, member_id: ALEX.id, origin: LODGE_PLACE, origin_stay_id: null, no_drive: false }] };
    const comparison = await compare([`candidate:${A}`, `candidate:${B}`], { full });
    expect(comparison.days[0].notes).toEqual(["1 person starts from their own starting point that morning, whichever stay is chosen."]);
    expect(labels(comparison)[0]).toEqual([SAT, ["10 min · 5.6 mi", "25 min · 5.6 mi"]]);
  });

  it("refuses stays and options from other trips", async () => {
    const result = await compareStays(splitDriveTrip(), [], request([`candidate:${A}`, `stay:${VILLAGE.id}`]), memoryStore(), { now: NOW, matrix: fakeMatrix() });
    expect(result).toEqual({ error: "Option not found in this trip.", status: 404 });
    const other = await compareStays(splitDriveTrip(), [], request([`stay:${PINE.id}`, `stay:${"4d000000-0000-4000-8000-000000000009"}`]), memoryStore(), { now: NOW });
    expect(other).toEqual({ error: "Stay not found in this trip.", status: 404 });
  });
});

describe("Comparison requests", () => {
  const parse = (params: Record<string, string>) => parseComparisonRequest(new URLSearchParams(params), SPLIT_TRIP);
  it("needs two or three distinct stays", () => {
    expect(parse({ options: `candidate:${A}` })).toEqual({ error: "Choose two or three stays to compare.", field: "options" });
    expect(parse({ options: `candidate:${A},candidate:${A}` })).toEqual({ error: "Choose each stay once.", field: "options" });
    expect(parse({ options: `candidate:${A},hotel:${B}` })).toEqual({ error: "Choose stays from this trip to compare.", field: "options" });
    expect(parse({ options: [A, B, PINE.id, VILLAGE.id].map((id) => `stay:${id}`).join(",") })).toMatchObject({ field: "options" });
  });
  it("uses the trip's nights unless both ends are chosen within it", () => {
    expect(parse({ options: `candidate:${A},candidate:${B}` })).toMatchObject({ first_night: FRI, checkout: MON });
    expect(parse({ options: `candidate:${A},candidate:${B}`, first_night: "2026-10-08", checkout: "2026-10-13" })).toMatchObject({ first_night: "2026-10-08", checkout: "2026-10-13" });
    expect(parse({ options: `candidate:${A},candidate:${B}`, first_night: "2026-10-07", checkout: SAT })).toMatchObject({ field: "first_night" });
    expect(parse({ options: `candidate:${A},candidate:${B}`, first_night: SAT, checkout: SAT })).toMatchObject({ field: "checkout" });
    expect(parse({ options: `candidate:${A},candidate:${B}`, first_night: SAT, checkout: "2026-10-14" })).toMatchObject({ field: "checkout" });
    expect(parse({ options: `candidate:${A},candidate:${B}`, first_night: SAT })).toMatchObject({ field: "checkout" });
  });
});

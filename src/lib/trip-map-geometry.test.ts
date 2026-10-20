// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveGeometry } from "@/lib/locations/geometry";
import { driveTrip } from "@/test/driveTrip";
import { projectTripMap } from "@/lib/trip-map";
import { drivePlans } from "@/lib/trip-drive";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { tripMapGeometry } from "./trip-map-geometry";

vi.mock("@/lib/locations/geometry", () => ({ driveGeometry: vi.fn() }));
const full = driveTrip();
const estimates = await tripDriveEstimates(full, { read: async () => [], write: async () => {} }, { refresh: false });
const day = projectTripMap(full, estimates).days[2];
const plan = drivePlans(full)[2];
const shape = { type: "MultiLineString" as const, coordinates: [[[-72.7, 44.5], [-72.8, 44.6]]] };
let now = 0, sequence = 0;

describe("Bounded private geometry reuse", () => {
  beforeEach(() => {
    now = Date.parse("2027-01-01T00:00:00Z") + ++sequence * 3_600_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(driveGeometry).mockReset().mockResolvedValue(shape);
  });
  afterEach(() => vi.restoreAllMocks());

  it("coalesces concurrent requests for the same trip/day/revision and expires after five minutes", async () => {
    const id = `trip-${sequence}`;
    const results = await Promise.all([tripMapGeometry(id, day, plan), tripMapGeometry(id, day, plan)]);
    expect(results[0]).toEqual(results[1]); expect(driveGeometry).toHaveBeenCalledTimes(1);
    await tripMapGeometry(id, day, plan); expect(driveGeometry).toHaveBeenCalledTimes(1);
    now += 300_001;
    await tripMapGeometry(id, day, plan); expect(driveGeometry).toHaveBeenCalledTimes(2);
  });
  it("isolates trips and revisions, and never caches provider failures", async () => {
    const id = `trip-${sequence}`;
    await tripMapGeometry(id, day, plan);
    await tripMapGeometry(`${id}-other`, day, plan);
    await tripMapGeometry(id, { ...day, geometry: { ...day.geometry, revision: "changed" } }, plan);
    expect(driveGeometry).toHaveBeenCalledTimes(3);
    vi.mocked(driveGeometry).mockRejectedValueOnce(new Error("provider failure"));
    expect((await tripMapGeometry(id, { ...day, geometry: { ...day.geometry, revision: "failed" } }, plan)).state).toBe("unavailable");
    now += 1_001;
    expect((await tripMapGeometry(id, { ...day, geometry: { ...day.geometry, revision: "failed" } }, plan)).state).toBe("available");
  });
  it("preserves no route independently of the manual estimate", async () => {
    const id = `trip-${sequence}`;
    expect((await tripMapGeometry(id, { ...day, drive: { ...day.drive, state: "no_route" } }, plan)).state).toBe("no_route");
    expect(driveGeometry).not.toHaveBeenCalled();
    vi.mocked(driveGeometry).mockResolvedValueOnce(null);
    expect((await tripMapGeometry(id, { ...day, drive: { ...day.drive, state: "manual" } }, plan)).state).toBe("no_route");
  });
  it("limits provider starts to four per second", async () => {
    for (let i = 0; i < 4; i++) expect((await tripMapGeometry(`trip-${sequence}-${i}`, day, plan)).state).toBe("available");
    expect((await tripMapGeometry(`trip-${sequence}-capped`, day, plan)).state).toBe("unavailable");
    expect(driveGeometry).toHaveBeenCalledTimes(4);
  });
  it("allows at most eight distinct in-flight provider requests", async () => {
    const finish: Array<(value: typeof shape) => void> = [];
    vi.mocked(driveGeometry).mockImplementation(() => new Promise((resolve) => finish.push(resolve)));
    const work = [];
    for (let i = 0; i < 8; i++) { now += 1_001; work.push(tripMapGeometry(`trip-${sequence}-${i}`, day, plan)); }
    expect((await tripMapGeometry(`trip-${sequence}-ninth`, day, plan)).state).toBe("unavailable");
    expect(driveGeometry).toHaveBeenCalledTimes(8);
    finish.forEach((resolve) => resolve(shape));
    await Promise.all(work);
  });

  it("evicts the oldest entry once the 128-entry bound is reached", async () => {
    const first = `trip-${sequence}-0`;
    for (let i = 0; i < 129; i++) {
      now += 1_001;
      await tripMapGeometry(`trip-${sequence}-${i}`, day, plan);
    }
    now += 1_001;
    await tripMapGeometry(first, day, plan);
    expect(driveGeometry).toHaveBeenCalledTimes(130);
  });
});

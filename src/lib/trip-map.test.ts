// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { driveTrip, MOTEL, place, SPRUCE_LOT } from "@/test/driveTrip";
import { drivePlans } from "@/lib/trip-drive";
import { tripDriveEstimates, type DriveEstimateStore, type ManualEstimateRow } from "@/lib/trip-drive-estimates";
import { tripMapData } from "./trip-map";
import type { TripFull } from "@/types/trips";

const NOW = Date.parse("2027-01-07T12:00:00Z");
const emptyStore = (): DriveEstimateStore => ({ read: vi.fn(async () => []), write: vi.fn(async () => {}) });

describe("Shared trip map/list projection", () => {
  it("separates checkout origin from tonight and preserves repeated visits and multiple roles", async () => {
    const result = await tripMapData(driveTrip(), emptyStore(), "2027-01-10", NOW);
    expect(result.selected_day).toMatchObject({ id: "day-2027-01-10", origin: "stay:stay-motel:location", crew_stay: "stay:stay-motel:location",
      tonight: "stay:stay-inn:location", access: "stop:stop-smuggs:access_point", destination: "stop:stop-smuggs:destination", tonight_state: "assigned" });
    const motel = result.places.find((p) => p.source.id === "stay-motel")!;
    expect(motel.nights).toEqual(["2027-01-08", "2027-01-09"]);
    expect(motel.night_range).toEqual({ check_in: "2027-01-08", check_out: "2027-01-10" });
    expect(motel.associations).toEqual(expect.arrayContaining([
      { day_id: "day-2027-01-08", date: "2027-01-08", role: "tonight" },
      { day_id: "day-2027-01-09", date: "2027-01-09", role: "origin" },
      { day_id: "day-2027-01-10", date: "2027-01-10", role: "origin" },
    ]));
    expect(result.days.slice(0, 2).map((d) => d.destination)).toEqual(["stop:stop-stowe:destination", "stop:stop-stowe:destination"]);
    expect(result.days[0].origin).toBeNull();
  });

  it("reuses first-day and day-only origins, saved-stay identity, and own access point", async () => {
    const full = driveTrip();
    full.days[0].origin = place("Home", 0, -71);
    full.days[1] = { ...full.days[1], origin: MOTEL, origin_stay_id: "stay-motel", access_point: place("Own lot", 44, 0), access_point_stop_id: "stop-stowe" };
    const result = await tripMapData(full, emptyStore());
    expect(result.days[0]).toMatchObject({ origin: "day:day-2027-01-08:origin", drive: { origin: { own: true } } });
    expect(result.days[1]).toMatchObject({ origin: "stay:stay-motel:location", access: "day:day-2027-01-09:access_point" });
    expect(result.places.find((p) => p.id === result.days[0].origin)?.coordinates).toEqual({ latitude: 0, longitude: -71 });
    expect(result.places.find((p) => p.id === result.days[1].access)?.coordinates).toEqual({ latitude: 44, longitude: 0 });
  });

  it("doesn't merge co-located entities, invent destination precision or treat zeros as missing", async () => {
    const full = driveTrip();
    full.stops[0] = { ...full.stops[0], latitude: 0, longitude: 0, access_point: { ...SPRUCE_LOT, latitude: 0, longitude: 0 } };
    const result = await tripMapData(full, emptyStore());
    expect(result.places.filter((p) => p.coordinates?.latitude === 0 && p.coordinates.longitude === 0)).toHaveLength(2);
    expect(result.places.find((p) => p.id === "stop:stop-stowe:destination")).toMatchObject({ mapping: "mapped", precision: "unknown", provenance: { source: "legacy_destination", provider: null } });
  });

  it("excludes unassigned candidate stays unless explicitly selected as an origin", async () => {
    const full = driveTrip();
    full.lodging!.stays.push({ ...full.lodging!.stays[0], id: "candidate", name: "Candidate hotel", assigned_nights: [] });
    expect((await tripMapData(full, emptyStore())).places.some((p) => p.source.id === "candidate")).toBe(false);
    full.days[0].origin = MOTEL; full.days[0].origin_stay_id = "candidate";
    const result = await tripMapData(full, emptyStore());
    expect(result.days[0].origin).toBe("stay:candidate:location");
    expect(result.places.find((p) => p.id === result.days[0].origin)?.label).toBe("Candidate hotel");
  });

  it.each([null, undefined, NaN, Infinity, 91, "0"])("keeps missing/invalid coordinates (%s) out of routing", async (latitude) => {
    const full = driveTrip();
    full.stops[0].latitude = latitude as number | null;
    full.lodging!.stays[0].location = { ...MOTEL, latitude: latitude as number };
    const result = await tripMapData(full, emptyStore());
    const expected = latitude == null ? "missing_coordinates" : "invalid_coordinates";
    expect(result.places.find((p) => p.id === "stop:stop-stowe:destination")).toMatchObject({ coordinates: null, mapping: expected });
    expect(result.days[1].drive).toMatchObject({ state: "origin_not_located", pair_key: null });
  });

  it("keeps approximate places mapped without routing them, and preserves no-drive/no-stay", async () => {
    const full = driveTrip();
    full.lodging!.stays[0].location = { ...MOTEL, precision: "approximate" };
    full.days[2].no_drive = true;
    full.lodging!.nights.find((n) => n.date === full.days[3].date)!.status = "no_stay";
    full.lodging!.days[3].staying_tonight = "No stay needed";
    const result = await tripMapData(full, emptyStore());
    expect(result.days[1].drive.state).toBe("approximate_origin");
    expect(result.places.find((p) => p.id === result.days[1].origin)).toMatchObject({ mapping: "mapped", precision: "approximate" });
    expect(result.days[2].drive.state).toBe("no_drive");
    expect(result.days[3]).toMatchObject({ tonight: null, tonight_state: "no_stay", staying_tonight: "No stay needed" });
  });

  it("consumes #210's canonical meeting point and reports notes-only pickup honestly", async () => {
    const full = driveTrip();
    full.tour_plans = [{ id: "tour", trip_id: full.trip.id, trip_day_id: full.days[1].id, pickup_notes: "Wait by the exit", meet_label: "6:30 AM EST" }] as TripFull["tour_plans"];
    const result = await tripMapData(full, emptyStore());
    expect(result.days[1]).toMatchObject({ meeting: result.days[1].access, pickup: null, pickup_state: "notes_only", meet_label: "6:30 AM EST" });
    expect(result.places.find((p) => p.id === result.days[1].access)?.associations).toContainEqual({ day_id: full.days[1].id, date: full.days[1].date, role: "meeting" });
  });

  it("reads #209's manual/fresh/stale/no-route states without calling a provider or writing", async () => {
    const full = driveTrip(), plans = drivePlans(full);
    const store = emptyStore();
    const rows = plans.filter((p) => p.state === "ready").map((p) => ({ date: p.date, route_key: p.route_key!, origin_label: p.origin!.label,
      destination_label: p.destination!.label, status: "ok" as const, duration_seconds: 720, distance_meters: 9000, calculated_at: new Date(NOW).toISOString() }));
    store.read = vi.fn(async () => rows);
    const matrix = vi.fn(async () => { throw new Error("No network"); });
    const expected = await tripDriveEstimates(full, store, { now: NOW, matrix });
    const result = await tripMapData(full, store, undefined, NOW);
    expect(result.days.map((d) => d.drive)).toEqual(expected.days);
    expect(matrix).not.toHaveBeenCalled();
    rows[0].calculated_at = "2026-01-01T00:00:00Z";
    expect((await tripMapData(full, store, undefined, NOW)).days[1].drive.state).toBe("stale");
    store.read = async () => [{ ...rows[0], status: "no_route", calculated_at: new Date(NOW).toISOString(), duration_seconds: null, distance_meters: null }];
    expect((await tripMapData(full, store, undefined, NOW)).days[1].drive.state).toBe("no_route");
    store.manual = async () => [{ trip_day_id: full.days[1].id, pair_key: plans[1].pair_key!, origin_label: "Motel", destination_label: "Lot", duration_seconds: 2400, note: null, use_calculated: false, entered_at: new Date(NOW).toISOString() } satisfies ManualEstimateRow];
    expect((await tripMapData(full, store, undefined, NOW)).days[1].drive).toMatchObject({ state: "manual", manual: { current: true } });
    expect(store.write).not.toHaveBeenCalled();
  });

  it("is available when estimate storage fails, and excludes private payloads", async () => {
    const full = driveTrip();
    full.members = [{ invite_token: "secret-invite" }] as TripFull["members"];
    full.kits = [{ note: "private-kit" }] as TripFull["kits"];
    full.lodging!.stays[0].notes = "booking-secret";
    const store = emptyStore(); store.read = async () => { throw new Error(); };
    const result = await tripMapData(full, store);
    expect(result.days[1].drive.state).toBe("unavailable");
    expect(JSON.stringify(result)).not.toMatch(/secret-invite|private-kit|booking-secret|owner_user_id|booking_status/);
  });

  it("revises refreshed estimate data independently from unchanged geometry and clock age", async () => {
    const full = driveTrip(), plan = drivePlans(full)[1], store = emptyStore();
    const before = await tripMapData(full, store, undefined, NOW);
    store.read = async () => [{ date: plan.date, route_key: plan.route_key!, origin_label: plan.origin!.label, destination_label: plan.destination!.label,
      status: "ok", duration_seconds: 720, distance_meters: 9000, calculated_at: new Date(NOW).toISOString() }];
    const refreshed = await tripMapData(full, store, undefined, NOW);
    expect(refreshed.revision).not.toBe(before.revision);
    expect(refreshed.days[1].revision).toBe(before.days[1].revision);
    const later = await tripMapData(full, store, undefined, NOW + 60_000);
    expect(later.days[1].drive.estimate?.age_label).not.toBe(refreshed.days[1].drive.estimate?.age_label);
    expect(later.revision).toBe(refreshed.revision);
  });

  it("revises changed endpoints/options while unrelated kits and clock age don't change revisions", async () => {
    const full = driveTrip();
    const before = await tripMapData(full, emptyStore(), undefined, NOW);
    expect((await tripMapData(full, emptyStore(), undefined, NOW + 86400000)).revision).toBe(before.revision);
    full.lodging!.stays[0].notes = "Secret booking update";
    expect((await tripMapData(full, emptyStore())).revision).toBe(before.revision);
    full.days[1].access_point = place("New access", 45, -73); full.days[1].access_point_stop_id = "stop-stowe";
    const after = await tripMapData(full, emptyStore());
    expect(after.revision).not.toBe(before.revision);
    expect(after.days[1].revision).not.toBe(before.days[1].revision);
    expect(after.days[2].revision).toBe(before.days[2].revision);
    full.days[2].no_drive = true;
    expect((await tripMapData(full, emptyStore())).days[2].revision).not.toBe(after.days[2].revision);
  });

  it("ignores own access saved for a removed/foreign stop, as #176/#208 require", async () => {
    const full = driveTrip();
    full.days[1].access_point = place("Inactive private point", 45, -73);
    full.days[1].access_point_stop_id = "removed-or-foreign-stop";
    const result = await tripMapData(full, emptyStore());
    expect(result.days[1].access).toBe("stop:stop-stowe:access_point");
    expect(JSON.stringify(result)).not.toMatch(/Inactive private point|removed-or-foreign-stop/);
  });

  it("keeps dates selectable with no destinations or mapped places", async () => {
    const full = driveTrip();
    full.stops = []; full.days.forEach((d) => { d.stop_id = null; });
    full.lodging!.stays.forEach((s) => { s.location = null; });
    const result = await tripMapData(full, emptyStore(), full.days[1].date);
    expect(result.selected_day).toMatchObject({ destination: null, access: null, drive: { state: "no_destination" } });
    expect(result.places.every((p) => p.mapping === "missing_coordinates")).toBe(true);
    expect(result.days).toHaveLength(4);
  });

  it.each(["stop", "day", "stay", "origin_stay", "tour", "night"])("rejects a foreign %s reference before estimate reads", async (kind) => {
    const full = driveTrip(), store = emptyStore();
    if (kind === "stop") full.days[0].stop_id = "other-trip-stop";
    if (kind === "day") full.days[0].trip_id = "other-trip";
    if (kind === "stay") full.lodging!.stays[0].trip_id = "other-trip";
    if (kind === "origin_stay") full.days[0].origin_stay_id = "other-trip-stay";
    if (kind === "tour") full.tour_plans = [{ trip_id: full.trip.id, trip_day_id: "foreign-day" }] as TripFull["tour_plans"];
    if (kind === "night") full.lodging!.assignments[0].stay_id = "foreign-stay";
    await expect(tripMapData(full, store)).rejects.toThrow("Invalid trip map references");
    expect(store.read).not.toHaveBeenCalled();
  });
});

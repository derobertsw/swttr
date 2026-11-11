import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { assertCanAccessTrip, loadTripFull } from "@/lib/trips";
import { planDay, savedOutfit, savedPlan, WEAR } from "@/test/savedKit";
import { ORGANIZER, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import type { TripDay, TripMemberDayKit } from "@/types/trips";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
vi.mock("@/lib/trips", async (original) => ({
  ...await original<typeof import("@/lib/trips")>(), assertCanAccessTrip: vi.fn(), loadTripFull: vi.fn(),
}));

const rpc = vi.fn();
const SAVE_ID = "6f1f0a52-8d43-4c55-9a39-1b2c3d4e5f60";
const NEW_ID = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const TRIP_ID = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const KIT: TripMemberDayKit = {
  id: "kit-1", trip_day_id: "day-1", trip_member_id: "member-you", effort: "steady", items: [], note: null,
  state: "ok", updated_at: "2026-10-06T20:01:02.123456+00:00", outfit: savedOutfit(), outfit_saved_at: "2026-10-06T20:01:02.123456+00:00",
};
const request = (overrides: object = {}) => ({ save_id: SAVE_ID, target: { trip_id: TRIP_ID }, outfit: savedOutfit(), ...overrides });
const save = (body: unknown) => POST(new NextRequest("http://localhost/api/v1/trips/kits", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
}));

describe("Save an outing's kit to a trip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", supabase: { rpc } as unknown as SupabaseClient });
    rpc.mockResolvedValue({ data: { status: "saved", trip: TRIP, created: false, kits: [{ ...KIT, date: "2026-10-10" }] }, error: null });
  });

  it("saves the signed-in member's kit for the outing's destination-local date", async () => {
    const response = await save({ ...request(), user_id: "user-2" });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_trip_kits", {
      p_save_id: SAVE_ID,
      p_user_id: "user-1",
      p_trip_id: TRIP_ID,
      p_new_trip: null,
      p_days: [{ date: "2026-10-10", effort: "steady", activity: "Alpine", outfit: savedOutfit() }],
      p_replace: {},
    });
  });

  it("makes a new one-day trip from the outing's date, place and activity", async () => {
    rpc.mockResolvedValue({ data: { status: "saved", trip: { ...TRIP, id: NEW_ID }, created: true, kits: [] }, error: null });
    const response = await save(request({ target: { new_trip: { id: NEW_ID, name: "Stowe trip" } } }));
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("save_trip_kits", expect.objectContaining({
      p_trip_id: NEW_ID,
      p_new_trip: {
        name: "Stowe trip", start_date: "2026-10-10", end_date: "2026-10-10", status: expect.any(String),
        destination: { name: "Stowe, Vermont", latitude: 44.47, longitude: -72.69 }, activity: "Alpine",
      },
    }));
  });

  it("saves each day of a plan that has layers, and spans a new trip over the whole outing", async () => {
    rpc.mockResolvedValue({ data: { status: "saved", trip: { ...TRIP, id: NEW_ID }, created: true, kits: [] }, error: null });
    const response = await save({ save_id: SAVE_ID, target: { new_trip: { id: NEW_ID, name: "Stowe tour" } }, plan: savedPlan() });
    expect(response.status).toBe(201);
    const [, args] = rpc.mock.calls[0];
    expect(args.p_days).toEqual([
      { date: "2026-10-10", effort: "hard", activity: "Backcountry", outfit: expect.objectContaining({ kind: "plan_day", startHour: 9, day: planDay("2026-10-10") }) },
      { date: "2026-10-11", effort: "hard", activity: "Backcountry", outfit: expect.objectContaining({ kind: "plan_day", startHour: 6 }) },
    ]);
    // Monday has no layers, but it's still part of the trip.
    expect(args.p_new_trip).toMatchObject({ name: "Stowe tour", start_date: "2026-10-10", end_date: "2026-10-12", activity: "Backcountry" });
  });

  it("compares each conflicting day of a plan with that day's new layers", async () => {
    rpc.mockResolvedValue({ data: { status: "conflict", trip: TRIP, conflicts: [{ date: "2026-10-11", kit: KIT }] }, error: null });
    const sunday = planDay("2026-10-11", { baseline: { ...planDay("2026-10-11").baseline, recommendation: { ...WEAR, hands: { base: [], outer: [] } } } });
    const response = await save({ save_id: SAVE_ID, target: { trip_id: TRIP_ID }, plan: savedPlan({ days: [planDay("2026-10-10"), sunday] }) });
    expect(response.status).toBe(409);
    expect((await response.json()).conflicts).toEqual([
      { date: "2026-10-11", kit: KIT, changes: [{ phase: "outing", add: [], remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }] }] },
    ]);
  });

  it("fits a full seven-day plan in the body limit", async () => {
    const week = savedPlan({
      outing: { ...savedPlan().outing, when: { mode: "later", date: "2026-10-10", time: "09:00", durationDays: 7 } },
      days: ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((date) => planDay(date, {
        dayparts: [0, 1, 2].map((index) => ({ ...planDay(date).dayparts[0], id: (["morning", "midday", "evening"] as const)[index], changes: { add: [], remove: [] } })),
      })),
    });
    expect((await save({ save_id: SAVE_ID, target: { trip_id: TRIP_ID }, plan: week })).status).toBe(200);
  });

  it("classifies a new trip by today at the destination, not on the server's clock", async () => {
    // 10:30pm on Oct 6 in Vermont is already Oct 7 in UTC.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-07T02:30:00Z") });
    try {
      const outfit = savedOutfit({
        outing: { ...savedOutfit().outing, when: { mode: "now" } },
        weather: { temperature: 30, windSpeed: 5, context: { source: "current", provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" }, timeZone: "America/New_York", observedTime: "2026-10-06T22:15-04:00" } } },
      });
      await save(request({ outfit, target: { new_trip: { id: NEW_ID, name: "Stowe trip" } } }));
      expect(rpc).toHaveBeenCalledWith("save_trip_kits", expect.objectContaining({
        p_new_trip: expect.objectContaining({ start_date: "2026-10-06", end_date: "2026-10-06", status: "live" }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a replayed save without reporting a new trip", async () => {
    rpc.mockResolvedValue({ data: { status: "saved", trip: TRIP, created: true, kits: [], replayed: true }, error: null });
    expect((await save(request({ target: { new_trip: { id: NEW_ID, name: "Stowe trip" } } }))).status).toBe(200);
  });

  it("stops at an existing kit, listing it with what replacing it changes", async () => {
    const next = savedOutfit({ phases: [{ id: "outing", wear: { ...WEAR, hands: { base: [], outer: [] } }, carry: [], decision: null }] });
    rpc.mockResolvedValue({ data: { status: "conflict", trip: TRIP, conflicts: [{ date: "2026-10-10", kit: KIT }, { date: "2026-10-11", kit: { ...KIT, outfit: null, items: ["shell"] } }] }, error: null });
    const response = await save(request({ outfit: next }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "You already have kits for those days.",
      status: "conflict",
      trip: TRIP,
      conflicts: [
        { date: "2026-10-10", kit: KIT, changes: [{ phase: "outing", add: [], remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }] }] },
        { date: "2026-10-11", kit: { ...KIT, outfit: null, items: ["shell"] }, changes: null },
      ],
    });
  });

  it("passes the confirmed versions to replace", async () => {
    const replace = { "2026-10-10": KIT.updated_at };
    await save(request({ replace }));
    expect(rpc).toHaveBeenCalledWith("save_trip_kits", expect.objectContaining({ p_replace: replace }));
  });

  it.each([
    ["P0002", 404],
    ["22008", 422],
    ["42501", 409],
    ["22023", 409],
    ["XX000", 500],
  ])("maps database error %s to %i without its details", async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "Internal details" } });
    const response = await save(request());
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("Internal details");
  });

  it.each([
    ["no layers", request({ outfit: { ...savedOutfit(), advice: { kind: "none", reason: "no_gear" } } })],
    ["a bad save identity", request({ save_id: "x" })],
    ["no trip", request({ target: null })],
    ["malformed JSON", "{"],
  ])("refuses %s before touching the database", async (_label, body) => {
    expect((await save(body)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a now outing at a place whose date can't be told", async () => {
    const outfit = savedOutfit({
      outing: { ...savedOutfit().outing, place: { id: 0, name: "Your location", country: "", latitude: 44.47, longitude: -72.69 }, when: { mode: "now" } },
      weather: { temperature: 20, windSpeed: 5, context: { source: "current" } },
    });
    expect((await save(request({ outfit }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an oversized body", async () => {
    expect((await save(JSON.stringify({ ...request(), padding: "x".repeat(200_000) }))).status).toBe(413);
  });

  it("needs a signed-in user", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    expect((await save(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  describe("layers planned from a trip day (#335)", () => {
    const DAY_ID = "0b5a3a52-6a8e-4c1f-9f3e-4b2d1c0a9e81";
    const STOP_ID = "5f9d2c1b-3e4a-4b6c-8d7e-9a0b1c2d3e4f";
    const DAY: TripDay = { id: DAY_ID, trip_id: TRIP_ID, stop_id: STOP_ID, date: "2026-10-10", activity: "Alpine" };
    const STOP = { ...STOWE_STOP, id: STOP_ID, trip_id: TRIP_ID };
    const planned = { day_id: DAY_ID, activity: "Alpine", stop: { id: STOP_ID, latitude: 44.47, longitude: -72.69 }, participation: "participating" };
    const fromDay = (overrides: object = {}) => request({ trip_day: { date: "2026-10-10", planned }, ...overrides });
    let receipts: Record<string, unknown>[];

    beforeEach(() => {
      receipts = [];
      vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", supabase: { ...createFakeSupabase({ trip_kit_saves: receipts }), rpc } as unknown as SupabaseClient });
      vi.mocked(assertCanAccessTrip).mockResolvedValue({ ...TRIP, id: TRIP_ID });
      vi.mocked(loadTripFull).mockResolvedValue(tripFull({ trip: { ...TRIP, id: TRIP_ID }, stops: [STOP], days: [DAY], members: [ORGANIZER] }));
    });

    it("saves them when the day is as it was planned", async () => {
      const response = await save(fromDay());
      expect(response.status).toBe(200);
      expect(assertCanAccessTrip).toHaveBeenCalledWith(expect.anything(), TRIP_ID, "user-1");
      expect(rpc).toHaveBeenCalledWith("save_trip_kits", expect.objectContaining({ p_trip_id: TRIP_ID, p_days: [expect.objectContaining({ date: "2026-10-10" })] }));
    });

    it("saves nothing and says what changed when the day changed since", async () => {
      vi.mocked(loadTripFull).mockResolvedValue(tripFull({
        trip: { ...TRIP, id: TRIP_ID }, stops: [STOP], days: [{ ...DAY, activity: "Hike" }], members: [ORGANIZER],
      }));
      const response = await save(fromDay());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "This day changed while you were planning.", code: "day_changed", changes: ["Activity changed to Hike."] });
      expect(rpc).not.toHaveBeenCalled();
      // Sent without the day, the same save goes ahead: Save anyway.
      expect((await save(request())).status).toBe(200);
      expect(rpc).toHaveBeenCalledOnce();
    });

    it("replays a save that already went through, however the day changed since", async () => {
      // The first answer was lost; the organizer changed the day before the retry.
      receipts.push({ save_id: SAVE_ID, trip_id: TRIP_ID, user_id: "user-1", input_hash: "h", result: {} });
      vi.mocked(loadTripFull).mockResolvedValue(tripFull({
        trip: { ...TRIP, id: TRIP_ID }, stops: [STOP], days: [{ ...DAY, activity: "Hike" }], members: [ORGANIZER],
      }));
      rpc.mockResolvedValue({ data: { status: "saved", trip: TRIP, created: false, replayed: true, kits: [{ ...KIT, date: "2026-10-10" }] }, error: null });
      const response = await save(fromDay());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "saved", replayed: true });
      expect(loadTripFull).not.toHaveBeenCalled();
      // Another account's receipt doesn't skip the check: on an unchanged day,
      // the save function refuses the identity.
      receipts[0].user_id = "user-2";
      vi.mocked(rpc).mockClear();
      vi.mocked(loadTripFull).mockResolvedValue(tripFull({ trip: { ...TRIP, id: TRIP_ID }, stops: [STOP], days: [DAY], members: [ORGANIZER] }));
      rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
      const refused = await save(fromDay());
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ code: "identity" });
      expect(loadTripFull).toHaveBeenCalledOnce();
      expect(rpc).toHaveBeenCalledOnce();
    });

    it.each([
      ["another day's", { outfit: savedOutfit({ outing: { ...savedOutfit().outing, when: { mode: "later", date: "2026-10-11", time: "09:00", durationDays: 1 } } }) }],
      ["another activity's", { outfit: savedOutfit({ outing: { ...savedOutfit().outing, activity: "hiking_snowshoeing" } }) }],
      ["another place's", { outfit: savedOutfit({ outing: { ...savedOutfit().outing, place: { ...savedOutfit().outing.place, latitude: 45 } } }) }],
      ["a new trip's", { target: { new_trip: { id: NEW_ID, name: "Stowe trip" } } }],
    ])("refuses %s layers as the trip day's", async (_case, overrides) => {
      expect((await save(fromDay(overrides))).status).toBe(422);
      expect(loadTripFull).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("refuses a trip the person isn't on, and a malformed day", async () => {
      vi.mocked(assertCanAccessTrip).mockResolvedValue(null);
      expect((await save(fromDay())).status).toBe(404);
      expect((await save(request({ trip_day: { date: "2026-10-10", planned: { ...planned, day_id: "day-1" } } }))).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});

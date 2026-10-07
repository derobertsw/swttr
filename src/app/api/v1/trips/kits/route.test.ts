import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { savedOutfit, WEAR } from "@/test/savedKit";
import { TRIP } from "@/test/tripApi";
import type { TripMemberDayKit } from "@/types/trips";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

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
      error: "You already have a kit for that day.",
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
    expect((await save(JSON.stringify({ ...request(), padding: "x".repeat(100_000) }))).status).toBe(413);
  });

  it("needs a signed-in user", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    expect((await save(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});

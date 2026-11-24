import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { savedOutfit } from "@/test/savedKit";
import { GET, PUT } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const memberId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const otherMemberId = "1a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const kitId = "2a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const SAVED_AT = "2026-10-08T20:00:00+00:00";
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const url = (date = "2026-10-10") => `http://localhost/api/v1/trips/${TRIP.id}/days/${date}/feedback`;
const get = (date?: string) => GET(new Request(url(date)), context(date));
const put = (body: unknown, date?: string) => PUT(new Request(url(date), { method: "PUT", body: JSON.stringify(body) }), context(date));

let tables: Record<string, Record<string, unknown>[]>;
function signIn(userId: string, { kit = {}, missing = [] }: { kit?: Record<string, unknown> | null; missing?: string[] } = {}) {
  tables = {
    trips: [TRIP as unknown as Record<string, unknown>],
    trip_members: [
      { id: memberId, trip_id: TRIP.id, user_id: "user-1", display_name: "You", role: "organizer", status: "joined" },
      { id: otherMemberId, trip_id: TRIP.id, user_id: "user-2", display_name: "Sam", role: "member", status: "joined" },
    ],
    trip_days: [{ id: dayId, trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: "Resort" }],
    trip_stops: [],
    trip_member_day_kits: kit === null ? [] : [{ id: kitId, trip_day_id: dayId, trip_member_id: memberId, effort: "steady", items: [],
      note: null, state: "ok", updated_at: SAVED_AT, outfit: savedOutfit(), outfit_saved_at: SAVED_AT, ...kit }],
    user_preferences: [],
    user_outing_feedback: [],
  };
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase: createFakeSupabase(tables, { missing }) as unknown as SupabaseClient });
}

describe("Feedback on a trip day's saved kit (#8)", () => {
  // The kit's outing starts at 9 AM in Stowe on Oct 10: 13:00 UTC.
  const at = (iso: string) => vi.setSystemTime(Date.parse(iso));
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T18:00:00Z") });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected request"))));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("isn't asked for before the outing starts, and says when it opens", async () => {
    signIn("user-1");
    at("2026-10-10T12:59:00Z");
    expect(await (await get()).json()).toEqual({ status: "not_started", opens_at: "2026-10-10T13:00:00.000Z" });
    const response = await put({ answer: { overall: "too_cold" } });
    expect(response.status).toBe(409);
    expect(tables.user_outing_feedback).toEqual([]);
  });

  it("opens once the outing has started, saves the answer about the kit as saved, and reads it back", async () => {
    signIn("user-1");
    expect(await (await get()).json()).toEqual({ status: "open", feedback: null });
    const response = await put({ answer: { overall: "too_cold", moments: ["stops"], body_areas: ["hands"] } });
    expect(response.status).toBe(200);
    expect(tables.user_outing_feedback).toEqual([expect.objectContaining({
      user_id: "user-1", source: "trip_kit", source_key: `trip_kit:${kitId}:2026-10-08T20:00:00.000Z`, trip_id: TRIP.id,
      trip_date: "2026-10-10", activity: "alpine_skiing", recommended_at: "2026-10-08T20:00:00.000Z",
      outing_started_at: "2026-10-10T13:00:00.000Z",
      context: expect.objectContaining({ preference: { at_recommendation: null, at_feedback: null }, minutes_after_start: 300 }),
    })]);
    expect(await (await get()).json()).toEqual({ status: "open",
      feedback: expect.objectContaining({ overall: "too_cold", moments: ["stops"], body_areas: ["hands"], worn: null }) });
  });

  it("changes the same answer when it's given again, and asks again about a replaced kit", async () => {
    signIn("user-1");
    await put({ answer: { overall: "too_cold" } });
    await put({ answer: { overall: "just_right", worn: { as_suggested: true } } });
    expect(tables.user_outing_feedback).toHaveLength(1);
    expect(tables.user_outing_feedback[0]).toMatchObject({ overall: "just_right", worn: { as_suggested: true } });
    tables.trip_member_day_kits[0].outfit_saved_at = "2026-10-09T20:00:00+00:00";
    expect(await (await get()).json()).toEqual({ status: "open", feedback: null });
  });

  it("is only about the person's own saved outfit", async () => {
    signIn("user-2");
    expect(await (await get()).json()).toEqual({ status: "no_kit" });
    expect((await put({ answer: { overall: "too_cold" } })).status).toBe(404);
    signIn("user-1", { kit: { outfit: null, items: ["shirt"] } });
    expect(await (await get()).json()).toEqual({ status: "no_kit" });
    signIn("user-3");
    expect((await get()).status).toBe(404);
    expect(tables.user_outing_feedback).toEqual([]);
  });

  it("refuses a malformed answer or a day off the trip", async () => {
    signIn("user-1");
    expect((await put({ answer: { overall: "meh" } })).status).toBe(400);
    expect((await put({ answer: { overall: "too_cold" } }, "2026-10-12")).status).toBe(404);
    expect((await get("Oct 10")).status).toBe(404);
  });

  it("says feedback isn't available before its migration", async () => {
    signIn("user-1", { missing: ["user_outing_feedback"] });
    expect((await get()).status).toBe(503);
    expect((await put({ answer: { overall: "too_cold" } })).status).toBe(503);
  });
});

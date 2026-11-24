import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { savedOutfit } from "@/test/savedKit";
import type { SavedOutfit } from "@/types/savedKit";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const KEY = "5b6c0a9e-4f0f-4b1a-9c55-0d9c1f6f4c11";
/** A run for now at Stowe, its conditions read at 7:15 that morning. */
const RUN: SavedOutfit = savedOutfit({
  outing: { ...savedOutfit().outing, activity: "running", when: { mode: "now" } },
  weather: {
    temperature: 56, windSpeed: 8, precipitation: false,
    context: { source: "current", place: "Stowe, Vermont, United States",
      provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" },
        timeZone: "America/New_York", observedTime: "2026-10-10T07:15-04:00" } },
  },
});

let tables: Record<string, Record<string, unknown>[]>;
function signIn(userId = "user_1", missing: string[] = []) {
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase: createFakeSupabase(tables, { missing }) as unknown as SupabaseClient });
}
const post = (body: unknown) => POST(new Request("http://localhost/api/v1/outing-feedback", { method: "POST", body: JSON.stringify(body) }));
const answer = (overall = "too_warm", extra: Record<string, unknown> = {}) => ({ overall, ...extra });

describe("POST /api/v1/outing-feedback (#8)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-10T12:30:00Z") });
    tables = { user_preferences: [{ user_id: "user_1", temperature_sensitivity: "cold", height_inches: 70, weight_lbs: 150 }], user_outing_feedback: [] };
    signIn();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("saves a one-tap answer for the signed-in person, with the outing's context", async () => {
    const response = await post({ key: KEY, outfit: RUN, sensitivity: "neutral", answer: answer() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feedback: expect.objectContaining({ overall: "too_warm", moments: [], body_areas: [], worn: null }) });
    expect(tables.user_outing_feedback).toEqual([expect.objectContaining({
      user_id: "user_1", source: "gear_up", source_key: `gear_up:${KEY}`, activity: "running", trip_id: null,
      context: expect.objectContaining({
        preference: { at_recommendation: "neutral", at_feedback: "cold" },
        body: { height_band_in: 68, weight_band_lb: 140 },
        minutes_after_start: 75,
      }),
    })]);
  });

  it("replaces the answer when it's sent again for the same result, rather than adding one", async () => {
    await post({ key: KEY, outfit: RUN, answer: answer() });
    const worn = { as_suggested: false, items: [{ source: "generic", generic: "t_shirt" }, { source: "generic", generic: "shorts" }], bare: ["head_neck", "hands"] };
    const response = await post({ key: KEY, outfit: RUN, answer: answer("just_right", { worn }) });
    expect((await response.json()).feedback).toMatchObject({ overall: "just_right", worn: { as_suggested: false, bare: ["head_neck", "hands"] } });
    expect(tables.user_outing_feedback).toHaveLength(1);
    expect(tables.user_outing_feedback[0]).toMatchObject({ overall: "just_right", context: expect.objectContaining({ preference: { at_recommendation: null, at_feedback: "cold" } }) });
  });

  it("keeps another person's answer about their own result apart", async () => {
    await post({ key: KEY, outfit: RUN, answer: answer() });
    signIn("user_2");
    await post({ key: KEY, outfit: RUN, answer: answer("too_cold") });
    expect(tables.user_outing_feedback.map((row) => [row.user_id, row.overall])).toEqual([["user_1", "too_warm"], ["user_2", "too_cold"]]);
  });

  it("refuses an answer about a later outing that hasn't started", async () => {
    const response = await post({ key: KEY, outfit: savedOutfit({ outing: { ...savedOutfit().outing, when: { mode: "later", date: "2026-10-10", time: "15:00", durationDays: 1 } } }), answer: answer() });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "not_started", opens_at: "2026-10-10T19:00:00.000Z" });
    expect(tables.user_outing_feedback).toEqual([]);
  });

  it.each([
    ["a missing key", { outfit: RUN, answer: answer() }],
    ["a malformed outfit", { key: KEY, outfit: { ...RUN, phases: [] }, answer: answer() }],
    ["an unknown preference", { key: KEY, outfit: RUN, sensitivity: "lukewarm", answer: answer() }],
    ["no answer", { key: KEY, outfit: RUN }],
  ])("refuses %s", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
    expect(tables.user_outing_feedback).toEqual([]);
  });

  it("needs a signed-in person", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    expect((await post({ key: KEY, outfit: RUN, answer: answer() })).status).toBe(401);
  });

  it("says feedback can't be saved yet before its migration", async () => {
    signIn("user_1", ["user_outing_feedback"]);
    const response = await post({ key: KEY, outfit: RUN, answer: answer() });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Feedback can't be saved yet. Try again later." });
  });
});

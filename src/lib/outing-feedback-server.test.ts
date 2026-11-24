// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  feedbackRecord,
  outingStartedAt,
  readFeedbackAnswer,
  readPreferenceContext,
  tripKitSourceKey,
} from "@/lib/outing-feedback-server";
import { planDayKits } from "@/lib/trip-saved-kits";
import { savedOutfit, savedPlan } from "@/test/savedKit";
import type { SupabaseClient } from "@supabase/supabase-js";


const NOW_OUTFIT = savedOutfit({
  outing: { ...savedOutfit().outing, activity: "running", when: { mode: "now" } },
  weather: {
    temperature: 56, windSpeed: 8, precipitation: false,
    context: { source: "current", place: "Stowe, Vermont, United States",
      provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" },
        timeZone: "America/New_York", observedTime: "2026-10-10T07:15-04:00" } },
  },
});

describe("readFeedbackAnswer", () => {
  it("takes one tap: only how it felt overall, with everything else unknown", () => {
    expect(readFeedbackAnswer({ overall: "too_warm" })).toEqual({ overall: "too_warm", moments: [], body_areas: [], worn: null });
  });

  it("keeps when and where it felt off, in a fixed order", () => {
    expect(readFeedbackAnswer({ overall: "too_cold", moments: ["stops", "start"], body_areas: ["hands", "head_neck"] }))
      .toMatchObject({ moments: ["start", "stops"], body_areas: ["head_neck", "hands"] });
  });

  it("drops when and where for just right", () => {
    expect(readFeedbackAnswer({ overall: "just_right", moments: ["stops"], body_areas: ["hands"] }))
      .toMatchObject({ moments: [], body_areas: [] });
  });

  it("takes the suggested layers as worn only when said", () => {
    expect(readFeedbackAnswer({ overall: "just_right", worn: { as_suggested: true } })).toMatchObject({ worn: { as_suggested: true } });
    expect(readFeedbackAnswer({ overall: "just_right", worn: null })).toMatchObject({ worn: null });
  });

  it("keeps a corrected outfit: suggested and wardrobe items, generic entries by their own name, and no hat or gloves", () => {
    expect(readFeedbackAnswer({ overall: "just_right", worn: { as_suggested: false, bare: ["hands", "head_neck"], items: [
      { source: "suggested", area: "torso", name: " Merino crew ", item_id: "g-1" },
      { source: "generic", generic: "shorts", name: "Swim trunks", area: "torso" },
    ] } })).toMatchObject({ worn: { as_suggested: false, bare: ["head_neck", "hands"], items: [
      { source: "suggested", area: "torso", name: "Merino crew", item_id: "g-1" },
      { source: "generic", generic: "shorts", name: "Shorts", area: "legs" },
    ] } });
  });

  it.each([
    [{}, "Say whether"],
    [{ overall: "freezing" }, "Say whether"],
    [{ overall: "too_cold", moments: ["lunch"] }, "when"],
    [{ overall: "too_cold", moments: ["start", "start"] }, "when"],
    [{ overall: "too_cold", body_areas: ["toes"] }, "where"],
    [{ overall: "too_cold", worn: { as_suggested: false, items: [], bare: [] } }, "what you wore"],
    [{ overall: "too_cold", worn: { as_suggested: false, items: [{ source: "generic", generic: "cape" }], bare: [] } }, "what you wore"],
    [{ overall: "too_cold", worn: { as_suggested: false, items: [{ source: "wardrobe", area: "torso", name: "" }], bare: [] } }, "what you wore"],
    // A hat and "no hat" together don't say what was worn.
    [{ overall: "too_cold", worn: { as_suggested: false, items: [{ source: "generic", generic: "hat" }], bare: ["head_neck"] } }, "what you wore"],
    [{ overall: "too_cold", worn: "T-shirt" }, "what you wore"],
  ])("refuses %j", (answer, message) => {
    expect(readFeedbackAnswer(answer)).toEqual(expect.stringContaining(message));
  });
});

describe("outingStartedAt", () => {
  it("starts a later outing at its time on the destination's clock", () => {
    expect(new Date(outingStartedAt(savedOutfit(), "2026-10-10")!).toISOString()).toBe("2026-10-10T13:00:00.000Z");
  });

  it("starts it on the trip day it moved to", () => {
    expect(new Date(outingStartedAt(savedOutfit(), "2026-10-17")!).toISOString()).toBe("2026-10-17T13:00:00.000Z");
  });

  it("starts an outing for now when its conditions were read, or at that time of day on the day it moved to", () => {
    expect(new Date(outingStartedAt(NOW_OUTFIT, "2026-10-10")!).toISOString()).toBe("2026-10-10T11:15:00.000Z");
    expect(new Date(outingStartedAt(NOW_OUTFIT, "2026-10-11")!).toISOString()).toBe("2026-10-11T11:15:00.000Z");
  });

  it("starts a plan day at its first hour", () => {
    const [first, second] = planDayKits(savedPlan());
    expect(new Date(outingStartedAt(first.kit, first.date)!).toISOString()).toBe("2026-10-10T13:00:00.000Z");
    expect(new Date(outingStartedAt(second.kit, second.date)!).toISOString()).toBe("2026-10-11T10:00:00.000Z");
  });

  it("uses the day's time zone when the kit has none, and otherwise the latest the time could be anywhere", () => {
    const noZone = savedOutfit({
      outing: { ...savedOutfit().outing, place: { ...savedOutfit().outing.place, timeZone: undefined } },
      weather: { temperature: 18, windSpeed: 12 },
    });
    expect(new Date(outingStartedAt(noZone, "2026-10-10", "America/Denver")!).toISOString()).toBe("2026-10-10T15:00:00.000Z");
    expect(new Date(outingStartedAt(noZone, "2026-10-10")!).toISOString()).toBe("2026-10-10T21:00:00.000Z");
  });

  it("doesn't know when an outing for now without a reading time started", () => {
    expect(outingStartedAt({ ...NOW_OUTFIT, weather: { temperature: 56, windSpeed: 8 } }, "2026-10-10")).toBeNull();
  });
});

describe("feedbackRecord", () => {
  const preferences = { sensitivity: "hot" as const, height_band_in: 68, weight_band_lb: 160 };
  const record = feedbackRecord({
    userId: "user_1", source: "gear_up", sourceKey: "gear_up:k", kit: NOW_OUTFIT, date: "2026-10-10",
    answer: { overall: "too_warm", moments: ["sustained"], body_areas: ["legs"], worn: null },
    sensitivityAtRecommendation: "neutral", preferences,
    startedAt: Date.parse("2026-10-10T11:15:00Z"), recommendedAt: Date.parse("2026-10-10T11:15:00Z"),
    now: Date.parse("2026-10-10T12:05:00Z"),
  });

  it("keeps the sport, effort, conditions, preference, body bands and timing", () => {
    expect(record).toMatchObject({
      user_id: "user_1", source: "gear_up", trip_id: null, trip_date: "2026-10-10", activity: "running", exertion: "moderate",
      advice_kind: "personalized", temperature_f: 56, wind_mph: 8, overall: "too_warm", worn: null,
      weather: { kind: "reading", temperature_f: 56, wind_mph: 8, precipitation: false, source: "current",
        time: "2026-10-10T07:15-04:00", time_zone: "America/New_York" },
      context: {
        outing: { mode: "now" },
        place: { region: "Vermont", country: "United States" },
        preference: { at_recommendation: "neutral", at_feedback: "hot" },
        body: { height_band_in: 68, weight_band_lb: 160 },
        minutes_after_start: 50,
      },
      outing_started_at: "2026-10-10T11:15:00.000Z",
      recommended_at: "2026-10-10T11:15:00.000Z",
    });
  });

  it("keeps the suggested outfit apart from what was worn", () => {
    expect(record.recommended).toMatchObject({ advice: { kind: "personalized" }, edited: false, phases: NOW_OUTFIT.phases });
  });

  it("keeps no place name or coordinates", () => {
    const stored = JSON.stringify(record);
    expect(stored).not.toContain("44.47");
    expect(stored).not.toContain("72.69");
    expect(stored).not.toContain("Stowe");
  });

  it("keeps a plan day's summary for its coldest part", () => {
    const [{ date, kit }] = planDayKits(savedPlan());
    expect(feedbackRecord({ ...{ userId: "user_1", source: "trip_kit", sourceKey: "trip_kit:x", tripId: "t", kit, date,
      answer: { overall: "just_right", moments: [], body_areas: [], worn: { as_suggested: true } },
      sensitivityAtRecommendation: null, preferences, startedAt: null, recommendedAt: null, now: 0 } }))
      .toMatchObject({ advice_kind: "general", temperature_f: 18, wind_mph: 12, trip_id: "t",
        weather: { kind: "day_summary", min_temp_f: 18, max_temp_f: 31, start_hour: 9 },
        context: { outing: { mode: "later", duration_days: 3, plan_day: "2026-10-10" }, minutes_after_start: null } });
  });
});

describe("readPreferenceContext", () => {
  const client = (result: { data: unknown; error: unknown }) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
  }) as unknown as SupabaseClient;

  it("keeps the saved preference and body size in bands", async () => {
    expect(await readPreferenceContext(client({ data: { temperature_sensitivity: "cold", height_inches: 70, weight_lbs: 185 }, error: null }), "u"))
      .toEqual({ sensitivity: "cold", height_band_in: 68, weight_band_lb: 180 });
  });

  it("says unknown when nothing is saved or it can't be read, rather than failing the feedback", async () => {
    const unknown = { sensitivity: null, height_band_in: null, weight_band_lb: null };
    expect(await readPreferenceContext(client({ data: null, error: null }), "u")).toEqual(unknown);
    expect(await readPreferenceContext(client({ data: null, error: { code: "500" } }), "u")).toEqual(unknown);
  });
});

describe("tripKitSourceKey", () => {
  it("is one key per kit as saved", () => {
    expect(tripKitSourceKey("k1", "2026-10-09T12:00:00.123456+00:00")).toBe("trip_kit:k1:2026-10-09T12:00:00.123Z");
    expect(tripKitSourceKey("k1", null)).toBe("trip_kit:k1:unknown");
  });
});

import { describe, expect, it } from "vitest";
import {
  destinationToday,
  kitAdvice,
  kitChanges,
  kitsToSave,
  outfitDate,
  outingToUpdate,
  parseSaveKitRequest,
  planDayKits,
  readSavedOutfit,
  readSavedPlan,
  tripDestination,
  tripEffort,
} from "@/lib/trip-saved-kits";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { planDay, savedOutfit, savedPlan, STOWE, WEAR } from "@/test/savedKit";
import type { SavedOutfit } from "@/types/savedKit";

const SAVE_ID = "6f1f0a52-8d43-4c55-9a39-1b2c3d4e5f60";
const TRIP_ID = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";

describe("readSavedOutfit", () => {
  it("keeps a valid outfit as it was shown", () => {
    expect(readSavedOutfit(savedOutfit())).toEqual(savedOutfit());
  });

  it("drops fields an outfit doesn't have", () => {
    const outfit = savedOutfit();
    const tampered = {
      ...outfit,
      extra: "x",
      outing: { ...outfit.outing, bodyMetrics: { weight: 180 } },
      phases: [{ ...outfit.phases[0], wear: { ...WEAR, torso: { ...WEAR.torso, base: [{ name: "Merino crew", owner: "user-2" }] } } }],
    };
    const read = readSavedOutfit(tampered)!;
    expect(read).not.toHaveProperty("extra");
    expect(read.outing).not.toHaveProperty("bodyMetrics");
    expect(read.phases[0].wear.torso.base).toEqual([{ name: "Merino crew" }]);
  });

  it("refuses advice with no layers, unknown activities and malformed layers", () => {
    expect(readSavedOutfit({ ...savedOutfit(), advice: { kind: "none", reason: "no_gear" } })).toBeNull();
    expect(readSavedOutfit({ ...savedOutfit(), outing: { ...savedOutfit().outing, activity: "surfing" } })).toBeNull();
    expect(readSavedOutfit({ ...savedOutfit(), phases: [{ ...savedOutfit().phases[0], wear: { torso: WEAR.torso } }] })).toBeNull();
    expect(readSavedOutfit({ ...savedOutfit(), phases: [] })).toBeNull();
    const tooMany = Array.from({ length: 13 }, () => ({ name: "Layer" }));
    expect(readSavedOutfit({ ...savedOutfit(), phases: [{ ...savedOutfit().phases[0], wear: { ...WEAR, legs: { base: tooMany, outer: [] } } }] })).toBeNull();
  });

  it("accepts a climb and descent only for a ski tour", () => {
    const phases: SavedOutfit["phases"] = [
      { id: "climb", wear: WEAR, carry: ["Ski shell"], decision: null },
      { id: "descent", wear: WEAR, carry: [], decision: null },
    ];
    expect(readSavedOutfit(savedOutfit({ phases }))).toBeNull();
    const tour = savedOutfit({ phases, outing: { ...savedOutfit().outing, activity: "backcountry_skiing" } });
    expect(readSavedOutfit(tour)?.phases.map((phase) => phase.id)).toEqual(["climb", "descent"]);
  });

  it("keeps the reason general guidance isn't personalized", () => {
    const general = savedOutfit({ advice: { kind: "general", reason: "unsupported" } });
    expect(readSavedOutfit(general)?.advice).toEqual({ kind: "general", reason: "unsupported" });
    expect(readSavedOutfit({ ...general, advice: { kind: "general", reason: "because" } })).toBeNull();
  });
});

describe("parseSaveKitRequest", () => {
  const request = (overrides: object = {}) => ({ save_id: SAVE_ID, target: { trip_id: TRIP_ID }, outfit: savedOutfit(), ...overrides });

  it("reads a save to an existing trip, or to a new one with a name", () => {
    expect(parseSaveKitRequest(request())).toEqual({ saveId: SAVE_ID, tripId: TRIP_ID, source: savedOutfit(), replace: {} });
    expect(parseSaveKitRequest(request({ target: { new_trip: { id: TRIP_ID, name: "  Stowe trip " } } })))
      .toMatchObject({ tripId: TRIP_ID, newTripName: "Stowe trip" });
  });

  it("passes the confirmed kit versions through unchanged", () => {
    const replace = { "2026-10-10": "2026-10-06T20:01:02.123456+00:00" };
    expect(parseSaveKitRequest(request({ replace }))).toMatchObject({ replace });
    expect(parseSaveKitRequest(request({ replace: { "2026-02-31": replace["2026-10-10"] } }))).toBe("Invalid replacement.");
    expect(parseSaveKitRequest(request({ replace: { "2026-10-10": "yesterday" } }))).toBe("Invalid replacement.");
  });

  it("says what's wrong with a bad request", () => {
    expect(parseSaveKitRequest(null)).toBe("Nothing to save.");
    expect(parseSaveKitRequest(request({ save_id: "1" }))).toBe("Invalid save identity. Try saving again.");
    expect(parseSaveKitRequest(request({ target: {} }))).toBe("Choose a trip to save to.");
    expect(parseSaveKitRequest(request({ target: { new_trip: { id: TRIP_ID, name: " " } } }))).toBe("Trip name must be 1–200 characters.");
    expect(parseSaveKitRequest(request({ outfit: {} }))).toBe("This outing's layers can't be saved. Get layers again and retry.");
    // An outfit or a plan, not both or neither.
    expect(parseSaveKitRequest(request({ plan: savedPlan() }))).toBe("This outing's layers can't be saved. Get layers again and retry.");
    expect(parseSaveKitRequest(request({ outfit: undefined }))).toBe("This outing's layers can't be saved. Get layers again and retry.");
  });

  it("reads a multi-day plan in place of an outfit", () => {
    expect(parseSaveKitRequest(request({ outfit: undefined, plan: savedPlan() }))).toMatchObject({ source: savedPlan() });
  });
});

describe("readSavedPlan", () => {
  it("keeps a valid plan as it was shown, without each day's changes from the day before", () => {
    expect(readSavedPlan(savedPlan())).toEqual(savedPlan());
    const withPrevious = savedPlan({ days: [planDay("2026-10-10"), planDay("2026-10-11", { changesFromPreviousDay: { add: [], remove: [] } })] });
    expect(readSavedPlan(withPrevious)?.days[1].changesFromPreviousDay).toBeNull();
    const extra = { ...savedPlan(), uncoveredDays: [], days: [{ ...planDay("2026-10-10"), secret: "x" }] };
    expect(readSavedPlan(extra)).toEqual(savedPlan({ days: [planDay("2026-10-10")] }));
  });

  it("refuses days without layers, out of order or outside the outing's dates", () => {
    const day = planDay("2026-10-10");
    expect(readSavedPlan(savedPlan({ days: [] }))).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [{ ...day, baseline: { ...day.baseline, recommendation: null } }] }))).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [planDay("2026-10-11"), planDay("2026-10-10")] }))).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [day, day] }))).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [planDay("2026-10-13")] }))).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [planDay("2026-10-09")] }))).toBeNull();
  });

  it("refuses a one-day outing, malformed conditions and malformed changes", () => {
    const day = planDay("2026-10-10");
    const oneDay = savedPlan().outing;
    expect(readSavedPlan(savedPlan({ outing: { ...oneDay, when: { ...oneDay.when, durationDays: 1 } } }))).toBeNull();
    expect(readSavedPlan({ ...savedPlan(), outing: { ...oneDay, when: { mode: "now" } } })).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [{ ...day, baseline: { ...day.baseline, minTemp: 40 } }] }))).toBeNull();
    expect(readSavedPlan(savedPlan({ days: [{ ...day, dayparts: [{ ...day.dayparts[0], changes: { add: [{ bodyPart: "feet", layerType: "outer", name: "Boots" }], remove: [] } }] }] } as never))).toBeNull();
    expect(readSavedPlan(savedPlan({ dayStartHour: 24 }))).toBeNull();
  });
});

describe("plan days as kits", () => {
  it("saves each day with layers to its date, the first with the plan's start time", () => {
    expect(planDayKits(savedPlan())).toEqual([
      { date: "2026-10-10", kit: { version: 1, kind: "plan_day", outing: savedPlan().outing, provenance: savedPlan().provenance, startHour: 9, endHour: 21, day: planDay("2026-10-10") } },
      { date: "2026-10-11", kit: expect.objectContaining({ kind: "plan_day", startHour: 6, endHour: 21, day: savedPlan().days[1] }) },
    ]);
  });

  it("spans a new trip over the whole outing, including days without layers", () => {
    const planned = kitsToSave(savedPlan())!;
    expect(planned.kits.map((kit) => kit.date)).toEqual(["2026-10-10", "2026-10-11"]);
    expect(planned).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-12" });
    expect(kitsToSave(savedOutfit())).toEqual({ kits: [{ date: "2026-10-10", kit: savedOutfit() }], startDate: "2026-10-10", endDate: "2026-10-10" });
  });

  it("classifies a plan's new trip by today at the destination", () => {
    expect(destinationToday(savedPlan(), Date.parse("2026-10-07T02:30:00Z"))).toBe("2026-10-06");
  });

  it("is general guidance for each day", () => {
    expect(kitAdvice(planDayKits(savedPlan())[0].kit)).toEqual({ kind: "general", reason: "multi_day" });
    expect(kitAdvice(savedOutfit())).toEqual({ kind: "personalized" });
  });

  it("compares a plan day's layers with a saved outfit, and with another plan day", () => {
    const [saturday] = planDayKits(savedPlan({ days: [planDay("2026-10-10", { baseline: { ...planDay("2026-10-10").baseline, recommendation: { ...WEAR, hands: { base: [], outer: [] } } } })] }));
    expect(kitChanges({ outfit: savedOutfit() }, saturday.kit)).toEqual([
      { phase: "outing", add: [], remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }] },
    ]);
    expect(kitChanges({ outfit: planDayKits(savedPlan())[0].kit }, saturday.kit)).toEqual(kitChanges({ outfit: savedOutfit() }, saturday.kit));
  });
});

describe("plan day changes through the day", () => {
  const MITTENS = { ...WEAR, hands: { base: [], outer: [{ name: "Warm mittens" }] } };
  const withEvening = (evening: typeof WEAR, baseline = WEAR) => planDayKits(savedPlan({
    days: [planDay("2026-10-10", {
      baseline: { ...planDay("2026-10-10").baseline, recommendation: baseline },
      dayparts: [{ ...planDay("2026-10-10").dayparts[0], recommendation: baseline }, { ...planDay("2026-10-10").dayparts[1], recommendation: evening }],
    })],
  }))[0].kit;

  it("lists a daypart whose layers change when the day's outfit doesn't", () => {
    expect(kitChanges({ outfit: withEvening(WEAR) }, withEvening(MITTENS))).toEqual([
      { phase: "outing", add: [], remove: [] },
      {
        phase: "evening",
        add: [{ bodyPart: "hands", layerType: "outer", name: "Warm mittens" }],
        remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }],
      },
    ]);
  });

  it("doesn't repeat a change the whole day makes for each daypart", () => {
    expect(kitChanges({ outfit: withEvening(WEAR) }, withEvening(MITTENS, MITTENS))).toEqual([
      expect.objectContaining({ phase: "outing", add: [expect.objectContaining({ name: "Warm mittens" })] }),
    ]);
  });
});

describe("outingToUpdate", () => {
  const at = (iso: string) => Date.parse(iso);

  it("plans today from the start of the day, not the first day's late start", () => {
    // Saturday 11pm to Monday; on Sunday morning, Sunday's kit is updated.
    const late = savedPlan({ outing: { ...savedPlan().outing, when: { mode: "later", date: "2026-10-10", time: "23:00", durationDays: 3 } }, firstDayStartHour: 23 });
    const [, sunday] = planDayKits(late);
    const when = outingToUpdate(sunday.kit, "2026-10-11", at("2026-10-11T12:00:00Z"))!.when;
    expect(when).toEqual({ mode: "later", date: "2026-10-11", time: "06:00", durationDays: 2 });
    if (when.mode !== "later") throw new Error("expected a later outing");
    const hours = ["2026-10-11", "2026-10-12"].flatMap((date) => [8, 14, 19].map((hour) => ({
      time: `${date}T${String(hour).padStart(2, "0")}:00`, temperature: 30, windSpeed: 5, precipitationProbability: 0,
    })));
    const replanned = buildMultiDayLayerPlan({
      startDate: new Date(`${when.date}T00:00:00`), durationDays: when.durationDays, startHour: Number(when.time.slice(0, 2)),
      hourlyForecast: hours, getRecommendation: () => WEAR,
    });
    expect(replanned.days.map((day) => day.date)).toEqual(["2026-10-11", "2026-10-12"]);
  });

  it("asks again for a later outing until its day has passed at the destination", () => {
    expect(outingToUpdate(savedOutfit(), "2026-10-10", at("2026-10-07T12:00:00Z"))).toEqual(savedOutfit().outing);
    expect(outingToUpdate(savedOutfit(), "2026-10-10", at("2026-10-11T03:30:00Z"))).toEqual(savedOutfit().outing);
    expect(outingToUpdate(savedOutfit(), "2026-10-10", at("2026-10-11T04:30:00Z"))).toBeNull();
  });

  it("isn't offered without the destination's time zone, rather than using the viewer's calendar", () => {
    const unzoned = savedOutfit({ outing: { ...savedOutfit().outing, place: { ...STOWE, timeZone: undefined } }, weather: { temperature: 30, windSpeed: 5 } });
    expect(outingToUpdate(unzoned, "2026-10-10", at("2026-10-07T12:00:00Z"))).toBeNull();
    const [saturday] = planDayKits(savedPlan({ provenance: undefined, outing: { ...savedPlan().outing, place: { ...STOWE, timeZone: undefined } } }));
    expect(outingToUpdate(saturday.kit, "2026-10-10", at("2026-10-07T12:00:00Z"))).toBeNull();
  });

  it("asks again for an outing for now only on its own day", () => {
    const now = savedOutfit({ outing: { ...savedOutfit().outing, when: { mode: "now" } } });
    expect(outingToUpdate(now, "2026-10-06", at("2026-10-06T20:00:00Z"))).toEqual(now.outing);
    expect(outingToUpdate(now, "2026-10-06", at("2026-10-07T12:00:00Z"))).toBeNull();
  });

  it("moves the outing with its day when the trip's dates changed after saving", () => {
    // Saved for Sat, Oct 10; the trip moved a day later.
    expect(outingToUpdate(savedOutfit(), "2026-10-11", at("2026-10-07T12:00:00Z"))?.when)
      .toEqual({ mode: "later", date: "2026-10-11", time: "09:00", durationDays: 1 });
    const [saturday, sunday] = planDayKits(savedPlan());
    expect(outingToUpdate(saturday.kit, "2026-10-11", at("2026-10-07T12:00:00Z"))?.when)
      .toEqual({ mode: "later", date: "2026-10-11", time: "09:00", durationDays: 3 });
    // Moved a day earlier, so it starts today: its start time stays.
    expect(outingToUpdate(sunday.kit, "2026-10-10", at("2026-10-09T12:00:00Z"))?.when)
      .toEqual({ mode: "later", date: "2026-10-09", time: "09:00", durationDays: 3 });
    // A day later it has started: from today on, all day.
    expect(outingToUpdate(sunday.kit, "2026-10-10", at("2026-10-10T12:00:00Z"))?.when)
      .toEqual({ mode: "later", date: "2026-10-10", time: "06:00", durationDays: 2 });
  });

  it("asks for an outing for now, moved to a later day, at the time it was read", () => {
    const now = savedOutfit({
      outing: { ...savedOutfit().outing, when: { mode: "now" } },
      weather: { temperature: 30, windSpeed: 5, context: { source: "current", provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" }, timeZone: "America/New_York", observedTime: "2026-10-06T14:15-04:00" } } },
    });
    expect(outingToUpdate(now, "2026-10-08", at("2026-10-07T12:00:00Z"))?.when)
      .toEqual({ mode: "later", date: "2026-10-08", time: "14:15", durationDays: 1 });
    expect(outingToUpdate(now, "2026-10-07", at("2026-10-07T12:00:00Z"))?.when).toEqual({ mode: "now" });
  });

  it("asks again for a plan from today on, once it has started", () => {
    const [, sunday] = planDayKits(savedPlan());
    expect(outingToUpdate(sunday.kit, "2026-10-11", at("2026-10-09T12:00:00Z"))).toEqual(savedPlan().outing);
    expect(outingToUpdate(sunday.kit, "2026-10-11", at("2026-10-11T12:00:00Z"))?.when)
      .toEqual({ mode: "later", date: "2026-10-11", time: "06:00", durationDays: 2 });
    expect(outingToUpdate(sunday.kit, "2026-10-11", at("2026-10-12T12:00:00Z"))).toBeNull();
  });
});

describe("outfitDate", () => {
  it("uses a later outing's date on the destination's calendar", () => {
    expect(outfitDate(savedOutfit())).toBe("2026-10-10");
  });

  it("uses the date there when the conditions were read, for now", () => {
    const outing = { ...savedOutfit().outing, when: { mode: "now" as const } };
    const current = (provenance: object) => savedOutfit({
      outing,
      weather: { temperature: 30, windSpeed: 5, context: { source: "current", provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" }, ...provenance } } },
    });
    expect(outfitDate(current({ observedTime: "2026-10-06T22:15-04:00" }))).toBe("2026-10-06");
    // Without the reading's time it isn't taken from the server's clock, which
    // would change at midnight between a save and its retry.
    expect(outfitDate(current({ timeZone: "America/New_York" }))).toBeNull();
  });

  it("is null when the place's calendar can't be told", () => {
    const outing = { ...savedOutfit().outing, place: { ...STOWE, timeZone: undefined }, when: { mode: "now" as const } };
    expect(outfitDate(savedOutfit({ outing, weather: { temperature: 30, windSpeed: 5 } }))).toBeNull();
  });
});

describe("destinationToday", () => {
  const now = Date.parse("2026-10-07T02:30:00Z"); // 10:30pm on Oct 6 in Vermont.

  it("is today on the destination's calendar, not the server's", () => {
    expect(destinationToday(savedOutfit(), now)).toBe("2026-10-06");
    const tokyo = savedOutfit({ outing: { ...savedOutfit().outing, place: { ...STOWE, timeZone: "Asia/Tokyo" } }, weather: { temperature: 30, windSpeed: 5 } });
    expect(destinationToday(tokyo, now)).toBe("2026-10-07");
  });

  it("is the outing's own date for now, and unknown without a time zone", () => {
    const current = savedOutfit({
      outing: { ...savedOutfit().outing, when: { mode: "now" } },
      weather: { temperature: 30, windSpeed: 5, context: { source: "current", provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" }, observedTime: "2026-10-06T22:15-04:00" } } },
    });
    expect(destinationToday(current, now)).toBe("2026-10-06");
    const unknown = savedOutfit({ outing: { ...savedOutfit().outing, place: { ...STOWE, timeZone: undefined } }, weather: { temperature: 30, windSpeed: 5 } });
    expect(destinationToday(unknown, now)).toBeUndefined();
  });
});

describe("trip details from the outing", () => {
  it("maps the effort and names the destination", () => {
    expect([tripEffort("easy"), tripEffort("moderate"), tripEffort("hard")]).toEqual(["easy", "steady", "hard"]);
    expect(tripDestination(STOWE)).toEqual({ name: "Stowe, Vermont", latitude: 44.47, longitude: -72.69 });
    expect(tripDestination({ id: 0, name: "Your location", country: "", latitude: 44.4712, longitude: -72.6854 }).name)
      .toBe("Near 44.47, -72.69");
  });

  it("lists what a replacement adds and removes, but not for a checklist", () => {
    const warmer = savedOutfit({
      phases: [{ id: "outing", wear: { ...WEAR, headNeck: { base: [], outer: [{ name: "Beanie" }] }, hands: { base: [], outer: [] } }, carry: [], decision: null }],
    });
    expect(kitChanges({ outfit: savedOutfit() }, warmer)).toEqual([{
      phase: "outing",
      add: [{ bodyPart: "headNeck", layerType: "outer", name: "Beanie" }],
      remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }],
    }]);
    expect(kitChanges({ outfit: null }, warmer)).toBeNull();
  });

  it("lists a ski tour's changes for the climb and the descent", () => {
    const tour = (descentHands: SavedOutfit["phases"][number]["wear"]["hands"]) => savedOutfit({
      outing: { ...savedOutfit().outing, activity: "backcountry_skiing" },
      phases: [
        { id: "climb", wear: WEAR, carry: [], decision: null },
        { id: "descent", wear: { ...WEAR, hands: descentHands }, carry: [], decision: null },
      ],
    });
    const mittens = { base: [], outer: [{ name: "Mittens" }] };
    expect(kitChanges({ outfit: tour(WEAR.hands) }, tour(mittens))).toEqual([
      { phase: "climb", add: [], remove: [] },
      {
        phase: "descent",
        add: [{ bodyPart: "hands", layerType: "outer", name: "Mittens" }],
        remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }],
      },
    ]);
  });
});

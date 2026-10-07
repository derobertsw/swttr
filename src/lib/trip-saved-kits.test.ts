import { describe, expect, it } from "vitest";
import { kitChanges, outfitDate, parseSaveKitRequest, readSavedOutfit, tripDestination, tripEffort } from "@/lib/trip-saved-kits";
import { savedOutfit, STOWE, WEAR } from "@/test/savedKit";
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
    expect(parseSaveKitRequest(request())).toEqual({ saveId: SAVE_ID, tripId: TRIP_ID, outfit: savedOutfit(), replace: {} });
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
  });
});

describe("outfitDate", () => {
  const now = Date.parse("2026-10-07T02:30:00Z"); // 10:30pm on Oct 6 in Vermont.

  it("uses a later outing's date on the destination's calendar", () => {
    expect(outfitDate(savedOutfit(), now)).toBe("2026-10-10");
  });

  it("uses the date there when the conditions were read, for now", () => {
    const outing = { ...savedOutfit().outing, when: { mode: "now" as const } };
    const current = (provenance: object) => savedOutfit({
      outing,
      weather: { temperature: 30, windSpeed: 5, context: { source: "current", provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" }, ...provenance } } },
    });
    expect(outfitDate(current({ observedTime: "2026-10-06T22:15-04:00" }), now)).toBe("2026-10-06");
    // Without the reading's time, today there; the device's clock says Oct 7 in UTC.
    expect(outfitDate(current({ timeZone: "America/New_York" }), now)).toBe("2026-10-06");
    expect(outfitDate(current({ timeZone: "Asia/Tokyo" }), now)).toBe("2026-10-07");
  });

  it("is null when the place's calendar can't be told", () => {
    const outing = { ...savedOutfit().outing, place: { ...STOWE, timeZone: undefined }, when: { mode: "now" as const } };
    expect(outfitDate(savedOutfit({ outing, weather: { temperature: 30, windSpeed: 5 } }), now)).toBeNull();
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
    expect(kitChanges({ outfit: savedOutfit() }, warmer)).toEqual({
      add: [{ bodyPart: "headNeck", layerType: "outer", name: "Beanie" }],
      remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }],
    });
    expect(kitChanges({ outfit: null }, warmer)).toBeNull();
  });
});

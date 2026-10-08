import type { Outing } from "@/types/outing";
import type { Recommendation } from "@/types/recommendations";
import type { SavedOutfit } from "@/types/savedKit";

/** A place as /api/geocode returns it, with its time zone. */
export const STOWE: Outing["place"] = {
  id: 1,
  name: "Stowe",
  region: "Vermont",
  country: "United States",
  latitude: 44.47,
  longitude: -72.69,
  timeZone: "America/New_York",
};

const LATER_OUTING: Outing = {
  activity: "alpine_skiing",
  exertion: "moderate",
  place: STOWE,
  when: { mode: "later", date: "2026-10-10", time: "09:00", durationDays: 1 },
};

const empty = { base: [], outer: [] };

export const WEAR: Recommendation = {
  torso: { base: [{ name: "Merino crew", rcl: 0.3, sourceId: "g-1", brand: "Smartwool" }], mid: [{ name: "Fleece", rcl: 0.5, sourceId: "g-2", isRecommended: true }], outer: [{ name: "Ski shell", rcl: 0.4, sourceId: "g-3" }] },
  legs: { base: [{ name: "Long johns", rcl: 0.2, sourceId: "g-4" }], outer: [{ name: "Ski pants", rcl: 0.5, sourceId: "g-5" }] },
  hands: { base: [], outer: [{ name: "Insulated gloves", rcl: 0.6, sourceId: "h-1" }] },
  headNeck: empty,
};

/** A personalized one-day alpine outfit for Saturday morning at Stowe. */
export function savedOutfit(overrides: Partial<SavedOutfit> = {}): SavedOutfit {
  return {
    version: 1,
    outing: LATER_OUTING,
    weather: {
      temperature: 18,
      windSpeed: 12,
      precipitation: true,
      precipitationType: "snow",
      context: {
        source: "forecast",
        place: "Stowe, Vermont, United States",
        forecastTime: "2026-10-10T09:00-04:00",
        timeZone: "America/New_York",
        provenance: { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" }, timeZone: "America/New_York" },
      },
    },
    advice: { kind: "personalized" },
    phases: [{ id: "outing", wear: WEAR, carry: [], decision: { riskType: "comfortable", severity: "moderate", delta: 0.1 } }],
    edited: false,
    ...overrides,
  };
}

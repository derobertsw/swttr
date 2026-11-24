import { describe, expect, it } from "vitest";
import { forecastPointText, isResortId, isSameLocation, pickedPlace, placeKey, readResortFields, searchKindFor, tripPlaceFrom } from "./locationSuggestion";
import type { LocationSuggestion } from "@/types/recommendations";

const TOWN: LocationSuggestion = { id: 5241803, name: "Stowe", region: "Vermont", country: "United States", latitude: 44.4654, longitude: -72.6874, timeZone: "America/New_York" };
const RESORT: LocationSuggestion = {
  id: "resort:wd-Q7620695", kind: "resort", source: "openskidata", resortId: "wd-Q7620695",
  name: "Stowe Mountain Resort", region: "Vermont", country: "United States", latitude: 44.5376, longitude: -72.8142,
  timeZone: "America/New_York", elevationM: 1116, pointLabel: "Top of Gondola Skyride", pointKind: "lift",
};

describe("resort IDs", () => {
  it("accepts catalog identities and nothing else", () => {
    expect(["wd-Q7620695", "skimap-799", "osm-r21355703", "osm-w1", "osm-n2"].every(isResortId)).toBe(true);
    expect(["", "wd-7620695", "skimap-", "osm-x1", "resort:wd-Q1", 42, null].some(isResortId)).toBe(false);
  });
});

describe("readResortFields", () => {
  it("is empty for a town, a legacy numeric place and the device", () => {
    expect(readResortFields({ ...TOWN })).toEqual({});
    expect(readResortFields({ id: 0, name: "Your location", country: "", latitude: 1, longitude: 2 })).toEqual({});
  });
  it("keeps a resort's point", () => {
    expect(readResortFields({ ...RESORT })).toEqual({
      kind: "resort", source: "openskidata", resortId: "wd-Q7620695", elevationM: 1116, pointLabel: "Top of Gondola Skyride", pointKind: "lift",
    });
    expect(readResortFields({ ...RESORT, elevationM: null, pointKind: "reference", pointLabel: "Resort reference point" })).toMatchObject({ elevationM: null });
  });
  it.each([
    { ...RESORT, id: "resort:skimap-1" },
    { ...RESORT, id: 12 },
    { ...RESORT, elevationM: 20_000 },
    { ...RESORT, elevationM: "1116" },
    { ...RESORT, pointLabel: "" },
    { ...RESORT, pointKind: "summit" },
    { ...RESORT, resortId: "nope" },
    { ...TOWN, id: "5241803" },
  ])("refuses resort fields that don't agree (%#)", (value) => {
    expect(readResortFields(value as Record<string, unknown>)).toBeNull();
  });
});

describe("comparing places", () => {
  it("treats a resort point and a town at the same coordinates as different places", () => {
    const sameSpot = { ...TOWN, latitude: RESORT.latitude, longitude: RESORT.longitude };
    expect(isSameLocation(sameSpot, RESORT)).toBe(false);
    expect(isSameLocation(RESORT, { ...RESORT })).toBe(true);
    expect(isSameLocation(RESORT, { ...RESORT, elevationM: 900 })).toBe(false);
    expect(isSameLocation(TOWN, null)).toBe(false);
  });
  it("keys resorts and geocoder places apart", () => {
    expect(placeKey(TOWN)).toBe("5241803");
    expect(placeKey(RESORT)).toBe("resort:wd-Q7620695");
  });
  it("drops how a search matched a place once it's picked", () => {
    expect(pickedPlace({ ...RESORT, match: "typo" })).toEqual(RESORT);
  });
});

describe("searchKindFor", () => {
  it("runs the general search when resort search is switched off", () => {
    expect(searchKindFor("alpine_skiing", false)).toBeUndefined();
    expect(searchKindFor("Alpine", false)).toBeUndefined();
  });
  it("is on, now that forecasts read the resort's point", () => {
    expect(searchKindFor("alpine_skiing")).toBe("resort");
  });
  it("searches resorts for alpine skiing and every place otherwise once it's on", () => {
    expect(searchKindFor("alpine_skiing", true)).toBe("resort");
    expect(searchKindFor("Alpine", true)).toBe("resort");
    expect(searchKindFor("xc_skiing", true)).toBe("all");
    expect(searchKindFor(null, true)).toBe("all");
  });
});

describe("tripPlaceFrom", () => {
  it("names a town with its region and sends no resort", () => {
    expect(tripPlaceFrom(TOWN)).toEqual({ name: "Stowe, Vermont", latitude: 44.4654, longitude: -72.6874 });
  });
  it("sends a resort's ID with its point for the API to check", () => {
    expect(tripPlaceFrom(RESORT)).toEqual({ name: "Stowe Mountain Resort, Vermont", latitude: 44.5376, longitude: -72.8142, resort_id: "wd-Q7620695" });
  });
});

describe("forecastPointText", () => {
  it("says where a resort's weather is read, in meters and feet", () => {
    expect(forecastPointText(RESORT)).toBe("forecast at Top of Gondola Skyride, 1,116 m (3,661 ft)");
    expect(forecastPointText({ ...RESORT, elevationM: null, pointLabel: "Resort reference point" })).toBe("forecast at Resort reference point, elevation not mapped");
    expect(forecastPointText(TOWN)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { tripLocation } from "./trip-sections";

describe("tripLocation", () => {
  it.each([
    ["/trips/trip-1", "plan", "", null],
    ["/trips/trip-1/", "plan", "", null],
    ["/trips/trip-1/days/2026-01-09", "plan", "/days/2026-01-09", "2026-01-09"],
    ["/trips/trip-1/map", "plan", "/map", null],
    ["/trips/trip-1/stops", "plan", "/stops", null],
    ["/trips/trip-1/settings", "plan", "/settings", null],
    ["/trips/trip-1/stays", "stays", "/stays", null],
    ["/trips/trip-1/manage", "crew", "/manage", null],
    ["/trips/trip-1/rollcall", "crew", "/rollcall", null],
    ["/trips/trip-1/pack", "packing", "/pack", null],
    ["/trips/trip-1/gear", "packing", "/gear", null],
    ["/trips/trip-1/unknown", null, "/unknown", null],
  ])("places %s in %s", (pathname, section, subpath, date) => {
    expect(tripLocation(pathname, "trip-1")).toEqual({ section, subpath, date });
  });

  it("ignores pages outside the trip, including another trip with the same prefix", () => {
    expect(tripLocation("/trips", "trip-1")).toBeNull();
    expect(tripLocation("/trips/trip-10/pack", "trip-1")).toBeNull();
  });

  it("keeps a malformed day as it is", () => {
    expect(tripLocation("/trips/trip-1/days/%", "trip-1")?.date).toBe("%");
  });
});

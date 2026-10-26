import { describe, expect, it } from "vitest";
import { buildTourPlanSummary, parseTourPlan } from "@/lib/trip-tour-plans";
import type { TripTourPlan } from "@/types/trips";

const saved = (extra: Partial<TripTourPlan> = {}): TripTourPlan => ({
  id: "plan-1", trip_id: "trip-1", trip_day_id: "day-1", objective: "Tuckerman Ravine", route_url: null,
  distance: null, distance_unit: null, ascent: null, ascent_unit: null,
  duration_minutes: null, metrics_source: null, metrics_source_url: null, approach_notes: null, access_notes: null,
  access_url: null, backup_plan: null, return_time: null, return_day_offset: 0, checkin_notes: null, pickup_notes: null,
  time_zone: null, revision: 1, created_by: "user-1", updated_by: "user-1",
  created_at: "2026-10-14T20:00:00Z", updated_at: "2026-10-14T20:00:00Z", ...extra,
});

describe("parseTourPlan", () => {
  it("accepts a route-only draft and fills every optional field with null", () => {
    expect(parseTourPlan({ objective: "  Tuckerman Ravine " })).toEqual({
      objective: "Tuckerman Ravine", route_url: null, return_time: null, return_day_offset: 0,
      distance: null, distance_unit: null, ascent: null, ascent_unit: null, duration_minutes: null, metrics_source: null,
      metrics_source_url: null, approach_notes: null, access_notes: null, access_url: null, backup_plan: null,
      checkin_notes: null, pickup_notes: null,
    });
  });

  it("keeps figures with their units and the return's day offset", () => {
    expect(parseTourPlan({ objective: "Hut", return_time: "11:00:00", return_day_offset: 1,
      distance: "14.25", distance_unit: "km", ascent: 1200, ascent_unit: "m", duration_minutes: 390 })).toMatchObject({
      return_time: "11:00", return_day_offset: 1,
      distance: 14.3, distance_unit: "km", ascent: 1200, ascent_unit: "m", duration_minutes: 390,
    });
  });

  it("leaves the meet time out: it's the day's (#333)", () => {
    expect(parseTourPlan({ objective: "Hut", meet_time: "18:30", meet_day_offset: -1 })).not.toHaveProperty("meet_time");
  });

  it.each([
    [{}, "objective"],
    [{ objective: "   " }, "objective"],
    [{ objective: "x".repeat(201) }, "objective"],
    [{ objective: "A", route_url: "javascript:alert(1)" }, "route_url"],
    [{ objective: "A", access_url: "https://user:pw@example.com" }, "access_url"],
    [{ objective: "A", metrics_source_url: "example.com/route" }, "metrics_source_url"],
    [{ objective: "A", return_time: "25:00" }, "return_time"],
    [{ objective: "A", return_day_offset: -1 }, "return_day_offset"],
    [{ objective: "A", distance: "12" }, "distance_unit"],
    [{ objective: "A", distance: "-1", distance_unit: "km" }, "distance"],
    [{ objective: "A", ascent: "1200.5", ascent_unit: "m" }, "ascent"],
    [{ objective: "A", ascent: 900, ascent_unit: "yd" }, "ascent_unit"],
    [{ objective: "A", duration_minutes: 4321 }, "duration_hours"],
    [{ objective: "A", backup_plan: "x".repeat(4001) }, "backup_plan"],
  ])("names the field to fix (%#)", (input, field) => {
    expect(parseTourPlan(input)).toMatchObject({ field });
  });
});

describe("buildTourPlanSummary", () => {
  it("labels a route-only draft without times or figures", () => {
    expect(buildTourPlanSummary(saved(), "2026-10-10")).toMatchObject({
      date: "2026-10-10", return_label: null, metrics_label: null, metrics_source_label: null,
      time_zone_label: null, updated_label: "Last changed Wed Oct 14 by the organizer",
    });
  });

  it("shows times on the destination's clock with that date's zone abbreviation", () => {
    const summary = buildTourPlanSummary(saved({ return_time: "06:30:00", return_day_offset: 1, time_zone: "America/Denver" }), "2026-10-31");
    // US daylight saving ends on Sunday November 1, 2026.
    expect(summary.return_label).toBe("6:30 AM MST · Sun Nov 1, the day after");
    expect(summary.time_zone_label).toBe("Times are local to the destination (America/Denver).");
  });

  it("says when the destination's time zone isn't known", () => {
    const summary = buildTourPlanSummary(saved({ return_time: "15:30:00" }), "2026-10-10");
    expect(summary.return_label).toBe("3:30 PM destination time · Sat Oct 10");
    expect(summary.time_zone_label).toMatch(/time zone wasn't confirmed/);
  });

  it("leaves out the meet columns an older API still writes (#333)", () => {
    const summary = buildTourPlanSummary({ ...saved(), meet_time: "06:30:00", meet_day_offset: -1 }, "2026-10-10");
    expect(summary).not.toHaveProperty("meet_time");
    expect(summary).not.toHaveProperty("meet_day_offset");
    expect(summary.time_zone_label).toBeNull();
  });

  it("lists crew figures with units as entered and says where they come from", () => {
    expect(buildTourPlanSummary(saved({ distance: 14.2, distance_unit: "km", ascent: 1200, ascent_unit: "m", duration_minutes: 390 }), "2026-10-10"))
      .toMatchObject({ metrics_label: "14.2 km · 1,200 m ascent · 6 h 30 min", metrics_source_label: "Crew estimate" });
    expect(buildTourPlanSummary(saved({ ascent: 3500, ascent_unit: "ft", duration_minutes: 45, metrics_source: "Guidebook" }), "2026-10-10"))
      .toMatchObject({ metrics_label: "3,500 ft ascent · 45 min", metrics_source_label: "Source: Guidebook" });
  });
});

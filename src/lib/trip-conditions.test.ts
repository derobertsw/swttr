import { describe, expect, it } from "vitest";
import {
  conditionsContext,
  contextKey,
  parseConditionsSource,
  parseReviewNote,
  staleReasons,
  summarizeConditions,
  type ConditionsRows,
} from "@/lib/trip-conditions";
import type { TripConditionsSource, TripDay, TripLocation, TripStop, TripTourPlanSummary } from "@/types/trips";

const point = (latitude: number): TripLocation => ({ label: "Pinkham Notch lot", address: null, latitude, longitude: -71.25, precision: "exact",
  time_zone: null, source: "manual", provider: null, provider_id: null, attribution: null });
const stop: TripStop = { id: "stop-1", trip_id: "trip-1", position: 0, name: "Pinkham Notch", latitude: 44.26, longitude: -71.25,
  activities: ["Backcountry"], created_at: "2026-10-01T00:00:00Z", access_point: point(44.257) };
const day: TripDay = { id: "day-1", trip_id: "trip-1", stop_id: null, date: "2026-10-10", activity: "Backcountry" };
const plan = { trip_day_id: "day-1", objective: "Tuckerman Ravine", route_url: null } as TripTourPlanSummary;
const source: TripConditionsSource = { id: "source-1", trip_id: "trip-1", category: "avalanche", name: "MWAC", region: "Presidential Range",
  url: "https://www.mountwashingtonavalanchecenter.org/", revision: 1, created_by: "user-1", updated_by: "user-1",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
const full = { stops: [stop], days: [day], tour_plans: [plan] };
const now = conditionsContext(full, day, source);

describe("parseConditionsSource", () => {
  it("trims the source and leaves a blank area out", () => {
    expect(parseConditionsSource({ category: "weather", name: " Mount Washington Observatory ", region: " ", url: " https://mountwashington.org/ " }))
      .toEqual({ category: "weather", name: "Mount Washington Observatory", region: null, url: "https://mountwashington.org/" });
  });

  it.each([
    [{ ...source, category: "snowpack" }, "category"],
    [{ ...source, name: "  " }, "name"],
    [{ ...source, name: "x".repeat(201) }, "name"],
    [{ ...source, region: 7 }, "region"],
    [{ ...source, url: "" }, "url"],
    [{ ...source, url: "javascript:alert(1)" }, "url"],
    [{ ...source, url: "https://user:secret@example.com" }, "url"],
    [{ ...source, url: `https://example.com/${"x".repeat(2000)}` }, "url"],
    [null, "category"],
  ])("names the field to fix in %#", (input, field) => {
    expect(parseConditionsSource(input)).toMatchObject({ field });
  });
});

describe("parseReviewNote", () => {
  it("trims a note, treats a blank one as none and limits its length", () => {
    expect(parseReviewNote(" Checked at 6 AM ")).toBe("Checked at 6 AM");
    expect(parseReviewNote("   ")).toBeNull();
    expect(parseReviewNote(undefined)).toBeNull();
    expect(parseReviewNote("x".repeat(1001))).toMatchObject({ field: "note" });
    expect(parseReviewNote(12)).toMatchObject({ field: "note" });
  });
});

describe("conditionsContext", () => {
  it("records the day, its destination (the base without a stop), activity, access point, route and the source", () => {
    expect(now).toEqual({
      date: "2026-10-10", stop: { id: "stop-1", latitude: 44.26, longitude: -71.25 }, activity: "Backcountry",
      access_point: { latitude: 44.257, longitude: -71.25 }, route: { objective: "Tuckerman Ravine", route_url: null },
      source: { url: "https://www.mountwashingtonavalanchecenter.org/", region: "Presidential Range" },
    });
  });

  it("compares equal to the same context read back from jsonb, whose keys come back in another order", () => {
    const fromJsonb = JSON.parse(JSON.stringify({ source: now.source, route: now.route, access_point: now.access_point, activity: now.activity, stop: now.stop, date: now.date }));
    expect(staleReasons(fromJsonb, now)).toEqual([]);
    expect(contextKey(fromJsonb)).toBe(contextKey(now));
  });
});

describe("staleReasons", () => {
  const changed = (overrides: { day?: Partial<TripDay>; stops?: TripStop[]; plans?: TripTourPlanSummary[]; source?: Partial<TripConditionsSource> }) =>
    staleReasons(now, conditionsContext({ stops: overrides.stops ?? [stop], tour_plans: overrides.plans ?? [plan] },
      { ...day, ...overrides.day }, { ...source, ...overrides.source }));

  it("names each relevant change", () => {
    expect(changed({ day: { date: "2026-10-11" } })).toEqual(["Date changed from Sat Oct 10"]);
    expect(changed({ stops: [{ ...stop, latitude: 44.3 }] })).toEqual(["Destination changed"]);
    expect(changed({ day: { activity: "Alpine" } })).toEqual(["Activity changed to Downhill skiing"]);
    expect(changed({ stops: [{ ...stop, access_point: point(44.3) }] })).toEqual(["Access point changed"]);
    expect(changed({ day: { access_point: point(44.3), access_point_stop_id: "stop-1" } })).toEqual(["Access point changed"]);
    expect(changed({ plans: [{ ...plan, objective: "Gulf of Slides" }] })).toEqual(["Route changed"]);
    expect(changed({ plans: [{ ...plan, route_url: "https://example.com/route" }] })).toEqual(["Route changed"]);
    expect(changed({ plans: [] })).toEqual(["Tour plan removed"]);
    expect(changed({ source: { url: "https://www.mountwashingtonavalanchecenter.org/forecasts" } })).toEqual(["Source link changed"]);
    expect(changed({ source: { region: null } })).toEqual(["Source area changed"]);
    expect(staleReasons({ ...now, route: null }, now)).toEqual(["Tour plan added"]);
  });

  it("ignores notes, times, the backup plan, the stop's name and the source's name", () => {
    expect(changed({
      stops: [{ ...stop, name: "Pinkham Notch Visitor Center" }],
      plans: [{ ...plan, backup_plan: "Lion Head", meet_time: "06:00", checkin_notes: "Text Sam" } as TripTourPlanSummary],
      source: { name: "Mount Washington Avalanche Center", category: "weather" },
    })).toEqual([]);
  });
});

describe("summarizeConditions", () => {
  const entry = (n: number, user: string, action: "reviewed" | "corrected" | "withdrawn", context = now as object, note: string | null = null) => ({
    id: `entry-${n}`, entry_number: n, trip_day_id: "day-1", source_id: "source-1", user_id: user, action, note,
    reviewed_at: `2026-10-09T1${n}:00:00Z`, created_at: `2026-10-09T1${n}:00:00Z`, context,
  });
  const rows = (reviews: ConditionsRows["reviews"], extra: Partial<ConditionsRows> = {}): ConditionsRows => ({
    sources: [source, { ...source, id: "source-2", category: "weather", name: "MWOBS" }],
    attachments: [{ trip_day_id: "day-1", source_id: "source-2", created_at: "2026-10-01T00:00:00Z" }, { trip_day_id: "day-1", source_id: "source-1", created_at: "2026-10-02T00:00:00Z" }],
    reviews, ...extra,
  });

  it("lists each day's sources in category order with each person's current review and history", () => {
    const summary = summarizeConditions(rows([
      entry(1, "user-2", "reviewed", now, "Low"), entry(2, "user-1", "reviewed"), entry(3, "user-2", "corrected", now, "Moderate"),
    ]), full);
    expect(summary.map((entry) => [entry.date, entry.name])).toEqual([["2026-10-10", "MWAC"], ["2026-10-10", "MWOBS"]]);
    expect(summary[0].context_key).toBe(contextKey(now));
    expect(summary[0].reviews).toEqual([
      { user_id: "user-1", current: expect.objectContaining({ id: "entry-2", action: "reviewed" }), stale_reasons: [], history: [] },
      { user_id: "user-2", current: expect.objectContaining({ id: "entry-3", action: "corrected", note: "Moderate" }), stale_reasons: [],
        history: [expect.objectContaining({ id: "entry-1", note: "Low" })] },
    ]);
    expect(summary[1].reviews).toEqual([]);
  });

  it("marks a review recorded against another plan, but not a withdrawn one", () => {
    const summary = summarizeConditions(rows([
      entry(1, "user-2", "reviewed", { ...now, route: { objective: "Gulf of Slides", route_url: null } }),
      entry(2, "user-1", "reviewed", { ...now, date: "2026-10-09" }), entry(3, "user-1", "withdrawn", { ...now, date: "2026-10-09" }),
    ]), full);
    expect(summary[0].reviews.map((review) => [review.user_id, review.stale_reasons])).toEqual([["user-2", ["Route changed"]], ["user-1", []]]);
  });

  it("leaves out sources removed from a day and days no longer on the trip", () => {
    expect(summarizeConditions(rows([entry(1, "user-2", "reviewed")], { attachments: [] }), full)).toEqual([]);
    expect(summarizeConditions(rows([]), { ...full, days: [] })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  conditionsContext,
  contextKey,
  keptReviewsOn,
  parseConditionsSource,
  parseReviewNote,
  previewConditionsAttach,
  removedDayConditions,
  previewConditionsEdit,
  sameDays,
  staleReasons,
  summarizeConditions,
  summarizeConditionsSources,
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

describe("reusing a source across days", () => {
  const days: TripDay[] = [{ ...day, id: "day-0", date: "2026-10-09" }, day, { ...day, id: "day-2", date: "2026-10-11" }];
  const weekend = { ...full, days };
  const entry = (n: number, dayId: string, user: string, context: object, action: "reviewed" | "withdrawn" = "reviewed") => ({
    id: `entry-${n}`, entry_number: n, trip_day_id: dayId, source_id: "source-1", user_id: user, action, note: null,
    reviewed_at: `2026-10-09T1${n}:00:00Z`, created_at: `2026-10-09T1${n}:00:00Z`, context,
  });
  const rows = (attachedTo: string[], reviews: ConditionsRows["reviews"] = []): ConditionsRows => ({
    sources: [source, { ...source, id: "source-2", category: "weather", name: "MWOBS" }, { ...source, id: "source-3", name: "Avalanche Canada" }],
    attachments: attachedTo.map((dayId) => ({ trip_day_id: dayId, source_id: "source-1", created_at: "2026-10-01T00:00:00Z" })),
    reviews,
  });

  it("lists every source on the trip by type and name, with the dates it's listed on", () => {
    expect(summarizeConditionsSources(rows(["day-2", "day-0"]), weekend).map((use) => [use.name, use.dates])).toEqual([
      ["Avalanche Canada", []], ["MWAC", ["2026-10-09", "2026-10-11"]], ["MWOBS", []],
    ]);
  });

  describe("previewConditionsAttach", () => {
    it("lists the days that don't have it yet, says which already do, and that reviews don't come from other days", () => {
      const preview = previewConditionsAttach(rows(["day-1"], [entry(1, "day-1", "user-2", conditionsContext(full, day, source))]), weekend, "source-1",
        ["2026-10-11", "2026-10-10", "2026-10-09", "2026-10-11"]);
      expect(preview).toEqual({
        source_id: "source-1", revision: 1,
        summary: "Lists MWAC on Fri Oct 9 and Sun Oct 11. Sat Oct 10 already lists it. Reviews stay with the day they were recorded for, so none come from other days.",
        days: [
          { date: "2026-10-09", date_label: "Fri Oct 9", note: "No review recorded for this day." },
          { date: "2026-10-11", date_label: "Sun Oct 11", note: "No review recorded for this day." },
        ],
        expected_days: [{ date: "2026-10-09", day_id: "day-0" }, { date: "2026-10-11", day_id: "day-2" }],
      });
    });

    it("says a day's own earlier reviews show again, and which of them the plan changed since", () => {
      const sunday = days[2];
      const fresh = conditionsContext(weekend, sunday, source);
      const preview = previewConditionsAttach(rows([], [
        entry(1, "day-2", "user-2", fresh), entry(2, "day-2", "user-3", { ...fresh, activity: "Hiking" }), entry(3, "day-2", "user-4", fresh, "withdrawn"),
        entry(4, "day-0", "user-2", { ...fresh, date: "2026-10-09", source: { url: "https://example.org/old", region: "Presidential Range" } }),
      ]), weekend, "source-1", ["2026-10-09", "2026-10-11"]);
      expect("error" in preview ? [] : preview.days.map((entry) => entry.note)).toEqual([
        "1 review recorded here before it was removed shows again, marked Plan changed — review again.",
        "2 reviews recorded here before it was removed show again, 1 marked Plan changed — review again.",
      ]);
    });

    it("refuses a source or day that isn't on the trip, and days that all list it", () => {
      expect(previewConditionsAttach(rows([]), weekend, "source-9", ["2026-10-09"])).toMatchObject({ status: 404 });
      expect(previewConditionsAttach(rows([]), weekend, "source-1", ["2026-10-12"])).toMatchObject({ status: 404 });
      expect(previewConditionsAttach(rows(["day-1"]), weekend, "source-1", ["2026-10-10"])).toEqual({ error: "MWAC is already listed on Sat Oct 10.", status: 400 });
    });
  });

  describe("previewConditionsEdit", () => {
    const listing = (date: string, dayId: string, reviews = [] as ReturnType<typeof summarizeConditions>[number]["reviews"]) =>
      ({ ...source, date, trip_day_id: dayId, context_key: "key", reviews });
    const trip = (reviews: ReturnType<typeof summarizeConditions>[number]["reviews"] = []) => ({
      conditions: [listing("2026-10-11", "day-2"), listing("2026-10-10", "day-1", reviews)],
      conditions_sources: [{ ...source, dates: ["2026-10-10", "2026-10-11"] }],
    });
    const recorded = (user: string, stale: string[] = [], action: "reviewed" | "withdrawn" = "reviewed") => ({
      user_id: user, stale_reasons: stale, history: [],
      current: { id: `entry-${user}`, action, note: null, reviewed_at: "2026-10-09T12:00:00Z", created_at: "2026-10-09T12:00:00Z" },
    });

    it("lists every day it's on, and the reviews a new link or area makes to record again", () => {
      const preview = previewConditionsEdit(trip([recorded("user-2"), recorded("user-3", ["Route changed"]), recorded("user-4", [], "withdrawn")]), "source-1",
        { category: "avalanche", name: "MWAC", region: "Presidential Range", url: "https://example.org/new" });
      expect(preview).toEqual({
        source_id: "source-1", revision: 1,
        summary: "Your change to MWAC applies to both days it's listed on: Sat Oct 10 and Sun Oct 11. A new link or area changes what was reviewed, so reviews recorded for these days need recording again.",
        days: [{ date: "2026-10-10", date_label: "Sat Oct 10", note: "1 review to record again" }, { date: "2026-10-11", date_label: "Sun Oct 11", note: null }],
        expected_days: [{ date: "2026-10-10", day_id: "day-1" }, { date: "2026-10-11", day_id: "day-2" }],
      });
      expect(previewConditionsEdit(trip([recorded("user-2")]), "source-1", { category: "avalanche", name: "MWAC", region: null, url: source.url }))
        .toMatchObject({ days: [{ note: "1 review to record again" }, { note: null }] });
    });

    it("says a new name or type keeps reviews as recorded", () => {
      const preview = previewConditionsEdit(trip([recorded("user-2")]), "source-1", { ...source, category: "weather", name: "Mount Washington Avalanche Center" });
      expect(preview).toMatchObject({
        summary: "Your change to MWAC applies to both days it's listed on: Sat Oct 10 and Sun Oct 11. The link and area stay the same, so reviews stay as recorded.",
        days: [{ note: null }, { note: null }],
      });
    });

    it("refuses a source that isn't on the trip", () => {
      expect(previewConditionsEdit(trip(), "source-9", source)).toMatchObject({ status: 404 });
    });
  });

  it("finds every review entry on a day for a date change's check, and the reviews kept for sources no longer listed", () => {
    const kept = rows(["day-1"], [
      entry(1, "day-1", "user-2", now), entry(2, "day-2", "user-2", now),
      { ...entry(3, "day-1", "user-2", now), source_id: "source-2" }, { ...entry(4, "day-1", "user-3", now), source_id: "source-2" },
      { ...entry(5, "day-1", "user-3", now), source_id: "source-2", action: "withdrawn" as const },
      { ...entry(6, "day-1", "user-2", now), source_id: "source-3", action: "withdrawn" as const },
    ]);
    expect(removedDayConditions(kept, "day-1")).toEqual({ source_ids: ["source-1"], entries: 5 });
    expect(removedDayConditions(kept, "day-2")).toEqual({ source_ids: [], entries: 1 });
    expect(removedDayConditions(kept, "day-0")).toBeUndefined();
    // MWAC is listed; MWOBS keeps Sam's review (Alex withdrew); Avalanche Canada's only review was withdrawn.
    expect(keptReviewsOn(kept, "day-1")).toEqual([{ name: "MWOBS", reviews: 1 }]);
    expect(keptReviewsOn(kept, "day-2")).toEqual([{ name: "MWAC", reviews: 1 }]);
  });

  it("compares a review's days in any order", () => {
    expect(sameDays([{ date: "2026-10-10", day_id: "A" }, { date: "2026-10-11", day_id: "b" }], [{ date: "2026-10-11", day_id: "B" }, { date: "2026-10-10", day_id: "a" }])).toBe(true);
    expect(sameDays([{ date: "2026-10-10", day_id: "a" }], [{ date: "2026-10-10", day_id: "a" }, { date: "2026-10-11", day_id: "b" }])).toBe(false);
    expect(sameDays([{ date: "2026-10-10", day_id: "a" }], [{ date: "2026-10-10", day_id: "b" }])).toBe(false);
  });
});

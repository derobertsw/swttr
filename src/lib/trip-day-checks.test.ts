import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkTimeLabel,
  dayCheckStaleReasons,
  dayChecksFor,
  loadDayChecks,
  planReviewContext,
  preparationFor,
  summarizeDayChecks,
  transceiverContext,
  type DayCheckRows,
} from "@/lib/trip-day-checks";
import type { TripDay, TripFull, TripLocation, TripMember, TripStop, TripTourPlanSummary } from "@/types/trips";

const FRI = "2027-02-12", SAT = "2027-02-13", SUN = "2027-02-14", MON = "2027-02-15";
const point = (latitude: number): TripLocation => ({ label: "Rogers Pass lot", address: null, latitude, longitude: -117.52, precision: "exact",
  time_zone: "America/Los_Angeles", source: "manual", provider: null, provider_id: null, attribution: null });
const stop: TripStop = { id: "stop-1", trip_id: "trip-1", position: 0, name: "Rogers Pass", latitude: 51.3, longitude: -117.52,
  activities: ["Backcountry"], created_at: "2027-01-01T00:00:00Z", access_point: point(51.301) };
const day = (id: string, date: string, activity: string | null = null): TripDay => ({ id, trip_id: "trip-1", stop_id: null, date, activity });
const plan = (extra: Partial<TripTourPlanSummary> = {}) => ({
  trip_day_id: "day-sat", objective: "Asulkan Valley", route_url: "https://example.com/asulkan", backup_plan: "Glacier Crest trees",
  meet_time: "06:30:00", meet_day_offset: 0, return_time: "15:00:00", return_day_offset: 0, time_zone: "America/Los_Angeles",
  approach_notes: "Skin the old road", distance: 12, distance_unit: "km", revision: 2, ...extra,
}) as TripTourPlanSummary;
const member = (id: string, name: string, user: string | null, status: TripMember["status"], role: TripMember["role"] = "member"): TripMember =>
  ({ id, trip_id: "trip-1", user_id: user, display_name: name, role, status, invite_token: null, created_at: "2027-01-01T00:00:00Z" });
const members = [
  member("m-you", "You", "user-1", "joined", "organizer"), member("m-ana", "Ana", "user-2", "joined"), member("m-gus", "Gus", null, "guest"),
  member("m-ivy", "Ivy", null, "invited"), member("m-lee", "Lee", "user-4", "left"),
];
const days = [day("day-fri", FRI, "Alpine"), day("day-sat", SAT), day("day-sun", SUN, "Backcountry"), day("day-mon", MON, "Backcountry")];
const trip = { id: "trip-1", owner_user_id: "user-1", name: "Rogers Pass", start_date: SAT, end_date: SUN, status: "planning",
  created_at: "", updated_at: "" } as TripFull["trip"];
const full = (extra: Partial<TripFull> = {}): TripFull => ({ trip, stops: [stop], members, days, kits: [], gear: [], tour_plans: [plan()], ...extra });

let entryNumber = 0;
const row = (extra: Partial<DayCheckRows["entries"][number]> & Pick<DayCheckRows["entries"][number], "trip_member_id" | "kind" | "context">) => ({
  id: `entry-${++entryNumber}`, entry_number: entryNumber, trip_day_id: "day-sat", action: "recorded" as const, recorded_by: "user-2",
  plan_revision: extra.kind === "plan_review" ? 2 : null, time_zone: "America/Los_Angeles", created_at: "2027-02-13T14:12:00Z", ...extra,
});
const planNow = planReviewContext(full(), days[1]);

describe("planReviewContext", () => {
  it("covers the route, backup plan, meet and return times and the meeting point, not notes or figures", () => {
    expect(planNow).toEqual({
      date: SAT,
      plan: { objective: "Asulkan Valley", route_url: "https://example.com/asulkan", backup_plan: "Glacier Crest trees",
        meet_time: "06:30", meet_day_offset: 0, return_time: "15:00", return_day_offset: 0 },
      meeting_point: { latitude: 51.301, longitude: -117.52 },
    });
    expect(planReviewContext(full({ tour_plans: [plan({ approach_notes: "Bring ski crampons", distance: 14, revision: 3 })] }), days[1])).toEqual(planNow);
    expect(planReviewContext(full({ tour_plans: [] }), days[1]).plan).toBeNull();
  });
});

describe("transceiverContext", () => {
  it("is the transceiver in the person's list, with when it was added, or none", () => {
    expect(transceiverContext(days[1], undefined)).toEqual({ date: SAT, transceiver: null });
    expect(transceiverContext(days[1], { transceiver: { status: "removed", added_at: "2027-02-01T00:00:00Z" } }).transceiver).toBeNull();
    expect(transceiverContext(days[1], { transceiver: { status: "added", added_at: "2027-02-01T00:00:00Z" } }).transceiver)
      .toEqual({ added_at: "2027-02-01T00:00:00Z" });
    expect(transceiverContext(days[1], { transceiver: { status: "added" } }).transceiver).toEqual({ added_at: null });
  });
});

describe("dayCheckStaleReasons", () => {
  const changed = (extra: Partial<TripTourPlanSummary>) =>
    dayCheckStaleReasons("plan_review", planNow, planReviewContext(full({ tour_plans: [plan(extra)] }), days[1]));

  it.each([
    [{ objective: "Bonney Glacier" }, ["Route changed"]],
    [{ route_url: null }, ["Route changed"]],
    [{ backup_plan: null }, ["Backup plan changed"]],
    [{ meet_time: "06:00:00" }, ["Meet time changed"]],
    [{ meet_day_offset: -1 as const }, ["Meet time changed"]],
    [{ return_time: "16:00:00", return_day_offset: 0 as const }, ["Return time changed"]],
    [{ approach_notes: "Ski crampons", checkin_notes: "Text Ana", distance: 15 }, []],
  ])("says what changed in a plan: %o", (extra, reasons) => {
    expect(changed(extra)).toEqual(reasons);
  });

  it("says when the meeting point, the date or the plan itself changed", () => {
    const moved = planReviewContext(full({ stops: [{ ...stop, access_point: point(51.4) }] }), days[1]);
    expect(dayCheckStaleReasons("plan_review", planNow, moved)).toEqual(["Meeting point changed"]);
    expect(dayCheckStaleReasons("plan_review", { ...planNow, date: FRI }, planNow)).toEqual(["Date changed from Fri Feb 12"]);
    expect(dayCheckStaleReasons("plan_review", planNow, planReviewContext(full({ tour_plans: [] }), days[1]))).toEqual(["Tour plan removed"]);
  });

  it("says when the transceiver in the list was taken off or replaced, but not when one was listed after", () => {
    const listed = { date: SAT, transceiver: { added_at: "2027-02-01T00:00:00Z" } };
    expect(dayCheckStaleReasons("transceiver", listed, listed)).toEqual([]);
    expect(dayCheckStaleReasons("transceiver", listed, { date: SAT, transceiver: null })).toEqual(["Transceiver taken off the packing list"]);
    expect(dayCheckStaleReasons("transceiver", listed, { date: SAT, transceiver: { added_at: "2027-02-10T00:00:00Z" } }))
      .toEqual(["Transceiver replaced in the packing list"]);
    expect(dayCheckStaleReasons("transceiver", { date: SAT, transceiver: { added_at: null } }, listed)).toEqual(["Transceiver replaced in the packing list"]);
    expect(dayCheckStaleReasons("transceiver", { date: SAT, transceiver: null }, listed)).toEqual([]);
  });
});

describe("checkTimeLabel", () => {
  it("shows the time on the destination's clock, or in UTC without its zone", () => {
    expect(checkTimeLabel("2027-02-13T14:12:00Z", "America/Los_Angeles")).toBe("6:12 AM PST · Sat Feb 13");
    expect(checkTimeLabel("2027-02-13T07:30:00Z", "America/Los_Angeles")).toBe("11:30 PM PST · Fri Feb 12");
    expect(checkTimeLabel("2027-02-13T14:12:00Z", null)).toBe("2:12 PM UTC · Sat Feb 13");
  });
});

describe("summarizeDayChecks", () => {
  const rows = (entries: DayCheckRows["entries"] = [], equipment: DayCheckRows["equipment"] = new Map()): DayCheckRows => ({ entries, equipment });

  it("lists both checks on each Backcountry day of the trip for members and managed guests, not invitations or people who left", () => {
    const summary = summarizeDayChecks(rows(), full());
    expect(summary.map((entry) => [entry.date, entry.plan_available])).toEqual([[SAT, true], [SUN, false]]);
    expect(summary[0].checks.map((check) => `${check.member_id}:${check.kind}:${check.status}`)).toEqual([
      "m-you:plan_review:not_recorded", "m-you:transceiver:not_recorded", "m-ana:plan_review:not_recorded",
      "m-ana:transceiver:not_recorded", "m-gus:plan_review:not_recorded", "m-gus:transceiver:not_recorded",
    ]);
    expect(summary[0].checks.every((check) => !check.can_record && check.context_key)).toBe(true);
    // Without a plan there's nothing to review.
    expect(summary[1].checks.filter((check) => check.kind === "plan_review").every((check) => check.context_key === null)).toBe(true);
  });

  it("leaves out people not taking part that day", () => {
    const lodging = { people: [{ member_id: "m-ana", days: [{ date: SAT, participation: "skipping" }, { date: SUN, participation: "participating" }] }] } as TripFull["lodging"];
    const summary = summarizeDayChecks(rows(), full({ lodging }));
    expect(summary[0].checks.some((check) => check.member_id === "m-ana")).toBe(false);
    expect(summary[1].checks.some((check) => check.member_id === "m-ana")).toBe(true);
  });

  it("gives each check its latest entry, history and whether what it covers changed", () => {
    const first = row({ trip_member_id: "m-ana", kind: "plan_review", context: planNow });
    const undo = row({ trip_member_id: "m-ana", kind: "plan_review", context: planNow, action: "withdrawn", created_at: "2027-02-13T14:20:00Z" });
    const again = row({ trip_member_id: "m-ana", kind: "plan_review", context: planNow, created_at: "2027-02-13T14:25:00Z" });
    const transceiver = row({ trip_member_id: "m-ana", kind: "transceiver", context: { date: SAT, transceiver: { added_at: "2027-02-01T00:00:00Z" } } });
    const guest = row({ trip_member_id: "m-gus", kind: "transceiver", context: { date: SAT, transceiver: null }, recorded_by: "user-1" });
    const changedPlan = full({ tour_plans: [plan({ backup_plan: "Stay home" })] });
    const [sat] = summarizeDayChecks(rows([first, undo, again, transceiver, guest], new Map([["m-ana", { transceiver: { status: "removed" } }]])), changedPlan);
    const ana = sat.checks.filter((check) => check.member_id === "m-ana");
    expect(ana[0]).toMatchObject({ status: "out_of_date", stale_reasons: ["Backup plan changed"], current: { id: again.id, action: "recorded", plan_revision: 2 } });
    expect(ana[0].history.map((entry) => [entry.id, entry.action])).toEqual([[undo.id, "withdrawn"], [first.id, "recorded"]]);
    expect(ana[0].current?.time_label).toBe("6:25 AM PST · Sat Feb 13");
    expect(ana[1]).toMatchObject({ status: "out_of_date", stale_reasons: ["Transceiver taken off the packing list"] });
    expect(sat.checks.find((check) => check.member_id === "m-gus" && check.kind === "transceiver"))
      .toMatchObject({ status: "recorded", stale_reasons: [], current: { recorded_by: "user-1" } });
  });

  it("starts a withdrawn check over as not recorded", () => {
    const first = row({ trip_member_id: "m-ana", kind: "transceiver", context: { date: SAT, transceiver: null } });
    const undo = row({ trip_member_id: "m-ana", kind: "transceiver", context: { date: SAT, transceiver: null }, action: "withdrawn" });
    const [sat] = summarizeDayChecks(rows([first, undo]), full());
    expect(sat.checks.find((check) => check.member_id === "m-ana" && check.kind === "transceiver"))
      .toMatchObject({ status: "not_recorded", current: { id: undo.id, action: "withdrawn" } });
  });
});

describe("dayChecksFor", () => {
  const summary = summarizeDayChecks({ entries: [], equipment: new Map() }, full());
  const recordable = (userId: string) => dayChecksFor(summary, full(), userId)[0].checks
    .filter((check) => check.can_record).map((check) => `${check.member_id}:${check.kind}`);

  it("lets each person record their own checks, and the organizer a managed guest's too", () => {
    expect(recordable("user-1")).toEqual(["m-you:plan_review", "m-you:transceiver", "m-gus:plan_review", "m-gus:transceiver"]);
    expect(recordable("user-2")).toEqual(["m-ana:plan_review", "m-ana:transceiver"]);
    expect(recordable("user-4")).toEqual([]);
  });

  it("keeps the context to record with only on those", () => {
    const checks = dayChecksFor(summary, full(), "user-2")[0].checks;
    expect(checks.filter((check) => check.context_key !== null).map((check) => check.member_id)).toEqual(["m-ana", "m-ana"]);
  });
});

describe("preparationFor", () => {
  const at = (iso: string) => Date.parse(iso);
  const forViewer = (viewer: TripFull, userId: string, entries: DayCheckRows["entries"] = [], now = at("2027-02-01T18:00:00Z")) => {
    const summary = dayChecksFor(summarizeDayChecks({ entries, equipment: new Map() }, viewer), viewer, userId);
    return preparationFor(viewer, summary, userId, now);
  };

  it("lists nothing unrecorded while planning days ahead, apart from a missing tour plan for the organizer", () => {
    expect(forViewer(full(), "user-2")).toEqual([]);
    expect(forViewer(full(), "user-1")).toEqual([{ kind: "no_tour_plan", scope: "crew", date: SUN, label: "No tour plan for Sun Feb 14",
      action: { label: "Add the tour plan", href: `/trips/trip-1/days/${SUN}#tour-plan-heading` } }]);
  });

  it("lists a recorded check that's out of date on any day ahead", () => {
    const entries = [row({ trip_member_id: "m-ana", kind: "plan_review", context: planNow })];
    expect(forViewer(full({ tour_plans: [plan({ objective: "Bonney Glacier" })] }), "user-2", entries)).toEqual([{
      kind: "plan_out_of_date", scope: "personal", date: SAT,
      label: "Your tour and backup plan review for Sat Feb 13 is out of date: Route changed",
      action: { label: "Review the plan again", href: `/trips/trip-1/days/${SAT}#day-checks` },
    }]);
  });

  it("lists unrecorded checks on the day at the destination, and the organizer's guest checks and crew behind a change", () => {
    // 6 AM on Saturday in Rogers Pass.
    const saturday = at("2027-02-13T14:00:00Z");
    const changed = full({ tour_plans: [plan({ meet_time: "07:00:00" })] });
    const entries = [row({ trip_member_id: "m-ana", kind: "plan_review", context: planNow })];
    expect(forViewer(changed, "user-1", entries, saturday).map((item) => `${item.scope}:${item.kind}:${item.label}`)).toEqual([
      "personal:plan_not_reviewed:Your tour and backup plan review for today, Sat Feb 13 isn't recorded yet",
      "personal:transceiver_not_checked:Your transceiver check for today, Sat Feb 13 isn't recorded yet",
      "crew:guest_check:Gus's tour and backup plan review for today, Sat Feb 13 isn't recorded yet (managed guest)",
      "crew:guest_check:Gus's transceiver check for today, Sat Feb 13 isn't recorded yet (managed guest)",
      "crew:crew_out_of_date:1 person reviewed the tour plan for today, Sat Feb 13 before it changed",
      "crew:no_tour_plan:No tour plan for Sun Feb 14",
    ]);
    // A member sees only their own.
    expect(forViewer(changed, "user-2", entries, saturday).map((item) => item.kind)).toEqual(["plan_out_of_date", "transceiver_not_checked"]);
  });

  it("uses the destination's date, and leaves past days out", () => {
    // 3 AM UTC on Saturday is still Friday evening in Rogers Pass.
    expect(forViewer(full(), "user-2", [], at("2027-02-13T03:00:00Z"))).toEqual([]);
    expect(forViewer(full(), "user-2", [], at("2027-02-15T18:00:00Z"))).toEqual([]);
  });
});

describe("loadDayChecks", () => {
  type Result = { data: unknown; error: { code: string } | null };
  const client = (checks: Result, packing: Result) => ({
    from: (table: string) => {
      const result = table === "trip_day_checks" ? checks : packing;
      const query = { select: () => query, eq: () => query, order: () => query, then: (resolve: (value: Result) => unknown) => resolve(result) };
      return query;
    },
  }) as unknown as SupabaseClient;

  it("reads the entries and each member's equipment", async () => {
    const loaded = await loadDayChecks(client({ data: [{ id: "entry-1" }], error: null },
      { data: [{ trip_member_id: "m-ana", equipment: { transceiver: { status: "added" } } }], error: null }), "trip-1");
    expect(loaded?.entries).toEqual([{ id: "entry-1" }]);
    expect(loaded?.equipment.get("m-ana")).toEqual({ transceiver: { status: "added" } });
  });

  it("reads nothing before the migrations, and fails rather than hide a check", async () => {
    expect(await loadDayChecks(client({ data: null, error: { code: "PGRST205" } }, { data: [], error: null }), "trip-1")).toBeNull();
    // Before 032 nobody has a transceiver in their list.
    expect(await loadDayChecks(client({ data: [], error: null }, { data: null, error: { code: "42703" } }), "trip-1"))
      .toEqual({ entries: [], equipment: new Map() });
    await expect(loadDayChecks(client({ data: null, error: { code: "57014" } }, { data: [], error: null }), "trip-1")).rejects.toThrow("Couldn't load day checks");
    await expect(loadDayChecks(client({ data: [], error: null }, { data: null, error: { code: "57014" } }), "trip-1")).rejects.toThrow("Couldn't load day checks");
  });
});

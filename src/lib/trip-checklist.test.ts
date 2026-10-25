import { describe, expect, it } from "vitest";
import { buildDayChecklists } from "@/lib/trip-checklist";
import { buildLodging } from "@/lib/trip-lodging";
import { checklistMembers as members, checklistTrip as trip, gear, kit, source } from "@/test/dayChecklist";
import { savedOutfit } from "@/test/savedKit";
import { ALEX, BLAIR, CASEY, DANA, ELI, FRAN, FRI, MON, PINE, SAT, SPLIT_MEMBERS, SPLIT_TRIP, SUN, splitRows } from "@/test/splitStays";
import { planReviewContext, summarizeDayChecks } from "@/lib/trip-day-checks";
import type { TripFull, TripTourPlanSummary } from "@/types/trips";

const person = (full: TripFull, date: string, memberId: string) =>
  buildDayChecklists(full, null, FRI).days.find((day) => day.date === date)!.people.find((entry) => entry.member_id === memberId)!;

describe("Day checklist (#336)", () => {
  it("never calls an empty kit OK, and keeps a checklist, a saved outfit and a changed plan apart", () => {
    const full = trip({ kits: [
      kit(ALEX.id, SAT, { outfit: savedOutfit() }),
      kit(BLAIR.id, SAT, { items: ["shell", "gloves"], state: "warn" }),
      kit(DANA.id, SAT, { items: [], state: "ok" }),
      kit(ELI.id, SAT, { items: ["shell"], state: "missing" }),
      kit(CASEY.id, SAT, { state: "missing" }),
      kit(ALEX.id, SUN, { outfit: savedOutfit() }),
      kit(BLAIR.id, SUN, { outfit: savedOutfit(), state: "warn" }),
    ] });
    expect(person(full, SAT, ALEX.id).clothing).toEqual({ state: "outfit", label: "Outfit saved", notes: [], flag: null });
    expect(person(full, SAT, BLAIR.id).clothing).toEqual({ state: "checklist", label: "Older checklist: Shell, Gloves", notes: [], flag: { state: "warn", label: "Flagged: needs help" } });
    expect(person(full, SAT, DANA.id).clothing).toMatchObject({ state: "not_started", label: "Not started", flag: null });
    // Missing, as the day page shows it, whether or not the kit has slots.
    expect(person(full, SAT, ELI.id).clothing).toMatchObject({ state: "checklist", flag: { state: "missing", label: "Flagged: missing" } });
    // Casey isn't taking part Saturday, so nothing is asked of them; a saved flag still shows.
    expect(person(full, SAT, CASEY.id).clothing).toMatchObject({ state: "not_needed", label: "Nothing to plan", flag: { state: "missing", label: "Flagged: missing" } });
    expect(person(full, SAT, FRAN.id).clothing).toMatchObject({ state: "not_started", label: "Not started", flag: null });
    // A saved outfit carries no checklist flag, as on the day page.
    expect(person(full, SUN, BLAIR.id).clothing.flag).toBeNull();
    // Saturday's outfit copied to Sunday was planned for Saturday's forecast.
    expect(person(full, SUN, ALEX.id).clothing).toMatchObject({ state: "outfit_review", label: "Outfit saved for another plan" });
    expect(person(full, SUN, ALEX.id).clothing.notes).toEqual([expect.stringContaining("Sat Oct 10")]);
  });

  it("asks nobody for clothing on a Travel or Rest day, and keeps a kit someone saved there (#334)", () => {
    const base = trip();
    const full = trip({ days: base.days.map((day) => day.date === SUN ? { ...day, activity: "Travel" } : day.date === MON ? { ...day, activity: "Rest" } : day),
      kits: [kit(BLAIR.id, MON, { items: ["shell"] })] });
    expect(person(full, SUN, ALEX.id).clothing).toEqual({ state: "not_needed", label: "Nothing to plan", notes: [], flag: null });
    expect(person(full, MON, ALEX.id).clothing.state).toBe("not_needed");
    expect(person(full, MON, BLAIR.id).clothing).toMatchObject({ state: "checklist", label: "Older checklist: Shell" });
    // Saturday is still a ski day.
    expect(person(full, SAT, ALEX.id).clothing.state).toBe("not_started");
  });

  it("follows the selected day's attendance and tonight's stay, and names a pending invitation as one", () => {
    const full = trip();
    expect(person(full, FRI, CASEY.id)).toMatchObject({ participation: "not_on_trip", participation_label: "Not on trip" });
    expect(person(full, SAT, CASEY.id)).toMatchObject({ participation: "skipping", participation_label: "There, not taking part",
      tonight: { state: "assigned", stay_id: PINE.id, label: "Pine rental", gap: false } });
    expect(person(full, SUN, CASEY.id)).toMatchObject({ participation: "participating", tonight: { label: "Mountain lodge" } });
    expect(person(full, FRI, FRAN.id)).toMatchObject({ membership: "invited", membership_label: "Invitation pending" });
    expect(person(full, FRI, DANA.id).membership_label).toBe("Managed guest");
    expect(person(full, FRI, ALEX.id).membership_label).toBe("Organizer");
    const rows = splitRows();
    rows.assignments = rows.assignments.filter((night) => !(night.member_id === ELI.id && night.date === SUN));
    const gap = trip({ lodging: buildLodging(SPLIT_TRIP, rows.stays, rows.assignments, { members: SPLIT_MEMBERS, attendance: rows.attendance, per_member: true }) });
    expect(person(gap, SUN, ELI.id).tonight).toEqual({ state: "unplanned", stay_id: null, label: "Not planned", gap: true });
  });

  it("lists shared gear by its own states, assignment alone never meaning accepted or packed", () => {
    const full = trip({ gear: [
      gear("Stove", BLAIR.id),
      gear("Rope", BLAIR.id, { accepted_at: "2026-10-02T00:00:00Z" }),
      gear("Shovel", BLAIR.id, { accepted_at: "2026-10-02T00:00:00Z", packed_at: "2026-10-03T00:00:00Z" }),
      gear("Tent", null),
      // A snapshot from before acceptance tracking.
      gear("Map", DANA.id, { accepted_at: undefined, packed_at: undefined }),
    ] });
    expect(person(full, FRI, BLAIR.id).shared.map((item) => [item.description, item.status, item.label])).toEqual([
      ["Stove", "awaiting", "Awaiting acceptance"], ["Rope", "accepted", "Accepted · not packed"], ["Shovel", "packed", "Packed"]]);
    expect(person(full, FRI, DANA.id).shared).toEqual([{ id: "Map", description: "Map", status: "assigned", label: "Assigned" }]);
    // Reassigned: it's only on its new person's list.
    const moved = trip({ gear: [gear("Stove", ALEX.id)] });
    expect(person(moved, FRI, BLAIR.id).shared).toEqual([]);
    expect(person(moved, FRI, ALEX.id).shared.map((item) => item.description)).toEqual(["Stove"]);
  });

  it("counts each person's own source reviews without a verdict, and none for someone without an account", () => {
    const full = trip({ conditions: [
      source("avalanche", SAT, [{ user: "user-alex", at: "2026-10-09T18:00:00Z" }, { user: "user-blair", stale: true }]),
      source("weather", SAT, [{ user: "user-alex", action: "withdrawn" }]),
    ] });
    expect(person(full, SAT, ALEX.id).conditions).toEqual({ sources: 2, reviewed: 1, out_of_date: 0, latest: "2026-10-09T18:00:00Z", label: "1 of 2 sources reviewed · latest Fri Oct 9" });
    expect(person(full, SAT, BLAIR.id).conditions?.label).toBe("0 of 2 sources reviewed · 1 reviewed before the plan changed · latest Thu Oct 8");
    expect(person(full, SAT, ELI.id).conditions?.label).toBe("No sources reviewed yet");
    expect(person(full, SAT, DANA.id).conditions).toBeNull();
    expect(person(full, FRI, ALEX.id).conditions).toBeNull();
  });

  it("states each person's day checks on Backcountry days they take part in, and who recorded a guest's (#212)", () => {
    const tour = (date: string) => ({ id: `day-${date}`, trip_id: SPLIT_TRIP.id, stop_id: "stop-stowe", date, activity: "Backcountry" });
    const plan = { trip_day_id: `day-${SAT}`, objective: "Mount Mansfield", route_url: null, backup_plan: null, meet_time: null, meet_day_offset: 0,
      return_time: null, return_day_offset: 0, time_zone: "America/New_York" } as TripTourPlanSummary;
    const base = trip({ days: [tour(SAT), tour(SUN)], tour_plans: [plan] });
    const recorded = (memberId: string, kind: "plan_review" | "transceiver", by: string, number: number, context: object) => ({
      id: `entry-${number}`, entry_number: number, trip_day_id: `day-${SAT}`, trip_member_id: memberId, kind, action: "recorded" as const,
      recorded_by: by, context, plan_revision: null, time_zone: "America/New_York", created_at: "2026-10-10T10:12:00Z" });
    const planNow = planReviewContext(base, base.days[0]);
    const entries = [
      recorded(ALEX.id, "plan_review", "user-alex", 1, planNow),
      recorded(BLAIR.id, "plan_review", "user-blair", 2, { ...planNow, plan: { ...planNow.plan!, objective: "Smugglers' Notch" } }),
      recorded(DANA.id, "transceiver", "user-alex", 3, { date: SAT, transceiver: null }),
    ];
    const full = { ...base, day_checks: summarizeDayChecks({ entries, equipment: new Map() }, base) };
    expect(person(full, SAT, ALEX.id).day_checks).toEqual([
      { kind: "plan_review", status: "recorded", label: "Tour and backup plan reviewed · 6:12 AM EDT · Sat Oct 10" },
      { kind: "transceiver", status: "not_recorded", label: "Transceiver check not recorded yet" },
    ]);
    expect(person(full, SAT, BLAIR.id).day_checks?.[0]).toEqual({ kind: "plan_review", status: "out_of_date", label: "Tour and backup plan reviewed before it changed: Route changed" });
    expect(person(full, SAT, DANA.id).day_checks?.[1].label).toBe("Transceiver check recorded · 6:12 AM EDT · Sat Oct 10 · by Alex");
    // Casey isn't taking part on Saturday, and a pending invitation has no checks.
    expect(person(full, SAT, CASEY.id).day_checks).toBeNull();
    expect(person(full, SAT, FRAN.id).day_checks).toBeNull();
    expect(person(full, SUN, ALEX.id).day_checks?.[0].label).toBe("No tour plan to review yet");
    expect(person(trip(), SAT, ALEX.id).day_checks).toBeNull();
  });

  it("opens on today during the trip, the first day before it and the last after it, and names the viewer", () => {
    const full = trip();
    expect(buildDayChecklists(full, null, "2026-09-01").default_date).toBe(FRI);
    expect(buildDayChecklists(full, null, SUN).default_date).toBe(SUN);
    expect(buildDayChecklists(full, null, "2026-11-01").default_date).toBe(MON);
    expect(buildDayChecklists(full, "user-blair", FRI).viewer_member_id).toBe(BLAIR.id);
    expect(buildDayChecklists(full, "user-outsider", FRI).viewer_member_id).toBeNull();
    expect(buildDayChecklists(trip({ days: [] }), null, FRI)).toMatchObject({ default_date: null, days: [] });
    expect(buildDayChecklists(full, null, FRI).days.map((day) => [day.date_label, day.activity, day.place])).toEqual([
      ["Fri Oct 9", "Downhill", "Stowe"], ["Sat Oct 10", "Downhill", "Stowe"], ["Sun Oct 11", "Downhill", "Stowe"], ["Mon Oct 12", "Downhill", "Stowe"]]);
  });

  it("leaves out people who left", () => {
    const full = trip({ members: members.map((member) => member.id === ELI.id ? { ...member, status: "left" as const } : member) });
    expect(buildDayChecklists(full, null, FRI).days[0].people.map((entry) => entry.display_name)).toEqual(["Alex", "Blair", "Casey", "Dana", "Fran"]);
  });
});

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonical } from "@/lib/trip-conditions";
import { dateLabel } from "@/lib/trip-lodging";
import { accessPointFor } from "@/lib/trip-location";
import { TOUR_ACTIVITY } from "@/lib/trip-activities";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import type {
  TripDay,
  TripDayCheck,
  TripDayCheckEntry,
  TripDayCheckKind,
  TripDayChecks,
  TripFull,
  TripPlanReviewContext,
  TripPreparationItem,
  TripTransceiverContext,
} from "@/types/trips";

/**
 * Day checks on Backcountry days (#212): "Tour and backup plan reviewed"
 * before leaving and "Transceiver check" at the trailhead. Each person
 * records their own; the organizer also records a managed guest's. See
 * docs/trip-touring-prep.md.
 */
const DAY_CHECK_KINDS: readonly TripDayCheckKind[] = ["plan_review", "transceiver"];
export const isDayCheckKind = (value: unknown): value is TripDayCheckKind => DAY_CHECK_KINDS.includes(value as TripDayCheckKind);

const LABELS: Record<TripDayCheckKind, string> = { plan_review: "Tour and backup plan review", transceiver: "Transceiver check" };

type Plans = Pick<TripFull, "stops" | "tour_plans">;
/** A member's touring equipment as saved (032), with when each item was added. */
type SavedEquipment = Record<string, { status?: unknown; added_at?: unknown } | undefined>;

/** The day's stop, or the base (the first stop) without one, as the day page reads it. */
const stopOf = (full: Pick<TripFull, "stops">, day: Pick<TripDay, "stop_id">) =>
  full.stops.find((stop) => stop.id === day.stop_id) ?? full.stops[0];

/** Whether the day is a Backcountry day: its own activity, or its stop's first. */
export const isTourDay = (full: Pick<TripFull, "stops">, day: TripDay) =>
  (day.activity ?? stopOf(full, day)?.activities[0] ?? null) === TOUR_ACTIVITY;

/**
 * The tour plan as a plan review covers it: the route, backup plan, meet and
 * return times and meeting point. Notes and figures don't count.
 * record_trip_day_check builds the same shape under the trip lock to check
 * it, so change both together.
 */
export function planReviewContext(full: Plans, day: TripDay): TripPlanReviewContext {
  const plan = full.tour_plans?.find((candidate) => candidate.trip_day_id === day.id);
  const point = accessPointFor(full.stops, day)?.location;
  return {
    date: day.date,
    plan: plan ? {
      objective: plan.objective, route_url: plan.route_url, backup_plan: plan.backup_plan,
      meet_time: plan.meet_time?.slice(0, 5) ?? null, meet_day_offset: plan.meet_day_offset,
      return_time: plan.return_time?.slice(0, 5) ?? null, return_day_offset: plan.return_day_offset,
    } : null,
    meeting_point: point ? { latitude: point.latitude, longitude: point.longitude } : null,
  };
}

/** The transceiver in the person's own packing list, as a transceiver check covers it. Managed guests have no list. */
export function transceiverContext(day: TripDay, equipment: SavedEquipment | undefined): TripTransceiverContext {
  const item = equipment?.transceiver;
  return { date: day.date, transceiver: item?.status === "added" ? { added_at: (item.added_at as string | undefined) ?? null } : null };
}

export function dayCheckContext(kind: TripDayCheckKind, full: Plans, day: TripDay, equipment: SavedEquipment | undefined) {
  return kind === "plan_review" ? planReviewContext(full, day) : transceiverContext(day, equipment);
}

type SavedContext = Partial<TripPlanReviewContext> & Partial<TripTransceiverContext>;

/** What changed since a check was recorded, in the order the day page lists it; empty when nothing did. */
export function dayCheckStaleReasons(kind: TripDayCheckKind, saved: SavedContext, now: TripPlanReviewContext | TripTransceiverContext): string[] {
  const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  const reasons: string[] = [];
  if (saved.date !== now.date) reasons.push(saved.date ? `Date changed from ${dateLabel(saved.date)}` : "Date changed");
  if (kind === "plan_review") {
    const { plan, meeting_point } = now as TripPlanReviewContext;
    const before = saved.plan;
    if (!plan) reasons.push("Tour plan removed");
    else if (!before) reasons.push("Tour plan changed");
    else {
      if (!same([before.objective, before.route_url], [plan.objective, plan.route_url])) reasons.push("Route changed");
      if (!same(before.backup_plan, plan.backup_plan)) reasons.push("Backup plan changed");
      if (!same([before.meet_time, before.meet_day_offset], [plan.meet_time, plan.meet_day_offset])) reasons.push("Meet time changed");
      if (!same([before.return_time, before.return_day_offset], [plan.return_time, plan.return_day_offset])) reasons.push("Return time changed");
    }
    if (!same(saved.meeting_point, meeting_point)) reasons.push("Meeting point changed");
  } else if (saved.transceiver) {
    // Recorded with no transceiver in the list, a check isn't about one listed later.
    const { transceiver } = now as TripTransceiverContext;
    if (!transceiver) reasons.push("Transceiver taken off the packing list");
    else if (!same(saved.transceiver, transceiver)) reasons.push("Transceiver replaced in the packing list");
  }
  return reasons;
}

/** The destination's time zone on the day, as far as it's known: the tour plan's, else its access point's. */
export function dayTimeZone(full: Plans, day: TripDay): string | null {
  const zone = full.tour_plans?.find((plan) => plan.trip_day_id === day.id)?.time_zone
    ?? accessPointFor(full.stops, day)?.location.time_zone;
  return zone && isTimeZone(zone) ? zone : null;
}

/** "6:12 AM MST · Sat Feb 13" on the destination's clock, or in UTC when its zone isn't known. */
export function checkTimeLabel(iso: string, zone: string | null): string {
  const instant = new Date(iso);
  const timeZone = zone && isTimeZone(zone) ? zone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).formatToParts(instant);
  const text = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${text("hour")}:${text("minute")} ${text("dayPeriod")} ${text("timeZoneName")} · ${dateLabel(formatZonedTime(instant.getTime(), timeZone).slice(0, 10))}`;
}

interface CheckRow {
  id: string;
  entry_number: number;
  trip_day_id: string;
  trip_member_id: string;
  kind: TripDayCheckKind;
  action: "recorded" | "withdrawn";
  recorded_by: string;
  context: SavedContext;
  plan_revision: number | null;
  time_zone: string | null;
  created_at: string;
}
export interface DayCheckRows { entries: CheckRow[]; equipment: Map<string, SavedEquipment> }

const MISSING_TABLE = ["42P01", "PGRST205"];

/**
 * Every check entry on the trip, oldest first, and each member's touring
 * equipment for their transceiver. Null before the migration, when there are
 * no checks to show or record.
 */
export async function loadDayChecks(supabase: SupabaseClient, tripId: string): Promise<DayCheckRows | null> {
  const [entries, packing] = await Promise.all([
    supabase.from("trip_day_checks").select("*").eq("trip_id", tripId).order("entry_number"),
    supabase.from("trip_member_packing").select("trip_member_id, equipment").eq("trip_id", tripId),
  ]);
  // Before this migration there's no table, and so no check to hide; before
  // 032 there's no equipment, and so no transceiver in anyone's list. Any
  // other failure might hide a check, or that one is out of date.
  if (entries.error && MISSING_TABLE.includes(entries.error.code)) return null;
  if (entries.error) throw new Error("Couldn't load day checks. Try again.");
  if (packing.error && packing.error.code !== "42703") throw new Error("Couldn't load day checks. Try again.");
  return {
    entries: (entries.data ?? []) as CheckRow[],
    equipment: new Map(((packing.error ? [] : packing.data ?? []) as Array<{ trip_member_id: string; equipment: unknown }>)
      .map((row) => [row.trip_member_id, (row.equipment ?? {}) as SavedEquipment])),
  };
}

const entry = (row: CheckRow): TripDayCheckEntry => ({
  id: row.id, action: row.action, recorded_by: row.recorded_by, created_at: row.created_at,
  time_label: checkTimeLabel(row.created_at, row.time_zone), plan_revision: row.plan_revision,
});

type Trip = Pick<TripFull, "trip" | "stops" | "days" | "members" | "tour_plans" | "lodging">;

/** Whether the person takes part on the day (#331); without attendance, everyone does. */
const participating = (full: Pick<TripFull, "lodging">, memberId: string, date: string) =>
  (full.lodging?.people.find((person) => person.member_id === memberId)?.days.find((entry) => entry.date === date)?.participation
    ?? "participating") === "participating";

/**
 * Each Backcountry day's checks, in date order, for everyone taking part who
 * can have one: members and managed guests, not pending invitations. Each has
 * its latest entry, its history and whether what it covers changed since.
 * `can_record` is false until dayChecksFor sets it for a viewer.
 */
export function summarizeDayChecks(rows: DayCheckRows, full: Trip): TripDayChecks[] {
  // Each person's entries for a check on a day, newest first.
  const people = new Map<string, CheckRow[]>();
  for (const row of [...rows.entries].sort((a, b) => b.entry_number - a.entry_number)) {
    const key = `${row.trip_day_id}:${row.trip_member_id}:${row.kind}`;
    let list = people.get(key);
    if (!list) people.set(key, list = []);
    list.push(row);
  }
  const { start_date, end_date } = full.trip;
  return [...full.days]
    .filter((day) => day.date >= start_date && day.date <= end_date && isTourDay(full, day))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const plan = full.tour_plans?.some((candidate) => candidate.trip_day_id === day.id) ?? false;
      const crew = full.members.filter((member) => (member.status === "joined" || member.status === "guest")
        && participating(full, member.id, day.date));
      const checks = crew.flatMap((member) => DAY_CHECK_KINDS.map((kind): TripDayCheck => {
        const now = dayCheckContext(kind, full, day, rows.equipment.get(member.id));
        const [latest, ...earlier] = people.get(`${day.id}:${member.id}:${kind}`) ?? [];
        const stale = latest?.action === "recorded" ? dayCheckStaleReasons(kind, latest.context, now) : [];
        return {
          kind, member_id: member.id,
          status: latest?.action !== "recorded" ? "not_recorded" : stale.length ? "out_of_date" : "recorded",
          current: latest ? entry(latest) : null, history: earlier.map(entry), stale_reasons: stale,
          can_record: false,
          // There's nothing to review without a plan.
          context_key: kind === "plan_review" && !plan ? null : canonical(now),
        };
      }));
      return { date: day.date, trip_day_id: day.id, plan_available: plan, checks };
    });
}

/** Whether `userId` may record or withdraw a member's checks: their own, or a managed guest's for the organizer. */
export function canRecordDayCheck(full: Pick<TripFull, "trip" | "members">, memberId: string, userId: string): boolean {
  const member = full.members.find((candidate) => candidate.id === memberId && candidate.status !== "left");
  return !!member && (member.user_id === userId || (member.status === "guest" && full.trip.owner_user_id === userId));
}

/** The checks as `userId` sees them: only those they may record keep the context to record them with. */
export function dayChecksFor(days: TripDayChecks[], full: Pick<TripFull, "trip" | "members">, userId: string): TripDayChecks[] {
  return days.map((day) => ({
    ...day,
    checks: day.checks.map((check) => {
      const can = canRecordDayCheck(full, check.member_id, userId);
      return { ...check, can_record: can, context_key: can ? check.context_key : null };
    }),
  }));
}

/** The destination's date now, or the UTC date when its zone isn't known. */
function destinationToday(full: Plans, day: TripDay, now: number): string {
  const zone = dayTimeZone(full, day);
  return zone ? formatZonedTime(now, zone).slice(0, 10) : new Date(now).toISOString().slice(0, 10);
}

/**
 * Tour preparation `userId` can act on, from today at the destination
 * onward: their own checks first, then, for the organizer, the crew's. A
 * recorded check that's out of date is listed on any day; one that isn't
 * recorded only on its day, so planning days ahead never shows it as
 * overdue. These are facts with a link to act on, never a readiness score.
 * `full` and `days` are as the viewer sees them (tripFullFor, dayChecksFor).
 */
export function preparationFor(full: TripFull, days: TripDayChecks[], userId: string, now = Date.now()): TripPreparationItem[] {
  const owner = full.trip.owner_user_id === userId;
  const members = new Map(full.members.map((member) => [member.id, member]));
  const me = full.members.find((member) => member.user_id === userId && member.status !== "left");
  const personal: TripPreparationItem[] = [], crew: TripPreparationItem[] = [];
  for (const checks of days) {
    const day = full.days.find((candidate) => candidate.id === checks.trip_day_id);
    if (!day) continue;
    const today = destinationToday(full, day, now);
    if (day.date < today) continue;
    const when = day.date === today ? `today, ${dateLabel(day.date)}` : dateLabel(day.date);
    const page = `/trips/${full.trip.id}/days/${day.date}`;
    // Recorded and out of date on any day; not recorded only on the day, and a plan review only once there's a plan.
    const due = (check: TripDayCheck) => check.status === "out_of_date"
      || (check.status === "not_recorded" && day.date === today && (check.kind === "transceiver" || checks.plan_available));
    const state = (check: TripDayCheck) => check.status === "out_of_date"
      ? `is out of date: ${check.stale_reasons.join(" · ")}` : "isn't recorded yet";
    for (const check of checks.checks.filter((entry) => entry.member_id === me?.id && due(entry))) {
      const stale = check.status === "out_of_date";
      personal.push({
        kind: check.kind === "plan_review" ? stale ? "plan_out_of_date" : "plan_not_reviewed" : stale ? "transceiver_out_of_date" : "transceiver_not_checked",
        scope: "personal", date: day.date,
        label: `Your ${LABELS[check.kind].toLowerCase()} for ${when} ${state(check)}`,
        action: { label: check.kind === "plan_review" && stale ? "Review the plan again" : stale ? "Check again" : "Open the day's checks", href: `${page}#day-checks` },
      });
    }
    if (!owner) continue;
    if (!checks.plan_available) {
      crew.push({ kind: "no_tour_plan", scope: "crew", date: day.date, label: `No tour plan for ${when}`,
        action: { label: "Add the tour plan", href: `${page}#tour-plan-heading` } });
    }
    for (const check of checks.checks) {
      const member = members.get(check.member_id);
      if (member?.status !== "guest" || !due(check)) continue;
      crew.push({ kind: "guest_check", scope: "crew", date: day.date,
        label: `${member.display_name}'s ${LABELS[check.kind].toLowerCase()} for ${when} ${state(check)} (managed guest)`,
        action: { label: `Record for ${member.display_name}`, href: `${page}#day-checks` } });
    }
    const behind = checks.checks.filter((check) => check.kind === "plan_review" && check.status === "out_of_date"
      && check.member_id !== me?.id && members.get(check.member_id)?.status === "joined").length;
    if (behind) {
      crew.push({ kind: "crew_out_of_date", scope: "crew", date: day.date,
        label: `${behind} ${behind === 1 ? "person" : "people"} reviewed the tour plan for ${when} before it changed`,
        action: { label: "See crew preparation", href: `${page}#crew-preparation` } });
    }
  }
  return [...personal, ...crew];
}

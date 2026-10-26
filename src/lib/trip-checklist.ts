import "server-only";
import { tripActivityNeedsClothing } from "@/lib/trip-activities";
import { dateLabel, participationLabel } from "@/lib/trip-lodging";
import { outfitMismatches } from "@/lib/trip-kit-fit";
import { sharedGearStatus } from "@/lib/shared-gear-status";
import type { TripChecklist, TripChecklistPerson, TripDayCheck, TripDayChecklist, TripFull, TripGroupGear, TripMember } from "@/types/trips";

const MEMBERSHIP_LABELS: Record<TripMember["status"], string> = { joined: "Joined", invited: "Invitation pending", guest: "Managed guest", left: "Left the trip" };
const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const sharedStatus = (item: TripGroupGear): TripChecklistPerson["shared"][number] =>
  ({ id: item.id, description: item.description, ...sharedGearStatus(item) });

const CHECK_NAMES: Record<TripDayCheck["kind"], [done: string, missing: string]> = {
  plan_review: ["Tour and backup plan reviewed", "Tour and backup plan review not recorded yet"],
  transceiver: ["Transceiver check recorded", "Transceiver check not recorded yet"],
};

/** A day check as the checklist states it (#212): when it was recorded and by whom, or that it isn't yet. */
function dayCheckLabel(full: TripFull, member: TripMember, check: TripDayCheck, plan: boolean): string {
  const [done, missing] = CHECK_NAMES[check.kind];
  if (check.kind === "plan_review" && !plan) return "No tour plan to review yet";
  if (check.status === "not_recorded") return missing;
  const entry = check.current!;
  const by = entry.recorded_by !== member.user_id
    ? ` · by ${full.members.find((candidate) => candidate.user_id === entry.recorded_by)?.display_name ?? "the organizer"}` : "";
  return check.status === "out_of_date"
    ? `${done} before it changed: ${check.stale_reasons.join(" · ")}`
    : `${done} · ${entry.time_label}${by}`;
}

/** The first trip day on or after today, or the last day once the trip is over. */
function defaultDate(dates: string[], today: string): string | null {
  return dates.find((date) => date >= today) ?? dates.at(-1) ?? null;
}

/**
 * Each trip day's checklist (#336): who's taking part, and for each person
 * their clothing, tonight's stay, shared gear, source reviews and day checks
 * as separate facts. Personal packing checks are private, so they're never
 * here.
 */
export function buildDayChecklists(full: TripFull, viewerUserId: string | null, today = new Date().toISOString().slice(0, 10)): TripChecklist {
  const members = full.members.filter((member) => member.status !== "left");
  const days = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const plans = new Map(full.day_checks?.map((entry) => [entry.trip_day_id, entry.plan_available]));
  const checklists = days.map((day): TripDayChecklist => {
    // The day's own stop, or the trip's first, as the day page reads it.
    const stop = full.stops.find((candidate) => candidate.id === day.stop_id) ?? full.stops[0] ?? null;
    const activity = day.activity ?? stop?.activities[0] ?? null;
    const sources = full.conditions?.filter((source) => source.date === day.date) ?? [];
    const people = members.map((member): TripChecklistPerson => {
      const lodging = full.lodging?.people.find((person) => person.member_id === member.id);
      const participation = lodging?.days.find((entry) => entry.date === day.date)?.participation ?? "participating";
      const kit = full.kits.find((candidate) => candidate.trip_day_id === day.id && candidate.trip_member_id === member.id);
      const notes = kit?.outfit ? outfitMismatches(kit.outfit, { date: day.date, activity: day.activity, stop }) : [];
      const flag: TripChecklistPerson["clothing"]["flag"] = kit && !kit.outfit && kit.state !== "ok"
        ? { state: kit.state, label: kit.state === "warn" ? "Flagged: needs help" : "Flagged: missing" } : null;
      // Travel and Rest days, and days someone isn't taking part in, have no clothing to plan (#334).
      const needed = participation === "participating" && tripActivityNeedsClothing(activity);
      const clothing: TripChecklistPerson["clothing"] = kit?.outfit
        ? { state: notes.length ? "outfit_review" : "outfit", label: notes.length ? "Outfit saved for another plan" : "Outfit saved", notes, flag: null }
        : kit && kit.items.length
          ? { state: "checklist", label: `Older checklist: ${kit.items.map(sentence).join(", ")}`, notes, flag }
          : needed ? { state: "not_started", label: "Not started", notes, flag } : { state: "not_needed", label: "Nothing to plan", notes, flag };
      const night = lodging?.nights.find((entry) => entry.date === day.date);
      let conditions: TripChecklistPerson["conditions"] = null;
      if (sources.length && member.user_id) {
        const reviews = sources.flatMap((source) => source.reviews.filter((review) => review.user_id === member.user_id && review.current.action !== "withdrawn"));
        const outOfDate = reviews.filter((review) => review.stale_reasons.length > 0).length;
        const latest = reviews.map((review) => review.current.reviewed_at).sort().at(-1) ?? null;
        const reviewed = reviews.length - outOfDate;
        conditions = { sources: sources.length, reviewed, out_of_date: outOfDate, latest,
          label: [reviews.length ? `${reviewed} of ${sources.length} ${sources.length === 1 ? "source" : "sources"} reviewed` : "No sources reviewed yet",
            outOfDate && `${outOfDate} reviewed before the plan changed`, latest && `latest ${dateLabel(latest.slice(0, 10))}`].filter(Boolean).join(" · ") };
      }
      const checks = full.day_checks?.find((entry) => entry.date === day.date)?.checks.filter((check) => check.member_id === member.id) ?? [];
      return {
        member_id: member.id, display_name: member.display_name, role: member.role, membership: member.status,
        membership_label: member.role === "organizer" ? "Organizer" : MEMBERSHIP_LABELS[member.status],
        participation, participation_label: participation === "skipping" ? "There, not taking part" : participationLabel(participation),
        clothing,
        tonight: night ? { state: night.state, stay_id: night.stay_id, label: night.label, gap: !!lodging?.gaps.includes(day.date) } : null,
        shared: full.gear.filter((item) => item.assignee_member_id === member.id).map(sharedStatus),
        conditions,
        day_checks: checks.length ? checks.map((check) => ({ kind: check.kind, status: check.status, label: dayCheckLabel(full, member, check, !!plans.get(day.id)) })) : null,
      };
    });
    return { date: day.date, date_label: dateLabel(day.date), activity, place: stop?.name ?? null, people };
  });
  const { id, name, start_date, end_date } = full.trip;
  return { trip: { id, name, start_date, end_date }, default_date: defaultDate(days.map((day) => day.date), today),
    viewer_member_id: (viewerUserId && members.find((member) => member.user_id === viewerUserId)?.id) || null, days: checklists };
}

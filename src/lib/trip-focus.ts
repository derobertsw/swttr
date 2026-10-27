import "server-only";
import { tripActivityNeedsClothing } from "@/lib/trip-activities";
import { destinationToday } from "@/lib/trip-day-checks";
import type { TripFocus, TripFull } from "@/types/trips";

/**
 * Where the trip opens for `userId`, and their next step (#334). During the
 * trip it opens on today, by the destination's clock. Before it, it opens on
 * their first unfinished day: one without an activity, or without their kit
 * on a day they take part in that has clothing to plan (not Travel or Rest).
 * A day that's over is never next, and a trip that's over opens on Plan's
 * own page. `full` is the trip as the viewer sees it (tripFullFor).
 */
export function tripFocusFor(full: TripFull, userId: string, now = Date.now()): TripFocus {
  const days = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const ahead = days.filter((day) => day.date >= destinationToday(full, day, now));
  const member = full.members.find((m) => m.user_id === userId && m.status !== "left");
  const person = member && full.lodging?.people.find((entry) => entry.member_id === member.id);
  const takesPart = (date: string) => (person?.days.find((entry) => entry.date === date)?.participation ?? "participating") === "participating";
  const unfinished = ahead.find((day) => !day.activity
    || (tripActivityNeedsClothing(day.activity) && takesPart(day.date)
      && !full.kits.some((kit) => kit.trip_day_id === day.id && kit.trip_member_id === member?.id)));
  const first = ahead[0];

  const next_step: TripFocus["next_step"] = full.stops.length === 0 ? { kind: "add_destination", date: null }
    : unfinished ? { kind: unfinished.activity ? "plan_kit" : "choose_activity", date: unfinished.date } : null;
  if (!first) return { date: null, reason: null, next_step };
  if (first.date === destinationToday(full, first, now)) return { date: first.date, reason: "today", next_step };
  return unfinished ? { date: unfinished.date, reason: "unfinished", next_step } : { date: first.date, reason: "first_day", next_step };
}

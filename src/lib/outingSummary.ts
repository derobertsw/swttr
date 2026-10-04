import { format, parse } from "date-fns";
import { ACTIVITIES } from "@/data/activities";
import type { Outing } from "@/types/outing";

/**
 * An outing in a few words, e.g. "XC Skiing at Stowe, now" or "Alpine Skiing
 * at Stowe, 3 days from Sat, Oct 10". A later date and time are already on
 * the place's clock, so they're shown as they are.
 */
export function outingSummary(outing: Outing): string {
  const activity = ACTIVITIES.find((candidate) => candidate.value === outing.activity)?.name ?? "Your outing";
  const where = `${activity} at ${outing.place.name}`;
  const { when } = outing;
  if (when.mode === "now") return `${where}, now`;

  const start = parse(`${when.date} ${when.time}`, "yyyy-MM-dd HH:mm", new Date());
  return when.durationDays > 1
    ? `${where}, ${when.durationDays} days from ${format(start, "EEE, MMM d")}`
    : `${where}, ${format(start, "EEE, MMM d 'at' h:mm a")}`;
}

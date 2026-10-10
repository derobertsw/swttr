import { format } from "date-fns";
import { ACTIVITIES } from "@/data/activities";
import { tripActivityToRecommendationKey } from "@/lib/trip-activities";
import { outfitDate } from "@/lib/trip-saved-kits";
import type { SavedOutfit } from "@/types/savedKit";
import type { TripStop } from "@/types/trips";

/** Within about 1 km: the saved outing's place and the day's stop are the same place. */
function samePlace(outfit: SavedOutfit, stop: TripStop): boolean {
  return stop.latitude !== null && stop.longitude !== null
    && Math.abs(stop.latitude - outfit.outing.place.latitude) < 0.01
    && Math.abs(stop.longitude - outfit.outing.place.longitude) < 0.01;
}

/**
 * Where a saved outfit doesn't fit the trip day it's on (#176): it was planned
 * for another place (or the day has none), another date's forecast or another
 * activity, as after a copy, a date move or a change to the day's plan. A saved
 * outfit never changes by itself, so the day says so rather than passing it off
 * as advice for this day. An activity a trip can't match to Gear up's isn't
 * compared.
 */
export function outfitMismatches(outfit: SavedOutfit, day: { date: string; activity: string | null; stop: TripStop | null }): string[] {
  const notes: string[] = [];
  const place = outfit.weather.context?.place ?? outfit.outing.place.name;
  // A day with no destination, as after its last stop is removed, doesn't match either.
  if (!day.stop) notes.push(`Saved for ${place}, and this day has no destination.`);
  else if (!samePlace(outfit, day.stop)) notes.push(`Saved for ${place}, not this day's stop (${day.stop.name}).`);
  const date = outfitDate(outfit);
  if (date && date !== day.date) {
    notes.push(`Planned for the forecast on ${format(new Date(`${date}T00:00:00`), "EEE MMM d")}, not this day's.`);
  }
  // A day without its own activity has its stop's first, as the day page and packing read it.
  const activity = day.activity ?? day.stop?.activities[0] ?? null;
  const dayActivity = tripActivityToRecommendationKey(activity);
  if (dayActivity && dayActivity !== outfit.outing.activity) {
    const planned = ACTIVITIES.find((option) => option.value === outfit.outing.activity)?.name ?? "another activity";
    notes.push(`Planned for ${planned}, not this day's activity (${activity}).`);
  }
  return notes;
}

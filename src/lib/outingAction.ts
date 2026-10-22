import { ACTIVITIES } from "@/data/activities";
import { EXERTION_LEVELS } from "@/lib/biophysics/exertion";
import { isLocalDateTime, isTimeZone } from "@/lib/timeZones";
import type { Outing } from "@/types/outing";
import type { LocationSuggestion } from "@/types/recommendations";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnly(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

/** Labels are untrusted display data; coordinates determine the weather request. */
export function isResolvedPlace(value: unknown): value is LocationSuggestion {
  return isRecord(value) && hasOnly(value, ["id", "name", "region", "country", "latitude", "longitude", "timeZone"])
    && Number.isSafeInteger(value.id) && Number(value.id) >= 0
    && text(value.name, 200) && typeof value.country === "string" && value.country.length <= 100
    && (value.region === undefined || text(value.region, 200))
    && (value.timeZone === undefined || isTimeZone(value.timeZone))
    && typeof value.latitude === "number" && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === "number" && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

/** Strict runtime validation, before state changes or requests. One day only. */
export function isSingleDayOuting(value: unknown): value is Outing {
  if (!isRecord(value) || !hasOnly(value, ["activity", "exertion", "place", "when"])
    || !ACTIVITIES.some(a => a.value === value.activity)
    || !EXERTION_LEVELS.some(e => e === value.exertion) || !isResolvedPlace(value.place) || !isRecord(value.when)) return false;
  const when = value.when;
  if (when.mode === "now") return hasOnly(when, ["mode"]);
  return when.mode === "later" && hasOnly(when, ["mode", "date", "time", "durationDays"])
    && when.durationDays === 1 && typeof when.date === "string" && typeof when.time === "string"
    && isLocalDateTime(`${when.date}T${when.time}`);
}

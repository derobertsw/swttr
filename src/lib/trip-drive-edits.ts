import "server-only";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { parseTripLocation } from "@/lib/trip-location";
import type { TripLocation } from "@/types/trips";

/**
 * Starting point and your-estimate saves (#209), rebuilt from validated
 * fields only. Migration 029's functions save them and refuse a save the
 * day no longer matches.
 */

type Invalid = { error: string; field?: string };

/** A day's starting point as it's saved, with the day as the editor showed it. */
interface DayOriginEdit {
  /** null uses the crew stay of the night before again. */
  origin: null | { stay_id: string } | { location: TripLocation };
  no_drive: boolean;
  /** Compared with the saved day, never stored. */
  expected: { origin: unknown; origin_stay_id: string | null; no_drive: boolean };
}

/** Each day a your-estimate save touches, as the editor showed it. */
type ExpectedEstimate = { date: string; entered_at: string | null; use_calculated: boolean | null };

interface DriveEstimateSave {
  /** The drive the organizer saw: its estimate is only for this pair. */
  pair_key: string;
  duration_seconds: number;
  note: string | null;
  /** The days to save it for, this one included. */
  dates: string[];
  /** Days that shared it and were unticked. */
  clear: string[];
  expected: ExpectedEstimate[];
}

const INVALID: Invalid = { error: "Reload the trip and try again." };
const MAX_DAYS = 400;
const MAX_NOTE = 200;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function parseDayOriginEdit(body: unknown): DayOriginEdit | Invalid {
  if (!isObject(body) || !("origin" in body) || typeof body.no_drive !== "boolean") return INVALID;
  const { expected } = body;
  if (!isObject(expected) || typeof expected.no_drive !== "boolean"
    || !(expected.origin === null || isObject(expected.origin))
    || !(expected.origin_stay_id === null || isUuid(expected.origin_stay_id))) return INVALID;
  const seen = { origin: expected.origin, origin_stay_id: expected.origin_stay_id?.toLowerCase() ?? null, no_drive: expected.no_drive };

  const { origin } = body;
  if (origin === null) return { origin: null, no_drive: body.no_drive, expected: seen };
  if (!isObject(origin)) return INVALID;
  if ("stay_id" in origin) {
    return isUuid(origin.stay_id) ? { origin: { stay_id: origin.stay_id.toLowerCase() }, no_drive: body.no_drive, expected: seen } : INVALID;
  }
  const location = parseTripLocation(origin.location);
  return "error" in location ? { error: location.error, field: "origin" } : { origin: { location }, no_drive: body.no_drive, expected: seen };
}

function parseDates(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS || !value.every(isCalendarDate)) return null;
  return new Set(value).size === value.length ? value : null;
}

/** What the editor showed for each day it touches; every one of `dates` must be there. */
function parseExpected(value: unknown, dates: string[]): ExpectedEstimate[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS) return null;
  const expected: ExpectedEstimate[] = [];
  for (const item of value) {
    if (!isObject(item) || !isCalendarDate(item.date)) return null;
    const enteredAt = item.entered_at ?? null, useCalculated = item.use_calculated ?? null;
    if (enteredAt !== null && (typeof enteredAt !== "string" || !Number.isFinite(Date.parse(enteredAt)))) return null;
    if (useCalculated !== null && typeof useCalculated !== "boolean") return null;
    if ((enteredAt === null) !== (useCalculated === null)) return null;
    expected.push({ date: item.date, entered_at: enteredAt, use_calculated: useCalculated });
  }
  return dates.every((date) => expected.some((item) => item.date === date)) ? expected : null;
}

/** Your estimate for `date` and any other days with the same drive. */
export function parseDriveEstimateSave(date: string, body: unknown): DriveEstimateSave | Invalid {
  if (!isObject(body) || typeof body.pair_key !== "string" || !body.pair_key || body.pair_key.length > 500) return INVALID;
  const seconds = body.duration_seconds;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 60 || seconds > 86_400 || seconds % 60 !== 0) {
    return { error: "Enter a time from 1 minute to 24 hours.", field: "duration" };
  }
  const note = body.note == null ? "" : body.note;
  if (typeof note !== "string" || note.trim().length > MAX_NOTE) return { error: `Keep the note to ${MAX_NOTE} characters.`, field: "note" };
  const dates = parseDates(body.dates), clear = parseDates(body.clear ?? []);
  if (!dates || !clear || !dates.includes(date) || clear.some((day) => dates.includes(day))) return INVALID;
  const expected = parseExpected(body.expected, [...dates, ...clear]);
  if (!expected) return INVALID;
  return { pair_key: body.pair_key, duration_seconds: seconds, note: note.trim() || null, dates, clear, expected };
}

/** Removes your estimate from `date` and the days that shared it. */
export function parseDriveEstimateRemove(date: string, body: unknown): { dates: string[]; expected: ExpectedEstimate[] } | Invalid {
  if (!isObject(body)) return INVALID;
  const dates = parseDates(body.dates);
  if (!dates || !dates.includes(date)) return INVALID;
  const expected = parseExpected(body.expected, dates);
  return expected ? { dates, expected } : INVALID;
}

/** Uses the calculated estimate on `date` instead of yours, or yours again. */
export function parseDriveEstimatePrefer(date: string, body: unknown): { use_calculated: boolean; expected: ExpectedEstimate[] } | Invalid {
  if (!isObject(body) || typeof body.use_calculated !== "boolean") return INVALID;
  const expected = parseExpected(body.expected, [date]);
  return expected ? { use_calculated: body.use_calculated, expected: expected.filter((item) => item.date === date) } : INVALID;
}

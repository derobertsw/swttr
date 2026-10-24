import "server-only";
import { isCalendarDate, isUuid } from "@/lib/trip-lodging";
import { parseTripLocation } from "@/lib/trip-location";
import type { TripLocation } from "@/types/trips";

/**
 * Starting point and your-estimate saves (#209, #333), rebuilt from validated
 * fields only. The database functions save them and refuse a save the day no
 * longer matches.
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

/** Chosen people's own starting point for a day (#333), with each of them as the editor showed them. */
interface MemberOriginsEdit {
  member_ids: string[];
  /** null keeps where they'd start anyway, or with no_drive false goes back to it. */
  origin: DayOriginEdit["origin"];
  no_drive: boolean;
  expected: Array<{ member_id: string; origin: unknown; origin_stay_id: string | null; no_drive: boolean }>;
}

/** An estimate of your own is for a drive on a day (#333). */
type DriveRef = { date: string; pair_key: string };

/** Each drive on a day a your-estimate save touches, as the editor showed it. */
type ExpectedEstimate = DriveRef & { entered_at: string | null; use_calculated: boolean | null };

interface DriveEstimateSave {
  /** The drive the organizer saw: its estimate is only for this pair. */
  pair_key: string;
  duration_seconds: number;
  note: string | null;
  /** The days to save it for, this one included. */
  dates: string[];
  /** Estimates to remove: days that shared it and were unticked, or one for an earlier drive this replaces. */
  clear: DriveRef[];
  expected: ExpectedEstimate[];
}

const INVALID: Invalid = { error: "Reload the trip and try again." };
const MAX_DAYS = 400;
const MAX_NOTE = 200;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** A starting point as an editor showed it: compared with what's saved, never stored. */
function parseSeenOrigin(value: unknown): DayOriginEdit["expected"] | null {
  if (!isObject(value) || typeof value.no_drive !== "boolean"
    || !(value.origin === null || isObject(value.origin))
    || !(value.origin_stay_id === null || isUuid(value.origin_stay_id))) return null;
  return { origin: value.origin, origin_stay_id: value.origin_stay_id?.toLowerCase() ?? null, no_drive: value.no_drive };
}

/** The place a starting point change saves: a saved stay, any place, or null. */
function parseOrigin(origin: unknown): DayOriginEdit["origin"] | Invalid {
  if (origin === null) return null;
  if (!isObject(origin)) return INVALID;
  if ("stay_id" in origin) return isUuid(origin.stay_id) ? { stay_id: origin.stay_id.toLowerCase() } : INVALID;
  const location = parseTripLocation(origin.location);
  return "error" in location ? { error: location.error, field: "origin" } : { location };
}

export function parseDayOriginEdit(body: unknown): DayOriginEdit | Invalid {
  if (!isObject(body) || !("origin" in body) || typeof body.no_drive !== "boolean") return INVALID;
  const seen = parseSeenOrigin(body.expected);
  if (!seen) return INVALID;
  const origin = parseOrigin(body.origin);
  return origin && "error" in origin ? origin : { origin, no_drive: body.no_drive, expected: seen };
}

/** The same starting point for chosen people (#333): `{member_ids, origin, no_drive, expected}`. */
export function parseMemberOriginsEdit(body: unknown): MemberOriginsEdit | Invalid {
  if (!isObject(body) || !("origin" in body) || typeof body.no_drive !== "boolean" || !Array.isArray(body.member_ids)
    || body.member_ids.length < 1 || body.member_ids.length > 200 || !body.member_ids.every(isUuid)
    || !Array.isArray(body.expected) || body.expected.length > 200) return INVALID;
  const memberIds = body.member_ids.map((id) => id.toLowerCase());
  if (new Set(memberIds).size !== memberIds.length) return INVALID;
  const expected: MemberOriginsEdit["expected"] = [];
  for (const item of body.expected) {
    if (!isObject(item) || !isUuid(item.member_id)) return INVALID;
    const seen = parseSeenOrigin(item);
    if (!seen) return INVALID;
    expected.push({ member_id: item.member_id.toLowerCase(), ...seen });
  }
  if (!memberIds.every((id) => expected.some((item) => item.member_id === id))) return INVALID;
  const origin = parseOrigin(body.origin);
  return origin && "error" in origin ? origin : { member_ids: memberIds, origin, no_drive: body.no_drive, expected };
}

function parseDates(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS || !value.every(isCalendarDate)) return null;
  return new Set(value).size === value.length ? value : null;
}

const isPair = (value: unknown): value is string => typeof value === "string" && !!value && value.length <= 500;
const sameDrive = (a: DriveRef, b: DriveRef) => a.date === b.date && a.pair_key === b.pair_key;

/** What the editor showed for each drive on a day it touches; every one of `touched` must be there. */
function parseExpected(value: unknown, touched: DriveRef[]): ExpectedEstimate[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS * 2) return null;
  const expected: ExpectedEstimate[] = [];
  for (const item of value) {
    if (!isObject(item) || !isCalendarDate(item.date) || !isPair(item.pair_key)) return null;
    const enteredAt = item.entered_at ?? null, useCalculated = item.use_calculated ?? null;
    if (enteredAt !== null && (typeof enteredAt !== "string" || !Number.isFinite(Date.parse(enteredAt)))) return null;
    if (useCalculated !== null && typeof useCalculated !== "boolean") return null;
    if ((enteredAt === null) !== (useCalculated === null)) return null;
    expected.push({ date: item.date, pair_key: item.pair_key, entered_at: enteredAt, use_calculated: useCalculated });
  }
  return touched.every((drive) => expected.some((item) => sameDrive(item, drive))) ? expected : null;
}

function parseClear(value: unknown): DriveRef[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS) return null;
  const clear = value.map((item) => isObject(item) && isCalendarDate(item.date) && isPair(item.pair_key) ? { date: item.date, pair_key: item.pair_key } : null);
  if (clear.some((item) => !item)) return null;
  return clear.every((item, index) => clear.findIndex((other) => sameDrive(other!, item!)) === index) ? clear as DriveRef[] : null;
}

/** Your estimate for the drive `pair_key` on `date` and any other days with the same drive. */
export function parseDriveEstimateSave(date: string, body: unknown): DriveEstimateSave | Invalid {
  if (!isObject(body) || !isPair(body.pair_key)) return INVALID;
  const pairKey = body.pair_key;
  const seconds = body.duration_seconds;
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 60 || seconds > 86_400 || seconds % 60 !== 0) {
    return { error: "Enter a time from 1 minute to 24 hours.", field: "duration" };
  }
  const note = body.note == null ? "" : body.note;
  if (typeof note !== "string" || note.trim().length > MAX_NOTE) return { error: `Keep the note to ${MAX_NOTE} characters.`, field: "note" };
  const dates = parseDates(body.dates), clear = parseClear(body.clear ?? []);
  if (!dates || !clear || !dates.includes(date) || clear.some((drive) => drive.pair_key === pairKey && dates.includes(drive.date))) return INVALID;
  const expected = parseExpected(body.expected, [...dates.map((day) => ({ date: day, pair_key: pairKey })), ...clear]);
  if (!expected) return INVALID;
  return { pair_key: pairKey, duration_seconds: seconds, note: note.trim() || null, dates, clear, expected };
}

/** Removes your estimate for the drive `pair_key` from `date` and the days that shared it. */
export function parseDriveEstimateRemove(date: string, body: unknown): { pair_key: string; dates: string[]; expected: ExpectedEstimate[] } | Invalid {
  if (!isObject(body) || !isPair(body.pair_key)) return INVALID;
  const pairKey = body.pair_key, dates = parseDates(body.dates);
  if (!dates || !dates.includes(date)) return INVALID;
  const expected = parseExpected(body.expected, dates.map((day) => ({ date: day, pair_key: pairKey })));
  return expected ? { pair_key: pairKey, dates, expected } : INVALID;
}

/** Uses the calculated estimate for the drive `pair_key` on `date` instead of yours, or yours again. */
export function parseDriveEstimatePrefer(date: string, body: unknown): { pair_key: string; use_calculated: boolean; expected: ExpectedEstimate[] } | Invalid {
  if (!isObject(body) || typeof body.use_calculated !== "boolean" || !isPair(body.pair_key)) return INVALID;
  const drive = { date, pair_key: body.pair_key };
  const expected = parseExpected(body.expected, [drive]);
  return expected ? { pair_key: drive.pair_key, use_calculated: body.use_calculated, expected: expected.filter((item) => sameDrive(item, drive)) } : INVALID;
}

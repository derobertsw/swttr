/**
 * The Gear up form and the last result's outing, kept in sessionStorage so a
 * reload, or coming back to Gear up in the same tab, starts from them (see
 * docs/outing-contract.md). Only what the person entered is kept: no weather,
 * advice, body metrics or wardrobe.
 *
 * Each account signed in to in the tab keeps its own draft, and so does the
 * guest, so one account's outing never shows for another.
 */
import { format, isValid, parse } from "date-fns";
import { ACTIVITIES } from "@/data/activities";
import { EXERTION_LEVELS, type ExertionLevel } from "@/lib/biophysics/exertion";
import { STORAGE_KEYS } from "@/lib/storage";
import type { Outing, OutingTime } from "@/types/outing";
import type { LocationSuggestion } from "@/types/recommendations";

export interface GearUpDraft {
  activity: string;
  exertion: ExertionLevel;
  /** The picked place, or null when none is. */
  place: LocationSuggestion | null;
  inputMode: OutingTime["mode"];
  /** The later start date, "yyyy-MM-dd", or null when none is picked. */
  date: string | null;
  /** The later start time, "HH:mm". */
  time: string;
  durationDays: number;
  /** The outing of the last result shown, which a reload or Forward on the results asks for again. */
  lastOuting: Outing | null;
}

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null;
const isTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const isDuration = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 7;
const isActivity = (value: unknown): value is string => ACTIVITIES.some((activity) => activity.value === value);
const isExertion = (value: unknown): value is ExertionLevel => EXERTION_LEVELS.some((level) => level === value);
const isMode = (value: unknown): value is OutingTime["mode"] => value === "now" || value === "later";

/** A real calendar date as "yyyy-MM-dd": "2026-02-31" has the shape, but isn't one. */
function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) && format(date, "yyyy-MM-dd") === value;
}

function isPlace(value: unknown): value is LocationSuggestion {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    typeof value.country === "string" &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  );
}

function isOutingTime(value: unknown): value is OutingTime {
  if (!isObject(value)) return false;
  if (value.mode === "now") return true;
  return value.mode === "later" && isDate(value.date) && isTime(value.time) && isDuration(value.durationDays);
}

function isOuting(value: unknown): value is Outing {
  return (
    isObject(value) &&
    isActivity(value.activity) &&
    isExertion(value.exertion) &&
    isPlace(value.place) &&
    isOutingTime(value.when)
  );
}

function isDraft(value: unknown): value is GearUpDraft {
  return (
    isObject(value) &&
    isActivity(value.activity) &&
    isExertion(value.exertion) &&
    (value.place === null || isPlace(value.place)) &&
    isMode(value.inputMode) &&
    (value.date === null || isDate(value.date)) &&
    isTime(value.time) &&
    isDuration(value.durationDays) &&
    (value.lastOuting === null || isOuting(value.lastOuting))
  );
}

/** Where a guest's draft is kept, beside each account's under its Clerk user ID. */
const GUEST = "guest";

/** Every draft kept in the tab, by owner. Any that don't validate are dropped. */
function readKept(): Record<string, GearUpDraft> {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEYS.GEAR_UP_DRAFT);
    const kept: unknown = stored ? JSON.parse(stored) : null;
    if (!isObject(kept)) return {};
    return Object.fromEntries(Object.entries(kept).filter(([, draft]) => isDraft(draft))) as Record<string, GearUpDraft>;
  } catch {
    // Storage can be unavailable (some private modes), or hold something unreadable.
    return {};
  }
}

/** Whether a guest picked a place or got a result: an outing to carry into the account they sign in to. */
const hasOuting = (draft: GearUpDraft) => draft.place !== null || draft.lastOuting !== null;

/**
 * The draft kept for `owner`, a Clerk user ID or null for a guest, or null
 * when there's none. Another account's draft is never returned. An outing a
 * guest started in this tab comes ahead of the account's own draft, so it
 * carries on after signing in.
 */
export function readGearUpDraft(owner: string | null): GearUpDraft | null {
  const kept = readKept();
  const guest = kept[GUEST] ?? null;
  if (owner === null) return guest;
  if (guest && hasOuting(guest)) return guest;
  return kept[owner] ?? guest;
}

/** Keeps `owner`'s draft. An account's takes the place of the guest's, which it carries on. */
export function saveGearUpDraft(owner: string | null, draft: GearUpDraft): void {
  const kept = readKept();
  if (owner !== null) delete kept[GUEST];
  kept[owner ?? GUEST] = draft;
  try {
    sessionStorage.setItem(STORAGE_KEYS.GEAR_UP_DRAFT, JSON.stringify(kept));
  } catch {
    // Without storage, a reload starts from an empty form, as before.
  }
}

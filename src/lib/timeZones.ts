/**
 * Local clock time in a place's own time zone. People plan outings by the
 * clock where they're going, whatever time zone their device is in.
 *
 * Instants are milliseconds since the epoch. Local date-times are
 * "YYYY-MM-DDTHH:mm" strings without an offset, as a clock there reads.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** What a clock in the time zone reads at an instant, as if that reading were UTC. */
function clockReadingAt(instant: number, timeZone: string): number {
  let clockFormat = clockFormats.get(timeZone);
  if (!clockFormat) {
    clockFormat = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    clockFormats.set(timeZone, clockFormat);
  }
  const parts = Object.fromEntries(
    clockFormat.formatToParts(instant).map(({ type, value }) => [type, Number(value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

/** The time zone's offset from UTC at an instant, in ms (positive east of Greenwich). */
function utcOffsetAt(instant: number, timeZone: string): number {
  return clockReadingAt(instant, timeZone) - Math.floor(instant / MINUTE_MS) * MINUTE_MS;
}

/**
 * Whether a value names a time zone Intl knows, like "America/New_York".
 * Intl reads a missing time zone as the machine's own, so check before using one.
 */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Whether a string is a real local date-time, like "2026-10-15T14:00". */
export function isLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  // Date.parse rolls impossible values like Feb 30 or 24:00 over, so check the round trip.
  const parsed = Date.parse(`${value}Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 16) === value;
}

/**
 * The instant a local date-time happens in a time zone.
 *
 * Daylight saving changes resolve like Temporal's "compatible" option: a time
 * the clocks skip means the same clock time after the jump (2:30 becomes 3:30),
 * and a time the clocks repeat means its first occurrence.
 */
export function zonedTimeToInstant(localDateTime: string, timeZone: string): number {
  const reading = Date.parse(`${localDateTime}Z`);
  // A zone changes its offset at most once a day, so these are the only candidates.
  const offsetBefore = utcOffsetAt(reading - DAY_MS, timeZone);
  const offsetAfter = utcOffsetAt(reading + DAY_MS, timeZone);
  const matches = [reading - offsetBefore, reading - offsetAfter].filter(
    (instant) => clockReadingAt(instant, timeZone) === reading
  );
  // No match means the clocks skipped this time; read it with the offset from before the jump.
  return matches.length > 0 ? Math.min(...matches) : reading - offsetBefore;
}

/** An instant's local date-time in a time zone, e.g. "2026-10-15T14:00". */
export function formatZonedTime(instant: number, timeZone: string): string {
  return new Date(clockReadingAt(instant, timeZone)).toISOString().slice(0, 16);
}

/** The local date-time now in a time zone, or on the device's clock without one. */
export function zonedNow(timeZone?: string): string {
  return formatZonedTime(Date.now(), timeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * A "YYYY-MM-DD" date as the Date a date picker shows for it, which is read
 * on the device's calendar. Noon, since some zones skip midnight.
 */
export function toPickerDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

/** An instant as ISO 8601 with the time zone's offset then, e.g. "2026-10-15T14:00-04:00". */
export function formatZonedIsoTime(instant: number, timeZone: string): string {
  const offsetMinutes = Math.round(utcOffsetAt(instant, timeZone) / MINUTE_MS);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
  return `${formatZonedTime(instant, timeZone)}${sign}${hours}:${minutes}`;
}

import "server-only";
import { buildLodging, dateLabel, isCalendarDate, shiftDate } from "@/lib/trip-lodging";
import type { Trip, TripDateChangeDay, TripDateChangeMode, TripDateChangePlan, TripDateChangePreview, TripDay, TripFull } from "@/types/trips";

const daysApart = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
function datesFrom(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}
const rangeLabel = (start: string, end: string) => {
  const count = daysApart(start, end) + 1;
  return `${dateLabel(start)} – ${dateLabel(end)} · ${count} ${count === 1 ? "day" : "days"}`;
};

interface TripSettingsInput {
  name?: string;
  start_date: string;
  end_date: string;
}

/** The requested name and dates, defaulting to the saved trip's, or the field to fix. */
export function parseTripSettings(body: unknown, trip: Trip): TripSettingsInput | { error: string; field: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid request.", field: "name" };
  const input = body as Record<string, unknown>;
  let name: string | undefined;
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 200) return { error: "Trip name must be 1–200 characters.", field: "name" };
    name = input.name.trim();
  }
  const start = input.start_date ?? trip.start_date;
  const end = input.end_date ?? trip.end_date;
  if (!isCalendarDate(start)) return { error: "Choose a valid start date.", field: "start_date" };
  if (!isCalendarDate(end)) return { error: "Choose a valid end date.", field: "end_date" };
  if (start > end) return { error: "The end date must be on or after the start date.", field: "end_date" };
  // Older trips may be longer; only a date change is held to the creation limit.
  if ((start !== trip.start_date || end !== trip.end_date) && daysApart(start, end) > 365) return { error: "Choose a trip of up to 366 days.", field: "end_date" };
  return { ...(name === undefined ? {} : { name }), start_date: start, end_date: end };
}

/**
 * What changing the trip to start–end does to each day plan, for every mode
 * the change allows. It follows the same rules as change_trip_dates (migration
 * 021), which applies the chosen plan.
 */
export function previewDateChange(full: TripFull, start: string, end: string): TripDateChangePreview {
  const { trip } = full;
  const lodging = full.lodging ?? buildLodging(trip, [], []);
  const sameLength = daysApart(start, end) === daysApart(trip.start_date, trip.end_date);
  return {
    from: { start_date: trip.start_date, end_date: trip.end_date, label: rangeLabel(trip.start_date, trip.end_date) },
    to: { start_date: start, end_date: end, label: rangeLabel(start, end) },
    plans: {
      keep: planFor(full, start, end, "keep"),
      ...(sameLength ? { move: planFor(full, start, end, "move") } : {}),
    },
    lodging_after: buildLodging({ ...trip, start_date: start, end_date: end }, lodging.stays, lodging.assignments),
    lodging_revision: lodging.revision,
  };
}

function planFor(full: TripFull, start: string, end: string, mode: TripDateChangeMode): TripDateChangePlan {
  const shift = mode === "move" ? daysApart(full.trip.start_date, start) : 0;
  const stopNames = new Map(full.stops.map((stop) => [stop.id, stop.name]));
  const base = full.stops[0]?.name;
  const memberNames = new Map(full.members.map((member) => [member.id, member.display_name]));
  const kitsOn = (day: TripDay) => full.kits.filter((kit) => kit.trip_day_id === day.id);
  const destination = (stopId: string | null) => stopId ? stopNames.get(stopId) ?? "No destination" : base ? `${base} (base)` : "No destination";
  const describe = (day: TripDay, date: string, from: string | null): TripDateChangeDay => ({
    date, date_label: dateLabel(date), from_date_label: from ? dateLabel(from) : null,
    destination: destination(day.stop_id), activity: day.activity,
    kits: kitsOn(day).map((kit) => memberNames.get(kit.trip_member_id) ?? "Crew member"),
  });

  const days = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const target = (day: TripDay) => shiftDate(day.date, shift);
  const inRange = (date: string) => date >= start && date <= end;
  const removed = days.filter((day) => !inRange(target(day)));
  const staying = days.filter((day) => inRange(target(day)));
  const covered = new Set(staying.map(target));
  // A new date takes the destination of the nearest day there is when it's
  // added: the moved days when moving, every current day when keeping.
  const sources = mode === "move" ? staying.map((day) => ({ ...day, date: target(day) })) : days;
  const nearest = (date: string) => [...sources].sort((a, b) =>
    Math.abs(daysApart(a.date, date)) - Math.abs(daysApart(b.date, date)) || a.date.localeCompare(b.date))[0];

  return {
    mode,
    moved: shift === 0 ? [] : staying.map((day) => describe(day, target(day), day.date)),
    added: datesFrom(start, end).filter((date) => !covered.has(date)).map((date) => ({
      date, date_label: dateLabel(date), from_date_label: null,
      destination: destination(nearest(date)?.stop_id ?? null), activity: null, kits: [],
    })),
    removed: removed.map((day) => describe(day, day.date, null)),
    kept: shift === 0 ? staying.length : 0,
    expected_removed: removed.map((day) => ({
      date: day.date, stop_id: day.stop_id, activity: day.activity, kit_ids: kitsOn(day).map((kit) => kit.id),
    })),
  };
}

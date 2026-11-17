import "server-only";
import { keptReviewsOn, removedDayConditions, type ConditionsRows } from "@/lib/trip-conditions";
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
 * 021, as replaced in 026), which applies the chosen plan. `conditions` is
 * every conditions source listing and review on the trip (#211): a removed
 * day takes all its reviews with it, including those of sources no longer
 * listed there. Without it, only the listed sources are known.
 */
export function previewDateChange(full: TripFull, start: string, end: string, conditions?: ConditionsRows): TripDateChangePreview {
  const { trip } = full;
  const lodging = full.lodging ?? buildLodging(trip, [], []);
  const sameLength = daysApart(start, end) === daysApart(trip.start_date, trip.end_date);
  return {
    from: { start_date: trip.start_date, end_date: trip.end_date, label: rangeLabel(trip.start_date, trip.end_date) },
    to: { start_date: start, end_date: end, label: rangeLabel(start, end) },
    plans: {
      keep: planFor(full, start, end, "keep", conditions),
      ...(sameLength ? { move: planFor(full, start, end, "move", conditions) } : {}),
    },
    lodging_after: buildLodging({ ...trip, start_date: start, end_date: end }, lodging.stays, lodging.assignments,
      { members: full.members, attendance: lodging.attendance, per_member: lodging.per_member }),
    lodging_revision: lodging.revision,
  };
}

function planFor(full: TripFull, start: string, end: string, mode: TripDateChangeMode, rows?: ConditionsRows): TripDateChangePlan {
  const shift = mode === "move" ? daysApart(full.trip.start_date, start) : 0;
  const stopNames = new Map(full.stops.map((stop) => [stop.id, stop.name]));
  const base = full.stops[0]?.name;
  const memberNames = new Map(full.members.map((member) => [member.id, member.display_name]));
  const kitsOn = (day: TripDay) => full.kits.filter((kit) => kit.trip_day_id === day.id);
  const tourPlanOn = (day: TripDay) => full.tour_plans?.find((plan) => plan.trip_day_id === day.id);
  const sourcesOn = (day: TripDay) => (full.conditions ?? []).filter((listing) => listing.trip_day_id === day.id);
  // A day's conditions sources (#211) and the reviews recorded there: removed
  // with the day, or moved with it and so to record again. A removed day also
  // takes the reviews kept for sources no longer listed on it.
  const reviewsCount = (count: number) => `${count} ${count === 1 ? "review" : "reviews"}`;
  const conditions = (day: TripDay, moved: boolean) => {
    const listings = sourcesOn(day);
    const reviews = listings.reduce((count, listing) => count + listing.reviews.filter((review) => review.current.action !== "withdrawn").length, 0);
    const kept = !moved && rows ? keptReviewsOn(rows, day.id) : [];
    const parts = [
      listings.length > 0 && new Intl.ListFormat("en", { type: "conjunction" }).format(listings.map((listing) => listing.name)),
      reviews > 0 && `${reviewsCount(reviews)} ${moved ? "to record again" : "removed with the day"}`,
      ...kept.map((source) => `${reviewsCount(source.reviews)} of ${source.name} (no longer listed) removed with the day`),
    ].filter((part): part is string => !!part);
    return parts.length > 0 ? `Conditions: ${parts.join(" · ")}` : null;
  };
  // What change_trip_dates (20261116210000) checks of a removed day's conditions.
  const conditionsCheck = (day: TripDay) => {
    if (rows) return removedDayConditions(rows, day.id);
    const listings = sourcesOn(day);
    return listings.length === 0 ? undefined : {
      source_ids: listings.map((listing) => listing.id).sort(),
      entries: listings.reduce((count, listing) => count + listing.reviews.reduce((sum, review) => sum + 1 + review.history.length, 0), 0),
    };
  };
  const destination = (stopId: string | null) => stopId ? stopNames.get(stopId) ?? "No destination" : base ? `${base} (base)` : "No destination";
  const describe = (day: TripDay, date: string, from: string | null): TripDateChangeDay => ({
    date, date_label: dateLabel(date), from_date_label: from ? dateLabel(from) : null,
    destination: destination(day.stop_id), activity: day.activity,
    kits: kitsOn(day).map((kit) => memberNames.get(kit.trip_member_id) ?? "Crew member"),
    tour_plan: tourPlanOn(day)?.objective ?? null,
    notes: day.notes ?? null,
    conditions: conditions(day, !!from),
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
      destination: destination(nearest(date)?.stop_id ?? null), activity: null, kits: [], tour_plan: null,
    })),
    removed: removed.map((day) => describe(day, day.date, null)),
    kept: shift === 0 ? staying.length : 0,
    // A day's tour plan, notes and conditions are listed only when it has
    // them, as change_trip_dates (026, 20261028130000, 20261116210000) lists
    // them. Conditions are the sources listed on it and every review entry
    // recorded there, for any source.
    expected_removed: removed.map((day) => {
      const plan = tourPlanOn(day);
      const check = conditionsCheck(day);
      return { date: day.date, stop_id: day.stop_id, activity: day.activity, kit_ids: kitsOn(day).map((kit) => kit.id),
        ...(plan ? { tour_plan_id: plan.id, tour_plan_revision: plan.revision } : {}),
        ...(day.notes ? { notes: day.notes } : {}),
        ...(check ? { conditions: check } : {}) };
    }),
  };
}

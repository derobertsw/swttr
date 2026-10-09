import "server-only";
import { dateLabel, isCalendarDate, isUuid } from "@/lib/trip-lodging";
import type { TripDay, TripFull, TripItineraryOption, TripItineraryPreview, TripItineraryRequest, TripPlace, TripStop } from "@/types/trips";

/**
 * Itinerary edits (#176 PR 2): remove and reorder stops, assign several days,
 * and change one day's place. previewItinerary builds the review with the same
 * rules as edit_trip_itinerary (migration 022), which saves the chosen option
 * and refuses it if the trip no longer matches what the review showed.
 */

type DayCheck = { date: string; stop_id: string | null; activity: string | null };

/** A change as it's saved: the action and the payload of the option chosen in the review. */
type ItineraryEdit =
  | { action: "remove_stop"; payload: { stop_id: string; reassign_to: string | null; expected: string[] } }
  | { action: "reorder_stops"; payload: { order: string[]; expected: string[] } }
  | { action: "assign_days"; payload: { dates: string[]; stop_id?: string; activity?: string | null; expected: DayCheck[] } }
  | { action: "set_day_place"; payload: { date: string; place: TripPlace; scope: "day" | "stop"; expected: { stop_id: string | null; dates: string[] } } };

type Invalid = { error: string };
type Itinerary = { stops: Array<Pick<TripStop, "id" | "name" | "latitude" | "longitude">>; days: Array<Pick<TripDay, "date" | "stop_id" | "activity">> };

const MAX_DAYS = 400;
const MAX_STOPS = 100;
const INVALID: Invalid = { error: "Reload the trip and try again." };

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const plural = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

function list<T>(value: unknown, max: number, item: (entry: unknown) => T | undefined): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const items = value.map(item);
  return items.every((entry) => entry !== undefined) ? items as T[] : null;
}
const dates = (value: unknown) => list(value, MAX_DAYS, (entry) => isCalendarDate(entry) ? entry : undefined);
const stopIds = (value: unknown) => list(value, MAX_STOPS, (entry) => isUuid(entry) ? entry.toLowerCase() : undefined);
const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

/** A day's activity: 1–80 characters, or null for none. Undefined when invalid. */
function activityOf(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const activity = value.trim();
  return activity && activity.length <= 80 ? activity : undefined;
}

function placeOf(value: unknown): TripPlace | null {
  if (!isObject(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const { latitude, longitude } = value;
  if (!name || name.length > 200) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { name, latitude, longitude };
}

/** The change to preview, or why it can't be. Stops and days are checked against the trip when previewing. */
export function parseItineraryRequest(body: unknown): TripItineraryRequest | Invalid {
  if (!isObject(body)) return INVALID;
  switch (body.action) {
    case "remove_stop":
      return typeof body.stop_id === "string" && body.stop_id ? { action: "remove_stop", stop_id: body.stop_id } : INVALID;
    case "reorder_stops": {
      const order = list(body.order, MAX_STOPS, (entry) => typeof entry === "string" ? entry : undefined);
      return order ? { action: "reorder_stops", order } : INVALID;
    }
    case "assign_days": {
      const days = dates(body.dates);
      if (!days?.length) return { error: "Choose days on this trip." };
      const setsStop = "stop_id" in body;
      const setsActivity = "activity" in body;
      if (!setsStop && !setsActivity) return { error: "Choose a destination or an activity." };
      if (setsStop && (typeof body.stop_id !== "string" || !body.stop_id)) return { error: "Choose a destination on this trip." };
      const activity = setsActivity ? activityOf(body.activity) : undefined;
      if (setsActivity && activity === undefined) return { error: "Activities are 1–80 characters." };
      return {
        action: "assign_days", dates: uniqueSorted(days),
        ...(setsStop ? { stop_id: body.stop_id as string } : {}),
        ...(setsActivity ? { activity } : {}),
      };
    }
    case "set_day_place": {
      const place = placeOf(body.place);
      if (!isCalendarDate(body.date)) return INVALID;
      return place ? { action: "set_day_place", date: body.date, place } : { error: "Choose a place from the search results." };
    }
    default:
      return INVALID;
  }
}

/** The change to save, rebuilt from its validated fields only, or why it can't be. */
export function parseItineraryEdit(body: unknown): ItineraryEdit | Invalid {
  if (!isObject(body)) return INVALID;
  switch (body.action) {
    case "remove_stop": {
      const expected = dates(body.expected);
      const reassignTo = body.reassign_to ?? null;
      if (!isUuid(body.stop_id) || !(reassignTo === null || isUuid(reassignTo)) || !expected) return INVALID;
      return { action: "remove_stop", payload: { stop_id: body.stop_id.toLowerCase(), reassign_to: reassignTo?.toLowerCase() ?? null, expected } };
    }
    case "reorder_stops": {
      const order = stopIds(body.order);
      const expected = stopIds(body.expected);
      return order && expected ? { action: "reorder_stops", payload: { order, expected } } : INVALID;
    }
    case "assign_days": {
      const days = dates(body.dates);
      const expected = list(body.expected, MAX_DAYS, (entry): DayCheck | undefined => {
        if (!isObject(entry) || !isCalendarDate(entry.date)) return undefined;
        const stopId = entry.stop_id ?? null;
        const activity = entry.activity ?? null;
        if (!(stopId === null || isUuid(stopId)) || !(activity === null || typeof activity === "string")) return undefined;
        return { date: entry.date, stop_id: stopId?.toLowerCase() ?? null, activity };
      });
      const setsStop = "stop_id" in body;
      const setsActivity = "activity" in body;
      const activity = setsActivity ? activityOf(body.activity) : undefined;
      if (!days?.length || !expected || (!setsStop && !setsActivity) || (setsStop && !isUuid(body.stop_id)) || (setsActivity && activity === undefined)) return INVALID;
      return {
        action: "assign_days",
        payload: {
          dates: uniqueSorted(days),
          ...(setsStop ? { stop_id: (body.stop_id as string).toLowerCase() } : {}),
          ...(setsActivity ? { activity } : {}),
          expected,
        },
      };
    }
    case "set_day_place": {
      const place = placeOf(body.place);
      const expected = isObject(body.expected) ? body.expected : null;
      const expectedDates = dates(expected?.dates);
      const stopId = expected?.stop_id ?? null;
      if (!place || !isCalendarDate(body.date) || (body.scope !== "day" && body.scope !== "stop") || !expectedDates || !(stopId === null || isUuid(stopId))) return INVALID;
      return {
        action: "set_day_place",
        payload: { date: body.date, place, scope: body.scope, expected: { stop_id: stopId?.toLowerCase() ?? null, dates: expectedDates } },
      };
    }
    default:
      return INVALID;
  }
}

/** The preview request a saved change came from, to show the review as it is now. */
export function requestFor(edit: ItineraryEdit): TripItineraryRequest {
  switch (edit.action) {
    case "remove_stop": return { action: "remove_stop", stop_id: edit.payload.stop_id };
    case "reorder_stops": return { action: "reorder_stops", order: edit.payload.order };
    case "assign_days": {
      const { dates, stop_id, activity } = edit.payload;
      return { action: "assign_days", dates, ...("stop_id" in edit.payload ? { stop_id } : {}), ...("activity" in edit.payload ? { activity } : {}) };
    }
    case "set_day_place": return { action: "set_day_place", date: edit.payload.date, place: edit.payload.place };
  }
}

/**
 * Each day's destination and activity, "<stop>[ (base)] · <activity|No activity>".
 * A day without a stop goes to the base, the first stop; stops are in position order.
 */
export function dayLabels({ stops, days }: Itinerary): Map<string, string> {
  const names = new Map(stops.map((stop) => [stop.id, stop.name]));
  const base = stops[0];
  return new Map(days.map((day) => {
    const destination = (day.stop_id && names.get(day.stop_id)) ?? (base ? `${base.name} (base)` : "No destination");
    return [day.date, `${destination} · ${day.activity ?? "No activity"}`];
  }));
}

/** An option that turns the trip's itinerary into `after`, with the days it changes. */
function option(full: TripFull, after: Itinerary, fields: Pick<TripItineraryOption, "key" | "label" | "detail" | "payload">): TripItineraryOption {
  const before = dayLabels(full);
  const next = dayLabels(after);
  const days = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const changes = days
    .filter((day) => before.get(day.date) !== next.get(day.date))
    .map((day) => ({ date: day.date, date_label: dateLabel(day.date), before: before.get(day.date)!, after: next.get(day.date)! }));
  return { ...fields, changes, unchanged: days.length - changes.length };
}

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) <= 0.0001 + 1e-9;

/**
 * The options for a change, each with the days it changes and the payload to
 * save it. `full.stops` is in position order, as loadTripFull returns it.
 */
export function previewItinerary(full: TripFull, request: TripItineraryRequest): TripItineraryPreview | { error: string; status: 400 | 404 } {
  const { stops, days } = full;
  const base = stops[0];
  const stopFor = (day: Pick<TripDay, "stop_id">) => stops.find((stop) => stop.id === day.stop_id) ?? base;
  const datesAt = (stopId: string | undefined) => days.filter((day) => stopFor(day)?.id === stopId).map((day) => day.date).sort();

  switch (request.action) {
    case "remove_stop": {
      const removed = stops.find((stop) => stop.id === request.stop_id);
      if (!removed) return { error: "That stop isn't on this trip anymore. Reload the trip.", status: 404 };
      const using = datesAt(removed.id);
      const others = stops.filter((stop) => stop !== removed);
      const remove = (reassignTo: string | null) => ({
        stops: others,
        days: days.map((day) => stopFor(day) === removed ? { ...day, stop_id: reassignTo } : day),
      });
      const payload = (reassignTo: string | null) => ({ stop_id: removed.id, reassign_to: reassignTo, expected: using });
      if (using.length === 0) {
        return { options: [option(full, remove(null), {
          key: "remove", label: `No day uses ${removed.name}`, detail: "Every day keeps its destination.", payload: payload(others[0]?.id ?? null),
        })] };
      }
      if (others.length === 0) {
        return { options: [option(full, remove(null), {
          key: "none", label: "No destination",
          detail: `${removed.name} is the only stop, so ${using.length === 1 ? "its day" : "its days"} will have no destination.`,
          payload: payload(null),
        })] };
      }
      return { options: others.map((stop) => option(full, remove(stop.id), {
        key: stop.id, label: stop.name, detail: null, payload: payload(stop.id),
      })) };
    }

    case "reorder_stops": {
      const order = request.order.map((id) => stops.find((stop) => stop.id === id));
      if (order.length !== stops.length || new Set(order).size !== stops.length || order.some((stop) => !stop)) {
        return { error: "The stops changed. Reload them and try again.", status: 400 };
      }
      const reordered = order as TripStop[];
      // Days without a stop keep going to the old base.
      const pinned = base && reordered[0] !== base ? days.map((day) => day.stop_id ? day : { ...day, stop_id: base.id }) : days;
      return { options: [option(full, { stops: reordered, days: pinned }, {
        key: "reorder", label: "New stop order", detail: "Every day keeps its destination.",
        payload: { order: reordered.map((stop) => stop.id), expected: stops.map((stop) => stop.id) },
      })] };
    }

    case "assign_days": {
      const selected = days.filter((day) => request.dates.includes(day.date));
      if (selected.length !== request.dates.length) return { error: "Some of these days aren't on the trip anymore. Reload the trip.", status: 400 };
      const stop = "stop_id" in request ? stops.find((candidate) => candidate.id === request.stop_id) : undefined;
      if ("stop_id" in request && !stop) return { error: "That stop isn't on this trip anymore. Reload the trip.", status: 400 };
      const set = { ...(stop ? { stop_id: stop.id } : {}), ...("activity" in request ? { activity: request.activity ?? null } : {}) };
      const parts = [stop?.name, "activity" in request ? request.activity ?? "No activity" : undefined].filter(Boolean);
      return { options: [option(full, { stops, days: days.map((day) => request.dates.includes(day.date) ? { ...day, ...set } : day) }, {
        key: "assign", label: `${parts.join(" and ")} for ${plural(selected.length)}`, detail: null,
        payload: {
          dates: request.dates, ...set,
          expected: selected.sort((a, b) => a.date.localeCompare(b.date)).map(({ date, stop_id, activity }) => ({ date, stop_id, activity })),
        },
      })] };
    }

    case "set_day_place": {
      const day = days.find((candidate) => candidate.date === request.date);
      if (!day) return { error: "This day isn't on the trip anymore. Reload the trip.", status: 404 };
      const { place } = request;
      const atPlace = (stop: Itinerary["stops"][number]) => stop.name === place.name && near(stop.latitude, place.latitude) && near(stop.longitude, place.longitude);
      const current = stopFor(day);
      const payload = (scope: "day" | "stop", dates: string[]) => ({ date: day.date, place, scope, expected: { stop_id: current?.id ?? null, dates } });
      const moved = (stop: Pick<TripStop, "id">) => ({ id: stop.id, name: place.name, latitude: place.latitude, longitude: place.longitude });

      if (!current) {
        // The place becomes the base, so every day goes to it.
        return { options: [option(full, { stops: [moved({ id: "new" })], days }, {
          key: "stop", label: `Every day (${plural(days.length)})`, detail: `${place.name} becomes the trip's base.`,
          payload: payload("stop", days.map((candidate) => candidate.date).sort()),
        })] };
      }
      const atStop = datesAt(current.id);
      const everyDay = option(full, { stops: stops.map((stop) => stop === current ? moved(stop) : stop), days }, {
        key: "stop", label: `Every day at ${current.name} (${plural(atStop.length)})`, detail: `Changes ${current.name} to ${place.name}.`,
        payload: payload("stop", atStop),
      });
      if (atPlace(current)) return { options: [{ ...everyDay, label: `${dateLabel(day.date)} is already at ${place.name}`, detail: null }] };
      if (atStop.length === 1) {
        return { options: [{ ...everyDay, label: `Only ${dateLabel(day.date)}`, detail: `It's the only day at ${current.name}, so ${current.name} changes to ${place.name}.` }] };
      }
      const existing = stops.find(atPlace);
      const target = existing ?? moved({ id: "new" });
      const onlyThisDay = option(full, {
        stops: existing ? stops : [...stops, target],
        days: days.map((candidate) => candidate === day ? { ...candidate, stop_id: target.id } : candidate),
      }, {
        key: "day", label: `Only ${dateLabel(day.date)}`,
        detail: existing ? `Uses ${existing.name}, already a stop on this trip.` : `Adds ${place.name} as a stop for this day.`,
        payload: payload("day", [day.date]),
      });
      return { options: [onlyThisDay, everyDay] };
    }
  }
}

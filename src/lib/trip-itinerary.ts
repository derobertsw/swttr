import "server-only";
import { dateLabel, isCalendarDate, isUuid } from "@/lib/trip-lodging";
import type { TripDay, TripFull, TripItineraryOption, TripItineraryPreview, TripItineraryRequest, TripMember, TripMemberDayKit, TripPlace, TripStop } from "@/types/trips";

/**
 * Itinerary edits (#176): remove and reorder stops, assign several days,
 * change one day's place, and copy a day. previewItinerary builds the review
 * with the same rules as edit_trip_itinerary (migration 022) and copy_trip_day
 * (023), which save the chosen option and refuse it if the trip no longer
 * matches what the review showed.
 */

type DayCheck = { date: string; stop_id: string | null; activity: string | null };
/** A day as a copy's review showed it, with the `updated_at` of the user's kit there, or null. */
type CopyCheck = DayCheck & { kit: string | null };
/** A stop's place as the review showed it, so a save can't overwrite a newer change to it. */
type StopCheck = { name: string; latitude: number | null; longitude: number | null };
/** Whether a copy brings the user's kit, and what it does where they already have one. */
type KitCopy = "none" | "replace" | "keep";

/** A change as it's saved: the action and the payload of the option chosen in the review. */
type ItineraryEdit =
  | { action: "remove_stop"; payload: { stop_id: string; reassign_to: string | null; expected: string[] } }
  | { action: "reorder_stops"; payload: { order: string[]; expected: string[] } }
  | { action: "assign_days"; payload: { dates: string[]; stop_id?: string; activity?: string | null; expected: DayCheck[] } }
  | { action: "set_day_place"; payload: { date: string; place: TripPlace; scope: "day" | "stop"; expected: { stop_id: string | null; stop: StopCheck | null; dates: string[] } } }
  | { action: "copy_day"; payload: { from: string; dates: string[]; kit: KitCopy; expected: { from: Omit<CopyCheck, "date">; days: CopyCheck[] } } };

type Invalid = { error: string };
type Itinerary = { stops: Array<Pick<TripStop, "id" | "name" | "latitude" | "longitude">>; days: Array<Pick<TripDay, "date" | "stop_id" | "activity">> };

const MAX_DAYS = 400;
const MAX_STOPS = 100;
const INVALID: Invalid = { error: "Reload the trip and try again." };

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const plural = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;
const listed = (items: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(items);

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
    case "copy_day": {
      const days = dates(body.dates);
      if (!isCalendarDate(body.from) || typeof body.kit !== "boolean") return INVALID;
      if (!days?.length) return { error: "Choose days to copy to." };
      return { action: "copy_day", from: body.from, dates: uniqueSorted(days), kit: body.kit };
    }
    default:
      return INVALID;
  }
}

/** A day's destination, activity and the user's kit as a copy's review showed them. Undefined when invalid. */
function copyCheck(entry: unknown): Omit<CopyCheck, "date"> | undefined {
  if (!isObject(entry)) return undefined;
  const stopId = entry.stop_id ?? null;
  const activity = entry.activity ?? null;
  const kit = entry.kit ?? null;
  if (!(stopId === null || isUuid(stopId)) || !(activity === null || typeof activity === "string")) return undefined;
  if (!(kit === null || (typeof kit === "string" && kit.length <= 40 && Number.isFinite(Date.parse(kit))))) return undefined;
  return { stop_id: stopId?.toLowerCase() ?? null, activity, kit };
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
      const rawStopId = expected?.stop_id ?? null;
      const stopId = rawStopId === null ? null : isUuid(rawStopId) ? rawStopId.toLowerCase() : undefined;
      // The day's stop as reviewed: required with its id, and absent when the trip had no stops.
      const reviewed = isObject(expected?.stop) ? expected.stop : null;
      const coordinate = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));
      const stop = reviewed && typeof reviewed.name === "string" && coordinate(reviewed.latitude) && coordinate(reviewed.longitude)
        ? { name: reviewed.name, latitude: reviewed.latitude as number | null, longitude: reviewed.longitude as number | null } : null;
      if (!place || !isCalendarDate(body.date) || (body.scope !== "day" && body.scope !== "stop") || !expectedDates) return INVALID;
      if (stopId === undefined || (stopId === null ? expected?.stop != null : !stop)) return INVALID;
      return {
        action: "set_day_place",
        payload: { date: body.date, place, scope: body.scope, expected: { stop_id: stopId, stop, dates: expectedDates } },
      };
    }
    case "copy_day": {
      const days = dates(body.dates);
      const expected = isObject(body.expected) ? body.expected : null;
      const from = copyCheck(expected?.from);
      const checks = list(expected?.days, MAX_DAYS, (entry): CopyCheck | undefined => {
        const check = copyCheck(entry);
        return check && isObject(entry) && isCalendarDate(entry.date) ? { date: entry.date, ...check } : undefined;
      });
      const kit = body.kit;
      if (!isCalendarDate(body.from) || !days?.length || !from || !checks || (kit !== "none" && kit !== "replace" && kit !== "keep")) return INVALID;
      return { action: "copy_day", payload: { from: body.from, dates: uniqueSorted(days), kit, expected: { from, days: checks } } };
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
    case "copy_day": return { action: "copy_day", from: edit.payload.from, dates: edit.payload.dates, kit: edit.payload.kit !== "none" };
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

/** An outfit or checklist items, as save_trip_kits counts a kit. */
const isKit = (kit: Pick<TripMemberDayKit, "outfit" | "items">) => !!kit.outfit || kit.items.length > 0;

/**
 * The kits on a day that stay as saved when its destination or activity
 * changes, the user's first: "your outfit and Sam's checklist". Undefined when
 * there are none. `copiedOver` leaves out the user's kit, which a copy replaces.
 */
function keptKits(full: TripFull, day: Pick<TripDay, "id">, me: TripMember | undefined, copiedOver: boolean): string | undefined {
  const members = full.members.filter((member) => member.status !== "left" && member !== me);
  const kits = (me ? [me, ...members] : members).flatMap((member) => {
    const kit = full.kits.find((candidate) => candidate.trip_day_id === day.id && candidate.trip_member_id === member.id);
    if (!kit || !isKit(kit) || (copiedOver && member === me)) return [];
    return [`${member === me ? "your" : `${member.display_name}'s`} ${kit.outfit ? "outfit" : "checklist"}`];
  });
  return kits.length > 0 ? `Kept as saved for the old plan: ${listed(kits)}.` : undefined;
}

/**
 * An option that turns the trip's itinerary into `after`, with the days it
 * changes. Each day whose destination or activity changes notes the kits that
 * stay as saved. `copied` notes the days that get the user's copied kit, which
 * change even when their destination and activity don't.
 */
function option(
  full: TripFull,
  after: Itinerary,
  fields: Pick<TripItineraryOption, "key" | "label" | "detail" | "payload">,
  me?: TripMember,
  copied?: Map<string, string>,
): TripItineraryOption {
  const before = dayLabels(full);
  const next = dayLabels(after);
  const days = [...full.days].sort((a, b) => a.date.localeCompare(b.date));
  const changes = days
    .filter((day) => before.get(day.date) !== next.get(day.date) || copied?.has(day.date))
    .map((day) => {
      const moved = before.get(day.date) !== next.get(day.date);
      const notes = [copied?.get(day.date), moved ? keptKits(full, day, me, !!copied?.has(day.date)) : undefined]
        .filter((note): note is string => !!note);
      return {
        date: day.date, date_label: dateLabel(day.date), before: before.get(day.date)!, after: next.get(day.date)!,
        ...(notes.length > 0 ? { notes } : {}),
      };
    });
  return { ...fields, changes, unchanged: days.length - changes.length };
}

const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) <= 0.0001 + 1e-9;

/**
 * The options for a change, each with the days it changes and the payload to
 * save it. `full.stops` is in position order, as loadTripFull returns it.
 * `userId` is the signed-in user, whose kit a copy can bring and whose kits the
 * review calls "your".
 */
export function previewItinerary(full: TripFull, request: TripItineraryRequest, userId?: string | null): TripItineraryPreview | { error: string; status: 400 | 404 } {
  const { stops, days } = full;
  const base = stops[0];
  const stopFor = (day: Pick<TripDay, "stop_id">) => stops.find((stop) => stop.id === day.stop_id) ?? base;
  const datesAt = (stopId: string | undefined) => days.filter((day) => stopFor(day)?.id === stopId).map((day) => day.date).sort();
  const me = userId ? full.members.find((member) => member.user_id === userId && member.status !== "left") : undefined;
  const review = (after: Itinerary, fields: Parameters<typeof option>[2], copied?: Map<string, string>) => option(full, after, fields, me, copied);

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
        return { options: [review(remove(null), {
          key: "remove", label: `No day uses ${removed.name}`, detail: "Every day keeps its destination.", payload: payload(others[0]?.id ?? null),
        })] };
      }
      if (others.length === 0) {
        return { options: [review(remove(null), {
          key: "none", label: "No destination",
          detail: `${removed.name} is the only stop, so ${using.length === 1 ? "its day" : "its days"} will have no destination.`,
          payload: payload(null),
        })] };
      }
      return { options: others.map((stop) => review(remove(stop.id), {
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
      return { options: [review({ stops: reordered, days: pinned }, {
        key: "reorder", label: "New stop order", detail: "Every day keeps its destination.",
        payload: { order: reordered.map((stop) => stop.id), expected: stops.map((stop) => stop.id) },
      })] };
    }

    case "assign_days": {
      const selected = days.filter((day) => request.dates.includes(day.date));
      if (selected.length !== request.dates.length) return { error: "Some of these days aren't on the trip anymore. Reload the trip.", status: 404 };
      const stop = "stop_id" in request ? stops.find((candidate) => candidate.id === request.stop_id) : undefined;
      if ("stop_id" in request && !stop) return { error: "That stop isn't on this trip anymore. Reload the trip.", status: 404 };
      const set = { ...(stop ? { stop_id: stop.id } : {}), ...("activity" in request ? { activity: request.activity ?? null } : {}) };
      const parts = [stop?.name, "activity" in request ? request.activity ?? "No activity" : undefined].filter(Boolean);
      return { options: [review({ stops, days: days.map((day) => request.dates.includes(day.date) ? { ...day, ...set } : day) }, {
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
      const payload = (scope: "day" | "stop", dates: string[]) => ({
        date: day.date, place, scope,
        expected: { stop_id: current?.id ?? null, stop: current ? { name: current.name, latitude: current.latitude, longitude: current.longitude } : null, dates },
      });
      const moved = (stop: Pick<TripStop, "id">) => ({ id: stop.id, name: place.name, latitude: place.latitude, longitude: place.longitude });

      if (!current) {
        // The place becomes the base, so every day goes to it.
        return { options: [review({ stops: [moved({ id: "new" })], days }, {
          key: "stop", label: `Every day (${plural(days.length)})`, detail: `${place.name} becomes the trip's base.`,
          payload: payload("stop", days.map((candidate) => candidate.date).sort()),
        })] };
      }
      const atStop = datesAt(current.id);
      if (atPlace(current)) {
        return { options: [review({ stops, days }, {
          key: "stop", label: `${dateLabel(day.date)} is already at ${place.name}`, detail: null, payload: payload("stop", atStop),
        })] };
      }
      // Another stop already at the place takes the days, rather than a second
      // stop at the same place.
      const existing = stops.find(atPlace);
      const everyDay = review(existing
        ? { stops, days: days.map((candidate) => stopFor(candidate) === current ? { ...candidate, stop_id: existing.id } : candidate) }
        : { stops: stops.map((stop) => stop === current ? moved(stop) : stop), days }, {
        key: "stop", label: `Every day at ${current.name} (${plural(atStop.length)})`,
        detail: existing ? `Moves them to ${existing.name}, already a stop on this trip.` : `Changes ${current.name} to ${place.name}.`,
        payload: payload("stop", atStop),
      });
      if (atStop.length === 1) {
        return { options: [{
          ...everyDay, label: `Only ${dateLabel(day.date)}`,
          detail: existing
            ? `Uses ${existing.name}, already a stop on this trip. ${current.name} will have no days.`
            : `It's the only day at ${current.name}, so ${current.name} changes to ${place.name}.`,
        }] };
      }
      const target = existing ?? moved({ id: "new" });
      const onlyThisDay = review({
        stops: existing ? stops : [...stops, target],
        days: days.map((candidate) => candidate === day ? { ...candidate, stop_id: target.id } : candidate),
      }, {
        key: "day", label: `Only ${dateLabel(day.date)}`,
        detail: existing ? `Uses ${existing.name}, already a stop on this trip.` : `Adds ${place.name} as a stop for this day.`,
        payload: payload("day", [day.date]),
      });
      return { options: [onlyThisDay, everyDay] };
    }

    case "copy_day": {
      const source = days.find((candidate) => candidate.date === request.from);
      if (!source) return { error: "The day you're copying isn't on the trip anymore. Reload the trip.", status: 404 };
      if (request.dates.includes(source.date)) return { error: "Choose days other than the one you're copying.", status: 400 };
      const targets = days.filter((day) => request.dates.includes(day.date)).sort((a, b) => a.date.localeCompare(b.date));
      if (targets.length !== request.dates.length) return { error: "Some of these days aren't on the trip anymore. Reload the trip.", status: 404 };
      const myKit = (day: TripDay) => me && full.kits.find((kit) => kit.trip_day_id === day.id && kit.trip_member_id === me.id && isKit(kit));
      const sourceKit = request.kit ? myKit(source) : undefined;
      const from = dateLabel(source.date);
      if (request.kit && !sourceKit) return { error: `You have no kit on ${from} to copy.`, status: 400 };

      const after = { stops, days: days.map((day) => request.dates.includes(day.date) ? { ...day, stop_id: source.stop_id, activity: source.activity } : day) };
      const plan = dayLabels(full).get(source.date)!;
      const payload = (kit: KitCopy) => ({
        from: source.date, dates: targets.map((day) => day.date), kit,
        expected: {
          from: { stop_id: source.stop_id, activity: source.activity, kit: sourceKit?.updated_at ?? null },
          days: targets.map((day) => ({ date: day.date, stop_id: day.stop_id, activity: day.activity, kit: sourceKit ? myKit(day)?.updated_at ?? null : null })),
        },
      });
      if (!sourceKit) {
        return { options: [review(after, {
          key: "copy", label: `Copy ${from} to ${plural(targets.length)}`, detail: `${plan}. Kits stay on their own days.`, payload: payload("none"),
        })] };
      }

      // The user's kit comes too: an outfit still shows the forecast it was planned for.
      const what = sourceKit.outfit ? "outfit" : "checklist";
      const forecast = sourceKit.outfit ? " The copied outfit keeps the forecast it was planned for, so check each day in Gear up." : "";
      const mine = targets.filter((day) => myKit(day));
      const copied = (replace: boolean) => new Map(targets
        .filter((day) => replace || !myKit(day))
        .map((day) => [day.date, myKit(day) ? `Your kit here is replaced with your ${what} from ${from}.` : `Gets your ${what} from ${from}.`]));
      if (mine.length === 0) {
        return { options: [review(after, {
          key: "copy", label: `Copy ${from} and your kit to ${plural(targets.length)}`, detail: `${plan}, and your ${what}.${forecast}`, payload: payload("replace"),
        }, copied(true))] };
      }
      const on = listed(mine.map((day) => dateLabel(day.date)));
      return { options: [
        review(after, {
          key: "replace", label: `Replace your kit on ${on}`, detail: `Every day gets ${plan} and your ${what}.${forecast}`, payload: payload("replace"),
        }, copied(true)),
        review(after, {
          key: "keep", label: `Keep your kit on ${on}`,
          detail: `${mine.length === 1 ? "That day gets" : "Those days get"} ${plan} only.${mine.length < targets.length
            ? ` ${targets.length - mine.length === 1 ? "The other day also gets" : "The others also get"} your ${what}.${forecast}` : ""}`,
          payload: payload("keep"),
        }, copied(false)),
      ] };
    }
  }
}

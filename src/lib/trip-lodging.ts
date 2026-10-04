import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip, TripLodging, TripLodgingAction, TripLodgingNight, TripLodgingPreview, TripStay, TripStayInput } from "@/types/trips";

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1000-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
function dates(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const result: string[] = [];
  for (let date = start; date < end; date = shiftDate(date, 1)) result.push(date);
  return result;
}

export function parseStay(value: unknown): TripStayInput | { error: string; field: string } {
  if (!value || typeof value !== "object") return { error: "Enter a stay name.", field: "name" };
  const input = value as Record<string, unknown>;
  if (!isUuid(input.id)) return { error: "Invalid stay identity. Reopen the stay editor.", field: "name" };
  const text = (key: string, max: number) => input[key] == null || input[key] === "" ? null : typeof input[key] === "string" && input[key].trim().length <= max ? input[key].trim() || null : undefined;
  const name = text("name", 200);
  if (!name) return { error: "Stay name must be 1–200 characters.", field: "name" };
  const checkIn = input.check_in === "" ? null : input.check_in ?? null, checkOut = input.check_out === "" ? null : input.check_out ?? null;
  if (checkIn !== null || checkOut !== null) {
    if (!isCalendarDate(checkIn)) return { error: "Choose a valid check-in date, or clear both dates.", field: "check_in" };
    if (!isCalendarDate(checkOut) || checkOut <= checkIn) return { error: "Check-out must be after check-in. Clear both dates to save without dates.", field: "check_out" };
    if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 > 366) return { error: "Choose a stay of up to 366 nights.", field: "check_out" };
  }
  const address = text("address", 1000), url = text("property_url", 2000), notes = text("notes", 4000);
  for (const [field, entry] of [["address", address], ["property_url", url], ["notes", notes]] as const) {
    if (entry === undefined) return { error: `Check the ${field.replaceAll("_", " ")} length.`, field };
  }
  if (url) {
    try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); }
    catch { return { error: "Use a complete http or https property link.", field: "property_url" }; }
  }
  if (input.type != null && input.type !== "" && !["hotel", "rental", "hut", "campground", "other"].includes(String(input.type))) return { error: "Choose a stay type.", field: "type" };
  const time = (key: string) => input[key] == null || input[key] === "" ? null : typeof input[key] === "string" && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(input[key]) ? input[key].slice(0, 5) : undefined;
  const inTime = time("check_in_time"), outTime = time("check_out_time");
  if (inTime === undefined || outTime === undefined) return { error: "Choose valid local check-in and check-out times.", field: inTime === undefined ? "check_in_time" : "check_out_time" };
  if (input.booking_status !== undefined && !["not_booked", "booked"].includes(String(input.booking_status))) return { error: "Choose a booking status.", field: "booking_status" };
  return { id: input.id, name, check_in: checkIn as string | null, check_out: checkOut as string | null,
    type: (input.type || null) as TripStayInput["type"], address: address ?? null, property_url: url ?? null,
    notes: notes ?? null, check_in_time: inTime, check_out_time: outTime,
    booking_status: (input.booking_status ?? "not_booked") as TripStayInput["booking_status"] };
}

export function buildLodging(trip: Trip, stays: TripStay[], assignments: TripLodgingNight[]): TripLodging {
  const byId = new Map(stays.map((stay) => [stay.id, stay]));
  const byDate = new Map(assignments.map((night) => [night.date, night]));
  const nightly = (date: string) => {
    const night = byDate.get(date);
    return { date, date_label: dateLabel(date), pre_trip: date === shiftDate(trip.start_date, -1), label: night?.status === "no_stay" ? "No stay needed" : night?.stay_id ? byId.get(night.stay_id)?.name ?? "Not planned yet" : "Not planned yet",
      stay_id: night?.stay_id ?? null, status: night?.status ?? "unplanned" as const };
  };
  return { revision: trip.lodging_revision ?? 0, assignments,
    stays: stays.map((stay) => {
      const covered = dates(stay.check_in, stay.check_out);
      return { ...stay, night_count: covered.length, date_label: covered.length ? `${dateLabel(stay.check_in!)} → ${dateLabel(stay.check_out!)} · ${covered.length} ${covered.length === 1 ? "night" : "nights"}` : "Dates not set",
        assigned_nights: assignments.filter((night) => night.stay_id === stay.id).map((night) => night.date).sort(),
        review_dates: covered.filter((date) => date < shiftDate(trip.start_date, -1) || date > trip.end_date) };
    }),
    nights: dates(shiftDate(trip.start_date, -1), shiftDate(trip.end_date, 1)).map(nightly),
    days: dates(trip.start_date, shiftDate(trip.end_date, 1)).map((date) => {
      const origin = nightly(shiftDate(date, -1)), tonight = nightly(date);
      return { date, starting_from: origin.stay_id ? origin.label : "Not set", starting_stay_id: origin.stay_id,
        staying_tonight: tonight.label, tonight_stay_id: tonight.stay_id };
    }) };
}

export async function loadLodging(supabase: SupabaseClient, trip: Trip): Promise<TripLodging> {
  const [stays, nights] = await Promise.all([
    supabase.from("trip_stays").select("*").eq("trip_id", trip.id).order("created_at"),
    supabase.from("trip_lodging_nights").select("*").eq("trip_id", trip.id).order("date"),
  ]);
  if (stays.error || nights.error) throw new Error("Couldn't load crew stays. Try again.");
  return buildLodging(trip, (stays.data ?? []) as TripStay[], (nights.data ?? []) as TripLodgingNight[]);
}

/** All date coverage, origin and overlap calculations stay on the server. */
export function previewLodging(trip: Trip, lodging: TripLodging, action: TripLodgingAction, payload: TripStayInput | { id: string } | { date: string; status: string }): TripLodgingPreview {
  const old = "id" in payload ? lodging.stays.find((stay) => stay.id === payload.id) : undefined;
  const stay = action === "save" ? payload as TripStayInput : undefined;
  const rangeChanged = stay && (!old || old.check_in !== stay.check_in || old.check_out !== stay.check_out);
  const assigning = rangeChanged ? dates(stay.check_in, stay.check_out) : [];
  const clearing = action === "remove" || rangeChanged ? old?.assigned_nights ?? [] : [];
  const affected = [...new Set([...assigning, ...clearing, ...("date" in payload ? [payload.date] : [])])].sort();
  const conflicts: string[] = [];
  const labelFor = (date: string) => lodging.assignments.find((night) => night.date === date)?.status === "no_stay" ? "No stay needed" : lodging.nights.find((night) => night.date === date)?.label ?? lodging.stays.find((saved) => saved.assigned_nights.includes(date))?.name ?? "Not planned yet";
  return { revision: lodging.revision, date_label: stay?.check_in ? `${dateLabel(stay.check_in)} → ${dateLabel(stay.check_out!)} · ${dates(stay.check_in, stay.check_out).length} nights` : "Dates not set",
    nights: affected.map((date) => {
      const existing = lodging.assignments.find((night) => night.date === date);
      const before = labelFor(date);
      let after = "Not planned yet";
      if (assigning.includes(date)) {
        after = stay!.name;
        if (existing && existing.stay_id !== stay!.id) conflicts.push(date);
      }
      if ("date" in payload) {
        after = payload.status === "no_stay" ? "No stay needed" : "Not planned yet";
        if (existing?.stay_id) conflicts.push(date);
      }
      const morning = shiftDate(date, 1);
      return { date, date_label: dateLabel(date), before, after, morning_origin: assigning.includes(date) ? stay!.name : "Not set", morning: morning >= trip.start_date && morning <= trip.end_date ? dateLabel(morning) : null };
    }), review_dates: stay ? dates(stay.check_in, stay.check_out).filter((date) => date < shiftDate(trip.start_date, -1) || date > trip.end_date) : [],
    conflicts };
}

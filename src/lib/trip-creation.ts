import { TRIP_ACTIVITY_OPTIONS } from "@/lib/trip-activities";

export interface TripCreationInput {
  creation_id?: string;
  name: string;
  start_date: string;
  end_date: string;
  destination?: { name: string; latitude: number; longitude: number };
  activity?: string | null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1000-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Validate the typed request before sending it to the database transaction. */
export function parseTripCreation(body: unknown): TripCreationInput | string {
  if (!body || typeof body !== "object") return "Add a trip name and valid start and end dates.";
  const input = body as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 200) return "Trip name must be 1–200 characters.";
  if (!validDate(input.start_date) || !validDate(input.end_date)) return "Choose valid start and end dates.";
  if (input.start_date > input.end_date) return "Start date must be on or before end date.";
  // Older name-and-date-only callers accepted longer trips. Bound the new
  // creation contract without narrowing those existing requests.
  const legacyDateOnly = input.creation_id === undefined && input.destination === undefined && input.activity == null;
  if (!legacyDateOnly && (Date.parse(input.end_date) - Date.parse(input.start_date)) / 86400000 >= 366) return "Choose a trip of up to 366 days.";
  if (input.creation_id !== undefined && (typeof input.creation_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.creation_id))) return "Invalid draft identity. Reopen the new trip page.";
  if (input.activity != null && !(TRIP_ACTIVITY_OPTIONS as readonly unknown[]).includes(input.activity)) return "Choose a supported trip activity.";
  let destination: TripCreationInput["destination"];
  if (input.destination !== undefined) {
    if (!input.destination || typeof input.destination !== "object") return "Select a destination from the search results.";
    const place = input.destination as Record<string, unknown>;
    if (typeof place.name !== "string" || !place.name.trim() || place.name.trim().length > 200 || typeof place.latitude !== "number" || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 || typeof place.longitude !== "number" || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) return "Select a destination with valid coordinates.";
    destination = { name: place.name.trim(), latitude: place.latitude, longitude: place.longitude };
  }
  return { name: input.name.trim(), start_date: input.start_date, end_date: input.end_date,
    ...(input.creation_id === undefined ? {} : { creation_id: input.creation_id as string }),
    ...(destination ? { destination } : {}), activity: input.activity as string | null | undefined };
}

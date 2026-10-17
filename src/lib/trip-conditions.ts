import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateLabel } from "@/lib/trip-lodging";
import { accessPointFor } from "@/lib/trip-location";
import type {
  TripConditionsContext,
  TripConditionsReview,
  TripConditionsReviewEntry,
  TripConditionsSource,
  TripConditionsSourceInput,
  TripDay,
  TripDayConditionsSource,
  TripFull,
} from "@/types/trips";

type FieldError = { error: string; field: string };

const CATEGORIES = ["avalanche", "weather", "access"] as const;

/** The organizer's source, or the first field to fix. Only the area or region is optional. */
export function parseConditionsSource(value: unknown): TripConditionsSourceInput | FieldError {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const category = CATEGORIES.find((option) => option === input.category);
  if (!category) return { error: "Choose avalanche forecast, mountain weather or access and closures.", field: "category" };
  const text = (key: string) => typeof input[key] === "string" ? (input[key] as string).trim() : input[key] == null ? "" : undefined;
  const name = text("name"), region = text("region"), url = text("url");
  if (!name) return { error: "Enter the source's name.", field: "name" };
  if (name.length > 200) return { error: "Use up to 200 characters for the source's name.", field: "name" };
  if (region === undefined || region.length > 200) return { error: "Use up to 200 characters for the area or region.", field: "region" };
  if (!url) return { error: "Enter the source's link.", field: "url" };
  try {
    const parsed = new URL(url);
    if (url.length > 2000 || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch { return { error: "Use a complete http or https link, up to 2,000 characters.", field: "url" }; }
  return { category, name, region: region || null, url };
}

/** A review's optional note, trimmed, or the error to show. */
export function parseReviewNote(value: unknown): string | null | FieldError {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 1000) return { error: "Use up to 1,000 characters for the note.", field: "note" };
  return value.trim() || null;
}

/** The day's plan and the source as they are now, which a review records and goes stale against. */
export function conditionsContext(
  full: Pick<TripFull, "stops" | "tour_plans">,
  day: TripDay,
  source: Pick<TripConditionsSource, "url" | "region">,
): TripConditionsContext {
  // A day without a stop goes to the base, the first stop, as everywhere on the day page.
  const stop = full.stops.find((candidate) => candidate.id === day.stop_id) ?? full.stops[0];
  const point = accessPointFor(full.stops, day)?.location;
  const plan = full.tour_plans?.find((candidate) => candidate.trip_day_id === day.id);
  return {
    date: day.date,
    stop: stop ? { id: stop.id, latitude: stop.latitude, longitude: stop.longitude } : null,
    activity: day.activity ?? stop?.activities[0] ?? null,
    access_point: point ? { latitude: point.latitude, longitude: point.longitude } : null,
    route: plan ? { objective: plan.objective, route_url: plan.route_url } : null,
    source: { url: source.url, region: source.region },
  };
}

/** JSON with sorted keys, so a context read back from jsonb compares equal to one built here. */
function canonical(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The context as the client sends it back with a review. */
export const contextKey = (context: TripConditionsContext) => canonical(context);

/** What changed since a review was recorded, in the order the day page lists it; empty when nothing did. */
export function staleReasons(saved: Partial<TripConditionsContext>, now: TripConditionsContext): string[] {
  const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  const reasons: string[] = [];
  if (saved.date !== now.date) reasons.push(saved.date ? `Date changed from ${dateLabel(saved.date)}` : "Date changed");
  if (!same(saved.stop, now.stop)) reasons.push("Destination changed");
  if (!same(saved.activity, now.activity)) reasons.push(`Activity changed to ${now.activity ?? "none"}`);
  if (!same(saved.access_point, now.access_point)) reasons.push("Access point changed");
  if (!same(saved.route, now.route)) reasons.push(!saved.route ? "Tour plan added" : !now.route ? "Tour plan removed" : "Route changed");
  if (!same(saved.source?.url, now.source.url)) reasons.push("Source link changed");
  if (!same(saved.source?.region, now.source.region)) reasons.push("Source area changed");
  return reasons;
}

interface AttachmentRow { trip_day_id: string; source_id: string; created_at: string }
interface ReviewRow extends TripConditionsReviewEntry {
  entry_number: number;
  trip_day_id: string;
  source_id: string;
  user_id: string;
  context: Partial<TripConditionsContext>;
}
export interface ConditionsRows { sources: TripConditionsSource[]; attachments: AttachmentRow[]; reviews: ReviewRow[] }

const MISSING_TABLE = ["42P01", "PGRST205"];

/** The trip's sources, their days and every review entry, oldest first. */
export async function loadConditions(supabase: SupabaseClient, tripId: string): Promise<ConditionsRows> {
  const results = await Promise.all([
    supabase.from("trip_conditions_sources").select("*").eq("trip_id", tripId),
    supabase.from("trip_day_conditions_sources").select("*").eq("trip_id", tripId),
    supabase.from("trip_conditions_reviews").select("*").eq("trip_id", tripId).order("entry_number"),
  ]);
  const errors = results.flatMap((result) => result.error ? [result.error] : []);
  // Before migration 031 there are no tables, and so no source or review to hide. Any other failure might hide one.
  if (errors.length === results.length && errors.every((error) => MISSING_TABLE.includes(error.code))) {
    return { sources: [], attachments: [], reviews: [] };
  }
  if (errors.length) throw new Error("Couldn't load conditions sources. Try again.");
  const [sources, attachments, reviews] = results.map((result) => result.data ?? []);
  return { sources: sources as TripConditionsSource[], attachments: attachments as AttachmentRow[], reviews: reviews as ReviewRow[] };
}

const entry = (row: ReviewRow): TripConditionsReviewEntry =>
  ({ id: row.id, action: row.action, note: row.note, reviewed_at: row.reviewed_at, created_at: row.created_at });

/**
 * Each day's sources, in date and category order, with everyone's current
 * review, its history and whether the plan changed since it was recorded.
 */
export function summarizeConditions(rows: ConditionsRows, full: Pick<TripFull, "stops" | "days" | "tour_plans">): TripDayConditionsSource[] {
  const days = new Map(full.days.map((day) => [day.id, day]));
  const sources = new Map(rows.sources.map((source) => [source.id, source]));
  // Each person's entries for a source on a day, newest first.
  const people = new Map<string, ReviewRow[]>();
  for (const row of [...rows.reviews].sort((a, b) => b.entry_number - a.entry_number)) {
    const key = `${row.trip_day_id}:${row.source_id}`;
    let list = people.get(key);
    if (!list) people.set(key, list = []);
    list.push(row);
  }
  return rows.attachments
    .filter((attachment) => days.has(attachment.trip_day_id) && sources.has(attachment.source_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((attachment) => {
      const day = days.get(attachment.trip_day_id)!, source = sources.get(attachment.source_id)!;
      const context = conditionsContext(full, day, source);
      const byUser = new Map<string, ReviewRow[]>();
      for (const row of people.get(`${day.id}:${source.id}`) ?? []) {
        if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
        byUser.get(row.user_id)!.push(row);
      }
      const reviews: TripConditionsReview[] = [...byUser.values()]
        .map(([latest, ...earlier]) => ({
          user_id: latest.user_id,
          current: entry(latest),
          stale_reasons: latest.action === "withdrawn" ? [] : staleReasons(latest.context, context),
          history: earlier.map(entry),
        }))
        .sort((a, b) => a.current.reviewed_at.localeCompare(b.current.reviewed_at));
      return { ...source, date: day.date, trip_day_id: day.id, context_key: contextKey(context), reviews };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
}

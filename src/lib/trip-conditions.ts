import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tripActivityLabel } from "@/lib/trip-activities";
import { dateLabel } from "@/lib/trip-lodging";
import { accessPointFor } from "@/lib/trip-location";
import type {
  TripConditionsContext,
  TripConditionsReview,
  TripConditionsReviewEntry,
  TripConditionsSource,
  TripConditionsSourceInput,
  TripConditionsSourcePreview,
  TripConditionsSourceUse,
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

/**
 * The day's plan and the source as they are now, which a review records and
 * goes stale against. record_trip_conditions_review (migration 031) builds the
 * same shape under the trip lock to check it, so change both together.
 */
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
export function canonical(value: unknown): string {
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
  if (!same(saved.activity, now.activity)) reasons.push(`Activity changed to ${now.activity ? tripActivityLabel(now.activity) : "none"}`);
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

/** Each person's entries for a source on a day, newest first, keyed by `<day id>:<source id>`. */
function entriesByListing(rows: ConditionsRows): Map<string, ReviewRow[]> {
  const listings = new Map<string, ReviewRow[]>();
  for (const row of [...rows.reviews].sort((a, b) => b.entry_number - a.entry_number)) {
    const key = `${row.trip_day_id}:${row.source_id}`;
    let list = listings.get(key);
    if (!list) listings.set(key, list = []);
    list.push(row);
  }
  return listings;
}

/** Everyone's review from their entries (newest first), with what changed since against the plan now. */
function reviewsFrom(entries: ReviewRow[], context: TripConditionsContext): TripConditionsReview[] {
  const byUser = new Map<string, ReviewRow[]>();
  for (const row of entries) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }
  return [...byUser.values()]
    .map(([latest, ...earlier]) => ({
      user_id: latest.user_id,
      current: entry(latest),
      stale_reasons: latest.action === "withdrawn" ? [] : staleReasons(latest.context, context),
      history: earlier.map(entry),
    }))
    .sort((a, b) => a.current.reviewed_at.localeCompare(b.current.reviewed_at));
}

const isRecorded = (review: TripConditionsReview) => review.current.action !== "withdrawn";

/**
 * Each day's sources, in date and category order, with everyone's current
 * review, its history and whether the plan changed since it was recorded.
 */
export function summarizeConditions(rows: ConditionsRows, full: Pick<TripFull, "stops" | "days" | "tour_plans">): TripDayConditionsSource[] {
  const days = new Map(full.days.map((day) => [day.id, day]));
  const sources = new Map(rows.sources.map((source) => [source.id, source]));
  const listings = entriesByListing(rows);
  return rows.attachments
    .filter((attachment) => days.has(attachment.trip_day_id) && sources.has(attachment.source_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((attachment) => {
      const day = days.get(attachment.trip_day_id)!, source = sources.get(attachment.source_id)!;
      const context = conditionsContext(full, day, source);
      const reviews = reviewsFrom(listings.get(`${day.id}:${source.id}`) ?? [], context);
      return { ...source, date: day.date, trip_day_id: day.id, context_key: contextKey(context), reviews };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
}

/** Every source on the trip, by type and name, with the dates it's listed on. */
export function summarizeConditionsSources(rows: ConditionsRows, full: Pick<TripFull, "days">): TripConditionsSourceUse[] {
  const dates = new Map(full.days.map((day) => [day.id, day.date]));
  return rows.sources
    .map((source) => ({
      ...source,
      dates: rows.attachments.flatMap((attachment) => attachment.source_id === source.id && dates.has(attachment.trip_day_id)
        ? [dates.get(attachment.trip_day_id)!] : []).sort(),
    }))
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name) || a.created_at.localeCompare(b.created_at));
}

const listed = (items: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(items);
const reviewsCount = (count: number) => `${count} ${count === 1 ? "review" : "reviews"}`;
type PreviewError = { error: string; status: 400 | 404 };

/**
 * What listing a source on `dates` does (#211): the days that don't list it
 * yet, and for each one any reviews recorded there before the source was
 * removed from it, which show again. Reviews never come from another day.
 */
export function previewConditionsAttach(
  rows: ConditionsRows,
  full: Pick<TripFull, "stops" | "days" | "tour_plans">,
  sourceId: string,
  dates: string[],
): TripConditionsSourcePreview | PreviewError {
  const source = rows.sources.find((candidate) => candidate.id === sourceId);
  if (!source) return { error: "This source isn't on the trip any more. Reload the trip.", status: 404 };
  const days = [...new Set(dates)].sort().map((date) => full.days.find((day) => day.date === date));
  if (days.some((day) => !day)) return { error: "Some of these days aren't on the trip any more. Reload the trip.", status: 404 };
  const listedOn = new Set(rows.attachments.filter((attachment) => attachment.source_id === source.id).map((attachment) => attachment.trip_day_id));
  const adding = days.filter((day): day is TripDay => !!day && !listedOn.has(day.id));
  const already = days.filter((day): day is TripDay => !!day && listedOn.has(day.id));
  const labels = (list: TripDay[]) => listed(list.map((day) => dateLabel(day.date)));
  if (adding.length === 0) return { error: `${source.name} is already listed on ${labels(already)}.`, status: 400 };
  const listings = entriesByListing(rows);
  return {
    source_id: source.id,
    revision: source.revision,
    summary: [
      `Lists ${source.name} on ${labels(adding)}.`,
      already.length > 0 && `${labels(already)} already ${already.length === 1 ? "lists" : "list"} it.`,
      "Reviews stay with the day they were recorded for, so none come from other days.",
    ].filter(Boolean).join(" "),
    days: adding.map((day) => {
      const earlier = reviewsFrom(listings.get(`${day.id}:${source.id}`) ?? [], conditionsContext(full, day, source)).filter(isRecorded);
      const changed = earlier.filter((review) => review.stale_reasons.length > 0).length;
      const marked = changed === 0 ? "" : changed === earlier.length ? (changed === 1 ? ", marked" : ", all marked") : `, ${changed} marked`;
      return {
        date: day.date, date_label: dateLabel(day.date),
        note: earlier.length === 0 ? "No review recorded for this day."
          : `${reviewsCount(earlier.length)} recorded here before it was removed ${earlier.length === 1 ? "shows" : "show"} again${
            marked && `${marked} Plan changed — review again`}.`,
      };
    }),
    expected_days: adding.map((day) => ({ date: day.date, day_id: day.id })),
  };
}

/**
 * Which days an edit to a source changes (#211): every day it's listed on. A
 * new link or area changes what each review was recorded against, so those
 * reviews say "Plan changed — review again"; a new name or type doesn't.
 */
export function previewConditionsEdit(
  full: Pick<TripFull, "conditions" | "conditions_sources">,
  sourceId: string,
  input: TripConditionsSourceInput,
): TripConditionsSourcePreview | PreviewError {
  const source = full.conditions_sources?.find((candidate) => candidate.id === sourceId);
  if (!source) return { error: "This source isn't on the trip any more. Reload the trip.", status: 404 };
  const listings = (full.conditions ?? []).filter((listing) => listing.id === source.id).sort((a, b) => a.date.localeCompare(b.date));
  const restales = input.url !== source.url || input.region !== source.region;
  const labels = listed(listings.map((listing) => dateLabel(listing.date)));
  return {
    source_id: source.id,
    revision: source.revision,
    summary: listings.length === 0 ? `${source.name} isn't listed on any day, so your change shows wherever it's listed next.`
      : [
        `Your change to ${source.name} applies to ${listings.length === 1 ? labels
          : `${listings.length === 2 ? "both" : `all ${listings.length}`} days it's listed on: ${labels}`}.`,
        restales ? "A new link or area changes what was reviewed, so reviews recorded for these days need recording again."
          : "The link and area stay the same, so reviews stay as recorded.",
      ].join(" "),
    days: listings.map((listing) => {
      // Reviews already marked Plan changed stay that way; the others change now.
      const current = listing.reviews.filter((review) => isRecorded(review) && review.stale_reasons.length === 0).length;
      return { date: listing.date, date_label: dateLabel(listing.date), note: restales && current > 0 ? `${reviewsCount(current)} to record again` : null };
    }),
    expected_days: listings.map((listing) => ({ date: listing.date, day_id: listing.trip_day_id })),
  };
}

/** Whether the days a source is listed on are the ones a review showed, as `{date, day_id}` in any order. */
export function sameDays(a: Array<{ date: string; day_id: string }>, b: Array<{ date: string; day_id: string }>): boolean {
  const key = (list: Array<{ date: string; day_id: string }>) => list.map((day) => `${day.date}:${day.day_id.toLowerCase()}`).sort().join(",");
  return key(a) === key(b);
}

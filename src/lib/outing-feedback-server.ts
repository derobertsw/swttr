import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeOptionalBodyMetrics } from "@/lib/biophysics/bodyMetrics";
import { kitAdvice, kitTimeZone } from "@/lib/trip-saved-kits";
import { isLocalDateTime, zonedTimeToInstant } from "@/lib/timeZones";
import {
  BARE_AREAS,
  FEEDBACK_BODY_AREAS,
  FEEDBACK_MOMENTS,
  FEEDBACK_OVERALL,
  GENERIC_WORN_ITEMS,
  type BareArea,
  type FeedbackAnswer,
  type FeedbackBodyArea,
  type FeedbackMoment,
  type FeedbackOverall,
  type GenericWornItem,
  type OutingFeedbackView,
  type WornItem,
  type WornOutfit,
} from "@/types/outingFeedback";
import type { TemperatureSensitivity } from "@/types/preferences";
import type { SavedKit } from "@/types/savedKit";

/**
 * Outing feedback (#8) on the server: checks what the browser sends, works out
 * when the outing started, and keeps the feedback with a snapshot of what it's
 * about. See docs/outing-feedback.md.
 */

const FEEDBACK_TABLE = "user_outing_feedback";
const MAX_WORN_ITEMS = 40;
const SENSITIVITIES: TemperatureSensitivity[] = ["hot", "neutral", "cold"];
/** Body metrics are kept in bands this wide, never exactly. */
const HEIGHT_BAND_INCHES = 4;
const WEIGHT_BAND_LBS = 20;

type Fields = Record<string, unknown>;
const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);

/** A list of distinct values from `allowed`, or null when it isn't one. */
function subset<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > allowed.length) return null;
  if (!value.every((entry) => allowed.includes(entry as T)) || new Set(value).size !== value.length) return null;
  // Kept in a fixed order, so the same answer is stored the same way.
  return allowed.filter((entry) => value.includes(entry));
}

function readWornItem(value: unknown): WornItem | null {
  if (!isObject(value) || !["suggested", "wardrobe", "generic"].includes(value.source as string)) return null;
  if (value.source === "generic") {
    const generic = value.generic as GenericWornItem;
    if (typeof generic !== "string" || !Object.hasOwn(GENERIC_WORN_ITEMS, generic)) return null;
    // A generic entry's name and body area are its own, whatever was sent.
    const { name, area } = GENERIC_WORN_ITEMS[generic];
    return { source: "generic", generic, name, area };
  }
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 200 || !FEEDBACK_BODY_AREAS.includes(value.area as FeedbackBodyArea)) return null;
  if (value.item_id !== undefined && (typeof value.item_id !== "string" || !/^[\w.:-]{1,100}$/.test(value.item_id))) return null;
  return {
    source: value.source as WornItem["source"],
    area: value.area as FeedbackBodyArea,
    name,
    ...(value.item_id !== undefined && { item_id: value.item_id as string }),
  };
}

function readWorn(value: unknown): WornOutfit | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) return undefined;
  if (value.as_suggested === true) return { as_suggested: true };
  if (value.as_suggested !== false || !Array.isArray(value.items) || value.items.length > MAX_WORN_ITEMS) return undefined;
  const items = value.items.map(readWornItem);
  const bare = subset<BareArea>(value.bare, BARE_AREAS);
  if (!items.every((item): item is WornItem => item !== null) || !bare) return undefined;
  // "No hat" with a hat on doesn't say what was worn.
  if (items.some((item) => (bare as FeedbackBodyArea[]).includes(item.area))) return undefined;
  if (items.length === 0 && bare.length === 0) return undefined;
  return { as_suggested: false, items, bare };
}

/**
 * The person's answer with only the fields it should have, or why it doesn't
 * check out. Where and when it felt off are only kept when it did: "just
 * right" has neither.
 */
export function readFeedbackAnswer(value: unknown): FeedbackAnswer | string {
  if (!isObject(value)) return "Say how the layers felt.";
  if (!FEEDBACK_OVERALL.includes(value.overall as FeedbackOverall)) return "Say whether you were too cold, just right or too warm.";
  const moments = subset<FeedbackMoment>(value.moments, FEEDBACK_MOMENTS);
  const bodyAreas = subset<FeedbackBodyArea>(value.body_areas, FEEDBACK_BODY_AREAS);
  if (!moments) return "Pick when it felt that way from the list.";
  if (!bodyAreas) return "Pick where it felt that way from the list.";
  const worn = readWorn(value.worn);
  if (worn === undefined) return "Say what you wore: the suggested layers, or at least one thing you wore instead.";
  const off = value.overall !== "just_right";
  return { overall: value.overall as FeedbackOverall, moments: off ? moments : [], body_areas: off ? bodyAreas : [], worn };
}

export function readSensitivity(value: unknown): TemperatureSensitivity | null | undefined {
  if (value === undefined || value === null) return null;
  return SENSITIVITIES.includes(value as TemperatureSensitivity) ? value as TemperatureSensitivity : undefined;
}

/** "HH:mm" of an ISO 8601 time with its offset, as the clock there read. */
const clockTime = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(11, 16) : null;

/**
 * When the outing started, on the trip day `date` (the kit's own date for
 * Gear up): a later outing at its time, a plan day at its first hour, and an
 * outing for now when its conditions were read. Without the place's time
 * zone, the latest the clock time could be anywhere (UTC−12), so it never
 * opens early. Null for an outing for now whose reading time isn't known: it
 * started when it was asked for.
 */
export function outingStartedAt(kit: SavedKit, date: string, fallbackZone?: string | null): number | null {
  let time: string | null;
  if (kit.kind === "plan_day") time = `${String(kit.startHour).padStart(2, "0")}:00`;
  else if (kit.outing.when.mode === "later") time = kit.outing.when.time;
  else {
    const context = kit.weather.context;
    const readAt = context?.source === "forecast" ? context.forecastTime : context?.provenance?.observedTime;
    // An outing for now on the day it was read started then; moved to another day, at the same time of day.
    if (readAt && readAt.slice(0, 10) === date && Number.isFinite(Date.parse(readAt))) return Date.parse(readAt);
    time = clockTime(readAt);
    if (!time) return null;
  }
  const local = `${date}T${time}`;
  if (!isLocalDateTime(local)) return null;
  const zone = kitTimeZone(kit) ?? fallbackZone ?? null;
  return zone ? zonedTimeToInstant(local, zone) : Date.parse(`${local}:00-12:00`);
}

/** The person's warm/cold preference and coarse body size now, from their saved preferences; unknown when they can't be read. */
export async function readPreferenceContext(supabase: SupabaseClient, userId: string) {
  try {
    const { data, error } = await supabase.from("user_preferences")
      .select("temperature_sensitivity, height_inches, weight_lbs").eq("user_id", userId).maybeSingle();
    if (error || !data) return { sensitivity: null, height_band_in: null, weight_band_lb: null };
    const metrics = sanitizeOptionalBodyMetrics({ heightInches: data.height_inches, weightLbs: data.weight_lbs });
    const band = (value: number | undefined, width: number) => value === undefined ? null : Math.floor(value / width) * width;
    return {
      sensitivity: readSensitivity(data.temperature_sensitivity) ?? null,
      height_band_in: band(metrics.heightInches, HEIGHT_BAND_INCHES),
      weight_band_lb: band(metrics.weightLbs, WEIGHT_BAND_LBS),
    };
  } catch {
    return { sensitivity: null, height_band_in: null, weight_band_lb: null };
  }
}

type PreferenceContext = Awaited<ReturnType<typeof readPreferenceContext>>;

/** The kit as it was shown, without the place's name or coordinates: only its region and country. */
function withoutPlace(kit: SavedKit): SavedKit {
  const { place } = kit.outing;
  const coarse = { region: place.region ?? null, country: place.country || null };
  const outing = { ...kit.outing, place: coarse } as unknown as SavedKit["outing"];
  if (kit.kind === "plan_day") return { ...kit, outing } as SavedKit;
  const weather = { ...kit.weather, ...(kit.weather.context && { context: { ...kit.weather.context } }) };
  delete weather.context?.place;
  return { ...kit, outing, weather } as SavedKit;
}

/** The conditions the layers were for, without where. A plan day's are its summary, for its coldest part. */
function weatherSnapshot(kit: SavedKit) {
  const time_zone = kitTimeZone(kit) ?? null;
  if (kit.kind === "plan_day") {
    const { minTemp, maxTemp, maxWindSpeed, maxPrecipProbability, effectiveTemperature } = kit.day.baseline;
    return {
      kind: "day_summary", min_temp_f: minTemp, max_temp_f: maxTemp, max_wind_mph: maxWindSpeed,
      max_precip_probability: maxPrecipProbability, effective_temperature_f: effectiveTemperature,
      start_hour: kit.startHour, end_hour: kit.endHour, time_zone,
    };
  }
  const { weather } = kit;
  const context = weather.context;
  return {
    kind: "reading", temperature_f: weather.temperature, wind_mph: weather.windSpeed,
    precipitation: weather.precipitation ?? null, precipitation_type: weather.precipitationType ?? null,
    source: context?.source ?? null,
    time: (context?.source === "forecast" ? context.forecastTime : context?.provenance?.observedTime) ?? null,
    time_zone,
  };
}

interface FeedbackRecordInput {
  userId: string;
  source: "gear_up" | "trip_kit";
  sourceKey: string;
  kit: SavedKit;
  /** The day the outing was on: the trip day's, or the kit's own. */
  date: string;
  tripId?: string | null;
  answer: FeedbackAnswer;
  /** The preference the layers were asked with, when known (Gear up results record it; saved kits don't). */
  sensitivityAtRecommendation: TemperatureSensitivity | null;
  preferences: PreferenceContext;
  startedAt: number | null;
  /** When the layers were worked out: when the kit was saved, or the result's reading. */
  recommendedAt: number | null;
  now: number;
}

/** The row kept for one piece of feedback. */
export function feedbackRecord(input: FeedbackRecordInput) {
  const { kit, answer, preferences, startedAt, recommendedAt, now } = input;
  const { when } = kit.outing;
  const weather = weatherSnapshot(kit);
  const iso = (instant: number | null) => instant === null ? null : new Date(instant).toISOString();
  return {
    user_id: input.userId,
    source: input.source,
    source_key: input.sourceKey,
    trip_id: input.tripId ?? null,
    trip_date: input.date,
    activity: kit.outing.activity,
    exertion: kit.outing.exertion,
    advice_kind: kitAdvice(kit).kind,
    temperature_f: weather.kind === "reading" ? weather.temperature_f : weather.min_temp_f,
    wind_mph: weather.kind === "reading" ? weather.wind_mph : weather.max_wind_mph,
    overall: answer.overall,
    moments: answer.moments,
    body_areas: answer.body_areas,
    worn: answer.worn,
    recommended: withoutPlace(kit),
    weather,
    context: {
      outing: {
        mode: when.mode,
        ...(when.mode === "later" && { date: when.date, time: when.time, duration_days: when.durationDays }),
        ...(kit.outing.outingPattern && { outing_pattern: kit.outing.outingPattern }),
        ...(kit.outing.xcExposure && { xc_exposure: kit.outing.xcExposure }),
        ...(kit.kind === "plan_day" && { plan_day: kit.day.date }),
      },
      place: { region: kit.outing.place.region ?? null, country: kit.outing.place.country || null },
      preference: { at_recommendation: input.sensitivityAtRecommendation, at_feedback: preferences.sensitivity },
      body: { height_band_in: preferences.height_band_in, weight_band_lb: preferences.weight_band_lb },
      minutes_after_start: startedAt === null ? null : Math.round((now - startedAt) / 60_000),
    },
    outing_started_at: iso(startedAt),
    recommended_at: iso(recommendedAt),
    app_version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}

type FeedbackRow = ReturnType<typeof feedbackRecord> & { updated_at: string };

function feedbackView(row: Pick<FeedbackRow, "overall" | "moments" | "body_areas" | "worn" | "updated_at">): OutingFeedbackView {
  return { overall: row.overall, moments: row.moments ?? [], body_areas: row.body_areas ?? [], worn: row.worn ?? null, updated_at: row.updated_at };
}

const VIEW_COLUMNS = "overall, moments, body_areas, worn, updated_at";
const missingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

type FeedbackWrite =
  | { status: "saved"; feedback: OutingFeedbackView }
  // Its migration isn't applied yet.
  | { status: "unavailable" }
  | { status: "failed" };

/**
 * Keeps the feedback, or replaces the person's earlier answer about the same
 * thing: one row per person and source key, so a repeat or a correction
 * never adds another.
 */
export async function saveFeedback(supabase: SupabaseClient, record: ReturnType<typeof feedbackRecord>): Promise<FeedbackWrite> {
  const { data, error } = await supabase.from(FEEDBACK_TABLE)
    .upsert(record, { onConflict: "user_id,source_key" }).select(VIEW_COLUMNS).single();
  if (error) return missingTable(error.code) ? { status: "unavailable" } : { status: "failed" };
  return { status: "saved", feedback: feedbackView(data as FeedbackRow) };
}

type FeedbackRead =
  | { status: "found"; feedback: OutingFeedbackView | null }
  | { status: "unavailable" }
  | { status: "failed" };

export async function loadFeedback(supabase: SupabaseClient, userId: string, sourceKey: string): Promise<FeedbackRead> {
  const { data, error } = await supabase.from(FEEDBACK_TABLE)
    .select(VIEW_COLUMNS).eq("user_id", userId).eq("source_key", sourceKey).maybeSingle();
  if (error) return missingTable(error.code) ? { status: "unavailable" } : { status: "failed" };
  return { status: "found", feedback: data ? feedbackView(data as FeedbackRow) : null };
}

/** One saved trip kit, as it was saved: a replaced kit is asked about again. */
export function tripKitSourceKey(kitId: string, savedAt: string | null | undefined): string {
  const saved = savedAt && Number.isFinite(Date.parse(savedAt)) ? new Date(savedAt).toISOString() : "unknown";
  return `trip_kit:${kitId}:${saved}`;
}

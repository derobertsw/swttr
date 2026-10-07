/**
 * Save to trip (#170): checks what the browser sends and works out what the
 * save means for the trip, on the server. See docs/trip-saved-kits.md.
 */
import { EXERTION_LEVELS, type ExertionLevel } from "@/lib/biophysics/exertion";
import { diffRecommendations } from "@/lib/planAhead";
import { formatZonedTime, isLocalDateTime, isTimeZone } from "@/lib/timeZones";
import { tripActivityFromRecommendationKey } from "@/lib/trip-activities";
import { readWeatherProvenance } from "@/lib/weatherProvenance";
import type { ThermalDecision } from "@/types/biophysics";
import type { Outing, OutingTime, PersonalizationGap } from "@/types/outing";
import type { LayerItem, LayerSet, LocationSuggestion, Recommendation } from "@/types/recommendations";
import type { SaveKitPhaseChanges, SavedKitAdvice, SavedKitPhase, SavedKitPhaseId, SavedOutfit } from "@/types/savedKit";
import type { TripEffort, TripMemberDayKit } from "@/types/trips";
import type { WeatherContext, WeatherData } from "@/types/weather";
import { BODY_PARTS } from "@/types/wardrobe";

type Fields = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAPS: PersonalizationGap[] = ["unsupported", "auth_required", "no_gear", "unavailable"];
const MAX_ITEMS_PER_LAYER = 12;
const MAX_CARRY = 30;

const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max = 200): string | null =>
  typeof value === "string" && value.trim() && value.length <= max ? value : null;
const optionalText = (value: unknown, max = 200): string | undefined | null =>
  value === undefined ? undefined : text(value, max);

/** A real calendar date as "yyyy-MM-dd". */
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isLocalDateTime(`${value}T00:00`);
}

/** An ISO 8601 time with its offset, like a forecast hour: "2026-10-10T09:00-04:00". */
function isOffsetTime(value: unknown): value is string {
  return typeof value === "string" && isLocalDateTime(value.slice(0, 16))
    && /^(Z|[+-]\d{2}:\d{2})$/.test(value.slice(16)) && Number.isFinite(Date.parse(value));
}

function readPlace(value: unknown): LocationSuggestion | null {
  if (!isObject(value)) return null;
  const name = text(value.name);
  const region = optionalText(value.region);
  const country = typeof value.country === "string" && value.country.length <= 200 ? value.country : null;
  if (!name || region === null || country === null || !isNumber(value.id)
    || !isNumber(value.latitude) || Math.abs(value.latitude) > 90
    || !isNumber(value.longitude) || Math.abs(value.longitude) > 180) return null;
  if (value.timeZone !== undefined && !isTimeZone(value.timeZone)) return null;
  return {
    id: value.id, name, country, latitude: value.latitude, longitude: value.longitude,
    ...(region !== undefined && { region }),
    ...(value.timeZone !== undefined && { timeZone: value.timeZone as string }),
  };
}

function readWhen(value: unknown): OutingTime | null {
  if (!isObject(value)) return null;
  if (value.mode === "now") return { mode: "now" };
  if (value.mode !== "later" || !isIsoDate(value.date) || typeof value.time !== "string"
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) || !Number.isInteger(value.durationDays)
    || Number(value.durationDays) < 1 || Number(value.durationDays) > 7) return null;
  return { mode: "later", date: value.date, time: value.time, durationDays: Number(value.durationDays) };
}

function readOuting(value: unknown): Outing | null {
  if (!isObject(value) || typeof value.activity !== "string" || !tripActivityFromRecommendationKey(value.activity)
    || !EXERTION_LEVELS.includes(value.exertion as ExertionLevel)) return null;
  const place = readPlace(value.place);
  const when = readWhen(value.when);
  if (!place || !when) return null;
  return { activity: value.activity, exertion: value.exertion as ExertionLevel, place, when };
}

function readContext(value: unknown): WeatherContext | undefined | null {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;
  const place = optionalText(value.place, 400);
  if (place === null) return null;
  const provenance = readWeatherProvenance(value.provenance);
  const shared = { ...(place !== undefined && { place }), ...(provenance && { provenance }) };
  if (value.source === "current") return { source: "current", ...shared };
  if (value.source === "forecast" && isOffsetTime(value.forecastTime) && isTimeZone(value.timeZone)) {
    return { source: "forecast", forecastTime: value.forecastTime, timeZone: value.timeZone, ...shared };
  }
  return null;
}

function readWeather(value: unknown): WeatherData | null {
  if (!isObject(value) || !isNumber(value.temperature) || !isNumber(value.windSpeed)) return null;
  if (value.precipitation !== undefined && typeof value.precipitation !== "boolean") return null;
  if (value.precipitationType !== undefined && !["rain", "snow", "mixed"].includes(value.precipitationType as string)) return null;
  const context = readContext(value.context);
  if (context === null) return null;
  return {
    temperature: value.temperature,
    windSpeed: value.windSpeed,
    ...(value.precipitation !== undefined && { precipitation: value.precipitation as boolean }),
    ...(value.precipitationType !== undefined && { precipitationType: value.precipitationType as WeatherData["precipitationType"] }),
    ...(context && { context }),
  };
}

function readItem(value: unknown): LayerItem | null {
  if (!isObject(value)) return null;
  const name = text(value.name);
  const sourceId = optionalText(value.sourceId);
  const brand = value.brand === "" ? undefined : optionalText(value.brand);
  if (!name || sourceId === null || brand === null) return null;
  if (value.rcl !== undefined && (!isNumber(value.rcl) || value.rcl < 0 || value.rcl > 10)) return null;
  if ((value.isRecommended !== undefined && typeof value.isRecommended !== "boolean")
    || (value.isGeneric !== undefined && typeof value.isGeneric !== "boolean")) return null;
  return {
    name,
    ...(value.rcl !== undefined && { rcl: value.rcl as number }),
    ...(sourceId !== undefined && { sourceId }),
    ...(brand !== undefined && { brand }),
    ...(value.isRecommended !== undefined && { isRecommended: value.isRecommended as boolean }),
    ...(value.isGeneric !== undefined && { isGeneric: value.isGeneric as boolean }),
  };
}

function readItems(value: unknown): LayerItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS_PER_LAYER) return null;
  const items = value.map(readItem);
  return items.every((item): item is LayerItem => item !== null) ? items : null;
}

function readWear(value: unknown): Recommendation | null {
  if (!isObject(value)) return null;
  const wear: Partial<Recommendation> = {};
  for (const bodyPart of BODY_PARTS) {
    const layers = value[bodyPart];
    if (!isObject(layers)) return null;
    const base = readItems(layers.base);
    const outer = readItems(layers.outer);
    const mid = layers.mid === undefined ? undefined : readItems(layers.mid);
    if (!base || !outer || mid === null) return null;
    wear[bodyPart] = { base, outer, ...(mid !== undefined && { mid }) } satisfies LayerSet;
  }
  return wear as Recommendation;
}

function readDecision(value: unknown): ThermalDecision | null | undefined {
  if (value === null) return null;
  if (!isObject(value) || !["comfortable", "cold", "overheat"].includes(value.riskType as string)
    || !["moderate", "high"].includes(value.severity as string) || !isNumber(value.delta)) return undefined;
  return { riskType: value.riskType as ThermalDecision["riskType"], severity: value.severity as ThermalDecision["severity"], delta: value.delta };
}

function readPhase(value: unknown): SavedKitPhase | null {
  if (!isObject(value) || !["outing", "climb", "descent"].includes(value.id as string)) return null;
  const wear = readWear(value.wear);
  const decision = readDecision(value.decision);
  if (!wear || decision === undefined || !Array.isArray(value.carry) || value.carry.length > MAX_CARRY) return null;
  const carry = value.carry.map((item) => text(item));
  if (!carry.every((item): item is string => item !== null)) return null;
  return { id: value.id as SavedKitPhaseId, wear, carry, decision };
}

function readAdvice(value: unknown): SavedKitAdvice | null {
  if (!isObject(value)) return null;
  if (value.kind === "personalized") return { kind: "personalized" };
  if (value.kind === "general" && GAPS.includes(value.reason as PersonalizationGap)) {
    return { kind: "general", reason: value.reason as PersonalizationGap };
  }
  return null;
}

/** The outfit with only the fields it should have, or null when any don't check out. */
export function readSavedOutfit(value: unknown): SavedOutfit | null {
  if (!isObject(value) || value.version !== 1 || typeof value.edited !== "boolean" || !Array.isArray(value.phases)) return null;
  const outing = readOuting(value.outing);
  const weather = readWeather(value.weather);
  const advice = readAdvice(value.advice);
  const phases = value.phases.map(readPhase);
  if (!outing || !weather || !advice || !phases.every((phase): phase is SavedKitPhase => phase !== null)) return null;
  const ids = phases.map((phase) => phase.id).join(",");
  // A ski tour saves its climb and descent; anything else one outfit.
  if (ids !== "outing" && !(ids === "climb,descent" && outing.activity === "backcountry_skiing")) return null;
  return { version: 1, outing, weather, advice, phases, edited: value.edited };
}

interface ParsedSaveKit {
  saveId: string;
  tripId: string;
  /** Present when the save makes a new trip. */
  newTripName?: string;
  outfit: SavedOutfit;
  replace: Record<string, string>;
}

/** Checks a save request; a string says what's wrong with it. */
export function parseSaveKitRequest(body: unknown): ParsedSaveKit | string {
  if (!isObject(body)) return "Nothing to save.";
  if (typeof body.save_id !== "string" || !NEW_UUID.test(body.save_id)) return "Invalid save identity. Try saving again.";
  const target = body.target;
  let tripId: string;
  let newTripName: string | undefined;
  if (isObject(target) && typeof target.trip_id === "string" && UUID.test(target.trip_id)) {
    tripId = target.trip_id;
  } else if (isObject(target) && isObject(target.new_trip) && typeof target.new_trip.id === "string" && NEW_UUID.test(target.new_trip.id)) {
    const name = typeof target.new_trip.name === "string" ? target.new_trip.name.trim() : "";
    if (!name || name.length > 200) return "Trip name must be 1–200 characters.";
    tripId = target.new_trip.id;
    newTripName = name;
  } else {
    return "Choose a trip to save to.";
  }
  const outfit = readSavedOutfit(body.outfit);
  if (!outfit) return "This outing's layers can't be saved. Get layers again and retry.";
  const replace: Record<string, string> = {};
  if (body.replace !== undefined) {
    if (!isObject(body.replace)) return "Invalid replacement.";
    for (const [date, version] of Object.entries(body.replace)) {
      if (!isIsoDate(date) || !isOffsetTimestamp(version)) return "Invalid replacement.";
      replace[date] = version;
    }
  }
  return { saveId: body.save_id, tripId, ...(newTripName !== undefined && { newTripName }), outfit, replace };
}

/** A kit's `updated_at` as the database sends it, passed back unchanged so no precision is lost. */
function isOffsetTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$/.test(value) && Number.isFinite(Date.parse(value));
}

/**
 * The trip date the outfit is for, on the destination's calendar: a later
 * outing's date, or for now, the date there when the conditions were read.
 * Null when the place's calendar can't be told.
 */
export function outfitDate(outfit: SavedOutfit, now = Date.now()): string | null {
  const { when, place } = outfit.outing;
  if (when.mode === "later") return when.date;
  const context = outfit.weather.context;
  if (context?.source === "forecast") return context.forecastTime.slice(0, 10);
  const observed = context?.provenance?.observedTime;
  if (observed) return observed.slice(0, 10);
  const zone = context?.provenance?.timeZone ?? place.timeZone;
  return zone ? formatZonedTime(now, zone).slice(0, 10) : null;
}

/**
 * Today on the destination's calendar, so a trip made by the save is
 * classified (planning, live, past) by the same calendar as its date.
 * Undefined when the place's time zone isn't known.
 */
export function destinationToday(outfit: SavedOutfit, now = Date.now()): string | undefined {
  if (outfit.outing.when.mode === "now") return outfitDate(outfit, now) ?? undefined;
  const context = outfit.weather.context;
  const zone = (context?.source === "forecast" ? context.timeZone : undefined)
    ?? context?.provenance?.timeZone ?? outfit.outing.place.timeZone;
  return zone ? formatZonedTime(now, zone).slice(0, 10) : undefined;
}

const EFFORT: Record<ExertionLevel, TripEffort> = { easy: "easy", moderate: "steady", hard: "hard" };

/** The trip effort for a Gear up effort. */
export function tripEffort(exertion: ExertionLevel): TripEffort {
  return EFFORT[exertion];
}

/** The outing's place as a trip destination; the device's own location is named by its coordinates. */
export function tripDestination(place: LocationSuggestion): { name: string; latitude: number; longitude: number } {
  const deviceLocation = place.id === 0 && !place.country;
  const name = deviceLocation
    ? `Near ${place.latitude.toFixed(2)}, ${place.longitude.toFixed(2)}`
    : [place.name, place.region || place.country].filter(Boolean).join(", ");
  return { name: name.slice(0, 200), latitude: place.latitude, longitude: place.longitude };
}

/**
 * What changes from a saved kit's outfit to a new one, phase by phase (a ski
 * tour's climb and descent); null when the saved kit is a checklist. A phase
 * the saved outfit doesn't have is compared with its first.
 */
export function kitChanges(kit: Pick<TripMemberDayKit, "outfit">, next: SavedOutfit): SaveKitPhaseChanges[] | null {
  const saved = kit.outfit;
  if (!saved?.phases?.length) return null;
  return next.phases.map((phase) => {
    const before = saved.phases.find((candidate) => candidate.id === phase.id) ?? saved.phases[0];
    return { phase: phase.id, ...(diffRecommendations(before.wear, phase.wear) ?? { add: [], remove: [] }) };
  });
}

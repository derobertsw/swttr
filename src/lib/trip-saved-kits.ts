/**
 * Save to trip (#170): checks what the browser sends and works out what the
 * save means for the trip, on the server, and reads saved kits wherever
 * they're shown. See docs/trip-saved-kits.md.
 */
import { EXERTION_LEVELS, type ExertionLevel } from "@/lib/biophysics/exertion";
import { addDaysToDateString } from "@/lib/forecastRange";
import { diffRecommendations } from "@/lib/planAhead";
import { formatZonedTime, isLocalDateTime, isTimeZone } from "@/lib/timeZones";
import { tripActivityFromRecommendationKey } from "@/lib/trip-activities";
import { readWeatherProvenance } from "@/lib/weatherProvenance";
import type { ThermalDecision } from "@/types/biophysics";
import type { Outing, OutingTime, PersonalizationGap } from "@/types/outing";
import type { DailyLayerPlan, DaypartId, DaypartLayerPlan, LayerChanges, PlanLayerItem } from "@/types/plan";
import type { LayerItem, LayerSet, LocationSuggestion, Recommendation } from "@/types/recommendations";
import type {
  MultiDayOuting,
  SaveKitChangePart,
  SaveKitPhaseChanges,
  SavedKit,
  SavedKitAdvice,
  SavedKitPhase,
  SavedKitPhaseId,
  SavedOutfit,
  SavedPlan,
  SavedPlanDay,
} from "@/types/savedKit";
import type { TripEffort, TripMemberDayKit } from "@/types/trips";
import type { WeatherContext, WeatherData } from "@/types/weather";
import { BODY_PARTS, type LayerType } from "@/types/wardrobe";

type Fields = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEW_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAPS: PersonalizationGap[] = ["unsupported", "auth_required", "no_gear", "unavailable"];
const MAX_ITEMS_PER_LAYER = 12;
const MAX_CARRY = 30;
const MAX_CHANGES = 40;
const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];
const DAYPART_IDS: DaypartId[] = ["morning", "midday", "evening"];

const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max = 200): string | null =>
  typeof value === "string" && value.trim() && value.length <= max ? value : null;
const optionalText = (value: unknown, max = 200): string | undefined | null =>
  value === undefined ? undefined : text(value, max);
const isHour = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 23;

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

function readPlanItem(value: unknown): PlanLayerItem | null {
  if (!isObject(value) || !BODY_PARTS.includes(value.bodyPart as PlanLayerItem["bodyPart"])
    || !LAYER_TYPES.includes(value.layerType as LayerType)) return null;
  const name = text(value.name);
  return name ? { bodyPart: value.bodyPart as PlanLayerItem["bodyPart"], layerType: value.layerType as LayerType, name } : null;
}

/** What to put on and take off, or null for none; undefined when it doesn't check out. */
function readChanges(value: unknown): LayerChanges | null | undefined {
  if (value === null) return null;
  if (!isObject(value) || !Array.isArray(value.add) || !Array.isArray(value.remove)
    || value.add.length > MAX_CHANGES || value.remove.length > MAX_CHANGES) return undefined;
  const add = value.add.map(readPlanItem);
  const remove = value.remove.map(readPlanItem);
  if (!add.every((item): item is PlanLayerItem => item !== null) || !remove.every((item): item is PlanLayerItem => item !== null)) return undefined;
  return { add, remove };
}

/** The conditions a plan day or daypart summarizes, or null when they don't check out. */
function readSummary(value: Fields) {
  const { minTemp, maxTemp, maxWindSpeed, maxPrecipProbability, effectiveTemperature } = value;
  if (!isNumber(minTemp) || !isNumber(maxTemp) || !isNumber(maxWindSpeed) || !isNumber(maxPrecipProbability)
    || !isNumber(effectiveTemperature) || minTemp > maxTemp) return null;
  return { minTemp, maxTemp, maxWindSpeed, maxPrecipProbability, effectiveTemperature };
}

function readDaypart(value: unknown): DaypartLayerPlan | null {
  if (!isObject(value) || !DAYPART_IDS.includes(value.id as DaypartId)) return null;
  const label = text(value.label, 40);
  const timeRangeLabel = text(value.timeRangeLabel, 40);
  const summary = readSummary(value);
  const recommendation = value.recommendation === null ? null : readWear(value.recommendation);
  const changes = readChanges(value.changes);
  if (!label || !timeRangeLabel || !summary || recommendation === undefined
    || (value.recommendation !== null && !recommendation) || changes === undefined) return null;
  return { id: value.id as DaypartId, label, timeRangeLabel, ...summary, recommendation, changes };
}

/** A plan day with layers as it was shown, without the changes from the day before. */
function readPlanDay(value: unknown): DailyLayerPlan | null {
  if (!isObject(value) || !isIsoDate(value.date) || !isObject(value.baseline) || !Array.isArray(value.dayparts)
    || value.dayparts.length > DAYPART_IDS.length || !Array.isArray(value.carryItems) || value.carryItems.length > MAX_CARRY) return null;
  const label = text(value.label, 40);
  const summary = readSummary(value.baseline);
  const recommendation = readWear(value.baseline.recommendation);
  const dayparts = value.dayparts.map(readDaypart);
  const carryItems = value.carryItems.map((item) => text(item));
  if (!label || !summary || !recommendation || !dayparts.every((part): part is DaypartLayerPlan => part !== null)
    || !carryItems.every((item): item is string => item !== null)) return null;
  return { date: value.date, label, baseline: { ...summary, recommendation }, changesFromPreviousDay: null, dayparts, carryItems };
}

/** The plan with only the fields it should have, or null when any don't check out. */
export function readSavedPlan(value: unknown): SavedPlan | null {
  if (!isObject(value) || value.version !== 1 || value.kind !== "plan" || !isHour(value.dayStartHour) || !isHour(value.dayEndHour)
    || !isHour(value.firstDayStartHour) || !Array.isArray(value.days) || value.days.length === 0 || value.days.length > 7) return null;
  const outing = readOuting(value.outing);
  if (!outing || outing.when.mode !== "later" || outing.when.durationDays < 2) return null;
  const first = outing.when.date;
  const last = addDaysToDateString(first, outing.when.durationDays - 1);
  const days = value.days.map(readPlanDay);
  if (!days.every((day): day is DailyLayerPlan => day !== null)) return null;
  // Days with layers, in order, within the outing's dates.
  if (days.some((day, index) => day.date < first || day.date > last || (index > 0 && day.date <= days[index - 1].date))) return null;
  const provenance = readWeatherProvenance(value.provenance);
  return {
    version: 1,
    kind: "plan",
    outing: outing as MultiDayOuting,
    ...(provenance && { provenance }),
    dayStartHour: value.dayStartHour,
    dayEndHour: value.dayEndHour,
    firstDayStartHour: value.firstDayStartHour,
    days,
  };
}

interface ParsedSaveKit {
  saveId: string;
  tripId: string;
  /** Present when the save makes a new trip. */
  newTripName?: string;
  /** A one-day outing's outfit, or a multi-day plan. */
  source: SavedOutfit | SavedPlan;
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
  const source = readSaveSource(body);
  if (!source) return "This outing's layers can't be saved. Get layers again and retry.";
  const replace: Record<string, string> = {};
  if (body.replace !== undefined) {
    if (!isObject(body.replace)) return "Invalid replacement.";
    for (const [date, version] of Object.entries(body.replace)) {
      if (!isIsoDate(date) || !isOffsetTimestamp(version)) return "Invalid replacement.";
      replace[date] = version;
    }
  }
  return { saveId: body.save_id, tripId, ...(newTripName !== undefined && { newTripName }), source, replace };
}

/** The `outfit` or `plan` a request asks to save, or null when it has neither, both, or one that doesn't check out. */
export function readSaveSource(body: unknown): SavedOutfit | SavedPlan | null {
  if (!isObject(body) || (body.outfit === undefined) === (body.plan === undefined)) return null;
  return body.plan === undefined ? readSavedOutfit(body.outfit) : readSavedPlan(body.plan);
}

/** A kit's `updated_at` as the database sends it, passed back unchanged so no precision is lost. */
function isOffsetTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)$/.test(value) && Number.isFinite(Date.parse(value));
}

/**
 * The trip date the outfit is for, on the destination's calendar: a later
 * outing's date, or for now, the date there when the conditions were read.
 * Null when that can't be told. It never comes from the server's clock, so a
 * retried save asks for the same date.
 */
export function outfitDate(outfit: SavedOutfit): string | null {
  const { when } = outfit.outing;
  if (when.mode === "later") return when.date;
  const context = outfit.weather.context;
  if (context?.source === "forecast") return context.forecastTime.slice(0, 10);
  return context?.provenance?.observedTime?.slice(0, 10) ?? null;
}

/** The destination's time zone, as the forecast or the place reported it; undefined when neither did. */
function kitTimeZone(kit: SavedKit | SavedPlan): string | undefined {
  if (kit.kind === "plan" || kit.kind === "plan_day") return kit.provenance?.timeZone ?? kit.outing.place.timeZone;
  const context = kit.weather.context;
  return (context?.source === "forecast" ? context.timeZone : undefined)
    ?? context?.provenance?.timeZone ?? kit.outing.place.timeZone;
}

/**
 * Today on the destination's calendar, so a trip made by the save is
 * classified (planning, live, past) by the same calendar as its date.
 * Undefined when the place's time zone isn't known.
 */
export function destinationToday(source: SavedOutfit | SavedPlan, now = Date.now()): string | undefined {
  if (source.outing.when.mode === "now" && source.kind !== "plan") return outfitDate(source) ?? undefined;
  const zone = kitTimeZone(source);
  return zone ? formatZonedTime(now, zone).slice(0, 10) : undefined;
}

/** A plan's days as the kits saved for them. */
export function planDayKits(plan: SavedPlan): Array<{ date: string; kit: SavedPlanDay }> {
  return plan.days.map((day) => ({
    date: day.date,
    kit: {
      version: 1,
      kind: "plan_day",
      outing: plan.outing,
      ...(plan.provenance && { provenance: plan.provenance }),
      startHour: day.date === plan.outing.when.date ? plan.firstDayStartHour : plan.dayStartHour,
      endHour: plan.dayEndHour,
      day: { ...day, changesFromPreviousDay: null },
    },
  }));
}

/**
 * What a save makes: the kit for each trip date, and a new trip's first and
 * last dates, which span the whole outing. Null when an outing's date at its
 * place can't be told.
 */
export function kitsToSave(source: SavedOutfit | SavedPlan): {
  kits: Array<{ date: string; kit: SavedKit }>;
  startDate: string;
  endDate: string;
} | null {
  if (source.kind === "plan") {
    const { when } = source.outing;
    return { kits: planDayKits(source), startDate: when.date, endDate: addDaysToDateString(when.date, when.durationDays - 1) };
  }
  const date = outfitDate(source);
  return date ? { kits: [{ date, kit: source }], startDate: date, endDate: date } : null;
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
 * What a saved kit has worn, part by part: a ski tour's climb and descent, or
 * one outfit. A plan day's outfit, for its coldest part, comes first, then
 * each daypart's layers.
 */
export function kitWear(kit: SavedKit): Array<{ id: SaveKitChangePart; wear: Recommendation }> {
  if (kit.kind === "plan_day") {
    const wear = kit.day?.baseline?.recommendation;
    if (!wear) return [];
    const dayparts = (kit.day.dayparts ?? []).flatMap((daypart) =>
      daypart.recommendation ? [{ id: daypart.id, wear: daypart.recommendation }] : []);
    return [{ id: "outing", wear }, ...dayparts];
  }
  return kit.phases ?? [];
}

/** Whether a saved kit's layers are personalized, and why not when they aren't. */
export function kitAdvice(kit: SavedKit): SavedKitAdvice {
  return kit.kind === "plan_day" ? { kind: "general", reason: "multi_day" } : kit.advice;
}

/** Changes as a comparable key, whatever order their items are in. */
function changesKey({ add, remove }: LayerChanges): string {
  const keys = (items: PlanLayerItem[]) => items.map((item) => `${item.bodyPart}:${item.layerType}:${item.name}`).sort();
  return JSON.stringify([keys(add), keys(remove)]);
}

/**
 * What changes from a saved kit's outfit to a new one, part by part (a ski
 * tour's climb and descent, a plan day's dayparts); null when the saved kit
 * is a checklist. A part the saved kit doesn't have is compared with its
 * first. A daypart is listed only when it changes, and differently from the
 * whole day.
 */
export function kitChanges(kit: Pick<TripMemberDayKit, "outfit">, next: SavedKit): SaveKitPhaseChanges[] | null {
  const saved = kit.outfit ? kitWear(kit.outfit) : [];
  if (!saved.length) return null;
  const changes = kitWear(next).map((part) => {
    const before = saved.find((candidate) => candidate.id === part.id) ?? saved[0];
    return { phase: part.id, ...(diffRecommendations(before.wear, part.wear) ?? { add: [], remove: [] }) };
  });
  const whole = changes[0] && changesKey(changes[0]);
  return changes.filter((part, index) => index === 0 || !DAYPART_IDS.includes(part.phase as DaypartId)
    || ((part.add.length > 0 || part.remove.length > 0) && changesKey(part) !== whole));
}

/** The trip date a saved kit was planned for: its outing's, or its plan day's. */
export function kitDate(kit: SavedKit): string | null {
  return kit.kind === "plan_day" ? kit.day.date : outfitDate(kit);
}

/** Whole days from one "yyyy-MM-dd" date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The outing to ask Gear up for again to update a kit on the trip day
 * `date`, on the destination's calendar; null once that day has passed there,
 * or when the destination's time zone isn't known, so the viewer's own
 * calendar never stands in for it.
 *
 * When the trip's dates have moved since the kit was saved, the outing moves
 * with its day: a later outing to the day's date, a plan by as many days, and
 * an outing for now, on a later day, to the same time of day it was read at.
 * A plan that started before today is asked for from today on.
 */
export function outingToUpdate(kit: SavedKit, date: string, now = Date.now()): Outing | null {
  const zone = kitTimeZone(kit);
  const planned = kitDate(kit);
  if (!zone || !planned) return null;
  const today = formatZonedTime(now, zone).slice(0, 10);
  if (date < today) return null;
  if (kit.kind === "plan_day") {
    const { when } = kit.outing;
    const start = addDaysToDateString(when.date, daysBetween(planned, date));
    const end = addDaysToDateString(start, when.durationDays - 1);
    const from = start < today ? today : start;
    return { ...kit.outing, when: { ...when, date: from, durationDays: daysBetween(from, end) + 1 } };
  }
  const { outing } = kit;
  if (outing.when.mode === "later") return { ...outing, when: { ...outing.when, date } };
  if (date === today) return outing;
  const context = kit.weather.context;
  const readAt = context?.source === "forecast" ? context.forecastTime : context?.provenance?.observedTime;
  return { ...outing, when: { mode: "later", date, time: readAt?.slice(11, 16) ?? "12:00", durationDays: 1 } };
}

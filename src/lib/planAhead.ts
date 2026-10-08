import { addDays, format } from "date-fns";
import { Recommendation } from "@/types/recommendations";
import type { BodyPart, LayerType } from "@/types/wardrobe";
import {
  DaypartId,
  DaypartLayerPlan,
  DailyLayerPlan,
  ForecastHour,
  LayerChanges,
  MultiDayLayerPlan,
  PlanLayerItem,
  UncoveredPlanDay,
} from "@/types/plan";

interface DaypartDefinition {
  id: DaypartId;
  label: string;
  startHour: number;
  endHour: number;
  timeRangeLabel: string;
}

interface WeatherSummary {
  minTemp: number;
  maxTemp: number;
  maxWindSpeed: number;
  maxPrecipProbability: number;
  effectiveTemperature: number;
}

interface BuildMultiDayLayerPlanArgs {
  startDate: Date;
  durationDays: number;
  startHour?: number;
  hourlyForecast: ForecastHour[];
  getRecommendation: (effectiveTemperature: number) => Recommendation | null;
}

const RELEVANT_DAY_START_HOUR = 6;
const RELEVANT_DAY_END_HOUR = 21;

const DAYPARTS: DaypartDefinition[] = [
  { id: "morning", label: "Morning", startHour: 6, endHour: 10, timeRangeLabel: "6am-10am" },
  { id: "midday", label: "Midday", startHour: 11, endHour: 15, timeRangeLabel: "11am-3pm" },
  { id: "evening", label: "Evening", startHour: 16, endHour: 21, timeRangeLabel: "4pm-9pm" },
];

function parseHour(time: string): number {
  const hour = Number.parseInt(time.slice(11, 13), 10);
  return Number.isFinite(hour) ? hour : -1;
}

/** A YYYY-MM-DD date as a day heading, e.g. "Thu, Jan 15". */
function formatDayLabel(dayKey: string): string {
  return format(new Date(`${dayKey}T00:00:00`), "EEE, MMM d");
}

function parseDateKey(time: string): string {
  return time.slice(0, 10);
}

function isRelevantHour(hour: number): boolean {
  return hour >= RELEVANT_DAY_START_HOUR && hour <= RELEVANT_DAY_END_HOUR;
}

function calculateEffectiveTemperature(
  minTemp: number,
  maxWindSpeed: number,
  maxPrecipProbability: number
): number {
  const windPenalty = Math.min(Math.round(maxWindSpeed * 0.25), 8);
  const precipPenalty =
    maxPrecipProbability >= 70 ? 4 : maxPrecipProbability >= 40 ? 2 : maxPrecipProbability >= 20 ? 1 : 0;
  return Math.round(minTemp - windPenalty - precipPenalty);
}

function summarizeWeather(hours: ForecastHour[]): WeatherSummary {
  const temps = hours.map((hour) => hour.temperature);
  const winds = hours.map((hour) => hour.windSpeed);
  const precip = hours.map((hour) => hour.precipitationProbability);

  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const maxWindSpeed = Math.max(...winds);
  const maxPrecipProbability = Math.max(...precip);

  return {
    minTemp,
    maxTemp,
    maxWindSpeed,
    maxPrecipProbability,
    effectiveTemperature: calculateEffectiveTemperature(minTemp, maxWindSpeed, maxPrecipProbability),
  };
}

const BODY_PART_ORDER: BodyPart[] = ["torso", "legs", "hands", "headNeck"];
const LAYER_TYPE_ORDER: LayerType[] = ["base", "mid", "outer"];

function listItems(recommendation: Recommendation): PlanLayerItem[] {
  return BODY_PART_ORDER.flatMap((bodyPart) =>
    LAYER_TYPE_ORDER.flatMap((layerType) =>
      (recommendation[bodyPart][layerType] ?? []).map((item) => ({ bodyPart, layerType, name: item.name }))
    )
  );
}

/** What to put on and take off to go from `from` to `to`; null when either is missing. */
export function diffRecommendations(
  from: Recommendation | null,
  to: Recommendation | null
): LayerChanges | null {
  if (!from || !to) return null;
  const keyOf = (item: PlanLayerItem) => `${item.bodyPart}:${item.layerType}:${item.name}`;
  const fromItems = listItems(from);
  const toItems = listItems(to);
  const fromKeys = new Set(fromItems.map(keyOf));
  const toKeys = new Set(toItems.map(keyOf));
  return {
    add: toItems.filter((item) => !fromKeys.has(keyOf(item))),
    remove: fromItems.filter((item) => !toKeys.has(keyOf(item))),
  };
}

function getCarryItems(
  baseline: WeatherSummary,
  dayparts: DaypartLayerPlan[]
): string[] {
  const items: string[] = [];
  const maxDaypartWind = Math.max(...dayparts.map((part) => part.maxWindSpeed), baseline.maxWindSpeed);
  const maxDaypartPrecip = Math.max(...dayparts.map((part) => part.maxPrecipProbability), baseline.maxPrecipProbability);
  const daytimeSwing = baseline.maxTemp - baseline.minTemp;

  if (maxDaypartPrecip >= 40) {
    items.push("Waterproof shell");
  }
  if (maxDaypartWind >= 18) {
    items.push("Wind-blocking outer layer");
  }
  if (baseline.minTemp <= 35) {
    items.push("Warm gloves and head insulation");
  }
  if (daytimeSwing >= 15) {
    items.push("Removable mid-layer for daytime swings");
  }

  return items;
}

function buildDayparts(
  dayHours: ForecastHour[],
  baselineRecommendation: Recommendation | null,
  getRecommendation: (effectiveTemperature: number) => Recommendation | null
): DaypartLayerPlan[] {
  // The day starts in the day's layers; each daypart changes what the one
  // before it had on, so layers taken off at midday go back on for a cold evening.
  let wearing = baselineRecommendation;
  return DAYPARTS.flatMap((definition) => {
    const hours = dayHours.filter((hour) => {
      const hourValue = parseHour(hour.time);
      return hourValue >= definition.startHour && hourValue <= definition.endHour;
    });

    if (hours.length === 0) return [];

    const summary = summarizeWeather(hours);
    const recommendation = getRecommendation(summary.effectiveTemperature);
    const changes = diffRecommendations(wearing, recommendation);
    if (recommendation) wearing = recommendation;

    return [{
      id: definition.id,
      label: definition.label,
      timeRangeLabel: definition.timeRangeLabel,
      minTemp: summary.minTemp,
      maxTemp: summary.maxTemp,
      maxWindSpeed: summary.maxWindSpeed,
      maxPrecipProbability: summary.maxPrecipProbability,
      effectiveTemperature: summary.effectiveTemperature,
      recommendation,
      changes,
    }];
  });
}

export function buildMultiDayLayerPlan({
  startDate,
  durationDays,
  startHour,
  hourlyForecast,
  getRecommendation,
}: BuildMultiDayLayerPlanArgs): MultiDayLayerPlan {
  const clampedDuration = Math.min(7, Math.max(1, Math.round(durationDays)));
  const normalizedStartHour = typeof startHour === "number" && Number.isFinite(startHour)
    ? Math.min(23, Math.max(0, Math.round(startHour)))
    : undefined;
  const firstDayStartHour = Math.max(RELEVANT_DAY_START_HOUR, normalizedStartHour ?? RELEVANT_DAY_START_HOUR);
  const dayKeys = Array.from({ length: clampedDuration }, (_, index) =>
    format(addDays(startDate, index), "yyyy-MM-dd")
  );
  const dayKeySet = new Set(dayKeys);

  const groupedHours = new Map<string, ForecastHour[]>();
  let firstDayHasHoursBeforeStart = false;
  for (const hour of hourlyForecast) {
    if (!hour?.time) continue;
    const dayKey = parseDateKey(hour.time);
    if (!dayKeySet.has(dayKey)) continue;

    const parsedHour = parseHour(hour.time);
    if (!isRelevantHour(parsedHour)) continue;
    if (dayKey === dayKeys[0] && parsedHour < firstDayStartHour) {
      firstDayHasHoursBeforeStart = true;
      continue;
    }

    const existing = groupedHours.get(dayKey) ?? [];
    existing.push(hour);
    groupedHours.set(dayKey, existing);
  }

  const days: DailyLayerPlan[] = [];
  const uncoveredDays: UncoveredPlanDay[] = [];
  for (const dayKey of dayKeys) {
    const dayHours = groupedHours.get(dayKey) ?? [];
    if (dayHours.length === 0) {
      uncoveredDays.push({
        date: dayKey,
        label: formatDayLabel(dayKey),
        reason: dayKey === dayKeys[0] && firstDayHasHoursBeforeStart ? "afterStartTime" : "noForecast",
      });
      continue;
    }

    dayHours.sort((a, b) => a.time.localeCompare(b.time));
    const baselineSummary = summarizeWeather(dayHours);
    const baselineRecommendation = getRecommendation(baselineSummary.effectiveTemperature);
    const dayparts = buildDayparts(dayHours, baselineRecommendation, getRecommendation);
    const carryItems = getCarryItems(baselineSummary, dayparts);
    const previousDay = days.at(-1);

    days.push({
      date: dayKey,
      label: formatDayLabel(dayKey),
      baseline: {
        minTemp: baselineSummary.minTemp,
        maxTemp: baselineSummary.maxTemp,
        maxWindSpeed: baselineSummary.maxWindSpeed,
        maxPrecipProbability: baselineSummary.maxPrecipProbability,
        effectiveTemperature: baselineSummary.effectiveTemperature,
        recommendation: baselineRecommendation,
      },
      changesFromPreviousDay: previousDay
        ? diffRecommendations(previousDay.baseline.recommendation, baselineRecommendation)
        : null,
      dayparts,
      carryItems,
    });
  }

  return {
    startDate: dayKeys[0],
    endDate: dayKeys[dayKeys.length - 1],
    durationDays: clampedDuration,
    dayStartHour: RELEVANT_DAY_START_HOUR,
    dayEndHour: RELEVANT_DAY_END_HOUR,
    firstDayStartHour,
    days,
    uncoveredDays,
  };
}

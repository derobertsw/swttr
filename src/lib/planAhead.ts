import { addDays, format } from "date-fns";
import { Recommendation } from "@/types/recommendations";
import {
  DaypartId,
  DaypartLayerPlan,
  DailyLayerPlan,
  ForecastHour,
  MultiDayLayerPlan,
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

export const RELEVANT_DAY_START_HOUR = 6;
export const RELEVANT_DAY_END_HOUR = 21;

export const DAYPARTS: DaypartDefinition[] = [
  { id: "morning", label: "Morning", startHour: 6, endHour: 10, timeRangeLabel: "6am-10am" },
  { id: "midday", label: "Midday", startHour: 11, endHour: 15, timeRangeLabel: "11am-3pm" },
  { id: "evening", label: "Evening", startHour: 16, endHour: 21, timeRangeLabel: "4pm-9pm" },
];

function parseHour(time: string): number {
  const hour = Number.parseInt(time.slice(11, 13), 10);
  return Number.isFinite(hour) ? hour : -1;
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

function scoreRecommendation(recommendation: Recommendation | null): number {
  if (!recommendation) return 0;

  const scoreLayerSet = (base: number, mid: number, outer: number) => {
    return base * 1 + mid * 1.35 + outer * 1.15;
  };

  const torsoScore = scoreLayerSet(
    recommendation.torso.base.length,
    recommendation.torso.mid?.length ?? 0,
    recommendation.torso.outer.length
  );
  const legsScore = scoreLayerSet(
    recommendation.legs.base.length,
    recommendation.legs.mid?.length ?? 0,
    recommendation.legs.outer.length
  );
  const handsScore = scoreLayerSet(
    recommendation.hands.base.length,
    recommendation.hands.mid?.length ?? 0,
    recommendation.hands.outer.length
  );
  const headScore = scoreLayerSet(
    recommendation.headNeck.base.length,
    recommendation.headNeck.mid?.length ?? 0,
    recommendation.headNeck.outer.length
  );

  return torsoScore + legsScore * 0.9 + handsScore * 0.5 + headScore * 0.5;
}

function getAdjustmentLabel(deltaScore: number): string {
  if (deltaScore >= 1.25) return "Add one warm layer vs baseline.";
  if (deltaScore >= 0.5) return "Slightly warmer setup than baseline.";
  if (deltaScore <= -1.25) return "Drop a layer or open vents vs baseline.";
  if (deltaScore <= -0.5) return "Slightly lighter than baseline.";
  return "Keep baseline layers.";
}

function getBaselineSummary(recommendation: Recommendation | null): string {
  if (!recommendation) return "No layer recommendation available";

  const countLayers = (section: { base: unknown[]; mid?: unknown[]; outer: unknown[] }) =>
    section.base.length + (section.mid?.length ?? 0) + section.outer.length;

  const torso = countLayers(recommendation.torso);
  const legs = countLayers(recommendation.legs);
  const hands = countLayers(recommendation.hands);
  const head = countLayers(recommendation.headNeck);
  return `${torso} torso / ${legs} legs / ${hands} hands / ${head} head-neck`;
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
  const baselineScore = scoreRecommendation(baselineRecommendation);

  return DAYPARTS.flatMap((definition) => {
    const hours = dayHours.filter((hour) => {
      const hourValue = parseHour(hour.time);
      return hourValue >= definition.startHour && hourValue <= definition.endHour;
    });

    if (hours.length === 0) return [];

    const summary = summarizeWeather(hours);
    const recommendation = getRecommendation(summary.effectiveTemperature);
    const scoreDelta = scoreRecommendation(recommendation) - baselineScore;

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
      adjustment: getAdjustmentLabel(scoreDelta),
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
  for (const hour of hourlyForecast) {
    if (!hour?.time) continue;
    const dayKey = parseDateKey(hour.time);
    if (!dayKeySet.has(dayKey)) continue;

    const parsedHour = parseHour(hour.time);
    if (!isRelevantHour(parsedHour)) continue;
    if (dayKey === dayKeys[0] && parsedHour < firstDayStartHour) continue;

    const existing = groupedHours.get(dayKey) ?? [];
    existing.push(hour);
    groupedHours.set(dayKey, existing);
  }

  const days: DailyLayerPlan[] = [];
  for (const dayKey of dayKeys) {
    const dayHours = groupedHours.get(dayKey) ?? [];
    if (dayHours.length === 0) continue;

    dayHours.sort((a, b) => a.time.localeCompare(b.time));
    const baselineSummary = summarizeWeather(dayHours);
    const baselineRecommendation = getRecommendation(baselineSummary.effectiveTemperature);
    const dayparts = buildDayparts(dayHours, baselineRecommendation, getRecommendation);
    const carryItems = getCarryItems(baselineSummary, dayparts);

    days.push({
      date: dayKey,
      label: format(new Date(`${dayKey}T00:00:00`), "EEE, MMM d"),
      baseline: {
        minTemp: baselineSummary.minTemp,
        maxTemp: baselineSummary.maxTemp,
        maxWindSpeed: baselineSummary.maxWindSpeed,
        maxPrecipProbability: baselineSummary.maxPrecipProbability,
        effectiveTemperature: baselineSummary.effectiveTemperature,
        recommendation: baselineRecommendation,
        summary: getBaselineSummary(baselineRecommendation),
      },
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
    days,
  };
}

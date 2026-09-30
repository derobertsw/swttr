import { NextRequest, NextResponse } from "next/server";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import { formatZonedTime, isTimeZone } from "@/lib/timeZones";
import { FORECAST_DAYS, planOutsideForecast } from "@/lib/forecastRange";
import { Recommendation } from "@/types/recommendations";
import { TemperatureSensitivity } from "@/types/preferences";
import { ForecastHour } from "@/types/plan";
import layerRecommendations from "@/data/layerRecommendations.json";

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

const VALID_SENSITIVITIES = new Set(["hot", "neutral", "cold"]);

function getRecommendation(
  temp: number,
  activity: string,
  sensitivity: TemperatureSensitivity
): Recommendation | null {
  const tempRange = getAdjustedTempRange(temp, sensitivity);
  const activityData =
    layerRecommendations[activity as keyof typeof layerRecommendations];

  if (activityData) {
    const legacyRec = activityData[tempRange as keyof typeof activityData];
    if (legacyRec) {
      return convertLegacyRecommendation(legacyRec as LegacyRecommendation);
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: {
    activity: string;
    sensitivity: string;
    lat: number;
    lon: number;
    startDate: string;
    durationDays: number;
    startHour?: number;
  };

  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { activity, sensitivity, lat, lon, startDate, durationDays, startHour } = body;

  if (!activity || !sensitivity || lat == null || lon == null || !startDate || durationDays == null) {
    return NextResponse.json(
      { error: "Missing required fields: activity, sensitivity, lat, lon, startDate, durationDays" },
      { status: 400 }
    );
  }

  if (!VALID_SENSITIVITIES.has(sensitivity)) {
    return NextResponse.json(
      { error: "sensitivity must be one of: hot, neutral, cold" },
      { status: 400 }
    );
  }

  if (!isValidDateString(startDate)) {
    return NextResponse.json(
      { error: "Invalid startDate. Use YYYY-MM-DD format." },
      { status: 400 }
    );
  }

  const parsedDays = Math.min(7, Math.max(1, Math.round(durationDays)));

  try {
    // The whole hourly forecast from Open-Meteo, so a plan past its end can say
    // which dates it covers. The dates, start hour and daytime windows are all
    // local time at the coordinates.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&forecast_days=${FORECAST_DAYS}&timezone=auto&timeformat=unixtime&temperature_unit=fahrenheit&wind_speed_unit=mph`;

    const weatherResponse = await fetch(url);
    if (!weatherResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch weather data" },
        { status: 502 }
      );
    }

    const data = await weatherResponse.json();
    // Without the place's time zone, the hours can't be read on its clock.
    const timeZone: unknown = data?.timezone;
    if (!isTimeZone(timeZone)) {
      return NextResponse.json(
        { error: "Failed to fetch weather data" },
        { status: 502 }
      );
    }
    const hourlyTime: number[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
    const hourlyTemps: number[] = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
    const hourlyWinds: number[] = Array.isArray(data?.hourly?.wind_speed_10m) ? data.hourly.wind_speed_10m : [];
    const hourlyPrecip: number[] = Array.isArray(data?.hourly?.precipitation_probability) ? data.hourly.precipitation_probability : [];

    const hourly: ForecastHour[] = hourlyTime
      .map((time: number, index: number) => ({
        time,
        temperature: Math.round(Number(hourlyTemps[index] ?? 0)),
        windSpeed: Math.round(Number(hourlyWinds[index] ?? 0)),
        precipitationProbability: Math.round(Number(hourlyPrecip[index] ?? 0)),
      }))
      .filter((entry) => (
        Number.isFinite(entry.time) &&
        Number.isFinite(entry.temperature) &&
        Number.isFinite(entry.windSpeed) &&
        Number.isFinite(entry.precipitationProbability)
      ))
      // Label each hour by the local clock then. Open-Meteo's own labels use
      // today's UTC offset, which is an hour out after a daylight saving change.
      .map((entry) => ({ ...entry, time: formatZonedTime(entry.time * 1000, timeZone) }));

    // The dates the forecast covers, on the place's calendar: those with a temperature.
    const forecastDates = hourlyTime.flatMap((start, index) =>
      typeof start === "number" && typeof hourlyTemps[index] === "number"
        ? [formatZonedTime(start * 1000, timeZone).slice(0, 10)]
        : []
    );
    if (forecastDates.length === 0) {
      return NextResponse.json(
        { error: "Failed to fetch weather data" },
        { status: 502 }
      );
    }
    const outsideForecast = planOutsideForecast(
      startDate,
      parsedDays,
      forecastDates[0],
      forecastDates[forecastDates.length - 1]
    );
    if (outsideForecast) {
      // `field` tells the form which input to fix.
      return NextResponse.json({ error: outsideForecast, field: "startDate" }, { status: 422 });
    }

    // Build the multi-day plan
    const plan = buildMultiDayLayerPlan({
      startDate: new Date(`${startDate}T00:00:00`),
      durationDays: parsedDays,
      startHour: typeof startHour === "number" && Number.isFinite(startHour) ? startHour : undefined,
      hourlyForecast: hourly,
      getRecommendation: (effectiveTemperature) =>
        getRecommendation(effectiveTemperature, activity, sensitivity as TemperatureSensitivity),
    });

    if (plan.days.length === 0) {
      return NextResponse.json(
        { error: "The forecast has no daytime hours (6am to 9pm) for this plan. Pick an earlier start time or another date." },
        { status: 422 }
      );
    }

    const firstDay = plan.days[0];
    return NextResponse.json({
      plan,
      baseline: {
        recommendation: firstDay.baseline.recommendation,
        effectiveTemperature: firstDay.baseline.effectiveTemperature,
        maxWindSpeed: firstDay.baseline.maxWindSpeed,
      },
    });
  } catch (error) {
    console.error("Plan-ahead API error:", error);
    return NextResponse.json(
      { error: "Failed to build plan" },
      { status: 500 }
    );
  }
}

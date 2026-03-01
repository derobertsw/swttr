import { NextRequest, NextResponse } from "next/server";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import { getAdjustedTempRange } from "@/lib/getTempRange";
import { convertLegacyRecommendation, type LegacyRecommendation } from "@/lib/layers";
import { Recommendation } from "@/types/recommendations";
import { TemperatureSensitivity } from "@/types/preferences";
import { ForecastHour } from "@/types/plan";
import layerRecommendations from "@/data/layerRecommendations.json";

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDaysToDateString(dateString: string, daysToAdd: number): string {
  const [year, month, day] = dateString.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysToAdd);

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
    // Fetch hourly weather from Open-Meteo
    const endDate = addDaysToDateString(startDate, parsedDays - 1);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&start_date=${startDate}&end_date=${endDate}&temperature_unit=fahrenheit&wind_speed_unit=mph`;

    const weatherResponse = await fetch(url);
    if (!weatherResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch weather data" },
        { status: 502 }
      );
    }

    const data = await weatherResponse.json();
    const hourlyTime: string[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
    const hourlyTemps: number[] = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
    const hourlyWinds: number[] = Array.isArray(data?.hourly?.wind_speed_10m) ? data.hourly.wind_speed_10m : [];
    const hourlyPrecip: number[] = Array.isArray(data?.hourly?.precipitation_probability) ? data.hourly.precipitation_probability : [];

    const hourly: ForecastHour[] = hourlyTime
      .map((time: string, index: number) => ({
        time,
        temperature: Math.round(Number(hourlyTemps[index] ?? 0)),
        windSpeed: Math.round(Number(hourlyWinds[index] ?? 0)),
        precipitationProbability: Math.round(Number(hourlyPrecip[index] ?? 0)),
      }))
      .filter((entry) => (
        typeof entry.time === "string" &&
        Number.isFinite(entry.temperature) &&
        Number.isFinite(entry.windSpeed) &&
        Number.isFinite(entry.precipitationProbability)
      ));

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
        { error: "No daytime forecast data returned for the selected window" },
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

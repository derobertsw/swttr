import { NextRequest, NextResponse } from "next/server";
import { formatZonedIsoTime, isLocalDateTime, zonedTimeToInstant } from "@/lib/timeZones";
import type { PrecipitationType } from "@/types/weather";

/** Days of hourly forecast Open-Meteo has, today included. */
const FORECAST_DAYS = 16;
const HOUR_SECONDS = 3600;

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

function decodePrecipitation(weatherCode: number): { precipitation: boolean; precipitationType?: PrecipitationType } {
  // Rain: drizzle (51-55), rain (61-65), rain showers (80-82), thunderstorms (95-99)
  if ((weatherCode >= 51 && weatherCode <= 55) || (weatherCode >= 61 && weatherCode <= 65) || (weatherCode >= 80 && weatherCode <= 82) || weatherCode >= 95) {
    return { precipitation: true, precipitationType: 'rain' };
  }
  // Mixed: freezing drizzle/rain (56-57, 66-67)
  if (weatherCode === 56 || weatherCode === 57 || weatherCode === 66 || weatherCode === 67) {
    return { precipitation: true, precipitationType: 'mixed' };
  }
  // Snow: snow fall (71-77), snow showers (85-86)
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return { precipitation: true, precipitationType: 'snow' };
  }
  return { precipitation: false };
}

/** A forecast day, e.g. "Oct 12", on the place's calendar. */
function formatForecastDay(hourStart: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(hourStart * 1000);
}

/**
 * The forecast for the hour a local date-time falls in at the coordinates.
 * The time is read on the place's clock, whatever time zone the caller is in.
 */
async function getHourlyForecast(lat: string, lon: string, localDateTime: string) {
  // Exact timestamps, because Open-Meteo labels its local times with today's
  // UTC offset, which is an hour out after a daylight saving change.
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,weather_code&forecast_days=${FORECAST_DAYS}&timezone=auto&timeformat=unixtime&temperature_unit=fahrenheit&wind_speed_unit=mph`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch weather data");
  }

  const data = await response.json();
  const timeZone: string = data.timezone;
  const hourStarts: unknown[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
  // Hours with a temperature and wind speed, each starting at a Unix time in seconds.
  const hours = hourStarts.flatMap((start, index) => {
    const temperature: unknown = data.hourly.temperature_2m?.[index];
    const windSpeed: unknown = data.hourly.wind_speed_10m?.[index];
    const weatherCode: unknown = data.hourly.weather_code?.[index];
    return typeof start === "number" && typeof temperature === "number" && typeof windSpeed === "number"
      ? [{ start, temperature, windSpeed, weatherCode: typeof weatherCode === "number" ? weatherCode : undefined }]
      : [];
  });

  if (hours.length === 0) {
    throw new Error("Forecast has no hourly data");
  }

  const requested = zonedTimeToInstant(localDateTime, timeZone) / 1000;
  const hour = hours.findLast(({ start }) => start <= requested);

  if (!hour || requested >= hour.start + HOUR_SECONDS) {
    const firstDay = formatForecastDay(hours[0].start, timeZone);
    const lastDay = formatForecastDay(hours[hours.length - 1].start, timeZone);
    return NextResponse.json(
      { error: `The forecast for this place covers ${firstDay} to ${lastDay}. Pick a date in that range.` },
      { status: 422 }
    );
  }

  const { weatherCode } = hour;
  const precipInfo = weatherCode === undefined
    ? { precipitation: false }
    : decodePrecipitation(weatherCode);
  return NextResponse.json({
    temperature: Math.round(hour.temperature),
    windSpeed: Math.round(hour.windSpeed),
    weatherCode,
    precipitation: precipInfo.precipitation,
    precipitationType: precipInfo.precipitationType,
    isForecast: true,
    // When the forecast hour starts, with the place's UTC offset at that time.
    forecastTime: formatZonedIsoTime(hour.start * 1000, timeZone),
    timeZone,
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  // Local date and time at the coordinates, e.g. 2026-10-15T14:00
  const dateTime = searchParams.get("datetime");
  const startDate = searchParams.get("startDate");
  const daysParam = searchParams.get("days");

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Missing latitude or longitude" },
      { status: 400 }
    );
  }

  try {
    if (startDate) {
      if (!isValidDateString(startDate)) {
        return NextResponse.json(
          { error: "Invalid startDate. Use YYYY-MM-DD format." },
          { status: 400 }
        );
      }

      const parsedDays = Number.parseInt(daysParam ?? "3", 10);
      if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 7) {
        return NextResponse.json(
          { error: "Invalid days. Must be an integer between 1 and 7." },
          { status: 400 }
        );
      }

      const endDate = addDaysToDateString(startDate, parsedDays - 1);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&start_date=${startDate}&end_date=${endDate}&temperature_unit=fahrenheit&wind_speed_unit=mph`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();
      const hourlyTime: string[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
      const hourlyTemps: number[] = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
      const hourlyWinds: number[] = Array.isArray(data?.hourly?.wind_speed_10m) ? data.hourly.wind_speed_10m : [];
      const hourlyPrecip: number[] = Array.isArray(data?.hourly?.precipitation_probability) ? data.hourly.precipitation_probability : [];

      const hourly = hourlyTime
        .map((time: string, index: number) => ({
          time,
          temperature: Math.round(Number(hourlyTemps[index] ?? 0)),
          windSpeed: Math.round(Number(hourlyWinds[index] ?? 0)),
          precipitationProbability: Math.round(Number(hourlyPrecip[index] ?? 0)),
        }))
        .filter((entry) => {
          return (
            typeof entry.time === "string" &&
            Number.isFinite(entry.temperature) &&
            Number.isFinite(entry.windSpeed) &&
            Number.isFinite(entry.precipitationProbability)
          );
        });

      return NextResponse.json({
        startDate,
        endDate,
        hourly,
        isForecast: true,
        isMultiDay: true,
      });
    }

    // If datetime is provided, fetch hourly forecast; otherwise fetch current weather
    if (dateTime) {
      if (!isLocalDateTime(dateTime)) {
        return NextResponse.json(
          { error: "Invalid datetime. Use YYYY-MM-DDTHH:mm." },
          { status: 400 }
        );
      }
      return await getHourlyForecast(lat, lon, dateTime);
    } else {
      // Current weather
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();

      const currentWeatherCode = Number(data.current.weather_code);
      const precipInfo = Number.isFinite(currentWeatherCode)
        ? decodePrecipitation(currentWeatherCode)
        : { precipitation: false };
      return NextResponse.json({
        temperature: Math.round(data.current.temperature_2m),
        windSpeed: Math.round(data.current.wind_speed_10m),
        weatherCode: Number.isFinite(currentWeatherCode) ? currentWeatherCode : undefined,
        precipitation: precipInfo.precipitation,
        precipitationType: precipInfo.precipitationType,
        isForecast: false,
      });
    }
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weather data" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { addDaysToDateString, describeForecastCoverage, FORECAST_DAYS } from "@/lib/forecastRange";
import { formatZonedIsoTime, formatZonedTime, isLocalDateTime, isTimeZone, zonedTimeToInstant } from "@/lib/timeZones";
import type { PrecipitationType } from "@/types/weather";

const HOUR_SECONDS = 3600;

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
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

/** The YYYY-MM-DD date an hour starts on, on the place's calendar. */
function forecastDate(hourStart: number, timeZone: string): string {
  return formatZonedTime(hourStart * 1000, timeZone).slice(0, 10);
}

/**
 * Open-Meteo's hourly forecast covering the local dates `startDate` to
 * `endDate`. It picks hours by date at today's UTC offset, so after a clock
 * change a date's first or last hour falls on the adjacent date in its frame.
 * Ask for a day either side, and fall back to the dates alone when that
 * reaches past the range Open-Meteo serves (it answers 400).
 */
async function fetchHourlyRange(lat: string, lon: string, startDate: string, endDate: string) {
  const ranges = [
    [addDaysToDateString(startDate, -1), addDaysToDateString(endDate, 1)],
    [startDate, endDate],
  ];
  for (const [from, to] of ranges) {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability&start_date=${from}&end_date=${to}&timezone=auto&timeformat=unixtime&temperature_unit=fahrenheit&wind_speed_unit=mph`);
    if (response.ok) return response.json();
    if (response.status !== 400) break;
  }
  throw new Error("Failed to fetch weather data");
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
  // Without the place's time zone, the time can't be read on its clock.
  const timeZone: unknown = data?.timezone;
  if (!isTimeZone(timeZone)) {
    throw new Error("Forecast has no valid time zone");
  }
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
    const coverage = describeForecastCoverage(
      forecastDate(hours[0].start, timeZone),
      forecastDate(hours[hours.length - 1].start, timeZone)
    );
    return NextResponse.json(
      { error: `${coverage} Pick a date in that range.` },
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
      const data = await fetchHourlyRange(lat, lon, startDate, endDate);
      const timeZone: unknown = data?.timezone;
      if (!isTimeZone(timeZone)) {
        throw new Error("Forecast has no valid time zone");
      }
      const hourlyTime: number[] = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
      const hourlyTemps: number[] = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
      const hourlyWinds: number[] = Array.isArray(data?.hourly?.wind_speed_10m) ? data.hourly.wind_speed_10m : [];
      const hourlyPrecip: number[] = Array.isArray(data?.hourly?.precipitation_probability) ? data.hourly.precipitation_probability : [];

      const hourly = hourlyTime
        .map((time: number, index: number) => ({
          time,
          temperature: Math.round(Number(hourlyTemps[index] ?? 0)),
          windSpeed: Math.round(Number(hourlyWinds[index] ?? 0)),
          precipitationProbability: Math.round(Number(hourlyPrecip[index] ?? 0)),
        }))
        .filter((entry) => {
          return (
            Number.isFinite(entry.time) &&
            Number.isFinite(entry.temperature) &&
            Number.isFinite(entry.windSpeed) &&
            Number.isFinite(entry.precipitationProbability)
          );
        })
        // Open-Meteo uses today's offset for its local labels. Use the offset
        // at each instant instead, so the stop's clock stays right across DST.
        .map((entry) => ({ ...entry, time: formatZonedTime(entry.time * 1000, timeZone) }))
        // The response includes hours from the adjacent dates. Only return
        // dates in the requested local window.
        .filter((entry) => entry.time.slice(0, 10) >= startDate && entry.time.slice(0, 10) <= endDate);

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

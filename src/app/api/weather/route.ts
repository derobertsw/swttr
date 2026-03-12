import { NextRequest, NextResponse } from "next/server";
import type { PrecipitationType } from "@/types/weather";

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const dateTime = searchParams.get("datetime"); // ISO format: 2024-01-15T14:00
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
      const date = dateTime.split("T")[0];
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,weather_code&start_date=${date}&end_date=${date}&temperature_unit=fahrenheit&wind_speed_unit=mph`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();
      const hourlyWeatherCodes: number[] = Array.isArray(data?.hourly?.weather_code) ? data.hourly.weather_code : [];

      // Find the index for the requested hour
      const targetHour = dateTime.substring(0, 13) + ":00"; // e.g., "2024-01-15T14:00"
      const hourIndex = data.hourly.time.findIndex((t: string) => t === targetHour);

      if (hourIndex === -1) {
        // Fall back to closest available hour
        const fallbackIndex = Math.min(12, Math.max(0, data.hourly.temperature_2m.length - 1));
        const fallbackWeatherCode = Number(hourlyWeatherCodes[fallbackIndex]);
        const precipInfo = Number.isFinite(fallbackWeatherCode)
          ? decodePrecipitation(fallbackWeatherCode)
          : { precipitation: false };
        return NextResponse.json({
          temperature: Math.round(data.hourly.temperature_2m[fallbackIndex]), // noon as fallback
          windSpeed: Math.round(data.hourly.wind_speed_10m[fallbackIndex]),
          weatherCode: Number.isFinite(fallbackWeatherCode) ? fallbackWeatherCode : undefined,
          precipitation: precipInfo.precipitation,
          precipitationType: precipInfo.precipitationType,
          isForecast: true,
        });
      }

      const weatherCode = Number(hourlyWeatherCodes[hourIndex]);
      const precipInfo = Number.isFinite(weatherCode)
        ? decodePrecipitation(weatherCode)
        : { precipitation: false };
      return NextResponse.json({
        temperature: Math.round(data.hourly.temperature_2m[hourIndex]),
        windSpeed: Math.round(data.hourly.wind_speed_10m[hourIndex]),
        weatherCode: Number.isFinite(weatherCode) ? weatherCode : undefined,
        precipitation: precipInfo.precipitation,
        precipitationType: precipInfo.precipitationType,
        isForecast: true,
      });
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

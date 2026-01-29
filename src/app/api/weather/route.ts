import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const dateTime = searchParams.get("datetime"); // ISO format: 2024-01-15T14:00

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Missing latitude or longitude" },
      { status: 400 }
    );
  }

  try {
    // If datetime is provided, fetch hourly forecast; otherwise fetch current weather
    if (dateTime) {
      const date = dateTime.split("T")[0];
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m&start_date=${date}&end_date=${date}&temperature_unit=fahrenheit&wind_speed_unit=mph`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();

      // Find the index for the requested hour
      const targetHour = dateTime.substring(0, 13) + ":00"; // e.g., "2024-01-15T14:00"
      const hourIndex = data.hourly.time.findIndex((t: string) => t === targetHour);

      if (hourIndex === -1) {
        // Fall back to closest available hour
        return NextResponse.json({
          temperature: Math.round(data.hourly.temperature_2m[12]), // noon as fallback
          windSpeed: Math.round(data.hourly.wind_speed_10m[12]),
          isForecast: true,
        });
      }

      return NextResponse.json({
        temperature: Math.round(data.hourly.temperature_2m[hourIndex]),
        windSpeed: Math.round(data.hourly.wind_speed_10m[hourIndex]),
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

      return NextResponse.json({
        temperature: Math.round(data.current.temperature_2m),
        windSpeed: Math.round(data.current.wind_speed_10m),
        weatherCode: data.current.weather_code,
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

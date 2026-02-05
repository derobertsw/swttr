"use client";

import type { WeatherData, WeatherResult } from "@/types/weather";

export type { WeatherData, WeatherResult };

export function fetchCurrentWeather(): Promise<WeatherResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ data: null, locationDenied: false });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/weather?lat=${latitude}&lon=${longitude}`
          );

          if (!response.ok) {
            resolve({ data: null, locationDenied: false });
            return;
          }

          const data = await response.json();
          resolve({
            data: { temperature: data.temperature, windSpeed: data.windSpeed },
            locationDenied: false,
          });
        } catch {
          resolve({ data: null, locationDenied: false });
        }
      },
      (error) => {
        const isDenied = error.code === error.PERMISSION_DENIED;
        resolve({ data: null, locationDenied: isDenied });
      }
    );
  });
}

export async function fetchWeatherByCoords(
  latitude: number,
  longitude: number
): Promise<WeatherData | null> {
  try {
    const response = await fetch(
      `/api/weather?lat=${latitude}&lon=${longitude}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return { temperature: data.temperature, windSpeed: data.windSpeed };
  } catch {
    return null;
  }
}

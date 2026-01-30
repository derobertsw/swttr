"use client";

export interface WeatherData {
  temperature: number;
  windSpeed: number;
}

export function fetchCurrentWeather(): Promise<WeatherData | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
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
            resolve(null);
            return;
          }

          const data = await response.json();
          resolve({ temperature: data.temperature, windSpeed: data.windSpeed });
        } catch {
          resolve(null);
        }
      },
      () => {
        resolve(null);
      }
    );
  });
}

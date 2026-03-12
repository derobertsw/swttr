"use client";

import { useState, useCallback } from "react";
import {
  BiophysicsRecommendation,
  BIOPHYSICS_ENDPOINTS,
  isBiophysicsSupported,
} from "@/types/biophysics";
import {
  type ExertionLevel,
  exertionToXcIntensity,
} from "@/lib/biophysics/exertion";
import type { UserBodyMetrics } from "@/types/preferences";
import type { WeatherData } from "@/types/weather";
import { useAuth } from "@clerk/nextjs";
import { logWarn } from "@/lib/logger";

type BiophysicsWeather = WeatherData & { humidity?: number };

export interface UseBiophysicsResult {
  data: BiophysicsRecommendation | null;
  loading: boolean;
  error: Error | null;
  fetch: (
    activity: string,
    weather: BiophysicsWeather,
    exertion: ExertionLevel,
    bodyMetrics: UserBodyMetrics
  ) => Promise<BiophysicsRecommendation | null>;
  reset: () => void;
}

/**
 * Hook for fetching biophysics-based clothing recommendations
 *
 * Returns null for unsupported activities (graceful fallback).
 * Handles errors silently so existing static recommendations still work.
 * If user has wardrobe items, uses only those for recommendations.
 */
export function useBiophysicsRecommendation(): UseBiophysicsResult {
  const { userId } = useAuth();
  const [data, setData] = useState<BiophysicsRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBiophysics = useCallback(
    async (
      activity: string,
      weather: BiophysicsWeather,
      exertion: ExertionLevel,
      bodyMetrics: UserBodyMetrics
    ): Promise<BiophysicsRecommendation | null> => {
      // Return null for unsupported activities
      if (!isBiophysicsSupported(activity)) {
        setData(null);
        return null;
      }

      const endpoint = BIOPHYSICS_ENDPOINTS[activity];
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            weather: {
              temperature: weather.temperature,
              wind_speed: weather.windSpeed,
              humidity: weather.humidity ?? 50,
              precipitation: weather.precipitation,
              precipitation_type: weather.precipitationType,
            },
            exertion,
            // Backward-compatible alias for routes that still inspect "intensity".
            intensity: exertionToXcIntensity(exertion),
            use_wardrobe_only: Boolean(userId),
            height_inches: bodyMetrics.heightInches,
            weight_lbs: bodyMetrics.weightLbs,
          }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        // Validate that the response has the expected structure
        if (result?.recommendation?.score !== undefined) {
          setData(result);
          return result;
        } else {
          // Response doesn't have expected structure, treat as null
          setData(null);
          return null;
        }
      } catch (err) {
        // Handle errors silently - existing recommendations still work
        const errorObj = err instanceof Error ? err : new Error("Unknown error");
        setError(errorObj);
        setData(null);
        logWarn("useBiophysicsRecommendation", errorObj);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return {
    data,
    loading,
    error,
    fetch: fetchBiophysics,
    reset,
  };
}

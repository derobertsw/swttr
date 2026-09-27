"use client";

import { useState, useCallback } from "react";
import {
  BiophysicsOutcome,
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

interface UseBiophysicsResult {
  data: BiophysicsRecommendation | null;
  loading: boolean;
  error: Error | null;
  fetch: (
    activity: string,
    weather: BiophysicsWeather,
    exertion: ExertionLevel,
    bodyMetrics: UserBodyMetrics
  ) => Promise<BiophysicsOutcome>;
  reset: () => void;
}

/**
 * Hook for fetching biophysics-based clothing recommendations
 *
 * Resolves to the recommendation, or to a status saying why there isn't one
 * (unsupported activity, sign-in required, no usable gear, failed request),
 * so callers can fall back to static layers and explain the fallback.
 * Failures are logged rather than thrown.
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
    ): Promise<BiophysicsOutcome> => {
      if (!isBiophysicsSupported(activity)) {
        setData(null);
        return { status: "unsupported", data: null };
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

        // Signed-out callers are turned away by src/proxy.ts.
        if (response.status === 401) {
          setData(null);
          return { status: "auth_required", data: null };
        }
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();
        if (result?.recommendation?.score !== undefined) {
          setData(result);
          return { status: "ok", data: result };
        }
        // Targets without a recommendation: there was no usable gear.
        if (result?.ireq) {
          setData(null);
          return { status: "no_gear", data: null };
        }
        throw new Error("API response has no recommendation");
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error("Unknown error");
        setError(errorObj);
        setData(null);
        logWarn("useBiophysicsRecommendation", errorObj);
        return { status: "unavailable", data: null };
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

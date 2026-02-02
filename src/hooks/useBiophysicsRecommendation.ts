"use client";

import { useState, useCallback } from "react";
import {
  BiophysicsRecommendation,
  BIOPHYSICS_ENDPOINTS,
  isBiophysicsSupported,
} from "@/types/biophysics";

interface UseBiophysicsResult {
  data: BiophysicsRecommendation | null;
  loading: boolean;
  error: Error | null;
  fetch: (
    activity: string,
    weather: { temperature: number; windSpeed: number; humidity?: number }
  ) => Promise<BiophysicsRecommendation | null>;
  reset: () => void;
}

/**
 * Get user ID from localStorage
 */
function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("swttr-user-id");
}

/**
 * Hook for fetching biophysics-based clothing recommendations
 *
 * Returns null for unsupported activities (graceful fallback).
 * Handles errors silently so existing static recommendations still work.
 * If user has wardrobe items, uses only those for recommendations.
 */
export function useBiophysicsRecommendation(): UseBiophysicsResult {
  const [data, setData] = useState<BiophysicsRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBiophysics = useCallback(
    async (
      activity: string,
      weather: { temperature: number; windSpeed: number; humidity?: number }
    ): Promise<BiophysicsRecommendation | null> => {
      // Return null for unsupported activities
      if (!isBiophysicsSupported(activity)) {
        setData(null);
        return null;
      }

      const endpoint = BIOPHYSICS_ENDPOINTS[activity];
      setLoading(true);
      setError(null);

      // Get user ID to use wardrobe items
      const userId = getUserId();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userId) {
        headers["x-user-id"] = userId;
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            weather: {
              temperature: weather.temperature,
              wind_speed: weather.windSpeed,
              humidity: weather.humidity ?? 50,
            },
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
        console.warn("Biophysics API error (falling back to static):", errorObj.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
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

/**
 * Standalone function to fetch biophysics recommendations
 * Use when you don't need the hook pattern
 */
export async function fetchBiophysicsRecommendation(
  activity: string,
  temperature: number,
  windSpeed: number,
  humidity?: number
): Promise<BiophysicsRecommendation | null> {
  if (!isBiophysicsSupported(activity)) {
    return null;
  }

  const endpoint = BIOPHYSICS_ENDPOINTS[activity];

  // Get user ID to use wardrobe items
  const userId = getUserId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (userId) {
    headers["x-user-id"] = userId;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        weather: {
          temperature,
          wind_speed: windSpeed,
          humidity: humidity ?? 50,
        },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    // Validate that the response has the expected structure
    if (result?.recommendation?.score !== undefined) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

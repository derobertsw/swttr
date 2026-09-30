"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTripFull } from "@/lib/trip-requests";
import type { TripFull } from "@/types/trips";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load trip";
}

export function useTrip(tripId: string | null) {
  const [data, setData] = useState<TripFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetchTripFull(tripId)
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(toErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // Reloads after a mutation; the initial load relies on `loading` starting true.
  const refresh = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      setData(await fetchTripFull(tripId));
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  return { data, loading, error, refresh };
}

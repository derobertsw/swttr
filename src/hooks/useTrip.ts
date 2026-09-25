"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripFull } from "@/types/trips";

async function fetchTrip(tripId: string): Promise<TripFull> {
  const res = await fetch(`/api/v1/trips/${tripId}`);
  if (!res.ok) throw new Error(`Failed (${res.status})`);
  return (await res.json()) as TripFull;
}

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
    fetchTrip(tripId)
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
      setData(await fetchTrip(tripId));
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  return { data, loading, error, refresh };
}

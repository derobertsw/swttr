"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripFull } from "@/types/trips";

export function useTrip(tripId: string | null) {
  const [data, setData] = useState<TripFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/trips/${tripId}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const body = (await res.json()) as TripFull;
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    refresh();
  }, [tripId, refresh]);

  return { data, loading, error, refresh };
}

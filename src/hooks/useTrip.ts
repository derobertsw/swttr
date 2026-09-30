"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTripFull } from "@/lib/trip-requests";
import type { TripFull } from "@/types/trips";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load trip";
}

export function useTrip(tripId: string | null) {
  const [data, setData] = useState<TripFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Loads can overlap: every save reloads the trip, so two saves close
  // together start two reloads. Only the newest load's result is used, so an
  // older snapshot that arrives last can't replace newer data.
  const newestLoad = useRef<Promise<void> | null>(null);

  const load = useCallback((id: string) => {
    const settled: Promise<void> = fetchTripFull(id)
      .then((body) => {
        if (newestLoad.current !== settled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (newestLoad.current === settled) setError(toErrorMessage(err));
      })
      .finally(() => {
        if (newestLoad.current === settled) setLoading(false);
      });
    newestLoad.current = settled;
    return settled;
  }, []);

  useEffect(() => {
    if (!tripId) return;
    void load(tripId);
    // When the trip changes or is cleared, or the page unmounts, a load still
    // running for it no longer counts as the newest, so it's dropped.
    return () => {
      newestLoad.current = null;
    };
  }, [tripId, load]);

  // Reloads after a mutation; the initial load relies on `loading` starting
  // true. It resolves once the newest load has finished, so the caller sees
  // data at least as new as its own save.
  const refresh = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    let settled = load(tripId);
    await settled;
    // A newer reload started meanwhile, and this one's result was dropped.
    while (newestLoad.current && newestLoad.current !== settled) {
      settled = newestLoad.current;
      await settled;
    }
  }, [tripId, load]);

  return { data, loading, error, refresh };
}

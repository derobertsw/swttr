"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchTripFull, TripRequestError } from "@/lib/trip-requests";
import type { TripFull } from "@/types/trips";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load trip";
}

export const TripContext = createContext<{
  tripId: string;
  state: ReturnType<typeof useTripState>;
  activate: () => void;
} | null>(null);

export function useTrip(tripId: string | null) {
  const shared = useContext(TripContext);
  const matches = shared?.tripId === tripId;
  // Standalone consumers retain their own loader outside the trip layout.
  const local = useTripState(matches ? null : tripId);
  const revalidate = matches ? shared.state.revalidate : null;
  const activate = matches ? shared.activate : null;
  useEffect(() => { activate?.(); void revalidate?.(); }, [activate, revalidate]);
  return matches ? shared.state : local;
}

/** The trip layout owns this state so subpage navigation can reuse it. */
export function useTripState(tripId: string | null) {
  const [data, setData] = useState<TripFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Loads can overlap: every save reloads the trip, so two saves close
  // together start two reloads. Only the newest load's result is used, so an
  // older snapshot that arrives last can't replace newer data.
  const newestLoad = useRef<Promise<void> | null>(null);
  const inFlight = useRef(false);
  const lastAttempt = useRef<number | null>(null);

  const load = useCallback((id: string) => {
    inFlight.current = true;
    lastAttempt.current = Date.now();
    const settled: Promise<void> = fetchTripFull(id)
      .then((body) => {
        if (newestLoad.current !== settled) return;
        setData(body);
        setError(null);
      })
      .catch((err) => {
        if (newestLoad.current !== settled) return;
        if (err instanceof TripRequestError && [401, 403, 404].includes(err.status)) setData(null);
        setError(toErrorMessage(err));
      })
      .finally(() => {
        if (newestLoad.current === settled) {
          inFlight.current = false;
          setLoading(false);
        }
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
      inFlight.current = false;
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

  // Background checks keep the current page visible and never supersede a
  // mutation reload. Navigating repeatedly within a minute needs no new read.
  const revalidate = useCallback(() => {
    if (!tripId || inFlight.current || lastAttempt.current === null || Date.now() - lastAttempt.current < 60_000) return;
    return load(tripId);
  }, [tripId, load]);

  return { data, loading, error, refresh, revalidate };
}

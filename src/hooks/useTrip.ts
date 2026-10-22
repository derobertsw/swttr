"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchTripFull, TripRequestError } from "@/lib/trip-requests";
import type { Trip, TripFull } from "@/types/trips";

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load trip";
}

/** What the trip workspace header shows. */
export type TripSummary = Pick<Trip, "id" | "name" | "start_date" | "end_date">;

export const TripContext = createContext<{
  tripId: string;
  state: ReturnType<typeof useTripState>;
  activate: () => void;
  /** The trip as a page with its own endpoint, like Packing, last loaded it. */
  summary: TripSummary | null;
  setSummary: (summary: TripSummary) => void;
} | null>(null);

/**
 * The trip's name and dates for the workspace header. It never loads the
 * full trip: it uses whatever the page already loaded.
 */
export function useTripSummary(tripId: string): TripSummary | null {
  const shared = useContext(TripContext);
  if (shared?.tripId !== tripId) return null;
  // A full-trip read that failed and left no trip, as lost access does,
  // hides what Packing named too.
  if (shared.state.error && !shared.state.data) return null;
  return shared.state.data?.trip ?? shared.summary;
}

/** Names the trip for the workspace header from a page's own trip data. */
export function usePublishTripSummary(summary: TripSummary | null | undefined) {
  const shared = useContext(TripContext);
  const setSummary = shared?.tripId === summary?.id ? shared?.setSummary : undefined;
  const { id, name, start_date, end_date } = summary ?? {};
  useEffect(() => {
    if (setSummary && id && name && start_date && end_date) setSummary({ id, name, start_date, end_date });
  }, [setSummary, id, name, start_date, end_date]);
}

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
  const newestLoad = useRef<Promise<boolean> | null>(null);
  const inFlight = useRef(false);
  // When the shown snapshot was loaded: null before the first load settles,
  // and -Infinity after a failed load, so the next focus or reconnect retries at once.
  const freshAt = useRef<number | null>(null);

  const load = useCallback((id: string) => {
    inFlight.current = true;
    // Resolves to whether this load succeeded and was still the newest.
    const settled: Promise<boolean> = fetchTripFull(id)
      .then((body) => {
        if (newestLoad.current !== settled) return false;
        freshAt.current = Date.now();
        setData(body);
        setError(null);
        return true;
      })
      .catch((err) => {
        if (newestLoad.current !== settled) return false;
        freshAt.current = Number.NEGATIVE_INFINITY;
        if (err instanceof TripRequestError && [401, 403, 404].includes(err.status)) setData(null);
        setError(toErrorMessage(err));
        return false;
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
  // data at least as new as its own save, to whether that load succeeded. It
  // never rejects: the save itself already happened.
  const reload = useCallback(async (): Promise<boolean> => {
    if (!tripId) return false;
    setLoading(true);
    let settled = load(tripId);
    let loaded = await settled;
    // A newer reload started meanwhile, and this one's result was dropped.
    while (newestLoad.current && newestLoad.current !== settled) {
      settled = newestLoad.current;
      loaded = await settled;
    }
    return loaded;
  }, [tripId, load]);
  // `reload` for callers that don't need to know whether it worked.
  const refresh = useCallback(async () => { await reload(); }, [reload]);

  // Background checks keep the current page visible and never supersede a
  // mutation reload. Navigating repeatedly within a minute needs no new read.
  const revalidate = useCallback(() => {
    if (!tripId || inFlight.current || freshAt.current === null || Date.now() - freshAt.current < 60_000) return;
    return load(tripId);
  }, [tripId, load]);

  return { data, loading, error, refresh, reload, revalidate };
}

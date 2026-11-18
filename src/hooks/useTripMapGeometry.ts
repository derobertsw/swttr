"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tripRequest } from "@/lib/trip-requests";
import type { TripMapDay, TripMapRoadGeometry as TripMapGeometry } from "@/types/trip-map";

/**
 * How long the browser waits for a route line. The server gives the provider
 * eight seconds; a stalled connection must still end in Retry, not an endless
 * "Loading", like the trip API's other 20-second client timeouts.
 */
export const GEOMETRY_TIMEOUT_MS = 20_000;

/**
 * On demand only: selecting/panning does not calculate a route. A changed day
 * or revision hides the old line immediately, even before effect cleanup.
 */
export function useTripMapGeometry(tripId: string | null, day: TripMapDay | null) {
  const dayId = day?.id, date = day?.date, revision = day ? day.geometry.revision ?? day.revision : undefined;
  const key = tripId && dayId && revision ? JSON.stringify([tripId, dayId, date, revision]) : null;
  const [state, setState] = useState<{ key: string | null; data: TripMapGeometry | null; loading: boolean; error: Error | null }>({ key: null, data: null, loading: false, error: null });
  const pending = useRef<AbortController | null>(null);

  // Discard the old snapshot, including on access loss; selecting the same
  // trip/day again must not resurrect protected data from an earlier session.
  if (state.key !== key) setState({ key, data: null, loading: false, error: null });

  useEffect(() => () => { pending.current?.abort(); }, [key]);

  const load = useCallback(async () => {
    pending.current?.abort();
    if (!key || !tripId || !date || !dayId || !revision) return;
    const controller = new AbortController();
    pending.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, GEOMETRY_TIMEOUT_MS);
    setState({ key, data: null, loading: true, error: null });
    try {
      const data = await tripRequest<TripMapGeometry>(`/api/v1/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(date)}/geometry?revision=${encodeURIComponent(revision)}`, "GET", undefined, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (data.trip_id !== tripId || data.day_id !== dayId || data.date !== date || data.revision !== revision) throw new Error("The day's places changed. Refresh the trip map.");
      setState({ key, data, loading: false, error: null });
    } catch (error) {
      // Only our own timeout reports; a newer request or a changed day aborted the rest.
      if (timedOut && pending.current === controller) setState({ key, data: null, loading: false, error: new Error("The route line took too long. Try again.") });
      else if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: error instanceof Error ? error : new Error("Route line unavailable.") });
    } finally {
      window.clearTimeout(timer);
    }
  }, [key, tripId, dayId, date, revision]);

  return { data: state.key === key ? state.data : null, loading: state.key === key && state.loading, error: state.key === key ? state.error : null, load };
}

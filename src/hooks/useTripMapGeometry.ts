"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tripRequest } from "@/lib/trip-requests";
import type { TripMapDay, TripMapGeometry } from "@/types/trip-map";

/**
 * On demand only: selecting/panning does not calculate a route. A changed day
 * or revision hides the old line immediately, even before effect cleanup.
 */
export function useTripMapGeometry(tripId: string | null, day: TripMapDay | null) {
  const dayId = day?.id, date = day?.date, revision = day?.revision;
  const key = tripId && dayId && revision ? JSON.stringify([tripId, dayId, revision]) : null;
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
    setState({ key, data: null, loading: true, error: null });
    try {
      const data = await tripRequest<TripMapGeometry>(`/api/v1/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(date)}/geometry?revision=${encodeURIComponent(revision)}`, "GET", undefined, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (data.trip_id !== tripId || data.day_id !== dayId || data.date !== date || data.revision !== revision) throw new Error("The day's places changed. Refresh the trip map.");
      setState({ key, data, loading: false, error: null });
    } catch (error) {
      if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: error instanceof Error ? error : new Error("Route line unavailable.") });
    }
  }, [key, tripId, dayId, date, revision]);

  return { data: state.key === key ? state.data : null, loading: state.key === key && state.loading, error: state.key === key ? state.error : null, load };
}

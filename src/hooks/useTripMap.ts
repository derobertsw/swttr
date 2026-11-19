"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tripRequest, TripRequestError } from "@/lib/trip-requests";
import type { TripMap } from "@/types/trip-map";

/**
 * Private, component-owned snapshot. No storage or cross-session cache.
 * `revision` is what to refresh for, such as the trip itself: a new value
 * reads the places again, but its first arrival doesn't, so the places can
 * load alongside it instead of after it (#235).
 */
export function useTripMap(tripId: string | null, revision?: unknown) {
  const [state, setState] = useState<{ id: string | null; data: TripMap | null; error: Error | null; loading: boolean }>({ id: tripId, data: null, error: null, loading: true });
  const pending = useRef<AbortController | null>(null);
  if (state.id !== tripId) setState({ id: tripId, data: null, error: null, loading: true });

  const load = useCallback(() => {
    pending.current?.abort();
    if (!tripId) return;
    const controller = new AbortController();
    pending.current = controller;
    return tripRequest<TripMap>(`/api/v1/trips/${encodeURIComponent(tripId)}/map`, "GET", undefined, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.trip.id !== tripId) throw new Error("Trip places unavailable. Try again.");
        setState({ id: tripId, data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error("Trip places unavailable.");
        const denied = error instanceof TripRequestError && [401, 403, 404].includes(error.status);
        setState((prev) => ({ id: tripId, data: denied ? null : prev.data, error, loading: false }));
      });
  }, [tripId]);

  const seen = useRef(revision);
  useEffect(() => {
    const previous = seen.current;
    seen.current = revision;
    if (previous != null && revision != null && previous !== revision) void load();
  }, [revision, load]);

  useEffect(() => {
    void load();
    const onReturn = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      pending.current?.abort();
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [load]);
  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    await load();
  }, [load]);
  return { data: state.id === tripId ? state.data : null, error: state.id === tripId ? state.error : null, loading: state.id !== tripId || state.loading, refresh };
}

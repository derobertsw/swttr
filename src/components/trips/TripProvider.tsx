"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { TripContext, useTripState } from "@/hooks/useTrip";

export function TripProvider({ tripId, children }: { tripId: string; children: ReactNode }) {
  const { userId, sessionId, isLoaded } = useAuth();
  // Remount immediately when the trip or Clerk session changes. Private trip
  // data never persists into a different account, including pending responses.
  return (
    <TripSession key={`${tripId}:${isLoaded}:${userId}:${sessionId}`} tripId={tripId} enabled={isLoaded && !!userId}>
      {children}
    </TripSession>
  );
}

function TripSession({ tripId, enabled, children }: { tripId: string; enabled: boolean; children: ReactNode }) {
  // Packing has its own endpoint and shouldn't trigger an unused full-trip read.
  const [requested, setRequested] = useState(false);
  const activate = useCallback(() => setRequested(true), []);
  const state = useTripState(enabled && requested ? tripId : null);
  const { revalidate } = state;
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [revalidate]);

  return <TripContext.Provider value={{ tripId, state, activate }}>{children}</TripContext.Provider>;
}

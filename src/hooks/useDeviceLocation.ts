"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocationSuggestion } from "@/types/recommendations";

/** The longest the device's position is waited for, permission prompt included. */
export const LOCATION_TIMEOUT_MS = 10_000;
/** A position this recent is close enough for the weather there. */
const MAX_POSITION_AGE_MS = 5 * 60_000;

// GeolocationPositionError codes. The iOS shell's location bridge (#147) reports the same ones.
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Why the device's position isn't available. */
type LocationFailure = "denied" | "timeout" | "unavailable";

/** Where the latest request for the device's position stands. */
export type DeviceLocationStatus = "idle" | "locating" | "located" | LocationFailure;

type LocateResult =
  | { status: "located"; coordinates: Coordinates }
  | { status: LocationFailure | "cancelled" };

/**
 * Asks the device where it is, and waits at most `timeoutMs` for the answer.
 * The Geolocation API's own timeout starts only once permission is granted, so
 * this one also covers a permission prompt nobody answers. Aborting `signal`
 * ends the wait at once. A position that arrives after the wait ends is ignored.
 */
export function locateDevice(signal?: AbortSignal, timeoutMs = LOCATION_TIMEOUT_MS): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ status: "cancelled" });
      return;
    }
    if (!navigator.geolocation) {
      resolve({ status: "unavailable" });
      return;
    }

    // The first result wins; later calls do nothing, since a promise resolves only once.
    const finish = (result: LocateResult) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish({ status: "cancelled" });
    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
    signal?.addEventListener("abort", onAbort);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        finish({ status: "located", coordinates: { latitude: coords.latitude, longitude: coords.longitude } }),
      (error) =>
        finish({
          status: error.code === PERMISSION_DENIED ? "denied" : error.code === TIMEOUT ? "timeout" : "unavailable",
        }),
      { timeout: timeoutMs, maximumAge: MAX_POSITION_AGE_MS }
    );
  });
}

/** The device's position as a place to pick, shown as "Your location". */
export function yourLocation({ latitude, longitude }: Coordinates): LocationSuggestion {
  // Geocoded places have positive ids, and a country to show after the name.
  return { id: 0, name: "Your location", country: "", latitude, longitude };
}

/**
 * The device's position, looked up only when asked. One request runs at a
 * time: cancelling it, or asking again, drops whatever it would have found.
 */
export function useDeviceLocation() {
  const [status, setStatus] = useState<DeviceLocationStatus>("idle");
  const pending = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    setStatus("idle");
  }, []);

  /** Resolves with the device's position, or null when it isn't available or the request was cancelled. */
  const locate = useCallback(async (): Promise<Coordinates | null> => {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setStatus("locating");

    const result = await locateDevice(request.signal);
    // Whatever cancelled the request has already set the status.
    if (result.status === "cancelled") return null;
    pending.current = null;
    setStatus(result.status);
    return result.status === "located" ? result.coordinates : null;
  }, []);

  // Stop waiting once the page is gone.
  useEffect(() => () => pending.current?.abort(), []);

  return { status, locate, cancel };
}

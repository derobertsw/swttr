"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useUserId } from "@/hooks/useUserId";
import { STORAGE_KEYS } from "@/lib/storage";
import { defaultTemperatureUnit } from "@/lib/temperature";
import type { TemperatureUnit } from "@/types/preferences";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const serverSnapshot = (): TemperatureUnit => "F";

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(`${STORAGE_KEYS.TEMPERATURE_UNIT}:`)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const TemperatureUnitContext = createContext<{
  temperatureUnit: TemperatureUnit;
  updateTemperatureUnit: (unit: TemperatureUnit) => void;
}>({
  temperatureUnit: "F",
  updateTemperatureUnit: () => { throw new Error("TemperatureUnitProvider is required"); },
});

/** Local to this device, with independent choices for each account and guests. */
export function TemperatureUnitProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const key = `${STORAGE_KEYS.TEMPERATURE_UNIT}:${userId ? `user:${userId}` : "guest"}`;
  const getSnapshot = useCallback((): TemperatureUnit => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === "F" || saved === "C") return saved;
    } catch {
      // Unavailable storage still permits reading forecasts in the locale's units.
    }
    return defaultTemperatureUnit(navigator.language);
  }, [key]);
  const temperatureUnit = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const updateTemperatureUnit = useCallback((unit: TemperatureUnit) => {
    // Persist before announcing success. A blocked write leaves the old choice intact.
    window.localStorage.setItem(key, unit);
    notify();
  }, [key]);
  const value = useMemo(() => ({ temperatureUnit, updateTemperatureUnit }), [temperatureUnit, updateTemperatureUnit]);
  return <TemperatureUnitContext.Provider value={value}>{children}</TemperatureUnitContext.Provider>;
}

export function useTemperatureUnit() {
  return useContext(TemperatureUnitContext);
}

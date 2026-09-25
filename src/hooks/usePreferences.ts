"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { TemperatureSensitivity, UserBodyMetrics } from "@/types/preferences";
import { DEFAULT_ACTIVITY } from "@/data/activities";
import { useUserId } from "@/hooks/useUserId";
import { STORAGE_KEYS } from "@/lib/storage";
import { logWarn } from "@/lib/logger";
import {
  sanitizeBodyMetrics,
  sanitizeOptionalBodyMetrics,
} from "@/lib/biophysics/bodyMetrics";

const VALID_SENSITIVITIES: readonly TemperatureSensitivity[] = ["hot", "neutral", "cold"];

function isTemperatureSensitivity(value: string): value is TemperatureSensitivity {
  return (VALID_SENSITIVITIES as readonly string[]).includes(value);
}

interface PreferencesSnapshot {
  /** False only for the server-render snapshot, before localStorage is read. */
  hydrated: boolean;
  /** Signed-in user whose server preferences have been merged in. */
  serverSyncedFor: string | null;
  sensitivity: TemperatureSensitivity;
  defaultActivity: string;
  hasStoredDefaultActivity: boolean;
  bodyMetricsSelection: Partial<UserBodyMetrics>;
}

const SERVER_SNAPSHOT: PreferencesSnapshot = {
  hydrated: false,
  serverSyncedFor: null,
  sensitivity: "neutral",
  defaultActivity: DEFAULT_ACTIVITY,
  hasStoredDefaultActivity: false,
  bodyMetricsSelection: {},
};

// A single store shared by every usePreferences() caller, so a change made in
// one component (e.g. the preferences drawer) reaches all of them.
let snapshot: PreferencesSnapshot | null = null;
let serverSyncStartedFor: string | null = null;
const listeners = new Set<() => void>();

function readLocalPreferences(): PreferencesSnapshot {
  const storedSensitivity = localStorage.getItem(STORAGE_KEYS.SENSITIVITY);
  const storedActivity = localStorage.getItem(STORAGE_KEYS.DEFAULT_ACTIVITY);
  const storedHeight = localStorage.getItem(STORAGE_KEYS.HEIGHT_INCHES);
  const storedWeight = localStorage.getItem(STORAGE_KEYS.WEIGHT_LBS);
  const storedMetrics = sanitizeOptionalBodyMetrics({
    heightInches: storedHeight ? Number(storedHeight) : undefined,
    weightLbs: storedWeight ? Number(storedWeight) : undefined,
  });
  const hasStoredMetrics =
    storedMetrics.heightInches !== undefined || storedMetrics.weightLbs !== undefined;

  return {
    hydrated: true,
    serverSyncedFor: null,
    sensitivity:
      storedSensitivity && isTemperatureSensitivity(storedSensitivity) ? storedSensitivity : "neutral",
    defaultActivity: storedActivity || DEFAULT_ACTIVITY,
    hasStoredDefaultActivity: Boolean(storedActivity),
    bodyMetricsSelection: hasStoredMetrics ? storedMetrics : {},
  };
}

function getSnapshot(): PreferencesSnapshot {
  if (!snapshot) snapshot = readLocalPreferences();
  return snapshot;
}

function getServerSnapshot(): PreferencesSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateSnapshot(patch: Partial<PreferencesSnapshot>) {
  snapshot = { ...getSnapshot(), ...patch };
  listeners.forEach((listener) => listener());
}

async function syncServerPreferences(userId: string) {
  try {
    const res = await fetch("/api/preferences");
    if (!res.ok || serverSyncStartedFor !== userId) return;

    const data = await res.json();
    // Only overwrite localStorage when the server has saved data.
    // An empty response means no DB row exists — keep localStorage values.
    const patch: Partial<PreferencesSnapshot> = {};
    if (data.temperatureSensitivity) {
      patch.sensitivity = data.temperatureSensitivity;
      localStorage.setItem(STORAGE_KEYS.SENSITIVITY, data.temperatureSensitivity);
    }
    if (data.defaultActivity) {
      patch.defaultActivity = data.defaultActivity;
      patch.hasStoredDefaultActivity = true;
      localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, data.defaultActivity);
    }
    if (data.heightInches !== undefined || data.weightLbs !== undefined) {
      const optional = sanitizeOptionalBodyMetrics({
        heightInches: data.heightInches,
        weightLbs: data.weightLbs,
      });
      patch.bodyMetricsSelection = optional;
      if (optional.heightInches !== undefined) {
        localStorage.setItem(STORAGE_KEYS.HEIGHT_INCHES, String(optional.heightInches));
      }
      if (optional.weightLbs !== undefined) {
        localStorage.setItem(STORAGE_KEYS.WEIGHT_LBS, String(optional.weightLbs));
      }
    }
    updateSnapshot(patch);
  } catch (err) {
    logWarn("usePreferences.fetch", err);
  } finally {
    if (serverSyncStartedFor === userId) updateSnapshot({ serverSyncedFor: userId });
  }
}

async function savePreferences(payload: Record<string, unknown>, context: string) {
  try {
    await fetch("/api/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logWarn(context, err);
  }
}

export function usePreferences() {
  const userId = useUserId();
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const bodyMetrics = useMemo(
    () => sanitizeBodyMetrics(preferences.bodyMetricsSelection),
    [preferences.bodyMetricsSelection]
  );

  useEffect(() => {
    if (!userId) {
      serverSyncStartedFor = null;
      return;
    }
    if (serverSyncStartedFor === userId) return;
    serverSyncStartedFor = userId;
    void syncServerPreferences(userId);
  }, [userId]);

  const updateSensitivity = useCallback(
    async (newSensitivity: TemperatureSensitivity) => {
      updateSnapshot({ sensitivity: newSensitivity });
      localStorage.setItem(STORAGE_KEYS.SENSITIVITY, newSensitivity);

      if (userId) {
        await savePreferences({ temperatureSensitivity: newSensitivity }, "usePreferences.updateSensitivity");
      }
    },
    [userId]
  );

  const updateDefaultActivity = useCallback(
    async (newActivity: string) => {
      updateSnapshot({ defaultActivity: newActivity });
      localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, newActivity);

      if (userId) {
        await savePreferences({ defaultActivity: newActivity }, "usePreferences.updateDefaultActivity");
      }
    },
    [userId]
  );

  const updateBodyMetrics = useCallback(
    async (nextMetrics: Partial<UserBodyMetrics>) => {
      const current = getSnapshot().bodyMetricsSelection;
      const sanitizedUpdate = sanitizeOptionalBodyMetrics(nextMetrics);
      const merged = sanitizeOptionalBodyMetrics({
        heightInches: sanitizedUpdate.heightInches ?? current.heightInches,
        weightLbs: sanitizedUpdate.weightLbs ?? current.weightLbs,
      });
      updateSnapshot({ bodyMetricsSelection: merged });

      if (merged.heightInches !== undefined) {
        localStorage.setItem(STORAGE_KEYS.HEIGHT_INCHES, String(merged.heightInches));
      }
      if (merged.weightLbs !== undefined) {
        localStorage.setItem(STORAGE_KEYS.WEIGHT_LBS, String(merged.weightLbs));
      }

      if (userId) {
        const payload: Record<string, number> = {};
        if (sanitizedUpdate.heightInches !== undefined) {
          payload.heightInches = sanitizedUpdate.heightInches;
        }
        if (sanitizedUpdate.weightLbs !== undefined) {
          payload.weightLbs = sanitizedUpdate.weightLbs;
        }
        await savePreferences(payload, "usePreferences.updateBodyMetrics");
      }
    },
    [userId]
  );

  return {
    sensitivity: preferences.sensitivity,
    defaultActivity: preferences.defaultActivity,
    hasStoredDefaultActivity: preferences.hasStoredDefaultActivity,
    bodyMetrics,
    bodyMetricsSelection: preferences.bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
    loading:
      !preferences.hydrated || (userId !== null && preferences.serverSyncedFor !== userId),
  };
}

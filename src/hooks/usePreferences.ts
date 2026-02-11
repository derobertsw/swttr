"use client";

import { useState, useEffect, useCallback } from "react";
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

function getStoredSensitivity(): TemperatureSensitivity {
  if (typeof window === "undefined") return "neutral";
  const stored = localStorage.getItem(STORAGE_KEYS.SENSITIVITY);
  return stored && isTemperatureSensitivity(stored) ? stored : "neutral";
}

function getStoredDefaultActivity(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.DEFAULT_ACTIVITY);
}

function getStoredBodyMetrics(): Partial<UserBodyMetrics> {
  if (typeof window === "undefined") return {};

  const storedHeight = localStorage.getItem(STORAGE_KEYS.HEIGHT_INCHES);
  const storedWeight = localStorage.getItem(STORAGE_KEYS.WEIGHT_LBS);
  return sanitizeOptionalBodyMetrics({
    heightInches: storedHeight ? Number(storedHeight) : undefined,
    weightLbs: storedWeight ? Number(storedWeight) : undefined,
  });
}

export function usePreferences() {
  const userId = useUserId();
  const [sensitivity, setSensitivity] = useState<TemperatureSensitivity>(() => getStoredSensitivity());
  const [defaultActivity, setDefaultActivity] = useState<string>(
    () => getStoredDefaultActivity() ?? DEFAULT_ACTIVITY
  );
  const [hasStoredDefaultActivity] = useState<boolean>(() => getStoredDefaultActivity() !== null);
  const [bodyMetricsSelection, setBodyMetricsSelection] = useState<Partial<UserBodyMetrics>>(
    () => getStoredBodyMetrics()
  );
  const [loading, setLoading] = useState(true);
  const bodyMetrics = sanitizeBodyMetrics(bodyMetricsSelection);

  useEffect(() => {
    if (!userId) return;

    const fetchPreferences = async () => {
      try {
        const res = await fetch("/api/preferences", {
          headers: { "x-user-id": userId },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.temperatureSensitivity) {
            setSensitivity(data.temperatureSensitivity);
            localStorage.setItem(STORAGE_KEYS.SENSITIVITY, data.temperatureSensitivity);
          }
          if (data.defaultActivity) {
            setDefaultActivity(data.defaultActivity);
            localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, data.defaultActivity);
          }
          if (data.heightInches !== undefined || data.weightLbs !== undefined) {
            const optional = sanitizeOptionalBodyMetrics({
              heightInches: data.heightInches,
              weightLbs: data.weightLbs,
            });
            setBodyMetricsSelection(optional);
            if (optional.heightInches !== undefined) {
              localStorage.setItem(STORAGE_KEYS.HEIGHT_INCHES, String(optional.heightInches));
            } else {
              localStorage.removeItem(STORAGE_KEYS.HEIGHT_INCHES);
            }
            if (optional.weightLbs !== undefined) {
              localStorage.setItem(STORAGE_KEYS.WEIGHT_LBS, String(optional.weightLbs));
            } else {
              localStorage.removeItem(STORAGE_KEYS.WEIGHT_LBS);
            }
          }
        }
      } catch (err) {
        logWarn("usePreferences.fetch", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [userId]);

  const updateSensitivity = useCallback(
    async (newSensitivity: TemperatureSensitivity) => {
      setSensitivity(newSensitivity);
      localStorage.setItem(STORAGE_KEYS.SENSITIVITY, newSensitivity);

      if (userId) {
        try {
          await fetch("/api/preferences", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify({ temperatureSensitivity: newSensitivity }),
          });
        } catch (err) {
          logWarn("usePreferences.updateSensitivity", err);
        }
      }
    },
    [userId]
  );

  const updateDefaultActivity = useCallback(
    async (newActivity: string) => {
      setDefaultActivity(newActivity);
      localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, newActivity);

      if (userId) {
        try {
          await fetch("/api/preferences", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify({ defaultActivity: newActivity }),
          });
        } catch (err) {
          logWarn("usePreferences.updateDefaultActivity", err);
        }
      }
    },
    [userId]
  );

  const updateBodyMetrics = useCallback(
    async (nextMetrics: Partial<UserBodyMetrics>) => {
      const sanitizedUpdate = sanitizeOptionalBodyMetrics(nextMetrics);
      const merged = sanitizeOptionalBodyMetrics({
        heightInches: sanitizedUpdate.heightInches ?? bodyMetricsSelection.heightInches,
        weightLbs: sanitizedUpdate.weightLbs ?? bodyMetricsSelection.weightLbs,
      });
      setBodyMetricsSelection(merged);

      if (merged.heightInches !== undefined) {
        localStorage.setItem(STORAGE_KEYS.HEIGHT_INCHES, String(merged.heightInches));
      }
      if (merged.weightLbs !== undefined) {
        localStorage.setItem(STORAGE_KEYS.WEIGHT_LBS, String(merged.weightLbs));
      }

      if (userId) {
        try {
          const payload: Record<string, number> = {};
          if (sanitizedUpdate.heightInches !== undefined) {
            payload.heightInches = sanitizedUpdate.heightInches;
          }
          if (sanitizedUpdate.weightLbs !== undefined) {
            payload.weightLbs = sanitizedUpdate.weightLbs;
          }
          await fetch("/api/preferences", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          logWarn("usePreferences.updateBodyMetrics", err);
        }
      }
    },
    [bodyMetricsSelection, userId]
  );

  return {
    sensitivity,
    defaultActivity,
    hasStoredDefaultActivity,
    bodyMetrics,
    bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
    loading,
  };
}

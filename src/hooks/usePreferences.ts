"use client";

import { useState, useEffect, useCallback } from "react";
import { TemperatureSensitivity } from "@/types/preferences";
import { DEFAULT_ACTIVITY } from "@/data/activities";
import { useUserId } from "@/hooks/useUserId";
import { STORAGE_KEYS } from "@/lib/storage";

const VALID_SENSITIVITIES: readonly TemperatureSensitivity[] = ["hot", "neutral", "cold"];

function isTemperatureSensitivity(value: string): value is TemperatureSensitivity {
  return (VALID_SENSITIVITIES as readonly string[]).includes(value);
}

export function usePreferences() {
  const userId = useUserId();
  const [sensitivity, setSensitivity] = useState<TemperatureSensitivity>("neutral");
  const [defaultActivity, setDefaultActivity] = useState<string>(DEFAULT_ACTIVITY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage first for immediate display
    const storedSensitivity = localStorage.getItem(STORAGE_KEYS.SENSITIVITY);
    if (storedSensitivity && isTemperatureSensitivity(storedSensitivity)) {
      setSensitivity(storedSensitivity);
    }

    const storedActivity = localStorage.getItem(STORAGE_KEYS.DEFAULT_ACTIVITY);
    if (storedActivity) {
      setDefaultActivity(storedActivity);
    }
  }, []);

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
        }
      } catch {
        // Already loaded from localStorage
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
        } catch {
          // Saved to localStorage
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
        } catch {
          // Saved to localStorage
        }
      }
    },
    [userId]
  );

  return {
    sensitivity,
    defaultActivity,
    updateSensitivity,
    updateDefaultActivity,
    loading,
  };
}

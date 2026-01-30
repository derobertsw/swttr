"use client";

import { useState, useEffect, useCallback } from "react";
import { TemperatureSensitivity } from "@/types/preferences";

const STORAGE_KEY = "swttr-temperature-sensitivity";

export function useTemperatureSensitivity() {
  const [sensitivity, setSensitivity] = useState<TemperatureSensitivity>("neutral");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let storedUserId = localStorage.getItem("swttr-user-id");
    if (!storedUserId) {
      storedUserId = `user-${crypto.randomUUID()}`;
      localStorage.setItem("swttr-user-id", storedUserId);
    }
    setUserId(storedUserId);

    const fetchSensitivity = async () => {
      try {
        const res = await fetch("/api/preferences", {
          headers: { "x-user-id": storedUserId },
        });

        if (res.ok) {
          const data = await res.json();
          setSensitivity(data.temperatureSensitivity);
          localStorage.setItem(STORAGE_KEY, data.temperatureSensitivity);
        } else {
          const stored = localStorage.getItem(STORAGE_KEY) as TemperatureSensitivity | null;
          if (stored && ["hot", "neutral", "cold"].includes(stored)) {
            setSensitivity(stored);
          }
        }
      } catch {
        const stored = localStorage.getItem(STORAGE_KEY) as TemperatureSensitivity | null;
        if (stored && ["hot", "neutral", "cold"].includes(stored)) {
          setSensitivity(stored);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSensitivity();
  }, []);

  const updateSensitivity = useCallback(
    async (newSensitivity: TemperatureSensitivity) => {
      setSensitivity(newSensitivity);
      localStorage.setItem(STORAGE_KEY, newSensitivity);

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
          console.log("Failed to save preference to server, using localStorage");
        }
      }
    },
    [userId]
  );

  return { sensitivity, updateSensitivity, loading };
}

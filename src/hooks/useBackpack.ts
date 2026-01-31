"use client";

import { useState, useEffect, useCallback } from "react";
import { BackpackItem } from "@/types/recommendations";
import backpackDefaults from "@/data/backpackDefaults.json";

const STORAGE_KEY = "swttr-backpack";

interface StoredBackpackData {
  [key: string]: {
    customItems: string[];
    hiddenDefaults: string[];
  };
}

function getStorageKey(activity: string, tempRange: string): string {
  return `${activity}:${tempRange}`;
}

function loadFromLocalStorage(
  activity: string,
  tempRange: string
): { customItems: string[]; hiddenDefaults: string[] } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredBackpackData = JSON.parse(stored);
      const key = getStorageKey(activity, tempRange);
      return data[key] || { customItems: [], hiddenDefaults: [] };
    }
  } catch {
    // ignore parse errors
  }
  return { customItems: [], hiddenDefaults: [] };
}

function saveToLocalStorage(
  activity: string,
  tempRange: string,
  customItems: string[],
  hiddenDefaults: string[]
): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const data: StoredBackpackData = stored ? JSON.parse(stored) : {};
    const key = getStorageKey(activity, tempRange);
    data[key] = { customItems, hiddenDefaults };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function getDefaultItems(activity: string, tempRange: string): string[] {
  const activityData =
    backpackDefaults[activity as keyof typeof backpackDefaults];
  if (activityData) {
    return (activityData[tempRange as keyof typeof activityData] as string[]) || [];
  }
  return [];
}

export function useBackpack(activity: string, tempRange: string) {
  const [userId, setUserId] = useState<string | null>(null);
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultItems = getDefaultItems(activity, tempRange);

  // Compute merged items
  const items: BackpackItem[] = [
    ...defaultItems
      .filter((name) => !hiddenDefaults.includes(name))
      .map((name) => ({ name, isCustom: false })),
    ...customItems.map((name) => ({ name, isCustom: true })),
  ];

  // Initialize user ID and fetch data
  useEffect(() => {
    let storedUserId = localStorage.getItem("swttr-user-id");
    if (!storedUserId) {
      storedUserId = `user-${crypto.randomUUID()}`;
      localStorage.setItem("swttr-user-id", storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  // Fetch backpack data when activity/tempRange change
  useEffect(() => {
    if (!userId || !activity || !tempRange) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/backpack?activity=${encodeURIComponent(activity)}&tempRange=${encodeURIComponent(tempRange)}`,
          {
            headers: { "x-user-id": userId! },
          }
        );

        if (res.ok) {
          const data = await res.json();
          setCustomItems(data.items || []);
          setHiddenDefaults(data.hiddenDefaults || []);
        } else {
          // Fallback to localStorage
          const local = loadFromLocalStorage(activity, tempRange);
          setCustomItems(local.customItems);
          setHiddenDefaults(local.hiddenDefaults);
        }
      } catch {
        // Fallback to localStorage
        const local = loadFromLocalStorage(activity, tempRange);
        setCustomItems(local.customItems);
        setHiddenDefaults(local.hiddenDefaults);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [userId, activity, tempRange]);

  const addItem = useCallback(
    async (itemName: string) => {
      if (!itemName.trim() || customItems.includes(itemName)) return;

      const newCustomItems = [...customItems, itemName];
      setCustomItems(newCustomItems);
      saveToLocalStorage(activity, tempRange, newCustomItems, hiddenDefaults);

      if (userId) {
        try {
          await fetch("/api/backpack", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": userId,
            },
            body: JSON.stringify({ activity, tempRange, itemName }),
          });
        } catch {
          // Already saved to localStorage
        }
      }
    },
    [userId, activity, tempRange, customItems, hiddenDefaults]
  );

  const removeItem = useCallback(
    async (itemName: string) => {
      const newCustomItems = customItems.filter((i) => i !== itemName);
      setCustomItems(newCustomItems);
      saveToLocalStorage(activity, tempRange, newCustomItems, hiddenDefaults);

      if (userId) {
        try {
          await fetch(
            `/api/backpack?activity=${encodeURIComponent(activity)}&tempRange=${encodeURIComponent(tempRange)}&itemName=${encodeURIComponent(itemName)}&isDefault=false`,
            {
              method: "DELETE",
              headers: { "x-user-id": userId },
            }
          );
        } catch {
          // Already saved to localStorage
        }
      }
    },
    [userId, activity, tempRange, customItems, hiddenDefaults]
  );

  const hideDefault = useCallback(
    async (itemName: string) => {
      if (hiddenDefaults.includes(itemName)) return;

      const newHiddenDefaults = [...hiddenDefaults, itemName];
      setHiddenDefaults(newHiddenDefaults);
      saveToLocalStorage(activity, tempRange, customItems, newHiddenDefaults);

      if (userId) {
        try {
          await fetch(
            `/api/backpack?activity=${encodeURIComponent(activity)}&tempRange=${encodeURIComponent(tempRange)}&itemName=${encodeURIComponent(itemName)}&isDefault=true`,
            {
              method: "DELETE",
              headers: { "x-user-id": userId },
            }
          );
        } catch {
          // Already saved to localStorage
        }
      }
    },
    [userId, activity, tempRange, customItems, hiddenDefaults]
  );

  return {
    items,
    loading,
    addItem,
    removeItem,
    hideDefault,
  };
}

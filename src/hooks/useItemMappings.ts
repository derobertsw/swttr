"use client";

import { useState, useEffect } from "react";
import { UserItemMapping } from "@/types/wardrobe";
import { useUserId } from "@/hooks/useUserId";
import { logWarn } from "@/lib/logger";

async function fetchItemMappings(): Promise<Map<string, string>> {
  try {
    const res = await fetch("/api/wardrobe/items");

    if (!res.ok) {
      logWarn("useItemMappings", "API returned non-ok status");
      return new Map<string, string>();
    }

    const { mappings: data } = (await res.json()) as {
      mappings: UserItemMapping[];
    };

    const map = new Map<string, string>();
    for (const m of data) {
      const key = `${m.body_part}:${m.layer_type}:${m.standard_option}`;
      map.set(key, m.custom_name);
    }
    return map;
  } catch (err) {
    logWarn("useItemMappings", err);
    return new Map<string, string>();
  }
}

const NO_MAPPINGS = new Map<string, string>();

export function useItemMappings() {
  const userId = useUserId();
  // Kept with the account they were loaded for, so another account's names
  // never show after signing out or switching.
  const [loaded, setLoaded] = useState<{ userId: string; mappings: Map<string, string> } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    const load = () =>
      fetchItemMappings().then((mappings) => {
        if (current) setLoaded({ userId, mappings });
      });
    void load();
    window.addEventListener("focus", load);
    return () => {
      current = false;
      window.removeEventListener("focus", load);
    };
  }, [userId]);

  const itemMappings = loaded && loaded.userId === userId ? loaded.mappings : NO_MAPPINGS;
  return { userId, itemMappings };
}

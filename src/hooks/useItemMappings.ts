"use client";

import { useState, useEffect } from "react";
import { UserItemMapping } from "@/types/wardrobe";

async function fetchItemMappings(userId: string): Promise<Map<string, string>> {
  try {
    const res = await fetch("/api/wardrobe/items", {
      headers: { "x-user-id": userId },
    });

    if (!res.ok) {
      console.log("Failed to fetch item mappings from API, using empty map");
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
    console.error("Failed to fetch item mappings:", err);
    return new Map<string, string>();
  }
}

export function useItemMappings() {
  const [userId, setUserId] = useState<string | null>(null);
  const [itemMappings, setItemMappings] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let storedUserId = localStorage.getItem("swttr-user-id");
    if (!storedUserId) {
      storedUserId = `user-${crypto.randomUUID()}`;
      localStorage.setItem("swttr-user-id", storedUserId);
    }
    setUserId(storedUserId);
    fetchItemMappings(storedUserId).then(setItemMappings);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      if (userId) {
        fetchItemMappings(userId).then(setItemMappings);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [userId]);

  return { userId, itemMappings };
}

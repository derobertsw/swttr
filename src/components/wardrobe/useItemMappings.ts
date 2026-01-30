"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BodyPart,
  ItemMappingKey,
  LayerType,
  makeItemMappingKey,
  UserItemMapping,
} from "@/types/wardrobe";

const STORAGE_KEY = "swttr-item-mappings";

interface StoredMapping {
  bodyPart: BodyPart;
  layerType: LayerType;
  standardOption: string;
  customName: string;
}

interface UseItemMappingsResult {
  mappings: Map<ItemMappingKey, string>;
  loading: boolean;
  error: string | null;
  updateMapping: (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string,
    customName: string
  ) => Promise<void>;
  deleteMapping: (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string
  ) => Promise<void>;
  getCustomName: (
    bodyPart: BodyPart,
    layerType: LayerType,
    standardOption: string
  ) => string;
  refetch: () => Promise<void>;
}

function loadFromLocalStorage(): Map<ItemMappingKey, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredMapping[] = JSON.parse(stored);
      const map = new Map<ItemMappingKey, string>();
      for (const m of data) {
        const key = makeItemMappingKey(m.bodyPart, m.layerType, m.standardOption);
        map.set(key, m.customName);
      }
      return map;
    }
  } catch (err) {
    console.error("Failed to load from localStorage:", err);
  }
  return new Map();
}

function saveToLocalStorage(mappings: Map<ItemMappingKey, string>): void {
  try {
    const data: StoredMapping[] = [];
    mappings.forEach((customName, key) => {
      const [bodyPart, layerType, standardOption] = key.split(":") as [BodyPart, LayerType, string];
      data.push({ bodyPart, layerType, standardOption, customName });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save to localStorage:", err);
  }
}

export function useItemMappings(userId: string | null): UseItemMappingsResult {
  const [mappings, setMappings] = useState<Map<ItemMappingKey, string>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useLocalStorage, setUseLocalStorage] = useState(false);

  const fetchMappings = useCallback(async () => {
    if (!userId) {
      setMappings(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/wardrobe/items", {
        headers: { "x-user-id": userId },
      });

      // If database not configured, fall back to localStorage
      if (res.status === 503) {
        setUseLocalStorage(true);
        const localMappings = loadFromLocalStorage();
        setMappings(localMappings);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to fetch item mappings");
      }

      const { mappings: data } = (await res.json()) as {
        mappings: UserItemMapping[];
      };

      const map = new Map<ItemMappingKey, string>();
      for (const m of data) {
        const key = makeItemMappingKey(
          m.body_part as BodyPart,
          m.layer_type as LayerType,
          m.standard_option
        );
        map.set(key, m.custom_name);
      }
      setMappings(map);
      setUseLocalStorage(false);
    } catch (err) {
      console.error("Failed to fetch item mappings:", err);
      // Fall back to localStorage on any error
      setUseLocalStorage(true);
      const localMappings = loadFromLocalStorage();
      setMappings(localMappings);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const updateMapping = useCallback(
    async (
      bodyPart: BodyPart,
      layerType: LayerType,
      standardOption: string,
      customName: string
    ) => {
      if (!userId) {
        setError("Must be logged in to save changes");
        return;
      }

      const key = makeItemMappingKey(bodyPart, layerType, standardOption);

      // If using localStorage, save directly
      if (useLocalStorage) {
        setMappings((prev) => {
          const next = new Map(prev);
          next.set(key, customName);
          saveToLocalStorage(next);
          return next;
        });
        return;
      }

      try {
        const res = await fetch("/api/wardrobe/items", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
          },
          body: JSON.stringify({
            bodyPart,
            layerType,
            standardOption,
            customName,
          }),
        });

        // If database not configured, fall back to localStorage
        if (res.status === 503) {
          setUseLocalStorage(true);
          setMappings((prev) => {
            const next = new Map(prev);
            next.set(key, customName);
            saveToLocalStorage(next);
            return next;
          });
          return;
        }

        if (!res.ok) throw new Error("Failed to save mapping");

        setMappings((prev) => {
          const next = new Map(prev);
          next.set(key, customName);
          return next;
        });
      } catch (err) {
        console.error("Failed to update mapping:", err);
        // Fall back to localStorage on error
        setUseLocalStorage(true);
        setMappings((prev) => {
          const next = new Map(prev);
          next.set(key, customName);
          saveToLocalStorage(next);
          return next;
        });
      }
    },
    [userId, useLocalStorage]
  );

  const deleteMapping = useCallback(
    async (
      bodyPart: BodyPart,
      layerType: LayerType,
      standardOption: string
    ) => {
      if (!userId) return;

      const key = makeItemMappingKey(bodyPart, layerType, standardOption);

      // If using localStorage, delete directly
      if (useLocalStorage) {
        setMappings((prev) => {
          const next = new Map(prev);
          next.delete(key);
          saveToLocalStorage(next);
          return next;
        });
        return;
      }

      try {
        const params = new URLSearchParams({
          bodyPart,
          layerType,
          standardOption,
        });

        const res = await fetch(`/api/wardrobe/items?${params}`, {
          method: "DELETE",
          headers: { "x-user-id": userId },
        });

        // If database not configured, fall back to localStorage
        if (res.status === 503) {
          setUseLocalStorage(true);
          setMappings((prev) => {
            const next = new Map(prev);
            next.delete(key);
            saveToLocalStorage(next);
            return next;
          });
          return;
        }

        if (!res.ok) throw new Error("Failed to delete mapping");

        setMappings((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      } catch (err) {
        console.error("Failed to delete mapping:", err);
        // Fall back to localStorage on error
        setUseLocalStorage(true);
        setMappings((prev) => {
          const next = new Map(prev);
          next.delete(key);
          saveToLocalStorage(next);
          return next;
        });
      }
    },
    [userId, useLocalStorage]
  );

  const getCustomName = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, standardOption: string) => {
      const key = makeItemMappingKey(bodyPart, layerType, standardOption);
      return mappings.get(key) || standardOption;
    },
    [mappings]
  );

  return {
    mappings,
    loading,
    error,
    updateMapping,
    deleteMapping,
    getCustomName,
    refetch: fetchMappings,
  };
}

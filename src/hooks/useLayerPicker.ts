"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useUserId } from "@/hooks/useUserId";
import { logWarn } from "@/lib/logger";
import type { AvailableItem, WardrobeItem } from "@/types/wardrobe";
import { getClo, getBodyPart } from "@/components/wardrobe/wardrobe-utils";
import { CATEGORY_TO_LAYER_TYPE, BodyPart, LayerType } from "@/lib/layers";

export interface PickerItem {
  id: string;
  name: string;
  brand: string;
  rcl: number;
  isInUse: boolean;
  isOwned: boolean;
}

const LEGS_GARMENT_TYPES = new Set(["pants", "shorts", "bib"]);
const SWTTR_BRANDS = new Set(["patagonia", "norrona", "norrøna"]);

function inferAvailableBodyPart(item: AvailableItem): BodyPart {
  if (item.type === "handwear") return "hands";
  if (item.type === "headwear") return "headNeck";
  if (item.garment_type && LEGS_GARMENT_TYPES.has(item.garment_type.toLowerCase())) return "legs";
  return "torso";
}

function inferAvailableLayer(item: AvailableItem): LayerType {
  const category = (item.category ?? "").toLowerCase();
  const mapped = CATEGORY_TO_LAYER_TYPE[category];
  if (mapped) return mapped;
  if (category.includes("base") || category.includes("liner")) return "base";
  if (category.includes("shell") || category.includes("hard") || category.includes("soft") || category.includes("wind")) {
    return "outer";
  }
  return "mid";
}

function wardrobeBodyPart(item: WardrobeItem): BodyPart {
  const raw = getBodyPart(item);
  if (raw === "head & neck") return "headNeck";
  return raw as BodyPart;
}

function wardrobeLayerType(item: WardrobeItem): LayerType | null {
  const category = (item.details.category ?? "").toLowerCase();
  const mapped = CATEGORY_TO_LAYER_TYPE[category];
  if (mapped) return mapped;
  if (category.includes("base") || category.includes("liner")) return "base";
  if (category.includes("shell") || category.includes("hard") || category.includes("soft") || category.includes("wind")) {
    return "outer";
  }
  if (category) return "mid";
  return null;
}

export function useLayerPicker(inUseItemIds: Set<string>) {
  const userId = useUserId();
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [gearRes, availableRes] = await Promise.all([
          fetch("/api/wardrobe/gear"),
          fetch("/api/wardrobe/available"),
        ]);
        if (cancelled) return;
        const gearData = await gearRes.json();
        const availableData = await availableRes.json();
        if (cancelled) return;
        setWardrobeItems(gearData.items || []);
        setAvailableItems(availableData.items || []);
      } catch (err) {
        logWarn("useLayerPicker.fetchData", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [userId]);

  const wardrobeItemIds = useMemo(
    () => new Set(wardrobeItems.map((w) => w.item_id)),
    [wardrobeItems]
  );

  const getItems = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, targetClo?: number) => {
      // Filter and map wardrobe items
      const wItems: PickerItem[] = wardrobeItems
        .filter((item) => {
          if (item.disabled) return false;
          if (wardrobeBodyPart(item) !== bodyPart) return false;
          const lt = wardrobeLayerType(item);
          return lt === layerType;
        })
        .map((item) => {
          const clo = getClo(item) ?? 0;
          return {
            id: item.item_id,
            name: item.nickname || item.details.model_name,
            brand: item.details.brand,
            rcl: clo,
            isInUse: inUseItemIds.has(item.item_id),
            isOwned: true,
          };
        })
        .sort((a, b) => b.rcl - a.rcl);

      // Filter and map available items (exclude those already in wardrobe, brand-restricted)
      let rItems: PickerItem[] = availableItems
        .filter((item) => {
          if (wardrobeItemIds.has(item.id)) return false;
          if (!SWTTR_BRANDS.has((item.brand ?? "").toLowerCase())) return false;
          if (inferAvailableBodyPart(item) !== bodyPart) return false;
          return inferAvailableLayer(item) === layerType;
        })
        .map((item) => ({
          id: item.id,
          name: item.model_name,
          brand: item.brand,
          rcl: item.rcl_clo ?? 0,
          isInUse: inUseItemIds.has(item.id),
          isOwned: false,
        }))
        .sort((a, b) => b.rcl - a.rcl);

      // Only show recommended items closer to target than the best wardrobe option
      if (targetClo !== undefined) {
        const available = wItems.filter((w) => !w.isInUse);
        if (available.length > 0) {
          const bestWardrobeDistance = Math.min(
            ...available.map((w) => Math.abs(w.rcl - targetClo))
          );
          rItems = rItems.filter(
            (r) => Math.abs(r.rcl - targetClo) < bestWardrobeDistance
          );
        }
      }

      return { wardrobeItems: wItems, recommendedItems: rItems.slice(0, 3) };
    },
    [wardrobeItems, availableItems, wardrobeItemIds, inUseItemIds]
  );

  return { loading, getItems };
}

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
  if (!category && item.type === "headwear") return "base";
  if (!category && item.type === "handwear") return "outer";
  return "mid";
}

function wardrobeBodyPart(item: WardrobeItem): BodyPart {
  const raw = getBodyPart(item);
  if (raw === "head & neck") return "headNeck";
  return raw as BodyPart;
}

/** Map a wardrobe item to its layer type (base/mid/outer) based on category or item type. */
function wardrobeLayerType(item: WardrobeItem): LayerType | null {
  const category = (item.details.category ?? "").toLowerCase();
  const mapped = CATEGORY_TO_LAYER_TYPE[category];
  if (mapped) return mapped;
  if (category.includes("base") || category.includes("liner")) return "base";
  if (category.includes("shell") || category.includes("hard") || category.includes("soft") || category.includes("wind")) {
    return "outer";
  }
  if (category) return "mid";
  // Extremity items lack garment categories — infer from item type
  if (item.item_type === "handwear") return "outer";
  if (item.item_type === "headwear") return "base";
  return null;
}

/**
 * Check if an item's native layer type is compatible with the target layer slot.
 * Items can be placed in their native layer or one step outward:
 *   base → base, mid
 *   mid  → base, mid, outer
 *   outer → mid, outer
 */
function isLayerCompatible(itemLayer: LayerType | null, targetLayer: LayerType): boolean {
  if (itemLayer === null) return false;
  if (itemLayer === targetLayer) return true;
  if (itemLayer === "base" && targetLayer === "mid") return true;
  if (itemLayer === "mid" && (targetLayer === "outer" || targetLayer === "base")) return true;
  if (itemLayer === "outer" && targetLayer === "mid") return true;
  return false;
}

/**
 * Get regional clo value for a wardrobe item matching its body part.
 * Falls back to whole-body rcl_clo if regional values aren't available.
 */
function getRegionalClo(item: WardrobeItem, bodyPart: BodyPart): number {
  const tp = item.details.garment_thermal_properties;
  const props = Array.isArray(tp) ? tp[0] : tp;
  if (props) {
    if (bodyPart === "legs" && props.rcl_legs != null) return props.rcl_legs;
    if (bodyPart === "torso" && props.rcl_torso != null) return props.rcl_torso;
  }
  return getClo(item) ?? 0;
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
          return isLayerCompatible(lt, layerType);
        })
        .map((item) => ({
          id: item.item_id,
          name: item.nickname || item.details.model_name,
          brand: item.details.brand,
          rcl: getRegionalClo(item, bodyPart),
          isInUse: inUseItemIds.has(item.item_id),
          isOwned: true,
        }))
        .sort((a, b) => b.rcl - a.rcl);

      // Filter and map available items (exclude those already in wardrobe)
      const rItems: PickerItem[] = availableItems
        .filter((item) => {
          if (wardrobeItemIds.has(item.id)) return false;
          if (inferAvailableBodyPart(item) !== bodyPart) return false;
          return isLayerCompatible(inferAvailableLayer(item), layerType);
        })
        .map((item) => {
          const regionalRcl = bodyPart === "legs" ? item.rcl_legs
            : bodyPart === "torso" ? item.rcl_torso
            : undefined;
          return {
            id: item.id,
            name: item.model_name,
            brand: item.brand,
            rcl: regionalRcl ?? item.rcl_clo ?? 0,
            isInUse: inUseItemIds.has(item.id),
            isOwned: false,
          };
        });

      // Sort recommendations by proximity to target (closest first), then by clo descending
      if (targetClo !== undefined) {
        rItems.sort((a, b) => Math.abs(a.rcl - targetClo) - Math.abs(b.rcl - targetClo));
      } else {
        rItems.sort((a, b) => b.rcl - a.rcl);
      }

      return { wardrobeItems: wItems, recommendedItems: rItems.slice(0, 3) };
    },
    [wardrobeItems, availableItems, wardrobeItemIds, inUseItemIds]
  );

  return { loading, getItems };
}

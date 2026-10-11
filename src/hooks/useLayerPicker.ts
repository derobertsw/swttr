"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useUserId } from "@/hooks/useUserId";
import { logWarn } from "@/lib/logger";
import type { EvaluationItem } from "@/types/biophysics";
import { garmentMetadata } from '@/lib/garment-metadata';
import type { AvailableItem, WardrobeItem } from "@/types/wardrobe";
import {
  getBodyPart,
  inferAvailableBodyPart,
} from "@/components/wardrobe/wardrobe-utils";
import { CATEGORY_TO_LAYER_TYPE, BodyPart, LayerType } from "@/lib/layers";

export interface PickerItem extends EvaluationItem {
  id: string;
  name: string;
  brand: string;
  rcl?: number;
  nativeLayerType: LayerType;
  isInUse: boolean;
  isOwned: boolean;
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
 * Whether the picker for the target layer offers an item of this native layer.
 * It offers items from the target layer and the layers next to it; a picked
 * item is still worn under its native layer. Item layer → layers it's offered for:
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

/** The `items` an API route returns; throws when the request fails. */
async function fetchItems<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const data = await res.json() as { items?: T[] };
  return data.items ?? [];
}

// Unknown warmth is listed after known data, never ranked as zero clo.
function compareClo(a: PickerItem, b: PickerItem, target?: number): number {
  if (a.rcl === undefined) return b.rcl === undefined ? 0 : 1;
  if (b.rcl === undefined) return -1;
  return target === undefined ? b.rcl - a.rcl : Math.abs(a.rcl - target) - Math.abs(b.rcl - target);
}

const EMPTY_WARDROBE_ITEMS: WardrobeItem[] = [];
const EMPTY_AVAILABLE_ITEMS: AvailableItem[] = [];

export function useLayerPicker(inUseItemIds: Set<string>) {
  const userId = useUserId();
  // Items are stored with the user they were loaded for, so loading and
  // signed-out states are derived instead of synced from an effect.
  const [data, setData] = useState<{
    userId: string;
    wardrobeItems: WardrobeItem[];
    availableItems: AvailableItem[];
  } | null>(null);
  // Bumped to reload the wardrobe after it changes.
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const fetchData = async () => {
      const [gear, available] = await Promise.allSettled([
        fetchItems<WardrobeItem>("/api/wardrobe/gear"),
        fetchItems<AvailableItem>("/api/wardrobe/available"),
      ]);
      if (gear.status === "rejected") logWarn("useLayerPicker.fetchData", gear.reason);
      if (available.status === "rejected") logWarn("useLayerPicker.fetchData", available.reason);
      if (cancelled) return;
      // A list that fails to load keeps what was loaded before for this user
      // (empty on the first load), so a failed reload doesn't clear the picker.
      setData((prev) => {
        const previous = prev?.userId === userId ? prev : null;
        return {
          userId,
          wardrobeItems: gear.status === "fulfilled" ? gear.value : previous?.wardrobeItems ?? [],
          availableItems: available.status === "fulfilled" ? available.value : previous?.availableItems ?? [],
        };
      });
    };

    fetchData();
    return () => { cancelled = true; };
  }, [userId, reloadCount]);

  /** Loads the wardrobe again; the current items stay until it arrives. */
  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const isCurrent = data !== null && data.userId === userId;
  const loading = userId !== null && !isCurrent;
  const wardrobeItems = isCurrent ? data.wardrobeItems : EMPTY_WARDROBE_ITEMS;
  const availableItems = isCurrent ? data.availableItems : EMPTY_AVAILABLE_ITEMS;

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
          ...garmentMetadata(item.details),
          item_type: item.item_type,
          id: item.item_id,
          name: item.nickname || item.details.model_name,
          brand: item.details.brand,
          rcl: item.details.thermal_data_status === 'known'
            ? item.item_type === 'garment'
              ? (bodyPart === 'legs' ? item.details.rcl_legs : item.details.rcl_torso)
              : item.details.rcl_clo
            : undefined,
          nativeLayerType: wardrobeLayerType(item) ?? layerType,
          isInUse: inUseItemIds.has(item.item_id),
          isOwned: true,
        }))
        .sort((a, b) => compareClo(a, b));

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
            ...garmentMetadata(item),
            item_type: item.type,
            id: item.id,
            name: item.model_name,
            brand: item.brand,
            rcl: item.thermal_data_status === 'known' ? item.type === "garment" ? regionalRcl : item.rcl_clo : undefined,
            nativeLayerType: inferAvailableLayer(item),
            isInUse: inUseItemIds.has(item.id),
            isOwned: false,
          };
        });

      // Sort recommendations by proximity to target (closest first), then by clo descending
      if (targetClo !== undefined) {
        rItems.sort((a, b) => compareClo(a, b, targetClo));
      } else {
        rItems.sort((a, b) => compareClo(a, b));
      }

      return { wardrobeItems: wItems, recommendedItems: rItems.slice(0, 3) };
    },
    [wardrobeItems, availableItems, wardrobeItemIds, inUseItemIds]
  );

  return { loading, getItems, reload };
}

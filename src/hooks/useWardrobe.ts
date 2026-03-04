"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useUserId } from "@/hooks/useUserId";
import { logWarn } from "@/lib/logger";
import type { AvailableItem, WardrobeItem } from "@/types/wardrobe";
import {
  normalizeSearch,
  getBodyPart,
  BODY_PART_ORDER,
  inferAvailableBodyPart,
  getClo,
} from "@/components/wardrobe/wardrobe-utils";
import { CATEGORY_TO_LAYER_TYPE } from "@/lib/layers";

const SEARCH_RESULTS_LIMIT = 30;
type SearchBodyPartFilter = "all" | "torso" | "legs" | "hands" | "headNeck";
type SearchLayerFilter = "all" | "base" | "mid" | "outer";
type SearchSort = "bestMatch" | "alpha" | "clo";

function inferAvailableLayer(item: AvailableItem): Exclude<SearchLayerFilter, "all"> {
  const category = (item.category ?? "").toLowerCase();
  const mapped = CATEGORY_TO_LAYER_TYPE[category];
  if (mapped) return mapped;

  if (category.includes("base") || category.includes("liner")) return "base";
  if (category.includes("shell") || category.includes("hard") || category.includes("soft") || category.includes("wind")) {
    return "outer";
  }
  return "mid";
}

export function useWardrobe() {
  const userId = useUserId();
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null);
  const [recentlyRemoved, setRecentlyRemoved] = useState<WardrobeItem[]>([]);
  const addTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(addTimerRef.current);
  }, []);

  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [searchBodyPartFilter, setSearchBodyPartFilter] = useState<SearchBodyPartFilter>("all");
  const [searchLayerFilter, setSearchLayerFilter] = useState<SearchLayerFilter>("all");
  const [searchSort, setSearchSort] = useState<SearchSort>("bestMatch");

  const [disabledCollapsed, setDisabledCollapsed] = useState<Record<string, boolean>>({
    torso: true,
    legs: true,
    hands: true,
    "head & neck": true,
  });

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [availableRes, wardrobeRes] = await Promise.all([
          fetch("/api/wardrobe/available"),
          fetch("/api/wardrobe/gear"),
        ]);

        const availableData = await availableRes.json();
        const wardrobeData = await wardrobeRes.json();

        setAvailableItems(availableData.items || []);
        setWardrobeItems(wardrobeData.items || []);
      } catch (err) {
        logWarn("useWardrobe.fetchData", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const wardrobeItemIds = useMemo(() => new Set(wardrobeItems.map((w) => w.item_id)), [wardrobeItems]);

  const baseFilteredItems = useMemo(() => {
    return availableItems.filter((item) => {
      if (brandFilter && item.brand !== brandFilter) return false;
      if (searchBodyPartFilter !== "all" && inferAvailableBodyPart(item) !== searchBodyPartFilter) return false;
      if (searchLayerFilter !== "all" && inferAvailableLayer(item) !== searchLayerFilter) return false;
      return true;
    });
  }, [
    availableItems,
    wardrobeItemIds,
    brandFilter,
    searchBodyPartFilter,
    searchLayerFilter,
  ]);

  const filteredItems = useMemo(() => {
    const searchNormalized = normalizeSearch(search);

    return baseFilteredItems.filter((item) => {
      if (!search || !searchNormalized.trim()) return true;

      const searchText = normalizeSearch(`${item.brand} ${item.model_name} ${item.category}`);
      return searchText.includes(searchNormalized);
    });
  }, [baseFilteredItems, search]);

  const rankedFilteredItems = useMemo(() => {
    const alphaSorted = [...filteredItems].sort((a, b) => {
      const brandCompare = a.brand.localeCompare(b.brand);
      if (brandCompare !== 0) return brandCompare;
      return a.model_name.localeCompare(b.model_name);
    });

    if (searchSort === "alpha") return alphaSorted;
    if (searchSort === "clo") {
      return [...alphaSorted].sort((a, b) => {
        const cloA = typeof a.rcl_clo === "number" ? a.rcl_clo : -1;
        const cloB = typeof b.rcl_clo === "number" ? b.rcl_clo : -1;
        if (cloA !== cloB) return cloB - cloA;
        return 0;
      });
    }

    const query = normalizeSearch(search).trim();
    if (!query) return alphaSorted;

    const scoreItem = (item: AvailableItem) => {
      const brand = normalizeSearch(item.brand);
      const model = normalizeSearch(item.model_name);
      const category = normalizeSearch(item.category ?? "");
      const combined = `${brand} ${model} ${category}`;

      if (combined === query) return 500;
      if (model === query) return 450;
      if (brand === query) return 400;
      if (model.startsWith(query)) return 320;
      if (brand.startsWith(query)) return 260;
      if (category.startsWith(query)) return 220;
      if (combined.includes(query)) return 120;
      return 0;
    };

    return [...filteredItems].sort((a, b) => {
      const scoreDelta = scoreItem(b) - scoreItem(a);
      if (scoreDelta !== 0) return scoreDelta;

      const brandCompare = a.brand.localeCompare(b.brand);
      if (brandCompare !== 0) return brandCompare;
      return a.model_name.localeCompare(b.model_name);
    });
  }, [filteredItems, search, searchSort]);

  const visibleSearchItems = useMemo(() => {
    // Show all items when not searching, limited items when searching
    if (!search.trim() || !normalizeSearch(search).trim()) {
      return rankedFilteredItems;
    }
    return rankedFilteredItems.slice(0, SEARCH_RESULTS_LIMIT);
  }, [rankedFilteredItems, search]);

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    for (const item of baseFilteredItems) {
      brands.add(item.brand);
    }
    return Array.from(brands).sort();
  }, [baseFilteredItems]);

  useEffect(() => {
    if (brandFilter && !availableBrands.includes(brandFilter)) {
      setBrandFilter(null);
    }
  }, [availableBrands, brandFilter]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, AvailableItem[]> = {
      garment: [],
      handwear: [],
      headwear: [],
      custom: [],
    };
    visibleSearchItems.forEach((item) => {
      if (groups[item.type]) {
        groups[item.type].push(item);
      }
    });
    return groups;
  }, [visibleSearchItems]);

  const groupedWardrobeItems = useMemo(() => {
    const groups: Record<string, WardrobeItem[]> = {};
    for (const part of BODY_PART_ORDER) {
      groups[part] = [];
    }
    wardrobeItems.forEach((item) => {
      if (item.disabled) return;
      const part = getBodyPart(item);
      groups[part].push(item);
    });
    // Sort each group by clo value (lowest to highest)
    for (const part of BODY_PART_ORDER) {
      groups[part].sort((a, b) => {
        const cloA = getClo(a) ?? 0;
        const cloB = getClo(b) ?? 0;
        return cloA - cloB;
      });
    }
    return groups;
  }, [wardrobeItems]);

  const disabledItemsByPart = useMemo(() => {
    const groups: Record<string, WardrobeItem[]> = {};
    for (const part of BODY_PART_ORDER) {
      groups[part] = [];
    }
    wardrobeItems.forEach((item) => {
      if (!item.disabled) return;
      const part = getBodyPart(item);
      groups[part].push(item);
    });
    // Sort each group by clo value (lowest to highest)
    for (const part of BODY_PART_ORDER) {
      groups[part].sort((a, b) => {
        const cloA = getClo(a) ?? 0;
        const cloB = getClo(b) ?? 0;
        return cloA - cloB;
      });
    }
    return groups;
  }, [wardrobeItems]);

  const addItem = async (item: AvailableItem) => {
    if (!userId || adding) return;

    setAdding(item.id);
    try {
      const res = await fetch("/api/wardrobe/gear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_type: item.type,
          item_id: item.id,
        }),
      });

      if (res.ok) {
        setJustAdded(item.id);
        setAdding(null);
        // Refresh wardrobe list silently so wardrobeItemIds updates
        fetch("/api/wardrobe/gear")
          .then(r => r.json())
          .then(data => {
            setWardrobeItems(data.items || []);
          })
          .catch(err => logWarn("useWardrobe.addItem.refresh", err));
        addTimerRef.current = setTimeout(() => {
          setJustAdded(null);
        }, 600);
      } else {
        setAdding(null);
      }
    } catch (err) {
      logWarn("useWardrobe.addItem", err);
      setAdding(null);
    }
  };

  const removeItem = async (wardrobeId: string) => {
    if (!userId) return;

    const itemToRemove = wardrobeItems.find((w) => w.id === wardrobeId);

    try {
      const res = await fetch(`/api/wardrobe/gear?id=${wardrobeId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setWardrobeItems((prev) => prev.filter((w) => w.id !== wardrobeId));
        if (itemToRemove) {
          setRecentlyRemoved((prev) => [itemToRemove, ...prev]);
        }
      }
    } catch (err) {
      logWarn("useWardrobe.removeItem", err);
    }
  };

  const restoreItem = async (item: WardrobeItem) => {
    if (!userId || adding) return;

    setAdding(item.item_id);
    try {
      const res = await fetch("/api/wardrobe/gear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_type: item.item_type,
          item_id: item.item_id,
        }),
      });

      if (res.ok) {
        const wardrobeRes = await fetch("/api/wardrobe/gear");
        const wardrobeData = await wardrobeRes.json();
        setWardrobeItems(wardrobeData.items || []);
        setRecentlyRemoved((prev) => prev.filter((r) => r.item_id !== item.item_id));
      }
    } catch (err) {
      logWarn("useWardrobe.restoreItem", err);
    } finally {
      setAdding(null);
    }
  };

  const clearRecentlyRemoved = () => {
    setRecentlyRemoved([]);
  };

  const toggleDisabled = async (wardrobeId: string, currentDisabled: boolean) => {
    if (!userId) return;

    try {
      const res = await fetch("/api/wardrobe/gear", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: wardrobeId,
          disabled: !currentDisabled,
        }),
      });

      if (res.ok) {
        setWardrobeItems((prev) =>
          prev.map((w) =>
            w.id === wardrobeId ? { ...w, disabled: !currentDisabled } : w
          )
        );
      }
    } catch (err) {
      logWarn("useWardrobe.toggleDisabled", err);
    }
  };

  const toggleDisabledCollapsed = (part: string) => {
    setDisabledCollapsed(prev => ({ ...prev, [part]: !prev[part] }));
  };

  const removeItemByItemId = async (itemId: string) => {
    const entry = wardrobeItems.find((w) => w.item_id === itemId);
    if (entry) {
      await removeItem(entry.id);
    }
  };

  const clearSearchFilters = () => {
    setBrandFilter(null);
    setSearchBodyPartFilter("all");
    setSearchLayerFilter("all");
    setSearchSort("bestMatch");
  };

  return {
    loading,
    search,
    setSearch,
    adding,
    justAdded,
    wardrobeItems,
    availableItems,
    totalAvailableCount: availableItems.length,
    filteredItems,
    visibleSearchItems,
    wardrobeItemIds,
    totalMatches: filteredItems.length,
    shownMatches: visibleSearchItems.length,
    groupedItems,
    groupedWardrobeItems,
    disabledItemsByPart,
    disabledCollapsed,
    selectedItem,
    setSelectedItem,
    recentlyRemoved,
    brandFilter,
    setBrandFilter,
    searchBodyPartFilter,
    setSearchBodyPartFilter,
    searchLayerFilter,
    setSearchLayerFilter,
    searchSort,
    setSearchSort,
    availableBrands,
    clearSearchFilters,
    addItem,
    removeItem,
    removeItemByItemId,
    restoreItem,
    clearRecentlyRemoved,
    toggleDisabled,
    toggleDisabledCollapsed,
  };
}

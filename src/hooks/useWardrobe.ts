"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useUserId } from "@/hooks/useUserId";
import { logWarn } from "@/lib/logger";
import type { AvailableItem, WardrobeItem } from "@/types/wardrobe";
import { normalizeSearch, getBodyPart, BODY_PART_ORDER } from "@/components/wardrobe/wardrobe-utils";

const SEARCH_RESULTS_LIMIT = 30;

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
          fetch("/api/wardrobe/gear", {
            headers: { "x-user-id": userId },
          }),
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

  const filteredItems = useMemo(() => {
    const wardrobeIds = new Set(wardrobeItems.map((w) => w.item_id));
    const searchNormalized = normalizeSearch(search);

    return availableItems.filter((item) => {
      if (wardrobeIds.has(item.id)) return false;
      if (brandFilter && item.brand !== brandFilter) return false;
      if (!search) return true;

      const searchText = normalizeSearch(`${item.brand} ${item.model_name} ${item.category}`);
      return searchText.includes(searchNormalized);
    });
  }, [availableItems, wardrobeItems, search, brandFilter]);

  const rankedFilteredItems = useMemo(() => {
    if (!search) return filteredItems;
    const query = normalizeSearch(search).trim();
    if (!query) return filteredItems;

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
  }, [filteredItems, search]);

  const visibleSearchItems = useMemo(() => {
    if (!search.trim()) return [];
    return rankedFilteredItems.slice(0, SEARCH_RESULTS_LIMIT);
  }, [rankedFilteredItems, search]);

  const availableBrands = useMemo(() => {
    const wardrobeIds = new Set(wardrobeItems.map((w) => w.item_id));
    const brands = new Set<string>();
    for (const item of availableItems) {
      if (!wardrobeIds.has(item.id)) {
        brands.add(item.brand);
      }
    }
    return Array.from(brands).sort();
  }, [availableItems, wardrobeItems]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, AvailableItem[]> = {
      garment: [],
      handwear: [],
      headwear: [],
    };
    visibleSearchItems.forEach((item) => {
      groups[item.type].push(item);
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
          "x-user-id": userId,
        },
        body: JSON.stringify({
          item_type: item.type,
          item_id: item.id,
        }),
      });

      if (res.ok) {
        setJustAdded(item.id);
        setAdding(null);
        addTimerRef.current = setTimeout(() => {
          setJustAdded(null);
          fetch("/api/wardrobe/gear", {
            headers: { "x-user-id": userId },
          })
            .then(r => r.json())
            .then(data => {
              setWardrobeItems(data.items || []);
            })
            .catch(err => logWarn("useWardrobe.addItem.refresh", err));
          setSearch("");
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
        headers: { "x-user-id": userId },
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
          "x-user-id": userId,
        },
        body: JSON.stringify({
          item_type: item.item_type,
          item_id: item.item_id,
        }),
      });

      if (res.ok) {
        const wardrobeRes = await fetch("/api/wardrobe/gear", {
          headers: { "x-user-id": userId },
        });
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
          "x-user-id": userId,
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

  return {
    loading,
    search,
    setSearch,
    adding,
    justAdded,
    wardrobeItems,
    filteredItems,
    visibleSearchItems,
    totalMatches: search.trim() ? filteredItems.length : 0,
    shownMatches: search.trim() ? visibleSearchItems.length : 0,
    groupedItems,
    groupedWardrobeItems,
    disabledItemsByPart,
    disabledCollapsed,
    selectedItem,
    setSelectedItem,
    recentlyRemoved,
    brandFilter,
    setBrandFilter,
    availableBrands,
    addItem,
    removeItem,
    restoreItem,
    clearRecentlyRemoved,
    toggleDisabled,
    toggleDisabledCollapsed,
  };
}

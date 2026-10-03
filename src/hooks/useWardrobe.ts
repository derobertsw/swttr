"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useUserId } from "@/hooks/useUserId";
import { logWarn } from "@/lib/logger";
import type { AvailableItem, BodyPart, WardrobeItem } from "@/types/wardrobe";
import {
  normalizeSearch,
  BODY_AREAS,
  inferAvailableBodyPart,
  getClo,
  getItemBodyArea,
  getItemSearchText,
} from "@/components/wardrobe/wardrobe-utils";
import { CATEGORY_TO_LAYER_TYPE } from "@/lib/layers";

const SEARCH_RESULTS_LIMIT = 30;
export type LoadStatus = "loading" | "ready" | "error";
export type BodyAreaFilter = "all" | BodyPart;
type SearchLayerFilter = "all" | "base" | "mid" | "outer";
type SearchSort = "bestMatch" | "alpha" | "clo";

/** A change to one owned item, keyed by wardrobe entry id. */
export type RowAction = "remove" | "exclude" | "include";
/** A change requested from the catalog or Recently removed, keyed by item id. */
export type CatalogAction = "add" | "remove";
/** A request in flight, or one that failed and can be retried. */
export interface ActionState<A> {
  action: A;
  failed: boolean;
}

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

/** The `items` an API route returns; throws when the request fails. */
async function readItems<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const data = (await res.json()) as { items?: T[] };
  return data.items ?? [];
}

/** Entries whose item no longer exists come back without details. */
function withDetails(item: WardrobeItem): WardrobeItem {
  return item.details ? item : { ...item, details: { brand: "", model_name: "Item no longer in the catalog" } };
}

function itemName(item: WardrobeItem): string {
  return item.details.model_name;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function useWardrobe() {
  const userId = useUserId();
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("loading");
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [wardrobeStatus, setWardrobeStatus] = useState<LoadStatus>("loading");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [recentlyRemoved, setRecentlyRemoved] = useState<WardrobeItem[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, ActionState<RowAction>>>({});
  const [catalogStates, setCatalogStates] = useState<Record<string, ActionState<CatalogAction>>>({});
  // Read by a role="status" region so finished changes are announced.
  const [announcement, setAnnouncement] = useState("");
  // Locks each row or catalog item while its request runs, so repeated taps
  // can't send duplicate requests before the pending state renders.
  const inFlight = useRef(new Set<string>());

  const [ownedSearch, setOwnedSearch] = useState("");
  const [ownedBodyArea, setOwnedBodyArea] = useState<BodyAreaFilter>("all");

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [searchBodyPartFilter, setSearchBodyPartFilter] = useState<BodyAreaFilter>("all");
  const [searchLayerFilter, setSearchLayerFilter] = useState<SearchLayerFilter>("all");
  const [searchSort, setSearchSort] = useState<SearchSort>("bestMatch");

  // Bumped to load each list again; a cancelled load can't overwrite a newer one.
  const [wardrobeLoad, setWardrobeLoad] = useState(0);
  const [catalogLoad, setCatalogLoad] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    readItems<WardrobeItem>("/api/wardrobe/gear").then(
      (items) => {
        if (cancelled) return;
        setWardrobeItems(items.map(withDetails));
        setWardrobeStatus("ready");
      },
      (err) => {
        if (cancelled) return;
        logWarn("useWardrobe.loadWardrobe", err);
        setWardrobeStatus("error");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [userId, wardrobeLoad]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    readItems<AvailableItem>("/api/wardrobe/available").then(
      (items) => {
        if (cancelled) return;
        setAvailableItems(items);
        setCatalogStatus("ready");
      },
      (err) => {
        if (cancelled) return;
        logWarn("useWardrobe.loadCatalog", err);
        setCatalogStatus("error");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [userId, catalogLoad]);

  const retryWardrobe = () => {
    setWardrobeStatus("loading");
    setWardrobeLoad((count) => count + 1);
  };

  const retryCatalog = () => {
    setCatalogStatus("loading");
    setCatalogLoad((count) => count + 1);
  };

  // ---- Owned gear ----

  const ownedMatches = useMemo(() => {
    const query = normalizeSearch(ownedSearch).trim();
    return wardrobeItems.filter((item) => {
      if (ownedBodyArea !== "all" && getItemBodyArea(item) !== ownedBodyArea) return false;
      return !query || normalizeSearch(getItemSearchText(item)).includes(query);
    });
  }, [wardrobeItems, ownedSearch, ownedBodyArea]);

  // Each body area's items, warmest last. Excluded items keep their place so
  // a row doesn't jump when it's excluded or included.
  const ownedGroups = useMemo(
    () =>
      BODY_AREAS.map((area) => ({
        area,
        items: ownedMatches
          .filter((item) => getItemBodyArea(item) === area)
          .sort((a, b) => (getClo(a) ?? 0) - (getClo(b) ?? 0)),
      })),
    [ownedMatches]
  );

  const clearOwnedFilters = () => {
    setOwnedSearch("");
    setOwnedBodyArea("all");
  };

  const selectedItem = wardrobeItems.find((item) => item.id === selectedItemId) ?? null;

  // ---- Catalog ----

  const wardrobeItemIds = useMemo(() => new Set(wardrobeItems.map((w) => w.item_id)), [wardrobeItems]);

  const itemsMatchingNonBrandFilters = useMemo(() => {
    return availableItems.filter((item) => {
      if (searchBodyPartFilter !== "all" && inferAvailableBodyPart(item) !== searchBodyPartFilter) return false;
      if (searchLayerFilter !== "all" && inferAvailableLayer(item) !== searchLayerFilter) return false;
      return true;
    });
  }, [availableItems, searchBodyPartFilter, searchLayerFilter]);

  // Drop the brand filter once the other filters leave nothing from that brand.
  if (brandFilter && !itemsMatchingNonBrandFilters.some((item) => item.brand === brandFilter)) {
    setBrandFilter(null);
  }

  const baseFilteredItems = useMemo(
    () =>
      brandFilter
        ? itemsMatchingNonBrandFilters.filter((item) => item.brand === brandFilter)
        : itemsMatchingNonBrandFilters,
    [itemsMatchingNonBrandFilters, brandFilter]
  );

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

  const clearSearchFilters = () => {
    setBrandFilter(null);
    setSearchBodyPartFilter("all");
    setSearchLayerFilter("all");
    setSearchSort("bestMatch");
  };

  // ---- Changes ----

  const setRowState = (wardrobeId: string, state: ActionState<RowAction> | null) =>
    setRowStates((prev) => (state ? { ...prev, [wardrobeId]: state } : withoutKey(prev, wardrobeId)));

  const setCatalogState = (itemId: string, state: ActionState<CatalogAction> | null) =>
    setCatalogStates((prev) => (state ? { ...prev, [itemId]: state } : withoutKey(prev, itemId)));

  /** Puts a new or restored entry in the list, unless it's already there. */
  const insertItem = (item: WardrobeItem) => {
    setWardrobeItems((prev) => (prev.some((w) => w.id === item.id) ? prev : [item, ...prev]));
    // Adding the same item again restores it, so it's no longer removed.
    setRecentlyRemoved((prev) => prev.filter((r) => r.item_id !== item.item_id));
  };

  /** Adds a catalog item, or restores a removed one. Resolves to the new entry. */
  const addByItemId = async (
    itemType: WardrobeItem["item_type"],
    itemId: string,
    verb: "Added" | "Restored"
  ): Promise<WardrobeItem | null> => {
    const key = `item:${itemId}`;
    if (!userId || inFlight.current.has(key)) return null;
    inFlight.current.add(key);
    setCatalogState(itemId, { action: "add", failed: false });

    try {
      const res = await fetch("/api/wardrobe/gear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: itemType, item_id: itemId }),
      });
      if (res.status === 409) {
        // Already added elsewhere, e.g. in another tab. Take only that entry
        // from a fresh list, so it can't undo changes made here meanwhile.
        const existing = (await readItems<WardrobeItem>("/api/wardrobe/gear")).find((w) => w.item_id === itemId);
        if (!existing) throw new Error("POST /api/wardrobe/gear returned 409 for an item the wardrobe doesn't list");
        const item = withDetails(existing);
        insertItem(item);
        setCatalogState(itemId, null);
        setAnnouncement(`${itemName(item)} is already in your wardrobe.`);
        return item;
      }
      if (!res.ok) throw new Error(`POST /api/wardrobe/gear returned ${res.status}`);

      const item = withDetails(((await res.json()) as { item: WardrobeItem }).item);
      insertItem(item);
      setCatalogState(itemId, null);
      setAnnouncement(`${verb} ${itemName(item)} to your wardrobe.`);
      return item;
    } catch (err) {
      logWarn("useWardrobe.addByItemId", err);
      setCatalogState(itemId, { action: "add", failed: true });
      return null;
    } finally {
      inFlight.current.delete(key);
    }
  };

  const addItem = (item: AvailableItem) => addByItemId(item.type, item.id, "Added");

  const restoreItem = (item: WardrobeItem) => addByItemId(item.item_type, item.item_id, "Restored");

  /** Lists an item the custom item form just created. */
  const addCreatedItem = (item: WardrobeItem) => {
    insertItem(withDetails(item));
    setAnnouncement(`Added ${itemName(item)} to your wardrobe.`);
  };

  /** Removes an entry. The previous row stays, marked failed, if the request fails. */
  const removeItem = async (wardrobeId: string): Promise<boolean> => {
    const item = wardrobeItems.find((w) => w.id === wardrobeId);
    const key = `row:${wardrobeId}`;
    if (!userId || !item || inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    setRowState(wardrobeId, { action: "remove", failed: false });

    try {
      const res = await fetch(`/api/wardrobe/gear?id=${encodeURIComponent(wardrobeId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE /api/wardrobe/gear returned ${res.status}`);

      setWardrobeItems((prev) => prev.filter((w) => w.id !== wardrobeId));
      setRecentlyRemoved((prev) => [item, ...prev.filter((r) => r.item_id !== item.item_id)]);
      setRowState(wardrobeId, null);
      // A catalog Remove that failed earlier is settled too, whichever Retry worked.
      setCatalogState(item.item_id, null);
      setAnnouncement(`Removed ${itemName(item)}. You can restore it until you leave this page.`);
      return true;
    } catch (err) {
      logWarn("useWardrobe.removeItem", err);
      setRowState(wardrobeId, { action: "remove", failed: true });
      return false;
    } finally {
      inFlight.current.delete(key);
    }
  };

  /** Removes the entry for a catalog item. */
  const removeByItemId = async (itemId: string) => {
    const entry = wardrobeItems.find((w) => w.item_id === itemId);
    if (!entry) return;
    setCatalogState(itemId, { action: "remove", failed: false });
    const removed = await removeItem(entry.id);
    setCatalogState(itemId, removed ? null : { action: "remove", failed: true });
  };

  /**
   * Excludes an item from every recommendation, or includes it again. The
   * row keeps its previous state, marked failed, if the request fails.
   */
  const setExcluded = async (wardrobeId: string, excluded: boolean) => {
    const item = wardrobeItems.find((w) => w.id === wardrobeId);
    const key = `row:${wardrobeId}`;
    if (!userId || !item || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    const action: RowAction = excluded ? "exclude" : "include";
    setRowState(wardrobeId, { action, failed: false });

    try {
      const res = await fetch("/api/wardrobe/gear", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wardrobeId, disabled: excluded }),
      });
      if (!res.ok) throw new Error(`PATCH /api/wardrobe/gear returned ${res.status}`);

      setWardrobeItems((prev) => prev.map((w) => (w.id === wardrobeId ? { ...w, disabled: excluded } : w)));
      setRowState(wardrobeId, null);
      setAnnouncement(
        `${itemName(item)} is ${excluded ? "excluded from" : "included in"} recommendations.`
      );
    } catch (err) {
      logWarn("useWardrobe.setExcluded", err);
      setRowState(wardrobeId, { action, failed: true });
    } finally {
      inFlight.current.delete(key);
    }
  };

  /** Runs a row's failed change again. */
  const retryRow = (wardrobeId: string) => {
    const state = rowStates[wardrobeId];
    if (!state) return;
    if (state.action === "remove") void removeItem(wardrobeId);
    else void setExcluded(wardrobeId, state.action === "exclude");
  };

  const dismissRowError = (wardrobeId: string) => {
    if (rowStates[wardrobeId]?.failed) setRowState(wardrobeId, null);
  };

  const clearRecentlyRemoved = () => {
    setRecentlyRemoved([]);
  };

  return {
    wardrobeStatus,
    retryWardrobe,
    wardrobeItems,
    ownedSearch,
    setOwnedSearch,
    ownedBodyArea,
    setOwnedBodyArea,
    clearOwnedFilters,
    ownedMatchCount: ownedMatches.length,
    ownedGroups,
    selectedItem,
    setSelectedItemId,
    rowStates,
    retryRow,
    dismissRowError,
    removeItem,
    setExcluded,
    recentlyRemoved,
    restoreItem,
    clearRecentlyRemoved,
    addCreatedItem,
    announcement,

    catalogStatus,
    retryCatalog,
    catalogStates,
    totalAvailableCount: availableItems.length,
    search,
    setSearch,
    filteredItems,
    totalMatches: filteredItems.length,
    shownMatches: visibleSearchItems.length,
    groupedItems,
    wardrobeItemIds,
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
    removeByItemId,
  };
}

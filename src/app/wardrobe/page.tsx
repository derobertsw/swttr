"use client";

import { useState, useEffect, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, X, Shirt, Hand, HardHat, LucideProps } from "lucide-react";

// Custom pants icon (ski pants style) since lucide-react doesn't have one
function PantsIcon(props: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 3h12v4l1 13h-5l-2-11-2 11H5l1-13V3z" />
    </svg>
  );
}

const LEGS_GARMENT_TYPES = ["pants", "shorts", "bib"];

interface AvailableItem {
  id: string;
  type: "garment" | "handwear" | "headwear";
  brand: string;
  model_name: string;
  category: string;
  garment_type?: string;
  rcl_clo?: number;
  dexterity_score?: number;
}

interface WardrobeItem {
  id: string;
  item_type: "garment" | "handwear" | "headwear";
  item_id: string;
  nickname?: string;
  details: {
    brand: string;
    model_name: string;
    category?: string;
    garment_type?: string;
    handwear_type?: string;
    headwear_type?: string;
    rcl_clo?: number;
    garment_thermal_properties?: { rcl_whole_body?: number };
  };
}

const typeIcons = {
  garment: Shirt,
  handwear: Hand,
  headwear: HardHat,
};

// Get the appropriate icon for an item based on type and garment_type
function getItemIcon(itemType: string, garmentType?: string) {
  if (itemType === "garment" && garmentType && LEGS_GARMENT_TYPES.includes(garmentType)) {
    return PantsIcon;
  }
  return typeIcons[itemType as keyof typeof typeIcons] || Shirt;
}

const typeLabels = {
  garment: "Clothing",
  handwear: "Handwear",
  headwear: "Headwear",
};

function formatCategory(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Wardrobe() {
  const [userId, setUserId] = useState<string | null>(null);
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  // Get or create user ID
  useEffect(() => {
    let storedUserId = localStorage.getItem("swttr-user-id");
    if (!storedUserId) {
      storedUserId = `user-${crypto.randomUUID()}`;
      localStorage.setItem("swttr-user-id", storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  // Fetch available items and user's wardrobe
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
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  // Normalize special characters for search (e.g., ø -> o)
  const normalizeSearch = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/ø/g, "o")
      .replace(/æ/g, "ae")
      .replace(/å/g, "a");
  };

  // Filter available items by search and exclude already added
  const filteredItems = useMemo(() => {
    const wardrobeIds = new Set(wardrobeItems.map((w) => w.item_id));
    const searchNormalized = normalizeSearch(search);

    return availableItems.filter((item) => {
      if (wardrobeIds.has(item.id)) return false;
      if (!search) return true;

      const searchText = normalizeSearch(`${item.brand} ${item.model_name} ${item.category}`);
      return searchText.includes(searchNormalized);
    });
  }, [availableItems, wardrobeItems, search]);

  // Group filtered items by type
  const groupedItems = useMemo(() => {
    const groups: Record<string, AvailableItem[]> = {
      garment: [],
      handwear: [],
      headwear: [],
    };
    filteredItems.forEach((item) => {
      groups[item.type].push(item);
    });
    return groups;
  }, [filteredItems]);

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
        // Refresh wardrobe
        const wardrobeRes = await fetch("/api/wardrobe/gear", {
          headers: { "x-user-id": userId },
        });
        const wardrobeData = await wardrobeRes.json();
        setWardrobeItems(wardrobeData.items || []);
        setSearch("");
      }
    } catch (err) {
      console.error("Failed to add item:", err);
    } finally {
      setAdding(null);
    }
  };

  const removeItem = async (wardrobeId: string) => {
    if (!userId) return;

    try {
      const res = await fetch(`/api/wardrobe/gear?id=${wardrobeId}`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      });

      if (res.ok) {
        setWardrobeItems((prev) => prev.filter((w) => w.id !== wardrobeId));
      }
    } catch (err) {
      console.error("Failed to remove item:", err);
    }
  };

  const getClo = (item: WardrobeItem): number | undefined => {
    if (item.details.rcl_clo !== undefined) return item.details.rcl_clo;
    return item.details.garment_thermal_properties?.rcl_whole_body;
  };

  const getBodyPart = (item: WardrobeItem): string => {
    if (item.item_type === "handwear") return "hands";
    if (item.item_type === "headwear") return "head & neck";
    if (item.details.garment_type && LEGS_GARMENT_TYPES.includes(item.details.garment_type)) return "legs";
    return "torso";
  };

  const bodyPartOrder = ["torso", "legs", "hands", "head & neck"];

  const groupedWardrobeItems = useMemo(() => {
    const groups: Record<string, WardrobeItem[]> = {};
    for (const part of bodyPartOrder) {
      groups[part] = [];
    }
    wardrobeItems.forEach((item) => {
      const part = getBodyPart(item);
      groups[part].push(item);
    });
    return groups;
  }, [wardrobeItems]);

  return (
    <PageLayout>
      <div className="flex flex-col gap-8 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold">My Gear</h2>
          <p className="text-muted-foreground">
            Add your calibrated gear to get personalized thermal recommendations.
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <>
            {/* Search and add section */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search gear to add..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Dropdown results */}
              {search && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-80 overflow-y-auto">
                  {filteredItems.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No matching items found
                    </div>
                  ) : (
                    Object.entries(groupedItems).map(([type, items]) => {
                      if (items.length === 0) return null;
                      const Icon = typeIcons[type as keyof typeof typeIcons];
                      return (
                        <div key={type}>
                          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted flex items-center gap-2">
                            <Icon className="size-3" />
                            {typeLabels[type as keyof typeof typeLabels]}
                          </div>
                          {items.map((item) => {
                            const ItemIcon = getItemIcon(item.type, item.garment_type);
                            return (
                              <button
                                key={item.id}
                                onClick={() => addItem(item)}
                                disabled={adding === item.id}
                                className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2 disabled:opacity-50"
                              >
                                <ItemIcon className="size-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {item.brand} {item.model_name}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                                    <span>{formatCategory(item.category)}</span>
                                    {item.rcl_clo && (
                                      <span className="font-mono">{item.rcl_clo.toFixed(2)} clo</span>
                                    )}
                                  </div>
                                </div>
                                <Plus className="size-4 text-muted-foreground flex-shrink-0" />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* User's wardrobe list */}
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold text-sm text-muted-foreground">
                My Wardrobe ({wardrobeItems.length} items)
              </h3>

              {wardrobeItems.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground border border-dashed rounded-lg">
                  <p>No gear added yet.</p>
                  <p className="text-sm">Search above to add your calibrated items.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {bodyPartOrder.map((part) => {
                    const items = groupedWardrobeItems[part];
                    if (items.length === 0) return null;
                    return (
                      <div key={part} className="flex flex-col gap-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                          {part}
                        </h4>
                        {items.map((item) => {
                          const Icon = getItemIcon(item.item_type, item.details.garment_type);
                          const category =
                            item.details.category ||
                            item.details.handwear_type ||
                            item.details.headwear_type ||
                            "";
                          const clo = getClo(item);

                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                            >
                              <Icon className="size-5 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {item.details.brand} {item.details.model_name}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                  <span>{formatCategory(category)}</span>
                                  {clo !== undefined && (
                                    <span className="font-mono">{clo.toFixed(2)} clo</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 flex-shrink-0"
                                onClick={() => removeItem(item.id)}
                              >
                                <X className="size-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

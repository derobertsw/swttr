"use client";

import { useState, useEffect, useMemo } from "react";
import PageLayout from "@/components/PageLayout";
import { Input } from "@/components/ui/input";
import { Search, Plus, Check, Shirt, Hand, HardHat, Layers, Flame, Shield, Wind, CloudRain, LucideProps } from "lucide-react";
import { useUserId } from "@/hooks/useUserId";
import { SwipeableItem } from "@/components/SwipeableItem";
import { FROSTED_INPUT_FULL, SUGGESTIONS_DROPDOWN } from "@/lib/styling";

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

// Category-specific icons for garments
const categoryIcons: Record<string, React.ComponentType<LucideProps>> = {
  base_layer: Layers,
  mid_layer_light: Shirt,
  mid_layer_heavy: Shirt,
  insulation_synthetic: Flame,
  insulation_down: Flame,
  soft_shell: Shield,
  hard_shell: CloudRain,
  outer_insulated: Flame,
  windbreaker: Wind,
};

// Get the appropriate icon for an item based on type, garment_type, and category
function getItemIcon(itemType: string, garmentType?: string, category?: string) {
  // Check for legs garment types first (pants, shorts, bib)
  if (itemType === "garment" && garmentType && LEGS_GARMENT_TYPES.includes(garmentType)) {
    return PantsIcon;
  }
  // Use category-specific icon for garments
  if (itemType === "garment" && category && categoryIcons[category]) {
    return categoryIcons[category];
  }
  // Fall back to type icons
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
  const userId = useUserId();
  const [availableItems, setAvailableItems] = useState<AvailableItem[]>([]);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

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
        // Show checkmark briefly
        setJustAdded(item.id);
        setAdding(null);
        setTimeout(() => {
          setJustAdded(null);
          // Refresh wardrobe
          fetch("/api/wardrobe/gear", {
            headers: { "x-user-id": userId },
          }).then(r => r.json()).then(data => {
            setWardrobeItems(data.items || []);
          });
          setSearch("");
        }, 600);
      } else {
        setAdding(null);
      }
    } catch (err) {
      console.error("Failed to add item:", err);
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
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        <header>
          <h2 className="text-2xl font-semibold text-white/90 tracking-wide">My Gear</h2>
          <p className="text-[13px] text-white/55 mt-1">
            Your gear powers your thermal recommendations.
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
                  className={`pl-10 h-12 ${FROSTED_INPUT_FULL}`}
                />
              </div>

              {/* Dropdown results */}
              {search && (
                <div className={`absolute z-10 w-full mt-1.5 ${SUGGESTIONS_DROPDOWN} max-h-80 overflow-y-auto`}>
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
                          <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                            <Icon className="size-3 opacity-60" />
                            {typeLabels[type as keyof typeof typeLabels]}
                          </div>
                          {items.map((item) => {
                            const ItemIcon = getItemIcon(item.type, item.garment_type, item.category);
                            const isAdding = adding === item.id;
                            const wasJustAdded = justAdded === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => addItem(item)}
                                disabled={isAdding || wasJustAdded}
                                className="w-full px-3 py-2.5 text-left hover:bg-muted/50 flex items-center gap-3 disabled:opacity-70 transition-colors"
                              >
                                <ItemIcon className="size-5 text-muted-foreground/60 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {item.brand} {item.model_name}
                                  </div>
                                  <div className="text-xs text-muted-foreground/65 mt-0.5">
                                    {formatCategory(item.category)}
                                    {item.rcl_clo && (
                                      <span className="font-mono ml-1.5 opacity-80">· {item.rcl_clo.toFixed(2)} clo</span>
                                    )}
                                  </div>
                                </div>
                                <div className="size-8 flex items-center justify-center flex-shrink-0">
                                  {wasJustAdded ? (
                                    <Check
                                      className="size-5 text-emerald-500"
                                      style={{
                                        animation: 'checkmark-pop 0.3s ease-out forwards'
                                      }}
                                    />
                                  ) : (
                                    <Plus className="size-4 text-muted-foreground/70 hover:text-muted-foreground transition-colors" />
                                  )}
                                </div>
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
            <div className="flex flex-col gap-4 mt-2">
              <h3 className="font-medium text-sm text-white/80 mb-1">
                My Wardrobe ({wardrobeItems.length} items)
              </h3>

              <div className="flex flex-col gap-6">
                  {bodyPartOrder.map((part, index) => {
                    const items = groupedWardrobeItems[part];
                    // Get the appropriate icon for empty state based on body part
                    const getEmptyStateIcon = () => {
                      switch (part) {
                        case "torso": return Shirt;
                        case "legs": return PantsIcon;
                        case "hands": return Hand;
                        case "head & neck": return HardHat;
                        default: return Shirt;
                      }
                    };
                    const EmptyIcon = getEmptyStateIcon();
                    const isFirst = index === 0;

                    return (
                      <div key={part} className="flex flex-col gap-3">
                        <h4 className={`text-xs font-semibold text-white/80 uppercase tracking-wider px-1 pb-1.5 border-b border-white/15 ${isFirst ? '' : 'mt-4'}`}>
                          {part}
                        </h4>
                        {items.length === 0 ? (
                          <div className="flex items-center gap-3 px-3 py-4 border border-dashed border-white/20 rounded-lg">
                            <EmptyIcon className="size-5 text-white/30 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white/50">
                                No {part} items yet
                              </div>
                              <div className="text-xs text-white/40">
                                Add gear to improve recommendations
                              </div>
                            </div>
                            <Plus className="size-4 text-white/30 flex-shrink-0" />
                          </div>
                        ) : (
                          items.map((item) => {
                            const Icon = getItemIcon(item.item_type, item.details.garment_type, item.details.category);
                            const category =
                              item.details.category ||
                              item.details.handwear_type ||
                              item.details.headwear_type ||
                              "";
                            const clo = getClo(item);

                            return (
                              <SwipeableItem
                                key={item.id}
                                onDelete={() => removeItem(item.id)}
                              >
                                <div className="flex items-center gap-3 px-3 py-4">
                                  <Icon className="size-5 text-white/60 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">
                                      {item.details.brand} {item.details.model_name}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                      <span>{formatCategory(category)}</span>
                                      {clo !== undefined && (
                                        <span className="font-mono text-[10px] opacity-55">{clo.toFixed(2)} clo</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </SwipeableItem>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

"use client";

import { useMemo } from "react";
import { Plus, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { AvailableItem } from "@/types/wardrobe";
import {
  bodyPartToFilterKey,
  inferAvailableBodyPart,
  typeIcons,
  typeLabels,
  getItemIcon,
  formatCategory,
} from "./wardrobe-utils";
import {
  getAvailableMediaRef,
  getBrandInitials,
  resolveBrandLogoUrl,
  resolveItemImageUrl,
  toCssBackgroundImage,
} from "./media";

interface BodyPartPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyPart: string; // "torso", "legs", "hands", "head & neck"
  availableItems: AvailableItem[];
  wardrobeItemIds: Set<string>;
  adding: string | null;
  justAdded: string | null;
  onAddItem: (item: AvailableItem) => void;
}

export function BodyPartPickerDrawer({
  open,
  onOpenChange,
  bodyPart,
  availableItems,
  wardrobeItemIds,
  adding,
  justAdded,
  onAddItem,
}: BodyPartPickerDrawerProps) {
  const isMobile = useIsMobile();

  // Filter items by body part and exclude items already in wardrobe
  const filteredItems = useMemo(() => {
    const filterKey = bodyPartToFilterKey(bodyPart);
    return availableItems.filter(
      (item) =>
        inferAvailableBodyPart(item) === filterKey && !wardrobeItemIds.has(item.id)
    );
  }, [availableItems, bodyPart, wardrobeItemIds]);

  // Sort alphabetically by brand then model
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const brandCompare = a.brand.localeCompare(b.brand);
      if (brandCompare !== 0) return brandCompare;
      return a.model_name.localeCompare(b.model_name);
    });
  }, [filteredItems]);

  // Group by type
  const groupedItems = useMemo(() => {
    const groups: Record<string, AvailableItem[]> = {
      garment: [],
      handwear: [],
      headwear: [],
    };
    sortedItems.forEach((item) => {
      groups[item.type].push(item);
    });
    return groups;
  }, [sortedItems]);

  const title = `Add ${bodyPart.charAt(0).toUpperCase() + bodyPart.slice(1)} Gear`;
  const description = `${filteredItems.length} ${
    filteredItems.length === 1 ? "item" : "items"
  } available`;

  const content = (
    <div className="max-h-[60vh] overflow-y-auto">
      {filteredItems.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No {bodyPart} items available
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            All available items for this body part are already in your wardrobe
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {Object.entries(groupedItems).map(([type, items]) => {
            if (items.length === 0) return null;
            const Icon = typeIcons[type as keyof typeof typeIcons];
            return (
              <div key={type}>
                <div className="sticky top-0 z-10 bg-background px-1 py-1.5 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                  <Icon className="size-3 opacity-60" />
                  {typeLabels[type as keyof typeof typeLabels]}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const ItemIcon = getItemIcon(
                      item.type,
                      item.garment_type,
                      item.category
                    );
                    const isAdding = adding === item.id;
                    const wasJustAdded = justAdded === item.id;
                    const disableAdd = isAdding || wasJustAdded;
                    const media = getAvailableMediaRef(item);
                    const itemImageUrl = resolveItemImageUrl(media);
                    const brandLogoUrl = resolveBrandLogoUrl(media);
                    const brand = item.brand || "Unknown brand";

                    return (
                      <button
                        key={item.id}
                        onClick={() => onAddItem(item)}
                        disabled={disableAdd}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-70 active:bg-muted/60"
                      >
                        <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-slate-300/40 bg-[linear-gradient(145deg,rgba(241,248,253,0.95),rgba(211,226,236,0.82))]">
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-cover bg-center"
                            style={{
                              backgroundImage: toCssBackgroundImage(itemImageUrl),
                            }}
                          />
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 bg-[linear-gradient(165deg,rgba(255,255,255,0.3),rgba(15,23,42,0.12))]"
                          />
                          <div
                            aria-hidden="true"
                            className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.38),transparent_52%)]"
                          />
                          <ItemIcon className="absolute bottom-1 right-1 size-3.5 text-slate-700/70" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div
                            className="truncate text-[14px] font-semibold leading-tight text-slate-900"
                            title={item.model_name}
                          >
                            {item.model_name}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-slate-700/76">
                            {formatCategory(item.category)}
                            {typeof item.rcl_clo === "number" && (
                              <span className="ml-1.5 font-medium opacity-80">
                                · {item.rcl_clo.toFixed(2)} clo
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <div
                            className="relative flex h-8 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-300/35 bg-white/72 px-1 shadow-[0_1px_4px_rgba(15,23,42,0.12)]"
                            title={brand}
                            aria-label={`${brand} logo`}
                          >
                            <span className="pointer-events-none text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-700/72">
                              {getBrandInitials(brand)}
                            </span>
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-contain bg-center bg-no-repeat p-1"
                              style={{
                                backgroundImage: toCssBackgroundImage(brandLogoUrl),
                              }}
                            />
                          </div>

                          <div className="size-8 flex items-center justify-center">
                            {wasJustAdded ? (
                              <Check
                                className="size-5 text-emerald-500"
                                style={{
                                  animation: "checkmark-pop 0.3s ease-out forwards",
                                }}
                              />
                            ) : (
                              <Plus className="size-4 text-muted-foreground/70" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="rounded-t-2xl border-t-border/60 bg-background/95">
          <div className="mx-auto w-full max-w-sm pb-8">
            <DrawerHeader className="px-5 pb-2 pt-2">
              <DrawerTitle className="text-2xl leading-tight">{title}</DrawerTitle>
              <DrawerDescription className="text-muted-foreground/90">
                {description}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-3">{content}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-hidden border-border/60 bg-background/95">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground/90">
            {description}
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

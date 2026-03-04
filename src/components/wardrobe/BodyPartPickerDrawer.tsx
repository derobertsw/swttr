"use client";

import { useMemo } from "react";
import { Plus, Check } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  formatCategory,
} from "./wardrobe-utils";

interface BodyPartPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyPart: string; // "torso", "legs", "hands", "head & neck"
  availableItems: AvailableItem[];
  wardrobeItemIds: Set<string>;
  adding: string | null;
  justAdded: string | null;
  onAddItem: (item: AvailableItem) => void;
  onCreateCustom?: () => void;
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
  onCreateCustom,
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
      custom: [],
    };
    sortedItems.forEach((item) => {
      if (groups[item.type]) {
        groups[item.type].push(item);
      }
    });
    return groups;
  }, [sortedItems]);

  const title = `Add ${bodyPart.charAt(0).toUpperCase() + bodyPart.slice(1)} Gear`;
  const description = `${filteredItems.length} ${
    filteredItems.length === 1 ? "item" : "items"
  } available`;

  const content = (
    <div className="max-h-[60vh] overflow-y-auto">
      {onCreateCustom && (
        <button
          onClick={() => {
            onOpenChange(false);
            onCreateCustom();
          }}
          className="mb-3 flex w-full items-center gap-3 rounded-md border-2 border-emerald-300/60 bg-emerald-50/90 px-3 py-3 transition-colors hover:bg-emerald-100/90"
        >
          <Plus className="size-5 flex-shrink-0 text-emerald-600" />
          <div className="flex-1 text-left">
            <p className="text-[15px] font-semibold text-emerald-900">
              Create Custom Item
            </p>
            <p className="text-[11px] text-emerald-700/90">
              Add a generic {bodyPart} item with your own name
            </p>
          </div>
        </button>
      )}

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
                    const isAdding = adding === item.id;
                    const wasJustAdded = justAdded === item.id;
                    const disableAdd = isAdding || wasJustAdded;
                    const brand = item.brand || "Unknown brand";
                    const categoryLabel = item.category
                      ? formatCategory(item.category)
                      : "Uncategorized";
                    const clo = item.rcl_clo;

                    return (
                      <button
                        key={item.id}
                        onClick={() => onAddItem(item)}
                        disabled={disableAdd}
                        className="flex w-full items-center gap-3 rounded-md bg-white px-3 py-3 text-left transition-colors hover:bg-slate-50/80 disabled:opacity-70 active:bg-slate-100/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "overflow-hidden text-ellipsis leading-[1.15] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]",
                              "text-[15px] font-semibold text-slate-900"
                            )}
                          >
                            {item.model_name}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                                "border-slate-400/50 bg-slate-200/60 text-slate-800"
                              )}
                            >
                              {categoryLabel}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                                "border-slate-400/50 bg-slate-200/60 text-slate-800"
                              )}
                            >
                              {brand}
                            </span>
                          </div>
                        </div>

                        <div className="ml-1 flex shrink-0 items-center gap-1.5">
                          {clo !== undefined ? (
                            <div
                              className={cn(
                                "flex h-8 w-16 flex-col items-center justify-center rounded-lg border px-1",
                                "border-blue-400/60 bg-blue-100/70"
                              )}
                            >
                              <div
                                className={cn(
                                  "font-mono text-[13px] font-bold leading-none",
                                  "text-blue-800"
                                )}
                              >
                                {clo.toFixed(2)}
                              </div>
                              <div
                                className={cn(
                                  "mt-0.5 text-[9px] font-medium uppercase tracking-wider",
                                  "text-blue-700/75"
                                )}
                              >
                                clo
                              </div>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "flex h-8 w-16 items-center justify-center rounded-lg border px-1",
                                "border-slate-400/50 bg-slate-200/60"
                              )}
                            >
                              <div className="text-center text-[9px] font-medium text-slate-600/72">
                                Pending
                              </div>
                            </div>
                          )}

                          <div className="size-8 flex items-center justify-center">
                            {wasJustAdded ? (
                              <Check
                                className="size-5 text-emerald-500"
                                style={{
                                  animation: "checkmark-pop 0.3s ease-out forwards",
                                }}
                              />
                            ) : (
                              <Plus className="size-4 text-slate-600/70" />
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

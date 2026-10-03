"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { BodyPart, LayerType, BODY_PART_LABELS, LAYER_LABELS } from "@/lib/layers";
import { cn } from "@/lib/utils";
import type { PickerItem } from "@/hooks/useLayerPicker";

interface CloContext {
  targetClo: number;
  currentClo: number;
  delta: number; // positive = need more, negative = over target
}

interface LayerPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyPart: BodyPart;
  layerType: LayerType;
  wardrobeItems: PickerItem[];
  recommendedItems: PickerItem[];
  currentItemName?: string;
  currentItemClo?: number;
  cloContext?: CloContext;
  onSelect: (item: PickerItem) => void;
  onRemove?: () => void;
  /** Where focus goes on close; the drawer opens from code, not a trigger. */
  onCloseAutoFocus?: (event: Event) => void;
}

function PickerItemRow({
  item,
  onSelect,
  variant = "wardrobe",
}: {
  item: PickerItem;
  onSelect: (item: PickerItem) => void;
  variant?: "wardrobe" | "recommended";
}) {
  const isRecommended = variant === "recommended";
  return (
    <button
      type="button"
      disabled={item.isInUse}
      onClick={() => onSelect(item)}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 rounded-control border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
        isRecommended
          ? "border-transparent bg-primary-soft hover:border-primary"
          : "border-border bg-card hover:bg-accent"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{item.brand}</p>
        <p className="truncate text-base font-semibold text-foreground">{item.name}</p>
        {!item.isOwned && <p className="text-xs font-medium text-primary">Not in your wardrobe</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.isInUse && <Badge size="sm">In use</Badge>}
        <Badge size="sm" variant="outline" className="tabular-nums">
          {item.rcl.toFixed(2)} clo
        </Badge>
      </div>
    </button>
  );
}

function PickerSection({
  title,
  items,
  maxHeight,
  emptyMessage,
  onSelect,
  variant = "wardrobe",
}: {
  title: string;
  items: PickerItem[];
  maxHeight: string;
  emptyMessage: string;
  onSelect: (item: PickerItem) => void;
  variant?: "wardrobe" | "recommended";
}) {
  const isRecommended = variant === "recommended";
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <div className="rounded-control border border-dashed border-border px-3 py-3 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          {!isRecommended && (
            <Link
              href="/wardrobe"
              className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Go to Wardrobe
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight }}>
          {items.map((item) => (
            <PickerItemRow key={item.id} item={item} onSelect={onSelect} variant={variant} />
          ))}
        </div>
      )}
    </div>
  );
}

function CloGapHint({ context }: { context: CloContext }) {
  const CLO_EPSILON = 0.05;
  const needMore = context.delta > CLO_EPSILON;
  const tooMuch = context.delta < -CLO_EPSILON;

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-control px-3 py-2 text-sm",
      needMore
        ? "bg-muted text-foreground"
        : tooMuch
          ? "bg-warning-soft text-warning"
          : "bg-success-soft text-success"
    )}>
      <span>
        {needMore
          ? `Need ~${context.delta.toFixed(1)} more clo`
          : tooMuch
            ? `Over by ${Math.abs(context.delta).toFixed(1)} clo`
            : "In target range"}
      </span>
      <span className="font-semibold tabular-nums">
        {context.currentClo.toFixed(1)} / {context.targetClo.toFixed(1)} clo
      </span>
    </div>
  );
}

export function LayerPickerDrawer({
  open,
  onOpenChange,
  bodyPart,
  layerType,
  wardrobeItems,
  recommendedItems,
  currentItemName,
  currentItemClo,
  cloContext,
  onSelect,
  onRemove,
  onCloseAutoFocus,
}: LayerPickerDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
        <DrawerHeader className="pb-1">
          <DrawerTitle>{LAYER_LABELS[layerType]} Layer</DrawerTitle>
          <DrawerDescription>{BODY_PART_LABELS[bodyPart]}</DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="flex flex-col pb-6">
          {/* Clo context + current item — compact top section */}
          {(cloContext || (currentItemName && onRemove)) && (
            <div className="flex flex-col gap-2 pb-3">
              {cloContext && <CloGapHint context={cloContext} />}
              {currentItemName && onRemove && (
                <div className="flex items-center gap-2 rounded-control bg-muted py-1 pr-1 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">Wearing now</p>
                    <p className="truncate text-sm font-semibold text-foreground">{currentItemName}</p>
                  </div>
                  {currentItemClo !== undefined && (
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {currentItemClo.toFixed(2)} clo
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRemove}
                    className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                    aria-label="Remove current item"
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Wardrobe items */}
          <div className="border-t border-border pt-3">
            <PickerSection
              title="Your wardrobe"
              items={wardrobeItems}
              maxHeight="168px"
              emptyMessage="No matching items in your wardrobe"
              onSelect={onSelect}
            />
          </div>

          {/* Catalog items the user doesn't own */}
          <div className="mt-4 border-t border-border pt-3">
            <PickerSection
              title="Other options"
              items={recommendedItems}
              maxHeight="240px"
              emptyMessage="No other options for this layer"
              onSelect={onSelect}
              variant="recommended"
            />
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

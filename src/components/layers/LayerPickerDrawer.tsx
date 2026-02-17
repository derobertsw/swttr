"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { BodyPart, LayerType, BODY_PART_LABELS, LAYER_LABELS } from "@/lib/layers";
import { cn } from "@/lib/utils";
import type { PickerItem } from "@/hooks/useLayerPicker";

interface LayerPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodyPart: BodyPart;
  layerType: LayerType;
  wardrobeItems: PickerItem[];
  recommendedItems: PickerItem[];
  currentItemName?: string;
  onSelect: (item: PickerItem) => void;
  onRemove?: () => void;
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
        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        item.isInUse
          ? "border-slate-200 bg-slate-50 opacity-40 cursor-not-allowed"
          : isRecommended
            ? "border-indigo-200/80 bg-indigo-50/50 hover:bg-indigo-50 active:bg-indigo-100/70"
            : "border-slate-200/80 bg-white hover:bg-slate-50 active:bg-slate-100"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-[11px] font-medium uppercase tracking-wide",
          isRecommended ? "text-indigo-500" : "text-slate-500"
        )}>
          {item.brand}
        </p>
        <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.isInUse && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            In use
          </span>
        )}
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
          isRecommended
            ? "border-indigo-300/80 bg-indigo-50/90 text-indigo-700"
            : "border-slate-300/80 bg-slate-50/90 text-slate-700"
        )}>
          {item.rcl.toFixed(2)} clo
        </span>
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
    <div className={cn(
      "rounded-lg",
      isRecommended && "border border-indigo-200/60 bg-indigo-50/30 px-3 py-3"
    )}>
      <h4 className={cn(
        "mb-2 text-xs font-bold uppercase tracking-wide",
        isRecommended ? "text-indigo-600" : "text-slate-500"
      )}>
        {title}
      </h4>
      {items.length === 0 ? (
        <div className={cn(
          "rounded-lg border border-dashed px-3 py-4 text-center",
          isRecommended
            ? "border-indigo-300/60 bg-indigo-50/50"
            : "border-slate-300 bg-slate-50"
        )}>
          <p className={cn("text-sm", isRecommended ? "text-indigo-400" : "text-slate-500")}>{emptyMessage}</p>
          {!isRecommended && (
            <Link
              href="/wardrobe"
              className="mt-1 inline-block text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Go to Wardrobe
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-y-auto space-y-1.5" style={{ maxHeight }}>
          {items.map((item) => (
            <PickerItemRow key={item.id} item={item} onSelect={onSelect} variant={variant} />
          ))}
        </div>
      )}
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
  onSelect,
  onRemove,
}: LayerPickerDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{LAYER_LABELS[layerType]} Layer</DrawerTitle>
          <DrawerDescription>{BODY_PART_LABELS[bodyPart]}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          {currentItemName && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-red-200/80 bg-red-50/60 px-3 py-2.5 text-left transition-colors hover:bg-red-50 active:bg-red-100"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-400">Current</p>
                <p className="truncate text-sm font-semibold text-slate-900">{currentItemName}</p>
              </div>
              <div className="flex items-center gap-1.5 text-red-500">
                <Trash2 className="size-4" />
                <span className="text-xs font-semibold">Remove</span>
              </div>
            </button>
          )}
          <PickerSection
            title="Your Wardrobe"
            items={wardrobeItems}
            maxHeight="220px"
            emptyMessage="No matching items in your wardrobe"
            onSelect={onSelect}
          />
          <PickerSection
            title="SWTTR Recommends"
            items={recommendedItems}
            maxHeight="330px"
            emptyMessage="No recommendations available"
            onSelect={onSelect}
            variant="recommended"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

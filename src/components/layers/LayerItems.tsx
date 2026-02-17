"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  LayerSet,
  LayerItem,
  BodyPart,
  LayerType,
  LAYER_LABELS,
  applyItemMappings,
} from "@/lib/layers";
import { cn } from "@/lib/utils";

interface LayerItemsProps {
  layers: LayerSet;
  bodyPart: BodyPart;
  biophysicsActive: boolean;
  itemMappings?: Map<string, string>;
  onItemTap: (layerType: LayerType, index: number) => void;
  onItemRemove: (layerType: LayerType, index: number) => void;
  onAddLayer: (layerType: LayerType) => void;
}

const LAYER_TYPES_BY_BODY_PART: Record<BodyPart, LayerType[]> = {
  torso: ["base", "mid", "outer"],
  legs: ["base", "outer"],
  hands: ["base", "outer"],
  headNeck: ["base", "outer"],
};

const ACTION_WIDTH = 64;
const SWIPE_THRESHOLD = -60;

function SwipeableLayerItem({
  item,
  onTap,
  onRemove,
}: {
  item: LayerItem;
  onTap: () => void;
  onRemove: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      startXRef.current = e.touches[0].clientX;
      currentXRef.current = translateX;
      setIsDragging(true);
    },
    [translateX]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const diff = e.touches[0].clientX - startXRef.current;
      const newTranslate = Math.min(0, Math.max(-ACTION_WIDTH - 20, currentXRef.current + diff));
      setTranslateX(newTranslate);
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (translateX < SWIPE_THRESHOLD) {
      setTranslateX(-ACTION_WIDTH);
    } else {
      setTranslateX(0);
    }
  }, [translateX]);

  const handleRemove = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.transition = "all 0.3s ease-out";
      containerRef.current.style.opacity = "0";
      containerRef.current.style.maxHeight = "0";
      containerRef.current.style.marginBottom = "0";
      containerRef.current.style.padding = "0";
    }
    setTimeout(onRemove, 300);
  }, [onRemove]);

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-md">
      {/* Remove action behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch transition-opacity"
        style={{ width: ACTION_WIDTH, opacity: translateX < -10 ? 1 : 0 }}
      >
        <button
          onClick={handleRemove}
          className="flex flex-col items-center justify-center bg-red-500/90 text-white rounded-r-md w-full"
        >
          <Trash2 className="size-4" />
          <span className="text-[10px] mt-0.5">Remove</span>
        </button>
      </div>

      {/* Main content */}
      <div
        className="relative flex items-start justify-between gap-3 rounded-md border border-slate-200/80 bg-white/45 px-2.5 py-2 cursor-pointer touch-pan-y"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (translateX === 0) onTap();
        }}
      >
        <span className="min-w-0 text-slate-900 font-semibold leading-snug">
          {item.name}
          {item.isRecommended && (
            <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              SWTTR
            </span>
          )}
        </span>
        {item.rcl !== undefined && (
          <span className="shrink-0 rounded-full border border-slate-300/80 bg-slate-50/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
            {item.rcl.toFixed(2)} clo
          </span>
        )}
      </div>
    </div>
  );
}

function LayerGroup({
  label,
  items,
  layerType,
  onItemTap,
  onItemRemove,
  onAddLayer,
}: {
  label: string;
  items: LayerItem[];
  layerType: LayerType;
  onItemTap: (index: number) => void;
  onItemRemove: (index: number) => void;
  onAddLayer: () => void;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <span className="text-xs uppercase text-slate-900/60 tracking-wide">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <SwipeableLayerItem
            key={`${item.sourceId || item.name}-${index}`}
            item={item}
            onTap={() => onItemTap(index)}
            onRemove={() => onItemRemove(index)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAddLayer}
        className={cn(
          "flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs font-medium transition-colors",
          "text-slate-500 hover:text-slate-700 hover:bg-slate-100/60"
        )}
      >
        <Plus className="size-3" />
        Add {label.toLowerCase()}
      </button>
    </li>
  );
}

/**
 * Displays garment layers (base, mid, outer) for a body part.
 * Each item is tappable (to open picker) and swipeable (to remove).
 * Includes an "Add" button per layer type.
 */
export function LayerItems({
  layers,
  bodyPart,
  biophysicsActive,
  itemMappings,
  onItemTap,
  onItemRemove,
  onAddLayer,
}: LayerItemsProps) {
  const layerTypes = LAYER_TYPES_BY_BODY_PART[bodyPart];

  const getDisplayItems = (items: LayerItem[], layerType: LayerType): LayerItem[] => {
    if (biophysicsActive || !itemMappings) {
      return items;
    }
    return applyItemMappings(items, bodyPart, layerType, itemMappings);
  };

  return (
    <>
      {layerTypes.map((layerType) => {
        const items = getDisplayItems(layers[layerType] ?? [], layerType);

        return (
          <LayerGroup
            key={`${bodyPart}:${layerType}`}
            label={LAYER_LABELS[layerType]}
            items={items}
            layerType={layerType}
            onItemTap={(index) => onItemTap(layerType, index)}
            onItemRemove={(index) => onItemRemove(layerType, index)}
            onAddLayer={() => onAddLayer(layerType)}
          />
        );
      })}
    </>
  );
}

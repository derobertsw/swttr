"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { ArrowDownToLine, GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LayerSet,
  LayerItem,
  BodyPart,
  LayerType,
  LAYER_LABELS,
} from "@/lib/layers";
import { cn } from "@/lib/utils";

interface LayerItemsProps {
  layers: LayerSet;
  bodyPart: BodyPart;
  otherPhaseLayers?: LayerSet;
  syncLabel?: string;
  onItemTap: (layerType: LayerType, index: number) => void;
  onItemRemove: (layerType: LayerType, index: number) => void;
  onAddLayer: (layerType: LayerType) => void;
  onSyncFromOtherPhase?: (layerType: LayerType) => void;
  onMoveItem?: (fromLayerType: LayerType, fromIndex: number, toLayerType: LayerType) => void;
}

const LAYER_TYPES_BY_BODY_PART: Record<BodyPart, LayerType[]> = {
  torso: ["base", "mid", "outer"],
  legs: ["base", "mid", "outer"],
  hands: ["base", "mid", "outer"],
  headNeck: ["base", "mid", "outer"],
};

function layerItemsDiffer(a: LayerItem[], b: LayerItem[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((item, i) => (item.sourceId || item.name) !== (b[i].sourceId || b[i].name));
}

const ACTION_WIDTH = 64;
const SWIPE_THRESHOLD = -60;
const DRAG_ACTIVATE_PX = 10;

interface DragInfo {
  layerType: LayerType;
  index: number;
  item: LayerItem;
  startY: number;
  ghostY: number;
  overLayerType: LayerType | null;
  active: boolean;
}

function SwipeableLayerItem({
  item,
  isDragSource,
  onTap,
  onRemove,
  onDragStart,
}: {
  item: LayerItem;
  isDragSource?: boolean;
  onTap: () => void;
  onRemove: () => void;
  onDragStart?: (clientY: number) => void;
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
    <div ref={containerRef} className={cn("relative overflow-hidden rounded-control", isDragSource && "opacity-25")}>
      {/* Remove action behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch transition-opacity"
        style={{ width: ACTION_WIDTH, opacity: translateX < -10 ? 1 : 0 }}
      >
        <button
          type="button"
          tabIndex={translateX < -10 ? 0 : -1}
          onClick={handleRemove}
          className="flex w-full flex-col items-center justify-center rounded-r-control bg-destructive text-destructive-foreground"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="mt-0.5 text-xs">Remove</span>
        </button>
      </div>

      {/* Main content */}
      <div
        role="button"
        tabIndex={0}
        className="relative flex min-h-11 cursor-pointer touch-pan-y items-center gap-1.5 rounded-control border border-input bg-card px-2.5 py-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onTap();
          }
        }}
      >
        {onDragStart && (
          <div
            aria-hidden="true"
            className="-ml-1 flex shrink-0 cursor-grab touch-none items-center self-stretch text-muted-foreground"
            onTouchStart={(e) => {
              e.stopPropagation();
              onDragStart(e.touches[0].clientY);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDragStart(e.clientY);
            }}
          >
            <GripVertical className="size-3.5" />
          </div>
        )}
        <span className="min-w-0 flex-1 font-medium leading-snug text-foreground">
          {item.name}
          {item.isRecommended && (
            <Badge size="sm" variant="outline" className="ml-2 align-middle font-medium">
              Not in your wardrobe
            </Badge>
          )}
        </span>
        {item.rcl !== undefined && (
          <Badge size="sm" variant="neutral" className="font-medium tabular-nums">
            {item.rcl.toFixed(2)} clo
          </Badge>
        )}
      </div>
    </div>
  );
}

function LayerGroup({
  elRef,
  label,
  items,
  otherPhaseItems,
  syncLabel,
  isDropTarget,
  dragSourceIndex,
  onItemTap,
  onItemRemove,
  onAddLayer,
  onSyncFromOtherPhase,
  onDragStart,
}: {
  elRef?: (el: HTMLLIElement | null) => void;
  label: string;
  items: LayerItem[];
  otherPhaseItems?: LayerItem[];
  syncLabel?: string;
  isDropTarget?: boolean;
  dragSourceIndex?: number;
  onItemTap: (index: number) => void;
  onItemRemove: (index: number) => void;
  onAddLayer: () => void;
  onSyncFromOtherPhase?: () => void;
  onDragStart?: (index: number, item: LayerItem, clientY: number) => void;
}) {
  const showSyncPrompt =
    onSyncFromOtherPhase &&
    otherPhaseItems &&
    otherPhaseItems.length > 0 &&
    layerItemsDiffer(items, otherPhaseItems);

  return (
    <li
      ref={elRef}
      className={cn(
        "-m-1 flex flex-col gap-1.5 rounded-control p-1 transition-colors",
        isDropTarget && "bg-primary-soft ring-1 ring-primary"
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <SwipeableLayerItem
            key={`${item.sourceId || item.name}-${index}`}
            item={item}
            isDragSource={dragSourceIndex === index}
            onTap={() => onItemTap(index)}
            onRemove={() => onItemRemove(index)}
            onDragStart={onDragStart ? (clientY) => onDragStart(index, item, clientY) : undefined}
          />
        ))}
      </div>
      {isDropTarget && (
        <div className="flex items-center justify-center rounded-control border border-dashed border-primary py-1.5 text-xs font-semibold text-primary">
          Drop here
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {showSyncPrompt && (
          <Button type="button" variant="outline" size="sm" onClick={onSyncFromOtherPhase}>
            <ArrowDownToLine aria-hidden="true" />
            {syncLabel ? `${syncLabel} ${label.toLowerCase()}` : `Use ${label.toLowerCase()}`}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={onAddLayer}>
          <Plus aria-hidden="true" />
          Add {label.toLowerCase()}
        </Button>
      </div>
    </li>
  );
}

/**
 * Editing controls for a body part's garment layers (base, mid, outer).
 * Each item opens the picker when tapped or activated from the keyboard, and
 * swipes to remove. Items can be dragged between layer types via the grip
 * handle. Includes an "Add" button per layer type.
 */
export function LayerItems({
  layers,
  bodyPart,
  otherPhaseLayers,
  syncLabel,
  onItemTap,
  onItemRemove,
  onAddLayer,
  onSyncFromOtherPhase,
  onMoveItem,
}: LayerItemsProps) {
  const layerTypes = LAYER_TYPES_BY_BODY_PART[bodyPart];

  // --- Drag between layer types ---
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const onMoveItemRef = useRef(onMoveItem);
  // Window listeners read the latest drag state and callback through refs.
  useLayoutEffect(() => {
    dragRef.current = drag;
    onMoveItemRef.current = onMoveItem;
  });
  const layerGroupRefs = useRef(new Map<LayerType, HTMLLIElement>());

  const getOverLayerType = useCallback((clientY: number): LayerType | null => {
    for (const [lt, el] of layerGroupRefs.current) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return lt;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!drag) return;

    const handleTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const d = dragRef.current;
      if (!d) return;
      if (!d.active && Math.abs(y - d.startY) > DRAG_ACTIVATE_PX) {
        e.preventDefault();
        setDrag((prev) => prev ? { ...prev, active: true, ghostY: y, overLayerType: getOverLayerType(y) } : null);
      } else if (d.active) {
        e.preventDefault();
        setDrag((prev) => prev ? { ...prev, ghostY: y, overLayerType: getOverLayerType(y) } : null);
      }
    };

    const handleTouchEnd = () => {
      const d = dragRef.current;
      if (d?.active && d.overLayerType && d.overLayerType !== d.layerType) {
        onMoveItemRef.current?.(d.layerType, d.index, d.overLayerType);
      }
      setDrag(null);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const y = e.clientY;
      const d = dragRef.current;
      if (!d) return;
      if (!d.active && Math.abs(y - d.startY) > DRAG_ACTIVATE_PX) {
        setDrag((prev) => prev ? { ...prev, active: true, ghostY: y, overLayerType: getOverLayerType(y) } : null);
      } else if (d.active) {
        setDrag((prev) => prev ? { ...prev, ghostY: y, overLayerType: getOverLayerType(y) } : null);
      }
    };

    const handleMouseUp = () => {
      const d = dragRef.current;
      if (d?.active && d.overLayerType && d.overLayerType !== d.layerType) {
        onMoveItemRef.current?.(d.layerType, d.index, d.overLayerType);
      }
      setDrag(null);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, getOverLayerType]);

  const handleDragStart = useCallback(
    (layerType: LayerType, index: number, item: LayerItem, clientY: number) => {
      setDrag({ layerType, index, item, startY: clientY, ghostY: clientY, overLayerType: null, active: false });
    },
    []
  );

  return (
    <>
      {layerTypes.map((layerType) => {
        const items = layers[layerType] ?? [];
        const otherPhaseItemsForType = otherPhaseLayers ? (otherPhaseLayers[layerType] ?? []) : undefined;
        const isDropTarget = drag?.active === true && drag.overLayerType === layerType && drag.layerType !== layerType;

        return (
          <LayerGroup
            key={`${bodyPart}:${layerType}`}
            elRef={(el) => { if (el) layerGroupRefs.current.set(layerType, el); }}
            label={LAYER_LABELS[layerType]}
            items={items}
            otherPhaseItems={otherPhaseItemsForType}
            syncLabel={syncLabel}
            isDropTarget={isDropTarget}
            dragSourceIndex={drag?.active && drag.layerType === layerType ? drag.index : undefined}
            onItemTap={(index) => onItemTap(layerType, index)}
            onItemRemove={(index) => onItemRemove(layerType, index)}
            onAddLayer={() => onAddLayer(layerType)}
            onSyncFromOtherPhase={onSyncFromOtherPhase ? () => onSyncFromOtherPhase(layerType) : undefined}
            onDragStart={onMoveItem ? (index, item, clientY) => handleDragStart(layerType, index, item, clientY) : undefined}
          />
        );
      })}
      {drag?.active && (
        <div
          className="pointer-events-none fixed right-4 left-4 z-50 flex items-center justify-between rounded-control border border-primary bg-popover px-3 py-2 text-popover-foreground shadow-lg"
          style={{ top: drag.ghostY - 20 }}
        >
          <span className="text-sm font-semibold">{drag.item.name}</span>
          {drag.item.rcl !== undefined && (
            <span className="text-xs tabular-nums text-muted-foreground">{drag.item.rcl.toFixed(2)} clo</span>
          )}
        </div>
      )}
    </>
  );
}

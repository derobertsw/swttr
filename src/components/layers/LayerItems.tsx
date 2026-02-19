"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowDownToLine, GripVertical, Plus, Trash2 } from "lucide-react";
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
  readOnly?: boolean;
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
    <div ref={containerRef} className={cn("relative overflow-hidden rounded-md", isDragSource && "opacity-25")}>
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
        className="relative flex items-center gap-1.5 rounded-md border border-slate-200/80 bg-white/45 px-2.5 py-2 cursor-pointer touch-pan-y"
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
        {onDragStart && (
          <div
            className="flex shrink-0 items-center self-stretch -ml-1 touch-none cursor-grab text-slate-300 active:text-slate-500"
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
        <span className="min-w-0 flex-1 text-slate-900 font-semibold leading-snug">
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

function ReadOnlyLayerItem({ item }: { item: LayerItem }) {
  return (
    <div className="relative overflow-hidden rounded-md">
      <div className="relative flex items-start justify-between gap-3 rounded-md border border-slate-200/80 bg-white/45 px-2.5 py-2">
        <span className="min-w-0 text-slate-900 font-semibold leading-snug">
          {item.name}
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
  elRef,
  label,
  items,
  layerType,
  readOnly,
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
  layerType: LayerType;
  readOnly?: boolean;
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
        "flex flex-col gap-1.5 rounded-lg p-1 -m-1 transition-colors",
        isDropTarget && "bg-violet-100/60 ring-1 ring-violet-300/70"
      )}
    >
      <span className="text-xs uppercase text-slate-900/60 tracking-wide">{label}</span>
      <div className="flex flex-col gap-2">
        {items.map((item, index) =>
          readOnly ? (
            <ReadOnlyLayerItem
              key={`${item.sourceId || item.name}-${index}`}
              item={item}
            />
          ) : (
            <SwipeableLayerItem
              key={`${item.sourceId || item.name}-${index}`}
              item={item}
              isDragSource={dragSourceIndex === index}
              onTap={() => onItemTap(index)}
              onRemove={() => onItemRemove(index)}
              onDragStart={onDragStart ? (clientY) => onDragStart(index, item, clientY) : undefined}
            />
          )
        )}
      </div>
      {isDropTarget && (
        <div className="flex items-center justify-center rounded-md border border-dashed border-violet-300/70 bg-violet-50/40 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-500">
          Drop here
        </div>
      )}
      {showSyncPrompt && (
        <button
          type="button"
          onClick={onSyncFromOtherPhase}
          className={cn(
            "flex items-center gap-1.5 self-start rounded-md border border-violet-300/60 bg-violet-50/60 px-2 py-1 text-xs font-medium transition-colors",
            "text-violet-600 hover:text-violet-800 hover:bg-violet-100/70"
          )}
        >
          <ArrowDownToLine className="size-3" />
          {syncLabel ? `${syncLabel} ${label.toLowerCase()}` : `Use ${label.toLowerCase()}`}
        </button>
      )}
      {!readOnly && (
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
      )}
    </li>
  );
}

/**
 * Displays garment layers (base, mid, outer) for a body part.
 * Each item is tappable (to open picker) and swipeable (to remove).
 * Items can be dragged between layer types via the grip handle.
 * Includes an "Add" button per layer type.
 */
export function LayerItems({
  layers,
  bodyPart,
  biophysicsActive,
  itemMappings,
  readOnly,
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
  dragRef.current = drag;
  const onMoveItemRef = useRef(onMoveItem);
  onMoveItemRef.current = onMoveItem;
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
        const otherPhaseItemsForType = otherPhaseLayers ? (otherPhaseLayers[layerType] ?? []) : undefined;
        const isDropTarget = drag?.active === true && drag.overLayerType === layerType && drag.layerType !== layerType;

        return (
          <LayerGroup
            key={`${bodyPart}:${layerType}`}
            elRef={(el) => { if (el) layerGroupRefs.current.set(layerType, el); }}
            label={LAYER_LABELS[layerType]}
            items={items}
            layerType={layerType}
            readOnly={readOnly}
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
          className="fixed left-4 right-4 z-50 flex items-center justify-between rounded-md border border-violet-300 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm pointer-events-none"
          style={{ top: drag.ghostY - 20 }}
        >
          <span className="text-sm font-semibold text-slate-900">{drag.item.name}</span>
          {drag.item.rcl !== undefined && (
            <span className="text-xs tabular-nums text-slate-500">{drag.item.rcl.toFixed(2)} clo</span>
          )}
        </div>
      )}
    </>
  );
}

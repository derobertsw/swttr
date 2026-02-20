"use client";

import { useState } from "react";
import { Shirt, Footprints, Hand, HardHat, ChevronRight } from "lucide-react";
import { BodyPart, LayerType, LayerSet, BODY_PART_LABELS, hasAnyLayers } from "@/lib/layers";
import { cn } from "@/lib/utils";
import { LayerItems } from "./LayerItems";

interface BodyPartSectionProps {
  bodyPart: BodyPart;
  layers: LayerSet;
  biophysicsActive: boolean;
  currentClo: number | undefined;
  targetClo: number | undefined;
  itemMappings?: Map<string, string>;
  defaultCollapsed?: boolean;
  colorScheme?: "climb" | "descent";
  readOnly?: boolean;
  otherPhaseLayers?: LayerSet;
  syncLabel?: string;
  onItemTap: (layerType: LayerType, index: number) => void;
  onItemRemove: (layerType: LayerType, index: number) => void;
  onAddLayer: (layerType: LayerType) => void;
  onSyncFromOtherPhase?: (layerType: LayerType) => void;
  onMoveItem?: (fromLayerType: LayerType, fromIndex: number, toLayerType: LayerType) => void;
}

function getEmptyStateMessage(bodyPart: BodyPart): string {
  switch (bodyPart) {
    case "torso":
      return "Add torso layers for core warmth";
    case "legs":
      return "Your legs need protection in these conditions";
    case "hands":
      return "No hand insulation selected";
    case "headNeck":
      return "Head and neck are exposed to the elements";
  }
}

function getBodyPartIcon(bodyPart: BodyPart): React.ReactNode {
  const iconClass = "size-4 text-slate-500";
  switch (bodyPart) {
    case "torso":
      return <Shirt className={iconClass} />;
    case "legs":
      return <Footprints className={iconClass} />;
    case "hands":
      return <Hand className={iconClass} />;
    case "headNeck":
      return <HardHat className={iconClass} />;
  }
}

const CARD_STYLES = {
  climb: "border-violet-300/60 bg-violet-50/45",
  descent: "border-teal-300/60 bg-teal-50/45",
} as const;

export function BodyPartSection({
  bodyPart,
  layers,
  biophysicsActive,
  currentClo,
  targetClo,
  itemMappings,
  defaultCollapsed = false,
  colorScheme,
  readOnly,
  otherPhaseLayers,
  syncLabel,
  onItemTap,
  onItemRemove,
  onAddLayer,
  onSyncFromOtherPhase,
  onMoveItem,
}: BodyPartSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const effectiveCurrentClo = currentClo;
  const hasContent = hasAnyLayers(layers);
  const deficitClo =
    targetClo !== undefined
      ? Math.max(0, targetClo - (effectiveCurrentClo ?? 0))
      : 0;
  const surplusClo =
    targetClo !== undefined && effectiveCurrentClo !== undefined
      ? Math.max(0, effectiveCurrentClo - targetClo)
      : 0;
  const actualPillClass =
    targetClo === undefined
      ? "border-slate-300/70 bg-slate-100/70 text-slate-600"
      : deficitClo > 0.15
        ? "border-sky-500 bg-sky-200 text-sky-950 font-bold"
        : surplusClo > 0.35
          ? "border-amber-500 bg-amber-200 text-amber-950 font-bold"
          : "border-emerald-500 bg-emerald-200 text-emerald-950 font-bold";

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 backdrop-blur-[3px] sm:p-4",
        CARD_STYLES[colorScheme ?? "climb"],
        collapsed && "cursor-pointer"
      )}
      onClick={collapsed ? () => setCollapsed(false) : undefined}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setCollapsed((prev) => !prev);
        }}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
          {getBodyPartIcon(bodyPart)}
          {BODY_PART_LABELS[bodyPart]}
        </h3>
        <div className="flex items-center gap-2">
          {targetClo !== undefined && effectiveCurrentClo !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-full border border-slate-300/70 bg-slate-100/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                Target {targetClo.toFixed(1)} clo
              </span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums", actualPillClass)}>
                Actual {effectiveCurrentClo.toFixed(1)} clo
              </span>
            </div>
          )}
          <ChevronRight
            className={cn(
              "size-4 text-slate-500 transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          />
        </div>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-2.5">
            {!hasContent && (
              <p className="mb-3 text-sm text-slate-700">{getEmptyStateMessage(bodyPart)}</p>
            )}
            <ul className="space-y-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <LayerItems
                layers={layers}
                bodyPart={bodyPart}
                biophysicsActive={biophysicsActive}
                itemMappings={itemMappings}
                readOnly={readOnly}
                otherPhaseLayers={otherPhaseLayers}
                syncLabel={syncLabel}
                onItemTap={onItemTap}
                onItemRemove={onItemRemove}
                onAddLayer={onAddLayer}
                onSyncFromOtherPhase={onSyncFromOtherPhase}
                onMoveItem={onMoveItem}
              />
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

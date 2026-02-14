"use client";

import { useEffect, useState } from "react";
import { Shirt, Footprints, Hand, HardHat, ChevronRight } from "lucide-react";
import { RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";
import { BodyPart, LayerSet, BODY_PART_LABELS, hasAnyLayers } from "@/lib/layers";
import { cn } from "@/lib/utils";
import { HandwearDisplay, HeadwearDisplay } from "./ExtremityDisplay";
import { LayerItems } from "./LayerItems";

interface BodyPartSectionProps {
  bodyPart: BodyPart;
  layers: LayerSet;
  biophysicsActive: boolean;
  handwear: RecommendedHandwear | null | undefined;
  headwear: RecommendedHeadwear | null | undefined;
  currentClo: number | undefined;
  targetClo: number | undefined;
  itemMappings?: Map<string, string>;
  defaultCollapsed?: boolean;
  onGenericCloChange?: (bodyPart: BodyPart, clo: number) => void;
}

const GENERIC_LAYER_SUGGESTION_DEFICIT_CLO = 0.15;

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

export function BodyPartSection({
  bodyPart,
  layers,
  biophysicsActive,
  handwear,
  headwear,
  currentClo,
  targetClo,
  itemMappings,
  defaultCollapsed = false,
  onGenericCloChange,
}: BodyPartSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [genericCloContribution, setGenericCloContribution] = useState(0);

  useEffect(() => {
    onGenericCloChange?.(bodyPart, genericCloContribution);
  }, [bodyPart, genericCloContribution, onGenericCloChange]);

  const hasHeadwear = headwear && (headwear.helmet || headwear.head_warmth || headwear.neck_warmth);

  const hasExtremityGear =
    (bodyPart === "hands" && handwear) || (bodyPart === "headNeck" && hasHeadwear);

  const effectiveCurrentClo =
    currentClo !== undefined
      ? currentClo + genericCloContribution
      : genericCloContribution > 0
        ? genericCloContribution
        : undefined;
  const hasContent = hasAnyLayers(layers) || hasExtremityGear || genericCloContribution > 0;
  const deficitClo =
    targetClo !== undefined
      ? Math.max(0, targetClo - (effectiveCurrentClo ?? 0))
      : 0;
  const surplusClo =
    targetClo !== undefined && effectiveCurrentClo !== undefined
      ? Math.max(0, effectiveCurrentClo - targetClo)
      : 0;
  const statusLabel =
    targetClo === undefined
      ? null
      : deficitClo > 0.15
        ? `Need +${deficitClo.toFixed(1)} clo`
        : surplusClo > 0.35
          ? `Over by ${surplusClo.toFixed(1)} clo`
          : "On target";
  const statusClass =
    targetClo === undefined
      ? "border-slate-300/70 bg-slate-100/70 text-slate-600"
      : deficitClo > 0.15
        ? "border-sky-300/80 bg-sky-50/90 text-sky-800"
        : surplusClo > 0.35
          ? "border-amber-300/80 bg-amber-50/90 text-amber-800"
          : "border-emerald-300/80 bg-emerald-50/90 text-emerald-800";
  const cloValueClass =
    targetClo === undefined
      ? "text-slate-500"
      : deficitClo > 0.15
        ? "text-sky-700"
        : surplusClo > 0.35
          ? "text-amber-700"
          : "text-emerald-700";
  const cloValueLabel =
    targetClo !== undefined
      ? `${(effectiveCurrentClo ?? 0).toFixed(1)}/${targetClo.toFixed(1)} clo`
      : effectiveCurrentClo !== undefined
        ? `${effectiveCurrentClo.toFixed(1)} clo`
        : null;
  const shouldSuggestGenericLayers =
    targetClo === undefined || deficitClo > GENERIC_LAYER_SUGGESTION_DEFICIT_CLO;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/35 bg-white/55 p-4 backdrop-blur-[3px] sm:p-5",
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
        <div className="flex items-start gap-2">
          <div className="flex flex-col items-end gap-1">
            {statusLabel && (
              <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", statusClass)}>
                {statusLabel}
              </span>
            )}
            {cloValueLabel && (
              <span className={cn("text-[11px] font-medium tabular-nums", cloValueClass)}>
                {cloValueLabel}
              </span>
            )}
          </div>
          <ChevronRight
            className={cn(
              "mt-0.5 size-4 text-slate-500 transition-transform duration-200",
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
          <div className="pt-3">
            {!hasContent && (
              <p className="mb-3 text-sm text-slate-700">{getEmptyStateMessage(bodyPart)}</p>
            )}
            <ul className="space-y-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {bodyPart === "hands" && handwear && <HandwearDisplay handwear={handwear} />}
              {bodyPart === "headNeck" && headwear && <HeadwearDisplay headwear={headwear} />}
              <LayerItems
                layers={layers}
                bodyPart={bodyPart}
                biophysicsActive={biophysicsActive}
                itemMappings={itemMappings}
                enableEmptySlots={
                  shouldSuggestGenericLayers
                  && !(bodyPart === "hands" && handwear)
                  && !(bodyPart === "headNeck" && hasHeadwear)
                }
                onGenericCloChange={setGenericCloContribution}
              />
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

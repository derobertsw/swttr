"use client";

import { useEffect, useState } from "react";
import { Shirt, Footprints, Hand, HardHat, Flame, ChevronDown } from "lucide-react";
import { RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";
import { BodyPart, LayerSet, BODY_PART_LABELS, hasAnyLayers } from "@/lib/layers";
import { cn } from "@/lib/utils";
import { CloProgressBar } from "./CloProgressBar";
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
  const isOverTarget =
    targetClo !== undefined &&
    effectiveCurrentClo !== undefined &&
    targetClo > 0 &&
    effectiveCurrentClo / targetClo >= 1.2;

  return (
    <div className="rounded-lg bg-white/40 backdrop-blur-[2px] p-5">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between"
      >
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
          {getBodyPartIcon(bodyPart)}
          {BODY_PART_LABELS[bodyPart]}
        </h3>
        <div className="flex items-center gap-2">
          {isOverTarget && (
            <span className="inline-flex items-center text-amber-600" title="Overheating risk">
              <Flame className="size-4" />
            </span>
          )}
          {targetClo !== undefined && <CloProgressBar currentClo={effectiveCurrentClo} targetClo={targetClo} />}
          <ChevronDown
            className={cn(
              "size-4 text-slate-500 transition-transform duration-200",
              collapsed && "-rotate-90"
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
              <p className="mb-3 text-sm text-slate-600">{getEmptyStateMessage(bodyPart)}</p>
            )}
            <ul className="space-y-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {bodyPart === "hands" && handwear && <HandwearDisplay handwear={handwear} />}
              {bodyPart === "headNeck" && headwear && <HeadwearDisplay headwear={headwear} />}
              <LayerItems
                layers={layers}
                bodyPart={bodyPart}
                biophysicsActive={biophysicsActive}
                itemMappings={itemMappings}
                enableEmptySlots={!(bodyPart === "hands" && handwear) && !(bodyPart === "headNeck" && hasHeadwear)}
                onGenericCloChange={setGenericCloContribution}
              />
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

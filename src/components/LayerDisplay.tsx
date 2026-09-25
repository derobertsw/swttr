"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Recommendation } from "@/types/recommendations";
import type { PrecipitationType } from "@/types/weather";
import type {
  BiophysicsRecommendation,
  ExtremityIreqRange,
  PackItemGarment,
  PhaseEvaluationInput,
  RegionalIreqRange,
} from "@/types/biophysics";
import BiophysicsDetails from "@/components/BiophysicsDetails";
import {
  BODY_PARTS,
  buildDescentLayers,
  buildRecommendedLayers,
  collectInUseIds,
  createEmptyLayerSet,
  itemCloByBodyPart,
  itemNamesMissingFrom,
  type BodyPart,
  type BodyPartLayers,
  type LayerItem,
  type LayerType,
} from "@/lib/layers";
import { cn } from "@/lib/utils";
import { WeatherHeader, BodyPartSection, WeatherEditDrawer } from "@/components/layers";
import { LayerPickerDrawer } from "@/components/layers/LayerPickerDrawer";
import { ActivityHeader } from "@/components/layers/ActivityHeader";
import { ComfortOverview } from "@/components/layers/ComfortOverview";
import { PackItemsCard } from "@/components/layers/PackItemsCard";
import { RecommendedItemsCard, type RecommendedItem } from "@/components/layers/RecommendedItemsCard";
import { useEditableLayers } from "@/hooks/useEditableLayers";
import { useLayerEvaluation } from "@/hooks/useLayerEvaluation";
import { useLayerPicker, type PickerItem } from "@/hooks/useLayerPicker";

interface LayerDisplayProps {
  activity?: string;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  itemMappings?: Map<string, string>;
  biophysicsData?: BiophysicsRecommendation | null;
  onReset?: () => void;
  onWeatherChange?: (lat: number, lon: number, datetime?: string) => Promise<void>;
  onActivityChange?: (activity: string) => Promise<void>;
  weatherLoading?: boolean;
}

type Phase = "climb" | "descent";

interface PickerTarget {
  bodyPart: BodyPart;
  layerType: LayerType;
  replaceIndex: number | null;
  phase: Phase;
}

const NO_PACK_ITEMS: PackItemGarment[] = [];

/** Each body part's neutral clo target from a recommendation's IREQ ranges. */
function bodyPartTargets(
  regional: RegionalIreqRange | undefined,
  extremity: ExtremityIreqRange | undefined
): PhaseEvaluationInput["targets"] {
  return {
    torso: regional?.neutral?.torso,
    legs: regional?.neutral?.legs,
    hands: extremity?.neutral?.hands,
    headNeck: extremity?.neutral?.head,
  };
}

/** Catalog items in the layers that the user picked from recommendations, once each. */
function recommendedCatalogItems(layers: BodyPartLayers): RecommendedItem[] {
  const items: RecommendedItem[] = [];
  const seen = new Set<string>();
  for (const bodyPart of BODY_PARTS) {
    for (const layerType of ["base", "mid", "outer"] as const) {
      for (const item of layers[bodyPart][layerType] ?? []) {
        if (item.isRecommended && item.sourceId && !seen.has(item.sourceId)) {
          seen.add(item.sourceId);
          items.push({ name: item.name, brand: item.brand ?? "", sourceId: item.sourceId, bodyPart });
        }
      }
    }
  }
  return items;
}

/**
 * Displays layered clothing recommendations organized by body part.
 * Supports both static recommendations and biophysics-based recommendations.
 */
const LayerDisplay = (props: LayerDisplayProps) => {
  if (!props.recommendation && !props.biophysicsData) return null;
  return <LayerDisplayContent {...props} />;
};

const LayerDisplayContent = ({
  activity,
  recommendation,
  temperature,
  windspeed,
  precipitation,
  precipitationType,
  itemMappings,
  biophysicsData,
  onReset,
  onWeatherChange,
  onActivityChange,
  weatherLoading,
}: LayerDisplayProps) => {
  const [weatherDrawerOpen, setWeatherDrawerOpen] = useState(false);
  const [activePhase, setActivePhase] = useState<Phase>("climb");
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;
  const ireq = biophysicsData?.ireq;
  const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
  const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;
  const garments = biophysicsData?.recommendation?.garments;
  const handwear = biophysicsData?.recommendation?.handwear;
  const rawHeadwear = biophysicsData?.recommendation?.headwear;
  const packItems = biophysicsData?.pack_items?.garments ?? NO_PACK_ITEMS;
  const descentHandwear = biophysicsData?.descent_handwear;
  const descentHeadwear = biophysicsData?.descent_headwear;
  const descentBreakdown = biophysicsData?.descent_breakdown;

  // Helmet insulation doesn't count toward head clo for XC skiing.
  const headwear = useMemo(
    () => (activity === "xc_skiing" && rawHeadwear ? { ...rawHeadwear, helmet: null } : rawHeadwear),
    [activity, rawHeadwear]
  );

  const recommendedLayers = useMemo(
    () => buildRecommendedLayers(garments, handwear, headwear),
    [garments, handwear, headwear]
  );
  const initialDescentLayers = useMemo(
    () => buildDescentLayers(garments, handwear, headwear, packItems, descentHandwear, descentHeadwear),
    [garments, handwear, headwear, packItems, descentHandwear, descentHeadwear]
  );
  const climb = useEditableLayers(recommendedLayers);
  const descent = useEditableLayers(initialDescentLayers);
  const phaseLayers = (phase: Phase) => (phase === "descent" ? descent : climb);

  const downhillTargetRange: [number, number] | undefined = ireq?.downhill_target_range
    ?? (ireq?.downhill ? [ireq.downhill.min, ireq.downhill.neutral] : undefined);
  const showDescent = activity === "backcountry_skiing"
    && biophysicsActive
    && totalClo !== undefined
    && downhillTargetRange !== undefined;

  // Thermal evaluation of the worn layers (including edits) runs on the server.
  const climbInput: PhaseEvaluationInput = {
    itemClo: itemCloByBodyPart(climb.layers),
    targets: bodyPartTargets(ireq?.regional, ireq?.extremity),
    arms: regionalClo ? { clo: regionalClo.arms, target: ireq?.regional?.neutral?.arms } : undefined,
    targetRange: ireq?.target_range,
  };
  const descentInput: PhaseEvaluationInput = {
    itemClo: itemCloByBodyPart(descent.layers),
    targets: descentBreakdown
      ? bodyPartTargets(descentBreakdown.regional_ireq, descentBreakdown.extremity_ireq)
      : climbInput.targets,
    arms: regionalClo
      ? {
          clo: regionalClo.arms,
          target: descentBreakdown?.regional_ireq?.neutral?.arms ?? ireq?.regional?.neutral?.arms,
          deficitClo: descentBreakdown?.regional_clo?.arms ?? regionalClo.arms,
        }
      : undefined,
    targetRange: downhillTargetRange,
  };
  const { evaluation } = useLayerEvaluation(
    biophysicsActive ? (showDescent ? [climbInput, descentInput] : [climbInput]) : null
  );
  const climbEvaluation = evaluation?.[0];
  const descentEvaluation = showDescent ? evaluation?.[1] : undefined;
  const phaseEvaluation = (phase: Phase) => (phase === "descent" ? descentEvaluation : climbEvaluation);

  const comfortScore = climbEvaluation
    ? (climbEvaluation.comfortScore
      ?? biophysicsData?.recommendation?.thermal_comfort_score
      ?? biophysicsData?.recommendation?.score)
    : undefined;

  // --- Layer picker ---
  const inUseItemIds = useMemo(() => {
    const ids = collectInUseIds(climb.layers);
    for (const id of collectInUseIds(descent.layers)) ids.add(id);
    return ids;
  }, [climb.layers, descent.layers]);
  const { getItems: getPickerItems } = useLayerPicker(inUseItemIds);

  const pickerItems = useMemo(() => {
    if (!pickerTarget) return { wardrobeItems: [], recommendedItems: [] };
    const targetClo = bodyPartTargets(ireq?.regional, ireq?.extremity)[pickerTarget.bodyPart];
    return getPickerItems(pickerTarget.bodyPart, pickerTarget.layerType, targetClo);
  }, [pickerTarget, getPickerItems, ireq?.regional, ireq?.extremity]);

  const pickerCurrentItem = pickerTarget && pickerTarget.replaceIndex !== null
    ? phaseLayers(pickerTarget.phase).layers[pickerTarget.bodyPart][pickerTarget.layerType]?.[pickerTarget.replaceIndex]
    : undefined;

  const pickerBodyPart = pickerTarget && biophysicsActive
    ? phaseEvaluation(pickerTarget.phase)?.bodyParts[pickerTarget.bodyPart]
    : undefined;
  const pickerCloContext = pickerBodyPart?.target !== undefined && pickerBodyPart.delta !== undefined
    ? { targetClo: pickerBodyPart.target, currentClo: pickerBodyPart.clo, delta: pickerBodyPart.delta }
    : undefined;

  const handlePickerSelect = (item: PickerItem) => {
    if (!pickerTarget) return;
    const { bodyPart, replaceIndex, phase } = pickerTarget;
    const layers = phaseLayers(phase);
    const newItem: LayerItem = {
      name: item.name,
      rcl: item.rcl,
      sourceId: item.id,
      isRecommended: !item.isOwned,
      brand: item.brand,
    };
    if (replaceIndex !== null) {
      layers.replaceItem(bodyPart, item.nativeLayerType, replaceIndex, newItem);
    } else {
      layers.addItem(bodyPart, item.nativeLayerType, newItem);
    }
    if (!item.isOwned) {
      toast.info("This item isn't in your wardrobe yet. Add it for better future recommendations.", {
        action: { label: "Go to Wardrobe", onClick: () => window.location.assign("/wardrobe") },
      });
    }
    setPickerTarget(null);
  };

  const handlePickerRemove = () => {
    if (!pickerTarget || pickerTarget.replaceIndex === null) return;
    const { bodyPart, layerType, replaceIndex, phase } = pickerTarget;
    phaseLayers(phase).removeItem(bodyPart, layerType, replaceIndex);
    setPickerTarget(null);
  };

  // --- Body part sections ---
  const renderSection = (bodyPart: BodyPart, phase: Phase) => {
    const layers = biophysicsActive
      ? phaseLayers(phase).layers[bodyPart]
      : recommendation?.[bodyPart] ?? createEmptyLayerSet();
    const bodyPartEvaluation = phaseEvaluation(phase)?.bodyParts[bodyPart];
    const otherPhase: Phase = phase === "descent" ? "climb" : "descent";

    return (
      <BodyPartSection
        key={bodyPart}
        bodyPart={bodyPart}
        layers={layers}
        biophysicsActive={biophysicsActive}
        currentClo={bodyPartEvaluation?.clo}
        targetClo={bodyPartEvaluation?.target}
        status={bodyPartEvaluation?.status}
        itemMappings={itemMappings}
        {...(showDescent && {
          colorScheme: phase,
          otherPhaseLayers: phaseLayers(otherPhase).layers[bodyPart],
          syncLabel: phase === "descent" ? "Use climb" : "Use descent",
          onSyncFromOtherPhase: (layerType: LayerType) =>
            phaseLayers(phase).setLayerItems(
              bodyPart,
              layerType,
              phaseLayers(otherPhase).layers[bodyPart][layerType] ?? []
            ),
        })}
        onItemTap={(layerType, index) => setPickerTarget({ bodyPart, layerType, replaceIndex: index, phase })}
        onItemRemove={(layerType, index) => phaseLayers(phase).removeItem(bodyPart, layerType, index)}
        onAddLayer={(layerType) => setPickerTarget({ bodyPart, layerType, replaceIndex: null, phase })}
        onMoveItem={biophysicsActive
          ? (fromLayerType, fromIndex, toLayerType) =>
              phaseLayers(phase).moveItem(bodyPart, fromLayerType, fromIndex, toLayerType)
          : undefined}
      />
    );
  };

  const shownPhase: Phase = showDescent ? activePhase : "climb";
  // "In the pack": carried during this phase, worn during the other.
  const packedItems = showDescent
    ? itemNamesMissingFrom(phaseLayers(shownPhase === "climb" ? "descent" : "climb").layers, phaseLayers(shownPhase).layers)
    : [];
  const recommendedItems = recommendedCatalogItems(climb.layers);

  return (
    <div className="flex flex-col gap-8 pb-24">
      <ActivityHeader
        activity={activity}
        onReset={onReset}
        onActivityChange={onActivityChange}
        loading={weatherLoading}
      />

      <div className={cn("flex flex-col gap-8 transition-opacity duration-200", weatherLoading && "opacity-50 pointer-events-none")}>
        <WeatherHeader
          temperature={temperature}
          windspeed={windspeed}
          precipitation={precipitation}
          precipitationType={precipitationType}
          score={showDescent ? undefined : comfortScore}
          totalClo={climbEvaluation?.totalClo}
          targetRange={ireq?.target_range}
          decision={climbEvaluation?.decision}
          interactive={Boolean(onWeatherChange)}
          onEditWeather={onWeatherChange ? () => setWeatherDrawerOpen(true) : undefined}
        />
        {onWeatherChange && (
          <WeatherEditDrawer
            open={weatherDrawerOpen}
            onOpenChange={setWeatherDrawerOpen}
            onSubmit={onWeatherChange}
            loading={weatherLoading}
          />
        )}

        <ComfortOverview
          climb={{ evaluation: climbEvaluation, targetRange: ireq?.target_range }}
          descent={showDescent ? { evaluation: descentEvaluation, targetRange: downhillTargetRange } : undefined}
        />

        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">
            Detailed Layer Breakdown
          </h3>
          {showDescent && (
            <div className="flex gap-1.5">
              {(["climb", "descent"] as const).map((phase) => (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setActivePhase(phase)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                    activePhase === phase
                      ? phase === "climb"
                        ? "border border-violet-400/60 bg-violet-500/25 text-violet-200"
                        : "border border-teal-400/60 bg-teal-500/25 text-teal-200"
                      : "border border-white/20 bg-white/[0.06] text-white/50 hover:text-white/70"
                  )}
                >
                  {phase === "climb" ? "Climb" : "Descent"}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="-mt-4 text-xs text-white/60">
          Tap a body area to collapse or expand details.
        </p>
        <div className="flex flex-col gap-6">
          {BODY_PARTS.map((bodyPart) => renderSection(bodyPart, shownPhase))}
          {showDescent && <PackItemsCard items={packedItems} />}
        </div>

        <LayerPickerDrawer
          open={pickerTarget !== null}
          onOpenChange={(open) => { if (!open) setPickerTarget(null); }}
          bodyPart={pickerTarget?.bodyPart ?? "torso"}
          layerType={pickerTarget?.layerType ?? "base"}
          wardrobeItems={pickerItems.wardrobeItems}
          recommendedItems={pickerItems.recommendedItems}
          currentItemName={pickerCurrentItem?.name}
          currentItemClo={pickerCurrentItem?.rcl}
          cloContext={pickerCloContext}
          onSelect={handlePickerSelect}
          onRemove={pickerTarget?.replaceIndex !== null ? handlePickerRemove : undefined}
        />

        {biophysicsData?.recommendation && (
          <details className="group rounded-xl border border-white/25 bg-white/10 p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold tracking-wide text-white/85 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              <span>Advanced Biophysics Details</span>
            </summary>
            <div className="mt-4">
              <BiophysicsDetails data={biophysicsData} />
            </div>
          </details>
        )}

        <RecommendedItemsCard items={recommendedItems} />
      </div>
    </div>
  );
};

export default LayerDisplay;

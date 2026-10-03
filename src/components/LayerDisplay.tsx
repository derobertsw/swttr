"use client";

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Undo2 } from "lucide-react";
import type { ExertionLevel } from "@/lib/biophysics/exertion";
import type { LocationSuggestion, Recommendation } from "@/types/recommendations";
import type { PrecipitationType, WeatherContext } from "@/types/weather";
import type {
  BiophysicsRecommendation,
  BiophysicsStatus,
  ExtremityIreqRange,
  PackItemGarment,
  PhaseEvaluationInput,
  RegionalIreqRange,
} from "@/types/biophysics";
import BiophysicsDetails from "@/components/BiophysicsDetails";
import ScoreDisplay from "@/components/ScoreDisplay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { segmentedGroupClassName, segmentedItemClassName } from "@/components/ui/segmented";
import {
  BODY_PARTS,
  BODY_PART_LABELS,
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
import { BodyPartSection, WeatherEditDrawer } from "@/components/layers";
import { CarryCard } from "@/components/layers/CarryCard";
import { ComfortDecision } from "@/components/layers/ComfortDecision";
import { ComfortOverview } from "@/components/layers/ComfortOverview";
import { EvaluationStatus } from "@/components/layers/EvaluationStatus";
import { LayerPickerDrawer } from "@/components/layers/LayerPickerDrawer";
import { RecommendationNotice } from "@/components/layers/RecommendationNotice";
import { ResultHeader } from "@/components/layers/ResultHeader";
import { RecommendedItemsCard, type RecommendedItem } from "@/components/layers/RecommendedItemsCard";
import { useEditableLayers } from "@/hooks/useEditableLayers";
import { useLayerEvaluation } from "@/hooks/useLayerEvaluation";
import { useLayerPicker, type PickerItem } from "@/hooks/useLayerPicker";

interface LayerDisplayProps {
  activity?: string;
  exertion?: ExertionLevel;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  precipitation?: boolean;
  precipitationType?: PrecipitationType;
  /** Where and when the weather applies. */
  weatherContext?: WeatherContext | null;
  itemMappings?: Map<string, string>;
  biophysicsData?: BiophysicsRecommendation | null;
  /** Why biophysicsData is missing, when it is. */
  biophysicsStatus?: BiophysicsStatus | null;
  /** Edit outing: back to the form with the outing as entered. */
  onReset?: () => void;
  /** Requests the same recommendation again after a failure. */
  onRetry?: () => void;
  /** Gets weather for another place or local time there; resolves true once it's shown. */
  onWeatherChange?: (location: LocationSuggestion, localDateTime?: string) => Promise<boolean>;
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

/** Each body part's neutral (or minimum) clo target from a recommendation's IREQ ranges. */
function bodyPartTargets(
  regional: RegionalIreqRange | undefined,
  extremity: ExtremityIreqRange | undefined,
  bound: "min" | "neutral" = "neutral"
): PhaseEvaluationInput["targets"] {
  return {
    torso: regional?.[bound]?.torso,
    legs: regional?.[bound]?.legs,
    hands: extremity?.[bound]?.hands,
    headNeck: extremity?.[bound]?.head,
  };
}

/** Catalog items the user picked into any phase's layers and doesn't own, once each. */
function recommendedCatalogItems(phases: BodyPartLayers[]): RecommendedItem[] {
  const items: RecommendedItem[] = [];
  const seen = new Set<string>();
  for (const layers of phases) {
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
  }
  return items;
}

/** A collapsed section of supporting detail below the outfit. */
function ResultDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-card border border-border bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}

/**
 * The layers for an outing, outfit first: what to wear on each body area and
 * what to carry, then why, with the numbers behind it under Technical details.
 * Supports both static recommendations and biophysics-based recommendations.
 * Static layers are general guidance and can't be edited, since nothing
 * evaluates edits to them.
 * Without either, keeps the outing on screen and explains why there are no
 * layers instead.
 */
const LayerDisplay = ({
  activity,
  exertion,
  recommendation,
  temperature,
  windspeed,
  precipitation,
  precipitationType,
  weatherContext,
  itemMappings,
  biophysicsData,
  biophysicsStatus,
  onReset,
  onRetry,
  onWeatherChange,
  onActivityChange,
  weatherLoading,
}: LayerDisplayProps) => {
  const [weatherDrawerOpen, setWeatherDrawerOpen] = useState(false);
  const [activePhase, setActivePhase] = useState<Phase>("climb");
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const wearHeadingId = useId();
  const wearHeadingRef = useRef<HTMLHeadingElement>(null);

  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;
  const hasLayers = biophysicsActive || recommendation !== null;
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
  // The phase of the latest edit, which a failed check's Undo change reverts.
  const [lastEditedPhase, setLastEditedPhase] = useState<Phase>("climb");
  const editLayers = (phase: Phase) => {
    setLastEditedPhase(phase);
    return phaseLayers(phase);
  };

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
    minTargets: bodyPartTargets(ireq?.regional, ireq?.extremity, "min"),
    arms: regionalClo
      ? { clo: regionalClo.arms, target: ireq?.regional?.neutral?.arms, minTarget: ireq?.regional?.min?.arms }
      : undefined,
    targetRange: ireq?.target_range,
  };
  const descentRegional = descentBreakdown?.regional_ireq ?? ireq?.regional;
  const descentInput: PhaseEvaluationInput = {
    itemClo: itemCloByBodyPart(descent.layers),
    targets: descentBreakdown
      ? bodyPartTargets(descentBreakdown.regional_ireq, descentBreakdown.extremity_ireq)
      : climbInput.targets,
    minTargets: descentBreakdown
      ? bodyPartTargets(descentBreakdown.regional_ireq, descentBreakdown.extremity_ireq, "min")
      : climbInput.minTargets,
    arms: regionalClo
      ? {
          clo: regionalClo.arms,
          target: descentRegional?.neutral?.arms,
          minTarget: descentRegional?.min?.arms,
          deficitClo: descentBreakdown?.regional_clo?.arms ?? regionalClo.arms,
        }
      : undefined,
    targetRange: downhillTargetRange,
  };
  const {
    evaluation: lastEvaluation,
    pending: evaluationPending,
    failed: evaluationFailed,
    retrying: evaluationRetrying,
    retry: retryEvaluation,
  } = useLayerEvaluation(
    biophysicsActive ? (showDescent ? [climbInput, descentInput] : [climbInput]) : null,
    biophysicsData
  );
  // After a failed check the last evaluation is for earlier layers, so nothing
  // but its labeled decision is shown for the current ones.
  const evaluation = evaluationFailed ? null : lastEvaluation;
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
  const { getItems: getPickerItems, reload: reloadPickerWardrobe } = useLayerPicker(inUseItemIds);

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
    const { bodyPart, layerType, replaceIndex, phase } = pickerTarget;
    const layers = editLayers(phase);
    const newItem: LayerItem = {
      name: item.name,
      rcl: item.rcl,
      sourceId: item.id,
      isRecommended: !item.isOwned,
      brand: item.brand,
    };
    // A catalog item joins the outfit only; "I own this" adds it to the wardrobe.
    // The picker also offers items from neighbouring layers, and a picked item
    // is worn under its own layer, whichever layer it was picked for (#62).
    if (replaceIndex === null) {
      layers.addItem(bodyPart, item.nativeLayerType, newItem);
    } else {
      layers.replaceItem(bodyPart, layerType, replaceIndex, newItem, item.nativeLayerType);
    }
    setPickerTarget(null);
  };

  const handleItemOwned = (item: RecommendedItem) => {
    climb.markOwned(item.sourceId);
    descent.markOwned(item.sourceId);
    reloadPickerWardrobe();
  };

  const handlePickerRemove = () => {
    if (!pickerTarget || pickerTarget.replaceIndex === null) return;
    const { bodyPart, layerType, replaceIndex, phase } = pickerTarget;
    editLayers(phase).removeItem(bodyPart, layerType, replaceIndex);
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
        readOnly={!biophysicsActive}
        currentClo={bodyPartEvaluation?.clo}
        targetClo={bodyPartEvaluation?.target}
        status={bodyPartEvaluation?.status}
        itemMappings={itemMappings}
        {...(showDescent && {
          otherPhaseLayers: phaseLayers(otherPhase).layers[bodyPart],
          syncLabel: phase === "descent" ? "Use climb" : "Use descent",
          onSyncFromOtherPhase: (layerType: LayerType) =>
            editLayers(phase).setLayerItems(
              bodyPart,
              layerType,
              phaseLayers(otherPhase).layers[bodyPart][layerType] ?? []
            ),
        })}
        onItemTap={(layerType, index) => setPickerTarget({ bodyPart, layerType, replaceIndex: index, phase })}
        onItemRemove={(layerType, index) => editLayers(phase).removeItem(bodyPart, layerType, index)}
        onAddLayer={(layerType) => setPickerTarget({ bodyPart, layerType, replaceIndex: null, phase })}
        onMoveItem={biophysicsActive
          ? (fromLayerType, fromIndex, toLayerType) =>
              editLayers(phase).moveItem(bodyPart, fromLayerType, fromIndex, toLayerType)
          : undefined}
      />
    );
  };

  const shownPhase: Phase = showDescent ? activePhase : "climb";
  // "In the pack": carried during this phase, worn during the other.
  const packedItems = showDescent
    ? itemNamesMissingFrom(phaseLayers(shownPhase === "climb" ? "descent" : "climb").layers, phaseLayers(shownPhase).layers)
    : [];
  const recommendedItems = recommendedCatalogItems([climb.layers, descent.layers]);

  const shownEvaluation = phaseEvaluation(shownPhase);
  const shownDecision = evaluationFailed
    ? lastEvaluation?.[showDescent && shownPhase === "descent" ? 1 : 0]?.decision
    : shownEvaluation?.decision;
  const phaseLabel = showDescent ? (shownPhase === "climb" ? "Climb" : "Descent") : undefined;
  const guidance = biophysicsData?.guidance ?? [];

  const shownLayers = phaseLayers(shownPhase);
  const focusWear = useCallback(() => wearHeadingRef.current?.focus(), []);
  /** Runs an undo or reset; if the control that had focus went away, focus moves to Wear. */
  const changeOutfit = (change: () => void) => {
    change();
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) focusWear();
    });
  };
  const phaseName = phaseLabel ? `${phaseLabel.toLowerCase()} ` : "";
  // A failed check's Undo change reverts the latest edit, and shows its phase.
  const failedEditLayers = phaseLayers(lastEditedPhase);
  const undoFailedEdit = () => {
    setActivePhase(lastEditedPhase);
    failedEditLayers.undo();
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-24">
      <ResultHeader
        activity={activity}
        exertion={exertion}
        adviceKind={biophysicsActive ? "personalized" : recommendation ? "general" : undefined}
        temperature={temperature}
        windspeed={windspeed}
        precipitation={precipitation}
        precipitationType={precipitationType}
        context={weatherContext}
        onEditOuting={onReset}
        onActivityChange={onActivityChange}
        onEditWeather={onWeatherChange ? () => setWeatherDrawerOpen(true) : undefined}
        loading={weatherLoading}
      />
      {onWeatherChange && (
        <WeatherEditDrawer
          open={weatherDrawerOpen}
          onOpenChange={setWeatherDrawerOpen}
          onSubmit={onWeatherChange}
          loading={weatherLoading}
        />
      )}

      <div
        aria-busy={weatherLoading || undefined}
        className={cn("flex flex-col gap-6 transition-opacity", weatherLoading && "pointer-events-none opacity-50")}
      >
        {!biophysicsActive && (
          <RecommendationNotice
            activity={activity}
            status={biophysicsStatus}
            hasGeneralLayers={hasLayers}
            onRetry={onRetry}
            retrying={weatherLoading}
          />
        )}

        {hasLayers && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-4">
              {showDescent && (
                <div className="flex flex-col gap-2">
                  <div role="group" aria-label="Phase" className={cn(segmentedGroupClassName, "grid-cols-2")}>
                    {(["climb", "descent"] as const).map((phase) => {
                      const label = phase === "climb" ? "Climb" : "Descent";
                      // A risk in the phase not shown stays visible on its tab.
                      const risk = phaseEvaluation(phase)?.decision?.riskType;
                      const riskLabel = risk === "cold" ? "cold risk" : risk === "overheat" ? "overheating risk" : null;
                      return (
                        <button
                          key={phase}
                          type="button"
                          aria-pressed={activePhase === phase}
                          aria-label={riskLabel ? `${label}, ${riskLabel}` : undefined}
                          onClick={() => setActivePhase(phase)}
                          className={segmentedItemClassName}
                        >
                          {riskLabel && <AlertTriangle className="size-4 text-warning" aria-hidden="true" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activePhase === "climb" ? "What to wear skinning up." : "What to wear for the ride down."}
                  </p>
                </div>
              )}

              {biophysicsActive && (
                <EvaluationStatus
                  pending={evaluationPending}
                  failed={evaluationFailed}
                  retrying={evaluationRetrying}
                  hasPreviousCheck={lastEvaluation !== null}
                  onRetry={retryEvaluation}
                  onUndo={failedEditLayers.canUndo ? () => changeOutfit(undoFailedEdit) : undefined}
                  undoLabel={showDescent ? `Undo ${lastEditedPhase} change` : undefined}
                  onFocusLost={focusWear}
                />
              )}

              <ComfortDecision
                decision={shownDecision}
                phase={phaseLabel}
                staleness={evaluationFailed ? "outdated" : evaluationPending ? "updating" : undefined}
              />

              <section aria-labelledby={wearHeadingId} aria-busy={evaluationPending || undefined} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h3
                    id={wearHeadingId}
                    ref={wearHeadingRef}
                    tabIndex={-1}
                    className="text-xl font-semibold text-foreground focus:outline-none"
                  >
                    Wear
                  </h3>
                  {biophysicsActive && (shownLayers.canUndo || shownLayers.edited) && (
                    <div className="flex gap-1">
                      {shownLayers.canUndo && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Undo last ${phaseName}change`}
                          onClick={() => changeOutfit(() => editLayers(shownPhase).undo())}
                        >
                          <Undo2 aria-hidden="true" />
                          Undo
                        </Button>
                      )}
                      {shownLayers.edited && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Reset ${phaseName}to the suggested layers`}
                          onClick={() => changeOutfit(() => editLayers(shownPhase).reset())}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <Card padding="none" className="divide-y divide-border px-4">
                  {BODY_PARTS.map((bodyPart) => renderSection(bodyPart, shownPhase))}
                </Card>
              </section>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              {showDescent && <CarryCard items={packedItems} phase={shownPhase} />}

              <RecommendedItemsCard items={recommendedItems} onOwned={handleItemOwned} />

              {guidance.length > 0 && (
                <ResultDisclosure title="Why these layers?">
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-foreground">
                    {guidance.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </ResultDisclosure>
              )}

              {biophysicsData?.recommendation && (
                <ResultDisclosure title="Technical details">
                  <div className="flex flex-col gap-6">
                    {!showDescent && comfortScore !== undefined && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Comfort</p>
                        <ScoreDisplay
                          score={comfortScore}
                          size="sm"
                          totalClo={climbEvaluation?.totalClo}
                          targetRange={ireq?.target_range}
                          decision={climbEvaluation?.decision}
                        />
                      </div>
                    )}
                    <ComfortOverview
                      climb={{ evaluation: climbEvaluation, targetRange: ireq?.target_range }}
                      descent={showDescent ? { evaluation: descentEvaluation, targetRange: downhillTargetRange } : undefined}
                    />
                    {shownEvaluation && (
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          Body areas{phaseLabel ? ` · ${phaseLabel}` : ""}
                        </h4>
                        <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                          {BODY_PARTS.map((bodyPart) => {
                            const part = shownEvaluation.bodyParts[bodyPart];
                            if (!part || part.target === undefined) return null;
                            return (
                              <div key={bodyPart} className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <dt className="text-muted-foreground">{BODY_PART_LABELS[bodyPart]}</dt>
                                <dd className="flex gap-2 tabular-nums text-foreground">
                                  <span>Actual {part.clo.toFixed(1)} clo</span>
                                  <span className="text-muted-foreground">Target {part.target.toFixed(1)} clo</span>
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </div>
                    )}
                    <BiophysicsDetails data={biophysicsData} />
                  </div>
                </ResultDisclosure>
              )}
            </div>
          </div>
        )}

        {hasLayers && (
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
        )}
      </div>
    </div>
  );
};

export default LayerDisplay;

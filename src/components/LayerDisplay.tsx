"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Recommendation } from "@/types/recommendations";
import {
  BiophysicsRecommendation,
  RecommendedHandwear,
  RecommendedHeadwear,
  RegionalClo,
  RegionalIreqRange,
  ExtremityIreqRange,
} from "@/types/biophysics";
import BiophysicsDetails from "@/components/BiophysicsDetails";
import {
  BodyPart,
  BODY_PARTS,
  BODY_PART_TO_REGION,
  BODY_PART_TO_EXTREMITY,
  garmentsToLayerSet,
  createEmptyLayerSet,
  CATEGORY_TO_LAYER_TYPE,
  LAYER_LABELS,
} from "@/lib/layers";
import type { AvailableItem } from "@/types/wardrobe";
import { STORAGE_KEYS } from "@/lib/storage";
import { logWarn } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  WeatherHeader,
  ThermalGauge,
  BodyPartSection,
  GuidanceSection,
} from "@/components/layers";
import { cn } from "@/lib/utils";

interface LayerDisplayProps {
  activity?: string;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  itemMappings?: Map<string, string>;
  biophysicsData?: BiophysicsRecommendation | null;
}

interface CloValues {
  currentClo: number | undefined;
  targetClo: number | undefined;
}

interface WardrobePurchaseSuggestion {
  id: string;
  name: string;
  category: string;
  layerType: "base" | "mid" | "outer";
  targetArea: "Torso" | "Legs";
  rcl: number;
}

const LEGS_GARMENT_TYPES = new Set(["pants", "shorts", "bib"]);

const TORSO_CATEGORY_PRIORITY: Record<string, number> = {
  base_layer: 90,
  mid_layer_heavy: 100,
  mid_layer_light: 85,
  insulation_synthetic: 95,
  insulation_down: 95,
  outer_insulated: 92,
  soft_shell: 55,
  hard_shell: 45,
  windbreaker: 35,
};

const LEGS_CATEGORY_PRIORITY: Record<string, number> = {
  base_layer: 95,
  mid_layer_heavy: 80,
  mid_layer_light: 70,
  insulation_synthetic: 65,
  insulation_down: 60,
  outer_insulated: 75,
  soft_shell: 50,
  hard_shell: 40,
  windbreaker: 30,
};

function getItemClo(item: AvailableItem): number | null {
  const raw = item.rcl_clo as unknown;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseCloDeficitFromWarning(warning: string | undefined): number {
  if (!warning) return 0;

  const match = warning.match(/([0-9]+(?:\.[0-9]+)?)\s*clo\s*vs\s*([0-9]+(?:\.[0-9]+)?)\s*clo/i);
  if (!match) return 0;

  const current = Number.parseFloat(match[1]);
  const required = Number.parseFloat(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(required)) return 0;

  return Math.max(0, required - current);
}

function getCategoryPriority(category: string, area: "torso" | "legs"): number {
  return area === "torso"
    ? (TORSO_CATEGORY_PRIORITY[category] ?? 20)
    : (LEGS_CATEGORY_PRIORITY[category] ?? 20);
}

function getLayerType(category: string): "base" | "mid" | "outer" {
  const mapped = CATEGORY_TO_LAYER_TYPE[category];
  return mapped ?? "mid";
}

function isLegsGarment(item: AvailableItem): boolean {
  if (item.type !== "garment") return false;
  if (!item.garment_type) return false;
  return LEGS_GARMENT_TYPES.has(item.garment_type);
}

function formatCategoryLabel(category: string): string {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildSuggestion(item: AvailableItem, area: "torso" | "legs"): WardrobePurchaseSuggestion {
  const clo = getItemClo(item) ?? 0;

  return {
    id: item.id,
    name: `${item.brand} ${item.model_name}`.trim(),
    category: item.category,
    layerType: getLayerType(item.category),
    targetArea: area === "torso" ? "Torso" : "Legs",
    rcl: clo,
  };
}

function pickItemsForDeficit(
  candidates: AvailableItem[],
  area: "torso" | "legs",
  deficit: number,
  maxItems: number,
  usedIds: Set<string>
): WardrobePurchaseSuggestion[] {
  if (deficit <= 0 || maxItems <= 0) return [];

  const picks: WardrobePurchaseSuggestion[] = [];
  let remaining = deficit;

  while (picks.length < maxItems) {
    const available = candidates.filter((item) => {
      if (usedIds.has(item.id)) return false;
      const clo = getItemClo(item);
      return clo !== null && clo > 0;
    });

    if (available.length === 0) break;

    available.sort((a, b) => {
      const aPriority = getCategoryPriority(a.category, area);
      const bPriority = getCategoryPriority(b.category, area);
      const aClo = getItemClo(a) ?? 0;
      const bClo = getItemClo(b) ?? 0;

      const aDistance = aClo > remaining
        ? (aClo - remaining) * 1.2
        : (remaining - aClo);
      const bDistance = bClo > remaining
        ? (bClo - remaining) * 1.2
        : (remaining - bClo);

      const aCost = aDistance + ((100 - aPriority) / 100) * 0.25;
      const bCost = bDistance + ((100 - bPriority) / 100) * 0.25;

      if (aCost !== bCost) return aCost - bCost;
      if (aDistance !== bDistance) return aDistance - bDistance;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return bClo - aClo;
    });

    const best = available[0];
    const bestClo = getItemClo(best) ?? 0;
    usedIds.add(best.id);
    picks.push(buildSuggestion(best, area));
    remaining = Math.max(0, remaining - bestClo);

    if (remaining <= 0.05) break;
  }

  return picks;
}

function buildWardrobeGapSuggestions(
  availableItems: AvailableItem[],
  ownedItemIds: Set<string>,
  totalDeficit: number,
  torsoDeficit: number,
  legsDeficit: number
): WardrobePurchaseSuggestion[] {
  const candidates = availableItems.filter((item) => {
    if (item.type !== "garment") return false;
    if (ownedItemIds.has(item.id)) return false;
    const clo = getItemClo(item);
    return clo !== null && clo > 0;
  });

  const torsoCandidates = candidates.filter((item) => !isLegsGarment(item));
  const legsCandidates = candidates.filter(isLegsGarment);

  const fallbackTorsoDeficit = totalDeficit > 0 ? totalDeficit * 0.7 : 0;
  const fallbackLegsDeficit = totalDeficit > 0 ? totalDeficit * 0.3 : 0;
  const torsoNeed = Math.max(0, torsoDeficit, fallbackTorsoDeficit);
  const legsNeed = Math.max(0, legsDeficit, fallbackLegsDeficit);

  const usedIds = new Set<string>();
  const torsoPicks = pickItemsForDeficit(torsoCandidates, "torso", torsoNeed, 2, usedIds);
  const legsPicks = pickItemsForDeficit(legsCandidates, "legs", legsNeed, 1, usedIds);

  return [...torsoPicks, ...legsPicks].slice(0, 3);
}

interface ThermalDecisionState {
  riskType: "comfortable" | "cold" | "overheat";
  severity: "moderate" | "high";
  delta: number;
}

function getThermalDecisionState(
  totalClo: number | undefined,
  targetRange: [number, number] | undefined
): ThermalDecisionState | null {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  if (totalClo >= targetMin && totalClo <= targetMax) {
    return { riskType: "comfortable", severity: "moderate", delta: 0 };
  }

  const rangeWidth = Math.max(0.2, targetMax - targetMin);
  if (totalClo < targetMin) {
    const deficit = targetMin - totalClo;
    return {
      riskType: "cold",
      severity: deficit <= rangeWidth ? "moderate" : "high",
      delta: deficit,
    };
  }

  const excess = totalClo - targetMax;
  return {
    riskType: "overheat",
    severity: excess <= rangeWidth ? "moderate" : "high",
    delta: excess,
  };
}

function getThermalSummary(state: ThermalDecisionState | null): string {
  if (!state) return "Layer guidance generated for current conditions.";
  if (state.riskType === "comfortable") return "Insulation is within your comfort target.";
  if (state.riskType === "cold") return `${state.severity === "high" ? "Significantly" : "Slightly"} under-insulated (+${state.delta.toFixed(1)} clo needed).`;
  return `${state.severity === "high" ? "Significantly" : "Slightly"} over-insulated (-${state.delta.toFixed(1)} clo advised).`;
}

function getImmediateAction(state: ThermalDecisionState | null): string {
  if (!state) return "Review body-part recommendations below.";
  if (state.riskType === "comfortable") return "Current setup is in range; keep vents and exertion in mind.";
  if (state.riskType === "cold") {
    return state.severity === "high"
      ? "Add a warmer base and an insulating mid-layer now."
      : "Add a light-to-mid insulation layer now.";
  }
  return state.severity === "high"
    ? "Remove a warm layer and open vents immediately."
    : "Drop one layer or increase venting to avoid overheating.";
}

function getDecisionClasses(state: ThermalDecisionState | null, hasWardrobeGap: boolean): string {
  if (!state) return "border-white/35 bg-white/90 text-slate-900";
  if (state.riskType === "comfortable") {
    return hasWardrobeGap
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-emerald-300 bg-emerald-50 text-emerald-950";
  }
  if (state.riskType === "cold") {
    return state.severity === "high"
      ? "border-rose-300 bg-rose-50 text-rose-950"
      : "border-amber-300 bg-amber-50 text-amber-950";
  }
  return state.severity === "high"
    ? "border-orange-300 bg-orange-50 text-orange-950"
    : "border-amber-300 bg-amber-50 text-amber-950";
}

/**
 * Calculates current and target clo values for a body part based on biophysics data.
 */
function getCloValues(
  bodyPart: BodyPart,
  regionalClo: RegionalClo | undefined,
  regionalIreq: RegionalIreqRange | undefined,
  extremityIreq: ExtremityIreqRange | undefined,
  handwear: RecommendedHandwear | null | undefined,
  headwear: RecommendedHeadwear | null | undefined,
  includeHelmetClo = true
): CloValues {
  const region = BODY_PART_TO_REGION[bodyPart];
  const extremity = BODY_PART_TO_EXTREMITY[bodyPart];

  if (region) {
    return {
      currentClo: regionalClo?.[region],
      targetClo: regionalIreq?.neutral?.[region],
    };
  }

  if (extremity) {
    let currentClo: number | undefined;

    if (extremity === "hands" && handwear) {
      currentClo = handwear.rcl;
    } else if (extremity === "head" && headwear) {
      currentClo =
        (includeHelmetClo ? (headwear.helmet?.rcl ?? 0) : 0) +
        (headwear.head_warmth?.rcl ?? 0) +
        (headwear.neck_warmth?.rcl ?? 0);
    }

    return {
      currentClo,
      targetClo: extremityIreq?.neutral?.[extremity],
    };
  }

  return { currentClo: undefined, targetClo: undefined };
}

/**
 * Displays layered clothing recommendations organized by body part.
 * Supports both static recommendations and biophysics-based recommendations.
 */
const LayerDisplay = ({
  activity,
  recommendation,
  temperature,
  windspeed,
  itemMappings,
  biophysicsData,
}: LayerDisplayProps) => {
  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;

  const biophysicsGarments = biophysicsData?.recommendation?.garments;
  const handwear = biophysicsData?.recommendation?.handwear;
  const shouldIgnoreHelmetForClo = activity === "xc_skiing";
  const headwear = shouldIgnoreHelmetForClo && biophysicsData?.recommendation?.headwear
    ? { ...biophysicsData.recommendation.headwear, helmet: null }
    : biophysicsData?.recommendation?.headwear;
  const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
  const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;
  const regionalIreq = biophysicsData?.ireq?.regional;
  const extremityIreq = biophysicsData?.ireq?.extremity;
  const wardrobeGapWarning = biophysicsData?.warnings?.find((warning) => {
    const normalized = warning.toLowerCase();
    return normalized.includes("insufficient overall insulation") || normalized.includes("heat loss risk");
  });
  const targetMinClo = biophysicsData?.ireq?.target_range?.[0];
  const computedTotalDeficit =
    targetMinClo !== undefined && totalClo !== undefined
      ? Math.max(0, targetMinClo - totalClo)
      : 0;
  const warningDeficit = parseCloDeficitFromWarning(wardrobeGapWarning);
  const totalDeficit = Math.max(computedTotalDeficit, warningDeficit);
  const torsoDeficit =
    regionalIreq?.neutral?.torso !== undefined && regionalClo?.torso !== undefined
      ? Math.max(0, regionalIreq.neutral.torso - regionalClo.torso)
      : 0;
  const legsDeficit =
    regionalIreq?.neutral?.legs !== undefined && regionalClo?.legs !== undefined
      ? Math.max(0, regionalIreq.neutral.legs - regionalClo.legs)
      : 0;

  const [purchaseSuggestions, setPurchaseSuggestions] = useState<WardrobePurchaseSuggestion[]>([]);
  const [purchaseSuggestionsLoading, setPurchaseSuggestionsLoading] = useState(false);
  const [showAllPurchaseSuggestions, setShowAllPurchaseSuggestions] = useState(false);
  const thermalDecision = getThermalDecisionState(totalClo, biophysicsData?.ireq?.target_range);
  const statusSummary = getThermalSummary(thermalDecision);
  const immediateAction = getImmediateAction(thermalDecision);

  useEffect(() => {
    let isCancelled = false;

    if (!wardrobeGapWarning || totalDeficit <= 0) {
      setPurchaseSuggestions([]);
      setPurchaseSuggestionsLoading(false);
      setShowAllPurchaseSuggestions(false);
      return () => {
        isCancelled = true;
      };
    }

    const fetchSuggestions = async () => {
      setPurchaseSuggestionsLoading(true);
      try {
        const availableResponse = await fetch("/api/wardrobe/available");
        if (!availableResponse.ok) {
          throw new Error(`Failed to fetch available wardrobe items (${availableResponse.status})`);
        }

        const availablePayload = await availableResponse.json() as { items?: AvailableItem[] };
        const availableItems = Array.isArray(availablePayload.items) ? availablePayload.items : [];

        const userId = localStorage.getItem(STORAGE_KEYS.USER_ID);
        const ownedItemIds = new Set<string>();

        if (userId) {
          const wardrobeResponse = await fetch("/api/wardrobe/gear", {
            headers: { "x-user-id": userId },
          });

          if (wardrobeResponse.ok) {
            const wardrobePayload = await wardrobeResponse.json() as {
              items?: Array<{ item_id?: string }>;
            };

            for (const item of wardrobePayload.items ?? []) {
              if (item.item_id) ownedItemIds.add(item.item_id);
            }
          }
        }

        const suggestions = buildWardrobeGapSuggestions(
          availableItems,
          ownedItemIds,
          totalDeficit,
          torsoDeficit,
          legsDeficit
        );

        if (!isCancelled) {
          setPurchaseSuggestions(suggestions);
          setShowAllPurchaseSuggestions(false);
        }
      } catch (error) {
        if (!isCancelled) {
          setPurchaseSuggestions([]);
          setShowAllPurchaseSuggestions(false);
        }
        logWarn("LayerDisplay.fetchWardrobeGapSuggestions", error);
      } finally {
        if (!isCancelled) {
          setPurchaseSuggestionsLoading(false);
        }
      }
    };

    void fetchSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [wardrobeGapWarning, totalDeficit, torsoDeficit, legsDeficit]);

  if (!recommendation && !biophysicsData) return null;

  const hasWardrobeGap = Boolean(wardrobeGapWarning);
  const decisionTitle = thermalDecision
    ? thermalDecision.riskType === "comfortable"
      ? "Comfort Range Achieved"
      : thermalDecision.riskType === "cold"
        ? `Cold Risk — ${thermalDecision.severity === "high" ? "High" : "Moderate"}`
        : `Overheating Risk — ${thermalDecision.severity === "high" ? "High" : "Moderate"}`
    : "Layer Guidance";
  const visibleSuggestions = showAllPurchaseSuggestions
    ? purchaseSuggestions.slice(1)
    : [];
  const hasExtraSuggestions = purchaseSuggestions.length > 1;
  const topSuggestion = purchaseSuggestions[0];
  const targetRangeLabel = biophysicsData?.ireq?.target_range
    ? `${biophysicsData.ireq.target_range[0].toFixed(1)}-${biophysicsData.ireq.target_range[1].toFixed(1)} clo`
    : "your target clo range";

  return (
    <div className="flex flex-col gap-8">
      <WeatherHeader
        temperature={temperature}
        windspeed={windspeed}
        score={biophysicsData?.recommendation?.thermal_comfort_score ?? biophysicsData?.recommendation?.score}
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
      />

      <ThermalGauge
        totalClo={totalClo}
        targetRange={biophysicsData?.ireq?.target_range}
      />

      <section
        className={cn(
          "rounded-xl border px-4 py-4 sm:px-5 sm:py-5",
          getDecisionClasses(thermalDecision, hasWardrobeGap)
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 opacity-80" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Recommendation</p>
            <h3 className="mt-0.5 text-xl font-semibold leading-tight">{decisionTitle}</h3>
            <p className="mt-1.5 text-sm opacity-90">{statusSummary}</p>

            <div className="mt-4 grid gap-3">
              <div className="rounded-lg border border-current/20 bg-white/45 px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Now</p>
                <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
                  <li>{immediateAction}</li>
                  {thermalDecision && thermalDecision.riskType !== "comfortable" && (
                    <li>
                      Stay near target range: {targetRangeLabel}
                    </li>
                  )}
                </ul>
              </div>

              {hasWardrobeGap && (
                <div className="rounded-lg border border-current/20 bg-white/45 px-3.5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Improve Wardrobe</p>
                  <p className="mt-2 text-sm leading-relaxed">{wardrobeGapWarning}</p>
                  {purchaseSuggestionsLoading ? (
                    <p className="mt-2 text-sm">Finding purchasable items in the wardrobe database...</p>
                  ) : purchaseSuggestions.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Suggested Gear To Buy</p>
                      {topSuggestion && (
                        <div className="mt-2 rounded-md border border-current/20 bg-white/55 p-2.5">
                          <p className="text-sm font-semibold leading-snug">{topSuggestion.name}</p>
                          <p className="mt-1 text-xs opacity-90">
                            {topSuggestion.targetArea} {LAYER_LABELS[topSuggestion.layerType]}
                            {" · "}
                            {formatCategoryLabel(topSuggestion.category)}
                            {" · +"}
                            {topSuggestion.rcl.toFixed(2)}
                            {" clo"}
                          </p>
                        </div>
                      )}
                      {showAllPurchaseSuggestions && visibleSuggestions.length > 0 && (
                        <ul className="mt-2 space-y-2">
                          {visibleSuggestions.map((item) => (
                            <li key={item.id} className="text-sm leading-relaxed">
                              <p className="font-semibold">{item.name}</p>
                              <p className="opacity-90">
                                {item.targetArea} {LAYER_LABELS[item.layerType]}
                                {" · "}
                                {formatCategoryLabel(item.category)}
                                {" · +"}
                                {item.rcl.toFixed(2)}
                                {" clo"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                      {hasExtraSuggestions && (
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 hover:opacity-75"
                          onClick={() => setShowAllPurchaseSuggestions((prev) => !prev)}
                        >
                          {showAllPurchaseSuggestions ? (
                            <>
                              Hide suggestions
                              <ChevronUp className="size-3.5" />
                            </>
                          ) : (
                            <>
                              Show suggestions ({purchaseSuggestions.length})
                              <ChevronDown className="size-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm">No purchasable layer items were found in the current wardrobe database.</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button asChild className="flex-1 bg-slate-900 text-white hover:bg-slate-800">
                <Link href="/wardrobe">
                  Update Wardrobe
                  <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">
          Detailed Layer Breakdown
        </h3>
      </div>
      <div className="flex flex-col gap-6">
        {BODY_PARTS.map((part) => {
          const wardrobeLayers =
            (part === "torso" || part === "legs") && biophysicsGarments
              ? garmentsToLayerSet(biophysicsGarments, part)
              : createEmptyLayerSet();

          const layers = biophysicsActive
            ? wardrobeLayers
            : recommendation?.[part] ?? createEmptyLayerSet();

          const { currentClo, targetClo } = getCloValues(
            part,
            regionalClo,
            regionalIreq,
            extremityIreq,
            handwear,
            headwear,
            !shouldIgnoreHelmetForClo
          );

          return (
            <BodyPartSection
              key={part}
              bodyPart={part}
              layers={layers}
              biophysicsActive={biophysicsActive}
              handwear={handwear}
              headwear={headwear}
              currentClo={currentClo}
              targetClo={targetClo}
              itemMappings={itemMappings}
            />
          );
        })}
      </div>

      {biophysicsData?.guidance && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">Actionable Guidance</h3>
          <GuidanceSection tips={biophysicsData.guidance} />
        </div>
      )}

      {biophysicsData?.recommendation && (
        <details className="rounded-lg border border-white/25 bg-white/10 p-4">
          <summary className="cursor-pointer text-sm font-semibold tracking-wide text-white/85">
            Advanced Biophysics Details
          </summary>
          <div className="mt-4">
            <BiophysicsDetails data={biophysicsData} />
          </div>
        </details>
      )}
    </div>
  );
};

export default LayerDisplay;

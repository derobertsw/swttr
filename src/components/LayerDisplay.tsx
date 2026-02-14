"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, ChevronUp, Info, Loader2 } from "lucide-react";
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
  BODY_PART_LABELS,
  BODY_PART_TO_REGION,
  BODY_PART_TO_EXTREMITY,
  garmentsToLayerSet,
  createEmptyLayerSet,
  CATEGORY_TO_LAYER_TYPE,
  LAYER_LABELS,
} from "@/lib/layers";
import { calculateThermalComfortScore, evaluateThermalComfort } from "@/lib/biophysics/comfort";
import type { AvailableItem } from "@/types/wardrobe";
import { useAuth } from "@clerk/nextjs";
import { logWarn } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  onReset?: () => void;
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
const BODY_PART_ORDER_INDEX = BODY_PARTS.reduce((acc, part, index) => {
  acc[part] = index;
  return acc;
}, {} as Record<BodyPart, number>);

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

function formatCloRangeLabel(range?: [number, number]): string | null {
  if (!range || range.length !== 2) return null;
  return `${range[0].toFixed(1)}-${range[1].toFixed(1)} clo`;
}

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

function parseMaxCloDeficitFromWarnings(warnings: string[] | undefined): number {
  if (!warnings || warnings.length === 0) return 0;
  return warnings.reduce((maxDeficit, warning) => {
    return Math.max(maxDeficit, parseCloDeficitFromWarning(warning));
  }, 0);
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

type ThermalDecisionState = NonNullable<ReturnType<typeof evaluateThermalComfort>>;

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

type CloStatusKind = "need" | "over" | "inRange";
type BreakdownSortMode = "bodyArea" | "gap";

interface CloStatus {
  kind: CloStatusKind;
  delta: number;
  label: string;
  phrase: string;
  className: string;
}

function getCloStatus(
  totalClo: number | undefined,
  targetRange: [number, number] | undefined
): CloStatus | null {
  if (totalClo === undefined || !targetRange) return null;

  const [targetMin, targetMax] = targetRange;
  const CLO_EPSILON = 0.05;
  const deficitRaw = targetMin - totalClo;
  const surplusRaw = totalClo - targetMax;
  const deficit = deficitRaw > CLO_EPSILON ? deficitRaw : 0;
  const surplus = surplusRaw > CLO_EPSILON ? surplusRaw : 0;

  if (deficit > 0) {
    return {
      kind: "need",
      delta: deficit,
      label: `Need +${deficit.toFixed(1)} clo`,
      phrase: "cold",
      className: "border-sky-200 bg-sky-50/95 text-sky-800",
    };
  }

  if (surplus > 0) {
    return {
      kind: "over",
      delta: surplus,
      label: `Over +${surplus.toFixed(1)} clo`,
      phrase: "warm",
      className: "border-amber-200 bg-amber-50/95 text-amber-800",
    };
  }

  return {
    kind: "inRange",
    delta: 0,
    label: "In target range",
    phrase: "in range",
    className: "border-emerald-200 bg-emerald-50/95 text-emerald-800",
  };
}

function getDecisionFromCloStatus(status: CloStatus | null): ThermalDecisionState | null {
  if (!status) return null;

  if (status.kind === "inRange") {
    return {
      riskType: "comfortable",
      severity: "moderate",
      delta: 0,
    };
  }

  return {
    riskType: status.kind === "need" ? "cold" : "overheat",
    severity: status.delta >= 0.35 ? "high" : "moderate",
    delta: status.delta,
  };
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
 * Compact body-part clo status grid for the descent layer plan.
 */
function DescentBodyPartGrid({
  breakdown,
  headwear,
  handwear,
}: {
  breakdown: NonNullable<BiophysicsRecommendation["descent_breakdown"]>;
  headwear: RecommendedHeadwear | null | undefined;
  handwear: RecommendedHandwear | null | undefined;
}) {
  const rows: { label: string; current: number; target: number }[] = [
    { label: "Torso", current: breakdown.regional_clo.torso, target: breakdown.regional_ireq.neutral.torso },
    { label: "Arms", current: breakdown.regional_clo.arms, target: breakdown.regional_ireq.neutral.arms },
    { label: "Legs", current: breakdown.regional_clo.legs, target: breakdown.regional_ireq.neutral.legs },
    {
      label: "Hands",
      current: handwear?.rcl ?? 0,
      target: breakdown.extremity_ireq.neutral.hands,
    },
    {
      label: "Head/Neck",
      current:
        (headwear?.helmet?.rcl ?? 0) +
        (headwear?.head_warmth?.rcl ?? 0) +
        (headwear?.neck_warmth?.rcl ?? 0),
      target: breakdown.extremity_ireq.neutral.head,
    },
  ];

  return (
    <div className="mt-3 grid grid-cols-5 gap-1.5">
      {rows.map((row) => {
        const delta = row.current - row.target;
        const isShort = delta < -0.15;
        const isOver = delta > 0.35;
        const statusColor = isShort
          ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
          : isOver
            ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
            : "border-emerald-400/60 bg-emerald-500/20 text-emerald-200";
        return (
          <div
            key={row.label}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-center",
              statusColor
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{row.label}</p>
            <p className="text-xs font-bold tabular-nums">{row.current.toFixed(1)}</p>
            <p className="text-[10px] opacity-70 tabular-nums">/ {row.target.toFixed(1)}</p>
          </div>
        );
      })}
    </div>
  );
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
  onReset,
}: LayerDisplayProps) => {
  const { userId } = useAuth();
  const isBackcountrySkiing = activity === "backcountry_skiing";
  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;
  const [breakdownSortMode, setBreakdownSortMode] = useState<BreakdownSortMode>(
    isBackcountrySkiing ? "gap" : "bodyArea"
  );
  const [genericCloByBodyPart, setGenericCloByBodyPart] = useState<Record<BodyPart, number>>({
    torso: 0,
    legs: 0,
    hands: 0,
    headNeck: 0,
  });

  const handleGenericCloChange = useCallback((bodyPart: BodyPart, clo: number) => {
    setGenericCloByBodyPart((prev) => {
      if (prev[bodyPart] === clo) return prev;
      return { ...prev, [bodyPart]: clo };
    });
  }, []);

  const biophysicsGarments = biophysicsData?.recommendation?.garments;
  const handwear = biophysicsData?.recommendation?.handwear;
  const shouldIgnoreHelmetForClo = activity === "xc_skiing";
  const headwear = shouldIgnoreHelmetForClo && biophysicsData?.recommendation?.headwear
    ? { ...biophysicsData.recommendation.headwear, helmet: null }
    : biophysicsData?.recommendation?.headwear;
  const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
  const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;
  const totalGenericClo = Object.values(genericCloByBodyPart).reduce((sum, clo) => sum + clo, 0);
  const effectiveTotalClo =
    totalClo !== undefined
      ? totalClo + totalGenericClo
      : totalGenericClo > 0
        ? totalGenericClo
        : undefined;
  const regionalIreq = biophysicsData?.ireq?.regional;
  const extremityIreq = biophysicsData?.ireq?.extremity;
  const totalPackWeight = biophysicsData?.pack_items?.total_weight_g;
  const descentPackItems = biophysicsData?.pack_items?.garments ?? [];
  const descentHeadwear = biophysicsData?.descent_headwear;
  const descentHelmetClo = descentHeadwear?.helmet?.rcl ?? 0;
  const descentPackClo = descentPackItems.reduce((sum, item) => {
    return sum + (typeof item.rcl_clo === "number" ? item.rcl_clo : 0);
  }, 0);
  const downhillTargetMinClo = biophysicsData?.ireq?.downhill_target_range?.[0]
    ?? biophysicsData?.ireq?.downhill?.min;
  const estimatedDescentClo = effectiveTotalClo !== undefined ? effectiveTotalClo + descentPackClo + descentHelmetClo : undefined;
  const descentDeficit =
    isBackcountrySkiing &&
    downhillTargetMinClo !== undefined &&
    estimatedDescentClo !== undefined
      ? Math.max(0, downhillTargetMinClo - estimatedDescentClo)
      : 0;
  const hasDescentGap = descentDeficit > 0.12;
  const insulationWarnings = (biophysicsData?.warnings ?? []).filter((warning) => {
    const normalized = warning.toLowerCase();
    return normalized.includes("insufficient overall insulation") || normalized.includes("heat loss risk");
  });
  const wardrobeGapWarning = insulationWarnings.find((warning) => warning.toLowerCase().includes("descent"))
    ?? insulationWarnings[0];
  const targetMinClo = biophysicsData?.ireq?.target_range?.[0];
  const computedTotalDeficit =
    targetMinClo !== undefined && effectiveTotalClo !== undefined
      ? Math.max(0, targetMinClo - effectiveTotalClo)
      : 0;
  const warningDeficit = parseMaxCloDeficitFromWarnings(insulationWarnings);
  const getRegionalDeficit = (target?: number, current?: number): number => {
    if (target === undefined) return 0;
    return Math.max(0, target - (current ?? 0));
  };
  const torsoDeficit = getRegionalDeficit(
    regionalIreq?.neutral?.torso,
    (regionalClo?.torso ?? 0) + genericCloByBodyPart.torso
  );
  const armsDeficit = getRegionalDeficit(regionalIreq?.neutral?.arms, regionalClo?.arms);
  const legsDeficit = getRegionalDeficit(
    regionalIreq?.neutral?.legs,
    (regionalClo?.legs ?? 0) + genericCloByBodyPart.legs
  );
  const maxRegionalDeficit = Math.max(torsoDeficit, armsDeficit, legsDeficit);
  const hasRegionalGap = maxRegionalDeficit > 0.12;
  const totalDeficit = Math.max(
    computedTotalDeficit,
    warningDeficit,
    torsoDeficit + legsDeficit,
    descentDeficit
  );
  const hasWardrobeGap = Boolean(wardrobeGapWarning) || hasRegionalGap || hasDescentGap;
  const descentGapMessage =
    hasDescentGap && estimatedDescentClo !== undefined && downhillTargetMinClo !== undefined
      ? `Insufficient insulation for the way down with current wardrobe layers: ${estimatedDescentClo.toFixed(1)} clo vs ${downhillTargetMinClo.toFixed(1)} clo needed (${descentDeficit.toFixed(1)} clo short).`
      : null;
  const wardrobeGapMessage =
    descentGapMessage ??
    wardrobeGapWarning ??
    "Current setup misses target insulation in one or more body regions. Add coverage where deficits are highest.";

  const [purchaseSuggestions, setPurchaseSuggestions] = useState<WardrobePurchaseSuggestion[]>([]);
  const [purchaseSuggestionsLoading, setPurchaseSuggestionsLoading] = useState(false);
  const [showAllPurchaseSuggestions, setShowAllPurchaseSuggestions] = useState(false);
  const thermalDecision = evaluateThermalComfort({
    totalClo: effectiveTotalClo,
    targetRange: biophysicsData?.ireq?.target_range,
    maxRegionalDeficit,
  });
  const thermalComfortScore = calculateThermalComfortScore({
    totalClo: effectiveTotalClo,
    targetRange: biophysicsData?.ireq?.target_range,
    maxRegionalDeficit,
  })
    ?? biophysicsData?.recommendation?.thermal_comfort_score
    ?? biophysicsData?.recommendation?.score;
  const regionalDeficitSummary = BODY_PARTS
    .map((part) => {
      const { currentClo, targetClo } = getCloValues(
        part,
        regionalClo,
        regionalIreq,
        extremityIreq,
        handwear,
        headwear,
        !shouldIgnoreHelmetForClo
      );
      const adjustedCurrent = (currentClo ?? 0) + genericCloByBodyPart[part];
      const deficit = targetClo !== undefined ? Math.max(0, targetClo - adjustedCurrent) : 0;
      return {
        part,
        label: BODY_PART_LABELS[part],
        deficit,
      };
    })
    .sort((a, b) => b.deficit - a.deficit);
  const topDeficitArea = regionalDeficitSummary.find((item) => item.deficit > 0.12);

  useEffect(() => {
    let isCancelled = false;

    if (!hasWardrobeGap || totalDeficit <= 0) {
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

        const ownedItemIds = new Set<string>();

        if (userId) {
          const wardrobeResponse = await fetch("/api/wardrobe/gear");

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
  }, [hasWardrobeGap, totalDeficit, torsoDeficit, legsDeficit, userId]);

  if (!recommendation && !biophysicsData) return null;

  const uphillTargetRange = biophysicsData?.ireq?.target_range;
  const downhillTargetRange = biophysicsData?.ireq?.downhill_target_range
    ?? (biophysicsData?.ireq?.downhill
      ? [biophysicsData.ireq.downhill.min, biophysicsData.ireq.downhill.neutral] as [number, number]
      : undefined);
  const showDualComfortGauges = isBackcountrySkiing
    && biophysicsActive
    && estimatedDescentClo !== undefined
    && downhillTargetRange !== undefined;
  const climbStatus = showDualComfortGauges ? getCloStatus(effectiveTotalClo, uphillTargetRange) : null;
  const descentStatus = showDualComfortGauges ? getCloStatus(estimatedDescentClo, downhillTargetRange) : null;
  const climbDecision = showDualComfortGauges ? getDecisionFromCloStatus(climbStatus) : null;
  const decisionForRiskCard = showDualComfortGauges ? climbDecision : thermalDecision;
  const backcountrySummaryLine = climbStatus && descentStatus
    ? `You're ${climbStatus.phrase} on climb, ${descentStatus.phrase} on descent.`
    : null;
  const showDecisionChip = Boolean(thermalDecision) && !showDualComfortGauges;
  const isBackcountryDescentGap = showDualComfortGauges && hasDescentGap;

  const decisionTitle = thermalDecision
    ? thermalDecision.riskType === "comfortable"
      ? "In Target Range"
      : thermalDecision.riskType === "cold"
        ? `Cold Risk — ${thermalDecision.severity === "high" ? "High" : "Moderate"}`
        : `Overheating Risk — ${thermalDecision.severity === "high" ? "High" : "Moderate"}`
    : "Layer Guidance";
  const climbRiskTitle = decisionForRiskCard
    ? decisionForRiskCard.riskType === "comfortable"
      ? "Climb In Target Range"
      : decisionForRiskCard.riskType === "cold"
        ? `Climb Cold Risk — ${decisionForRiskCard.severity === "high" ? "High" : "Moderate"}`
        : `Climb Overheating Risk — ${decisionForRiskCard.severity === "high" ? "High" : "Moderate"}`
    : "Climb Guidance";
  const riskCardTitle = showDualComfortGauges ? climbRiskTitle : decisionTitle;
  const visibleSuggestions = showAllPurchaseSuggestions
    ? purchaseSuggestions.slice(1)
    : [];
  const hasExtraSuggestions = purchaseSuggestions.length > 1;
  const showRiskCard = biophysicsActive
    ? Boolean(decisionForRiskCard && decisionForRiskCard.riskType !== "comfortable")
    : true;
  const statusSummary = getThermalSummary(decisionForRiskCard);
  const immediateAction = getImmediateAction(decisionForRiskCard);
  const topSuggestion = purchaseSuggestions[0];
  const targetRangeLabel = biophysicsData?.ireq?.target_range
    ? formatCloRangeLabel(biophysicsData.ireq.target_range)
    : null;
  const downhillTargetRangeLabel = biophysicsData?.ireq?.downhill_target_range
    ? formatCloRangeLabel(biophysicsData.ireq.downhill_target_range)
    : biophysicsData?.ireq?.downhill
      ? `${biophysicsData.ireq.downhill.min.toFixed(1)}-${biophysicsData.ireq.downhill.neutral.toFixed(1)} clo`
      : null;
  const topSummaryChipLabel = topDeficitArea
    ? `${topDeficitArea.label} +${topDeficitArea.deficit.toFixed(1)} clo`
    : null;
  const showInlineSnapshotRow = biophysicsActive && (!showDualComfortGauges || showDecisionChip || Boolean(topSummaryChipLabel));
  const bodyPartSections = BODY_PARTS.map((part) => {
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

    const adjustedCurrent = (currentClo ?? 0) + genericCloByBodyPart[part];
    const urgencyDelta =
      targetClo !== undefined
        ? Math.max(Math.abs(adjustedCurrent - targetClo), 0)
        : 0;

    return {
      part,
      layers,
      currentClo,
      targetClo,
      urgencyDelta,
    };
  });
  const orderedBodyPartSections =
    showDualComfortGauges && breakdownSortMode === "gap"
      ? [...bodyPartSections].sort((a, b) => {
        if (b.urgencyDelta !== a.urgencyDelta) return b.urgencyDelta - a.urgencyDelta;
        return BODY_PART_ORDER_INDEX[a.part] - BODY_PART_ORDER_INDEX[b.part];
      })
      : bodyPartSections;

  return (
    <div className="flex flex-col gap-8 pb-24">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 self-start -mt-2 -mb-2 text-sm font-medium text-white/75 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
      )}

      <WeatherHeader
        temperature={temperature}
        windspeed={windspeed}
        score={showDualComfortGauges ? undefined : thermalComfortScore}
        totalClo={effectiveTotalClo}
        targetRange={biophysicsData?.ireq?.target_range}
        regionalDeficit={maxRegionalDeficit}
        hasRegionalGap={hasRegionalGap}
      />

      {showDualComfortGauges ? (
        <section className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-3 sm:px-4">
          <div className="space-y-4">
            {climbStatus && descentStatus && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", climbStatus.className)}>
                      Climb: {climbStatus.label}
                    </span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", descentStatus.className)}>
                      Descent: {descentStatus.label}
                    </span>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="View thermal snapshot details"
                        className="inline-flex size-7 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/80 transition-colors hover:bg-white/20"
                      >
                        <Info className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72">
                      <PopoverHeader>
                        <PopoverTitle>Thermal Snapshot</PopoverTitle>
                        <PopoverDescription>
                          Quick context for the current recommendation.
                        </PopoverDescription>
                      </PopoverHeader>
                      <div className="mt-3 space-y-2 text-xs text-slate-600">
                        {effectiveTotalClo !== undefined && (
                          <p>Current insulation: {effectiveTotalClo.toFixed(1)} clo</p>
                        )}
                        {targetRangeLabel && (
                          <p>Target insulation: {targetRangeLabel}</p>
                        )}
                        {topDeficitArea ? (
                          <p>Biggest regional gap: {topDeficitArea.label} (+{topDeficitArea.deficit.toFixed(1)} clo)</p>
                        ) : (
                          <p>No major regional insulation gaps detected.</p>
                        )}
                        {hasDescentGap && (
                          <p>Descent shortfall: +{descentDeficit.toFixed(1)} clo</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                {backcountrySummaryLine && (
                  <p className="text-sm font-medium text-white/88">{backcountrySummaryLine}</p>
                )}
                {effectiveTotalClo !== undefined && (
                  <p className="text-xs text-white/68">
                    Current setup: {effectiveTotalClo.toFixed(1)} clo
                    {descentPackClo > 0 && estimatedDescentClo !== undefined
                      ? ` · Descent with pack: ${estimatedDescentClo.toFixed(1)} clo`
                      : ""}
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Climb
              </p>
              <ThermalGauge
                totalClo={effectiveTotalClo}
                targetRange={uphillTargetRange}
                markerLabel=""
                targetLabel="Climb target"
                showStatusPill={false}
                hideMarkerLabel
              />
            </div>
            <div className="border-t border-white/15 pt-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Descent
              </p>
              <ThermalGauge
                totalClo={estimatedDescentClo}
                targetRange={downhillTargetRange}
                markerLabel=""
                targetLabel="Descent target"
                showStatusPill={false}
                hideMarkerLabel
              />
            </div>
          </div>
        </section>
      ) : (
        <ThermalGauge
          totalClo={effectiveTotalClo}
          targetRange={uphillTargetRange}
        />
      )}

      {showInlineSnapshotRow && (
        <div className="-mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {showDecisionChip && (
            <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 font-semibold text-white/85">
              {decisionTitle}
            </span>
          )}
          {topSummaryChipLabel && (
            <span
              className="rounded-full border border-sky-300/35 bg-sky-100/10 px-2.5 py-1 font-semibold text-sky-100"
            >
              {topSummaryChipLabel}
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="View thermal snapshot details"
                className="inline-flex size-7 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/80 transition-colors hover:bg-white/20"
              >
                <Info className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <PopoverHeader>
                <PopoverTitle>Thermal Snapshot</PopoverTitle>
                <PopoverDescription>
                  Quick context for the current recommendation.
                </PopoverDescription>
              </PopoverHeader>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {effectiveTotalClo !== undefined && (
                  <p>Current insulation: {effectiveTotalClo.toFixed(1)} clo</p>
                )}
                {targetRangeLabel && (
                  <p>Target insulation: {targetRangeLabel}</p>
                )}
                {topDeficitArea ? (
                  <p>Biggest regional gap: {topDeficitArea.label} (+{topDeficitArea.deficit.toFixed(1)} clo)</p>
                ) : (
                  <p>No major regional insulation gaps detected.</p>
                )}
                {hasDescentGap && (
                  <p>Descent shortfall: +{descentDeficit.toFixed(1)} clo</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {showRiskCard && (
        <section
          className={cn(
            "rounded-xl border px-4 py-4 sm:px-5 sm:py-5",
            getDecisionClasses(decisionForRiskCard, false)
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                {showDualComfortGauges ? "Climb Risk" : "Current Risk"}
              </p>
              <h3 className="mt-0.5 text-xl font-semibold leading-tight">{riskCardTitle}</h3>
              <p className="mt-1.5 text-sm opacity-90">{statusSummary}</p>

              <div className="mt-4 rounded-lg border border-current/20 bg-white/60 px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-75">
                  {isBackcountrySkiing ? "Climb" : "Now"}
                </p>
                <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
                  <li>{immediateAction}</li>
                  {decisionForRiskCard && decisionForRiskCard.riskType !== "comfortable" && (
                    <li>
                      Stay near target range: {targetRangeLabel ?? "your target clo range"}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {hasWardrobeGap && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-950 sm:px-5 sm:py-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
                {isBackcountryDescentGap ? "Backcountry" : "Wardrobe Gap"}
              </p>
              <h3 className="mt-0.5 text-xl font-semibold leading-tight">
                {isBackcountryDescentGap ? "Descent Risk" : "Improve Wardrobe"}
              </h3>
              {isBackcountryDescentGap && estimatedDescentClo !== undefined ? (
                <>
                  <p className="mt-1.5 text-sm font-medium opacity-90">Add one packable insulation layer for descent.</p>
                  <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed opacity-90">
                    <li>Current: {estimatedDescentClo.toFixed(1)} clo</li>
                    <li>
                      Descent target: {downhillTargetRangeLabel ?? `${downhillTargetMinClo?.toFixed(1) ?? "?"}+ clo`}
                      {" "}
                      (+{descentDeficit.toFixed(1)} needed)
                    </li>
                  </ul>
                </>
              ) : (
                <p className="mt-1.5 text-sm opacity-90">{wardrobeGapMessage}</p>
              )}
              {purchaseSuggestionsLoading ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-800/70">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Finding gear suggestions...</span>
                  </div>
                  <div className="rounded-md border border-current/20 bg-white/55 p-2.5">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-amber-900/12" />
                    <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-amber-900/8" />
                  </div>
                </div>
              ) : purchaseSuggestions.length > 0 ? (
                <div className="mt-3">
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
                      className="mt-2 inline-flex items-center gap-1 rounded-full border border-current/30 bg-white/40 px-2 py-1 text-xs font-semibold hover:bg-white/55"
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
                <p className="mt-3 text-sm">No purchasable layer items were found in the current wardrobe database.</p>
              )}

              <div className="mt-4 flex gap-2">
                <Button asChild className="flex-1 bg-slate-900 text-white hover:bg-slate-800">
                  <Link href="/wardrobe">
                    {isBackcountryDescentGap ? "Add descent layer" : "Update Wardrobe"}
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">
            Detailed Layer Breakdown
          </h3>
          {showDualComfortGauges && (
            <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
              Climb setup
            </span>
          )}
        </div>
        {showDualComfortGauges && (
          <button
            type="button"
            onClick={() => setBreakdownSortMode((prev) => (prev === "gap" ? "bodyArea" : "gap"))}
            className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/15"
          >
            Sort: {breakdownSortMode === "gap" ? "Biggest gap" : "Body area"}
          </button>
        )}
      </div>
      <p className="-mt-4 text-xs text-white/60">
        {showDualComfortGauges
          ? `Tap a body area for details. Sorted by ${breakdownSortMode === "gap" ? "biggest gap" : "body area"}.`
          : "Tap a body area to collapse or expand details."}
      </p>
      <div className="flex flex-col gap-6">
        {orderedBodyPartSections.map(({ part, layers, currentClo, targetClo }) => (
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
            onGenericCloChange={handleGenericCloChange}
          />
        ))}
      </div>

      {biophysicsData?.guidance && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">Actionable Guidance</h3>
          <GuidanceSection tips={biophysicsData.guidance} />
        </div>
      )}

      {isBackcountrySkiing && biophysicsActive && (
        <section className="rounded-lg border border-white/25 bg-white/15 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/85">
            Descent Layer Plan
          </h3>
          <p className="mt-2 text-sm text-white/80 leading-relaxed">
            Maximize reuse from the climb: keep your climb layers on, then add only the pack layers below for transition and descent.
          </p>
          {hasDescentGap && estimatedDescentClo !== undefined && downhillTargetMinClo !== undefined && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              <p className="text-xs font-semibold uppercase tracking-wide">Descent Warning</p>
              <p className="mt-1 text-sm leading-relaxed">
                Current descent setup is short: {estimatedDescentClo.toFixed(1)} clo vs {downhillTargetMinClo.toFixed(1)} clo needed.
                Add insulation from Suggested Gear To Buy above.
              </p>
            </div>
          )}
          {downhillTargetRangeLabel && (
            <p className="mt-2 text-xs text-white/70">
              Descent target insulation: {downhillTargetRangeLabel}
            </p>
          )}

          {biophysicsData?.descent_breakdown && (
            <DescentBodyPartGrid
              breakdown={biophysicsData.descent_breakdown}
              headwear={descentHeadwear}
              handwear={biophysicsData.descent_handwear}
            />
          )}

          {descentHeadwear?.helmet && (
            <div className="mt-3 rounded-md border border-white/20 bg-white/10 p-2.5">
              <p className="text-xs uppercase text-white/60 tracking-wide">Helmet</p>
              <p className="text-sm font-semibold text-white/90">{descentHeadwear.helmet.name}</p>
              <p className="mt-0.5 text-xs text-white/70">{descentHeadwear.helmet.rcl.toFixed(2)} clo</p>
            </div>
          )}

          {descentPackItems.length > 0 ? (
            <>
              <ul className="mt-3 space-y-2">
                {descentPackItems.map((item) => (
                  <li key={item.id} className="rounded-md border border-white/20 bg-white/10 p-2.5">
                    <p className="text-sm font-semibold text-white/90">{item.name}</p>
                    <p className="mt-1 text-xs text-white/70">
                      Add over climb kit
                      {typeof item.rcl_clo === "number" ? ` · +${item.rcl_clo.toFixed(2)} clo` : ""}
                      {typeof item.weight_g === "number" ? ` · ${Math.round(item.weight_g)} g` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              {typeof totalPackWeight === "number" && Number.isFinite(totalPackWeight) && (
                <p className="mt-2 text-xs text-white/70">
                  Total additional packed layer weight: {Math.round(totalPackWeight)} g
                </p>
              )}
            </>
          ) : hasDescentGap ? (
            <p className="mt-3 text-sm text-white/75">
              No pack-layer add-ons are available yet. Add insulation via Suggested Gear To Buy above.
            </p>
          ) : (
            <p className="mt-3 text-sm text-white/75">
              No extra descent layers are required right now. Start with the climb setup and adjust with venting/shell use as conditions change.
            </p>
          )}
        </section>
      )}

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
    </div>
  );
};

export default LayerDisplay;

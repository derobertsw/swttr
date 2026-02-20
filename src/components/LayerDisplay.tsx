"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Backpack, Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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
  createEmptyLayerSet,
  garmentsToLayerSet,
  LAYER_LABELS,
  LayerType,
  LayerSet,
  LayerItem,
} from "@/lib/layers";
import {
  EXTREMITY_DEFICIT_CLO_THRESHOLD,
  REGIONAL_DEFICIT_CLO_THRESHOLD,
  calculateThermalComfortScore,
  evaluateThermalComfort,
} from "@/lib/biophysics/comfort";
import { ENSEMBLE_REGRESSION, REGIONAL_WEIGHTS } from "@/lib/biophysics/constants";
import { ACTIVITIES } from "@/data/activities";
import { useAuth } from "@clerk/nextjs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  WeatherHeader,
  ThermalGauge,
  BodyPartSection,
  WeatherEditDrawer,
} from "@/components/layers";
import type { CloBreakdown } from "@/components/layers/ThermalGauge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMutableLayers } from "@/hooks/useMutableLayers";
import { useLayerPicker, PickerItem } from "@/hooks/useLayerPicker";
import { LayerPickerDrawer } from "@/components/layers/LayerPickerDrawer";

interface LayerDisplayProps {
  activity?: string;
  recommendation: Recommendation | null;
  temperature: number;
  windspeed: number;
  itemMappings?: Map<string, string>;
  biophysicsData?: BiophysicsRecommendation | null;
  onReset?: () => void;
  onWeatherChange?: (lat: number, lon: number, datetime?: string) => Promise<void>;
  onActivityChange?: (activity: string) => Promise<void>;
  weatherLoading?: boolean;
}

interface CloValues {
  currentClo: number | undefined;
  targetClo: number | undefined;
}

const ACTIVITY_HEADER_LABELS: Record<string, string> = {
  running: "Running",
  biking: "Biking",
  hiking_snowshoeing: "Hiking",
  backcountry_skiing: "Backcountry",
  alpine_skiing: "Alpine",
  xc_skiing: "XC",
};

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

type CloStatusKind = "need" | "over" | "inRange";
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

type MutableLayers = Record<BodyPart, LayerSet>;
const LAYER_TYPES: LayerType[] = ["base", "mid", "outer"];

function buildDescentLayers(
  garments: BiophysicsRecommendation["recommendation"]["garments"] | undefined,
  climbHandwear: RecommendedHandwear | null | undefined,
  climbHeadwear: RecommendedHeadwear | null | undefined,
  packItems: { id: string; name: string; rcl_clo?: number }[],
  dHandwear: RecommendedHandwear | null | undefined,
  dHeadwear: RecommendedHeadwear | null | undefined,
): MutableLayers {
  const torso = garments ? garmentsToLayerSet(garments, "torso") : createEmptyLayerSet();
  const legs = garments ? garmentsToLayerSet(garments, "legs") : createEmptyLayerSet();

  // Append pack items to torso outer
  const packLayerItems: LayerItem[] = packItems.map((item) => ({
    name: item.name,
    rcl: typeof item.rcl_clo === "number" ? item.rcl_clo : undefined,
    sourceId: item.id,
  }));
  torso.outer = [...torso.outer, ...packLayerItems];

  // Hands — use descent handwear if different, else climb handwear
  const hands = createEmptyLayerSet();
  const effectiveHandwear = dHandwear && dHandwear.name !== climbHandwear?.name
    ? dHandwear : climbHandwear;
  if (effectiveHandwear) {
    hands.outer = [{ name: effectiveHandwear.name, rcl: effectiveHandwear.rcl, sourceId: effectiveHandwear.id }];
  }

  // HeadNeck — use descent headwear if available, else climb headwear
  const headNeck = createEmptyLayerSet();
  const effectiveHeadwear = dHeadwear ?? climbHeadwear;
  if (effectiveHeadwear) {
    const baseItems: LayerItem[] = [];
    if (effectiveHeadwear.head_warmth) {
      baseItems.push({ name: effectiveHeadwear.head_warmth.name, rcl: effectiveHeadwear.head_warmth.rcl, sourceId: effectiveHeadwear.head_warmth.id });
    }
    if (effectiveHeadwear.neck_warmth) {
      baseItems.push({ name: effectiveHeadwear.neck_warmth.name, rcl: effectiveHeadwear.neck_warmth.rcl, sourceId: effectiveHeadwear.neck_warmth.id });
    }
    if (baseItems.length > 0) headNeck.base = baseItems;
    if (effectiveHeadwear.helmet) {
      headNeck.outer = [{ name: effectiveHeadwear.helmet.name, rcl: effectiveHeadwear.helmet.rcl, sourceId: effectiveHeadwear.helmet.id }];
    }
  }

  return { torso, legs, hands, headNeck };
}

function collectInUseIds(layers: MutableLayers): Set<string> {
  const ids = new Set<string>();
  for (const part of BODY_PARTS) {
    for (const lt of LAYER_TYPES) {
      const items = layers[part][lt];
      if (items) {
        for (const item of items) {
          if (item.sourceId) ids.add(item.sourceId);
        }
      }
    }
  }
  return ids;
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
  onWeatherChange,
  onActivityChange,
  weatherLoading,
}: LayerDisplayProps) => {
  const { userId } = useAuth();
  const [weatherDrawerOpen, setWeatherDrawerOpen] = useState(false);
  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const [activePhase, setActivePhase] = useState<"climb" | "descent">("climb");
  const isBackcountrySkiing = activity === "backcountry_skiing";
  const biophysicsActive = biophysicsData !== null && biophysicsData !== undefined;
  const shouldIgnoreHelmetForClo = activity === "xc_skiing";
  const handwear = biophysicsData?.recommendation?.handwear;
  const headwear = shouldIgnoreHelmetForClo && biophysicsData?.recommendation?.headwear
    ? { ...biophysicsData.recommendation.headwear, helmet: null }
    : biophysicsData?.recommendation?.headwear;
  const {
    mutableLayers,
    layerEditDelta,
    totalLayerEditDelta,
    inUseItemIds,
    hasSwttrRecommendsInUse,
    addItem: addMutableItem,
    removeItem: removeMutableItem,
    replaceItem: replaceMutableItem,
    setLayerItems: setMutableLayerItems,
  } = useMutableLayers(biophysicsData ?? null, handwear, headwear);
  // --- Descent mutable layers (independent from climb) ---
  const [descentMutableLayers, setDescentMutableLayers] = useState<MutableLayers>(() =>
    buildDescentLayers(
      biophysicsData?.recommendation?.garments,
      handwear, headwear,
      biophysicsData?.pack_items?.garments ?? [],
      biophysicsData?.descent_handwear,
      biophysicsData?.descent_headwear,
    )
  );
  const prevDescentGarmentsRef = useRef(biophysicsData?.recommendation?.garments);
  useEffect(() => {
    const garments = biophysicsData?.recommendation?.garments;
    if (garments !== prevDescentGarmentsRef.current) {
      prevDescentGarmentsRef.current = garments;
      setDescentMutableLayers(
        buildDescentLayers(
          garments, handwear, headwear,
          biophysicsData?.pack_items?.garments ?? [],
          biophysicsData?.descent_handwear,
          biophysicsData?.descent_headwear,
        )
      );
    }
  }, [biophysicsData?.recommendation?.garments, biophysicsData?.pack_items?.garments, biophysicsData?.descent_handwear, biophysicsData?.descent_headwear, handwear, headwear]);

  const addDescentItem = useCallback((bodyPart: BodyPart, layerType: LayerType, item: LayerItem) => {
    setDescentMutableLayers((prev) => ({
      ...prev,
      [bodyPart]: {
        ...prev[bodyPart],
        [layerType]: [...(prev[bodyPart][layerType] ?? []), item],
      },
    }));
  }, []);

  const removeDescentItem = useCallback((bodyPart: BodyPart, layerType: LayerType, index: number) => {
    setDescentMutableLayers((prev) => {
      const existing = prev[bodyPart][layerType] ?? [];
      if (index < 0 || index >= existing.length) return prev;
      return {
        ...prev,
        [bodyPart]: {
          ...prev[bodyPart],
          [layerType]: existing.filter((_, i) => i !== index),
        },
      };
    });
  }, []);

  const replaceDescentItem = useCallback(
    (bodyPart: BodyPart, layerType: LayerType, index: number, newItem: LayerItem) => {
      setDescentMutableLayers((prev) => {
        const existing = prev[bodyPart][layerType] ?? [];
        if (index < 0 || index >= existing.length) return prev;
        const updated = [...existing];
        updated[index] = newItem;
        return {
          ...prev,
          [bodyPart]: {
            ...prev[bodyPart],
            [layerType]: updated,
          },
        };
      });
    },
    []
  );

  const syncDescentFromClimb = useCallback((bodyPart: BodyPart, layerType: LayerType) => {
    setDescentMutableLayers((prev) => ({
      ...prev,
      [bodyPart]: {
        ...prev[bodyPart],
        [layerType]: [...(mutableLayers[bodyPart][layerType] ?? [])],
      },
    }));
  }, [mutableLayers]);

  const syncClimbFromDescent = useCallback((bodyPart: BodyPart, layerType: LayerType) => {
    setMutableLayerItems(bodyPart, layerType, descentMutableLayers[bodyPart][layerType] ?? []);
  }, [descentMutableLayers, setMutableLayerItems]);

  const moveDescentItem = useCallback(
    (bodyPart: BodyPart, fromLayerType: LayerType, fromIndex: number, toLayerType: LayerType) => {
      setDescentMutableLayers((prev) => {
        const existing = prev[bodyPart][fromLayerType] ?? [];
        const item = existing[fromIndex];
        if (!item || fromIndex < 0 || fromIndex >= existing.length) return prev;
        return {
          ...prev,
          [bodyPart]: {
            ...prev[bodyPart],
            [fromLayerType]: existing.filter((_, i) => i !== fromIndex),
            [toLayerType]: [...(prev[bodyPart][toLayerType] ?? []), item],
          },
        };
      });
    },
    []
  );

  const descentInUseItemIds = useMemo(() => collectInUseIds(descentMutableLayers), [descentMutableLayers]);
  const combinedInUseItemIds = useMemo(() => {
    const combined = new Set(inUseItemIds);
    for (const id of descentInUseItemIds) combined.add(id);
    return combined;
  }, [inUseItemIds, descentInUseItemIds]);

  const { getItems: getPickerItems } = useLayerPicker(combinedInUseItemIds);
  const [pickerTarget, setPickerTarget] = useState<{
    bodyPart: BodyPart;
    layerType: LayerType;
    replaceIndex: number | null;
    phase?: "climb" | "descent";
  } | null>(null);

  const pickerItems = useMemo(() => {
    if (!pickerTarget) return { wardrobeItems: [], recommendedItems: [] };
    const { targetClo } = getCloValues(
      pickerTarget.bodyPart,
      biophysicsData?.recommendation?.ensemble_properties?.regional_clo,
      biophysicsData?.ireq?.regional,
      biophysicsData?.ireq?.extremity,
      handwear, headwear, !shouldIgnoreHelmetForClo
    );
    return getPickerItems(pickerTarget.bodyPart, pickerTarget.layerType, targetClo);
  }, [pickerTarget, getPickerItems, biophysicsData, handwear, headwear, shouldIgnoreHelmetForClo]);

  // pickerCloContext computed after bodyPartSections/descentBodyPartSections (below)

  const handlePickerSelect = useCallback((item: PickerItem) => {
    if (!pickerTarget) return;
    const { bodyPart: bp, layerType: lt, replaceIndex, phase } = pickerTarget;
    const newItem = {
      name: item.name,
      rcl: item.rcl,
      sourceId: item.id,
      isRecommended: !item.isOwned,
      brand: item.brand,
    };
    const isDescent = phase === "descent";
    if (replaceIndex !== null) {
      isDescent ? replaceDescentItem(bp, lt, replaceIndex, newItem) : replaceMutableItem(bp, lt, replaceIndex, newItem);
    } else {
      isDescent ? addDescentItem(bp, lt, newItem) : addMutableItem(bp, lt, newItem);
    }
    if (!item.isOwned) {
      toast.info("This item isn't in your wardrobe yet. Add it for better future recommendations.", {
        action: { label: "Go to Wardrobe", onClick: () => window.location.assign("/wardrobe") },
      });
    }
    setPickerTarget(null);
  }, [pickerTarget, replaceMutableItem, addMutableItem, replaceDescentItem, addDescentItem]);

  const pickerCurrentItem = useMemo(() => {
    if (!pickerTarget || pickerTarget.replaceIndex === null) return undefined;
    const layers = pickerTarget.phase === "descent" ? descentMutableLayers : mutableLayers;
    const item = layers[pickerTarget.bodyPart][pickerTarget.layerType]?.[pickerTarget.replaceIndex];
    if (!item) return undefined;
    return { name: item.name, rcl: item.rcl };
  }, [pickerTarget, mutableLayers, descentMutableLayers]);

  const handlePickerRemove = useCallback(() => {
    if (!pickerTarget || pickerTarget.replaceIndex === null) return;
    const { bodyPart: bp, layerType: lt, replaceIndex, phase } = pickerTarget;
    phase === "descent" ? removeDescentItem(bp, lt, replaceIndex) : removeMutableItem(bp, lt, replaceIndex);
    setPickerTarget(null);
  }, [pickerTarget, removeMutableItem, removeDescentItem]);

  const regionalClo = biophysicsData?.recommendation?.ensemble_properties?.regional_clo;
  const totalClo = biophysicsData?.recommendation?.ensemble_properties?.total_clo;
  const effectiveTotalClo =
    totalClo !== undefined
      ? totalClo + totalLayerEditDelta
      : totalLayerEditDelta !== 0
        ? totalLayerEditDelta
        : undefined;
  const regionalIreq = biophysicsData?.ireq?.regional;
  const extremityIreq = biophysicsData?.ireq?.extremity;
  const descentPackItems = biophysicsData?.pack_items?.garments ?? [];
  const descentHeadwear = biophysicsData?.descent_headwear;
  const descentHelmetClo = descentHeadwear?.helmet?.rcl ?? 0;
  const descentPackClo = descentPackItems.reduce((sum, item) => {
    return sum + (typeof item.rcl_clo === "number" ? item.rcl_clo : 0);
  }, 0);
  const downhillTargetMinClo = biophysicsData?.ireq?.downhill_target_range?.[0]
    ?? biophysicsData?.ireq?.downhill?.min;
  // Preliminary descent clo from API data (used for early guards); refined after descentBodyPartSections
  let estimatedDescentClo: number | undefined = effectiveTotalClo !== undefined ? effectiveTotalClo + descentPackClo + descentHelmetClo : undefined;
  const getRegionalDeficit = (target?: number, current?: number): number => {
    if (target === undefined) return 0;
    return Math.max(0, target - (current ?? 0));
  };
  const torsoDeficit = getRegionalDeficit(
    regionalIreq?.neutral?.torso,
    (regionalClo?.torso ?? 0) + layerEditDelta.torso
  );
  const armsDeficit = getRegionalDeficit(regionalIreq?.neutral?.arms, regionalClo?.arms);
  const legsDeficit = getRegionalDeficit(
    regionalIreq?.neutral?.legs,
    (regionalClo?.legs ?? 0) + layerEditDelta.legs
  );
  const handsDeficit = getRegionalDeficit(
    extremityIreq?.neutral?.hands,
    (handwear?.rcl ?? 0) + layerEditDelta.hands
  );
  const headDeficit = getRegionalDeficit(
    extremityIreq?.neutral?.head,
    ((headwear?.helmet?.rcl ?? 0) + (headwear?.head_warmth?.rcl ?? 0) + (headwear?.neck_warmth?.rcl ?? 0))
      + layerEditDelta.headNeck
  );
  const maxRegionalDeficit = Math.max(torsoDeficit, armsDeficit, legsDeficit);
  const maxExtremityDeficit = Math.max(handsDeficit, headDeficit);
  const hasRegionalGap = maxRegionalDeficit > REGIONAL_DEFICIT_CLO_THRESHOLD;
  const hasExtremityGap = maxExtremityDeficit > EXTREMITY_DEFICIT_CLO_THRESHOLD;
  const thermalDecision = evaluateThermalComfort({
    totalClo: effectiveTotalClo,
    targetRange: biophysicsData?.ireq?.target_range,
    maxRegionalDeficit,
    maxExtremityDeficit,
  });
  const thermalComfortScore = calculateThermalComfortScore({
    totalClo: effectiveTotalClo,
    targetRange: biophysicsData?.ireq?.target_range,
    maxRegionalDeficit,
    maxExtremityDeficit,
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
      const adjustedCurrent = (currentClo ?? 0) + layerEditDelta[part];
      const deficit = targetClo !== undefined ? Math.max(0, targetClo - adjustedCurrent) : 0;
      return {
        part,
        label: BODY_PART_LABELS[part],
        deficit,
      };
    })
    .sort((a, b) => b.deficit - a.deficit);
  const topDeficitArea = regionalDeficitSummary.find((item) => item.deficit > 0.12);

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
  const climbDecision = showDualComfortGauges ? getDecisionFromCloStatus(climbStatus) : null;
  // descentStatus/descentDecision computed after estimatedDescentClo is refined (below descentBodyPartSections)
  const decisionForRiskCard = showDualComfortGauges ? climbDecision : thermalDecision;
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
  // descentRiskTitle computed after descentDecision (below descentBodyPartSections)
  const riskCardTitle = showDualComfortGauges ? climbRiskTitle : decisionTitle;
  const showRiskCard = biophysicsActive
    ? Boolean(decisionForRiskCard && decisionForRiskCard.riskType !== "comfortable")
    : true;
  // showDescentRiskCard, descentStatusSummary, descentImmediateAction computed after descentDecision
  const statusSummary = getThermalSummary(decisionForRiskCard);
  const immediateAction = getImmediateAction(decisionForRiskCard);
  const bodyPartSections = BODY_PARTS.map((part) => {
    // Use mutable layers for torso/legs when biophysics is active
    const layers = biophysicsActive
      ? mutableLayers[part]
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

    // When mutable layers are active, compute actual insulation from the
    // items' regional clo values. For torso/legs, apply the ensemble
    // regression coefficient — layering compresses air gaps so the
    // effective insulation is less than the raw sum.
    let adjustedCurrent: number;
    if (biophysicsActive) {
      const rawSum = ["base", "mid", "outer"].reduce((sum, lt) => {
        const items = mutableLayers[part][lt as LayerType];
        return sum + (items ? items.reduce((s, item) => s + (item.rcl ?? 0), 0) : 0);
      }, 0);
      const coef = part === "torso" ? ENSEMBLE_REGRESSION.thermal.torso.coef
        : part === "legs" ? ENSEMBLE_REGRESSION.thermal.leg.coef
        : undefined;
      adjustedCurrent = coef ? rawSum * coef : rawSum;
    } else {
      adjustedCurrent = (currentClo ?? 0) + layerEditDelta[part];
    }

    const urgencyDelta =
      targetClo !== undefined
        ? Math.max(Math.abs(adjustedCurrent - targetClo), 0)
        : 0;

    return {
      part,
      layers,
      currentClo: adjustedCurrent,
      targetClo,
      urgencyDelta,
    };
  });
  const descentBreakdown = biophysicsData?.descent_breakdown;
  const descentBodyPartSections = showDualComfortGauges
    ? BODY_PARTS.map((part) => {
        const layers = descentMutableLayers[part];

        // Use descent breakdown for target if available
        const descentCloValues = descentBreakdown
          ? getCloValues(part, descentBreakdown.regional_clo, descentBreakdown.regional_ireq, descentBreakdown.extremity_ireq,
              biophysicsData?.descent_handwear, descentHeadwear, true)
          : getCloValues(part, regionalClo, regionalIreq, extremityIreq, handwear, headwear, !shouldIgnoreHelmetForClo);

        // Compute actual clo from descent layer items
        const rawSum = (["base", "mid", "outer"] as LayerType[]).reduce((sum, lt) => {
          const items = layers[lt];
          return sum + (items ? items.reduce((s, item) => s + (item.rcl ?? 0), 0) : 0);
        }, 0);
        const coef = part === "torso" ? ENSEMBLE_REGRESSION.thermal.torso.coef
          : part === "legs" ? ENSEMBLE_REGRESSION.thermal.leg.coef
          : undefined;
        const currentClo = coef ? rawSum * coef : rawSum;

        return {
          part,
          layers,
          currentClo: currentClo,
          targetClo: descentCloValues.targetClo,
        };
      })
    : [];

  // Refine descent full-body clo using the same regional-weight method as climb
  if (showDualComfortGauges && regionalClo) {
    const torso = descentBodyPartSections.find((s) => s.part === "torso")?.currentClo ?? regionalClo.torso;
    const arms = regionalClo.arms; // arms aren't independently editable
    const legs = descentBodyPartSections.find((s) => s.part === "legs")?.currentClo ?? regionalClo.legs;
    const wt = REGIONAL_WEIGHTS;
    estimatedDescentClo = torso * wt.torso + arms * wt.arm + legs * wt.leg;
  }

  // Now compute descent status using the refined estimatedDescentClo
  const descentStatus = showDualComfortGauges ? getCloStatus(estimatedDescentClo, downhillTargetRange) : null;
  const descentDecision = showDualComfortGauges ? getDecisionFromCloStatus(descentStatus) : null;
  const descentRiskTitle = descentDecision
    ? descentDecision.riskType === "comfortable"
      ? "Descent In Target Range"
      : descentDecision.riskType === "cold"
        ? `Descent Cold Risk — ${descentDecision.severity === "high" ? "High" : "Moderate"}`
        : `Descent Overheating Risk — ${descentDecision.severity === "high" ? "High" : "Moderate"}`
    : "Descent Guidance";
  const showDescentRiskCard = showDualComfortGauges
    && Boolean(descentDecision && descentDecision.riskType !== "comfortable");
  const descentStatusSummary = getThermalSummary(descentDecision);
  const descentImmediateAction = getImmediateAction(descentDecision);

  const pickerCloContext = useMemo(() => {
    if (!pickerTarget || !biophysicsActive) return undefined;
    const sections = pickerTarget.phase === "descent" ? descentBodyPartSections : bodyPartSections;
    const section = sections.find((s) => s.part === pickerTarget.bodyPart);
    if (!section || section.targetClo === undefined || section.currentClo === undefined) return undefined;
    return {
      targetClo: section.targetClo,
      currentClo: section.currentClo,
      delta: section.targetClo - section.currentClo,
    };
  }, [pickerTarget, biophysicsActive, bodyPartSections, descentBodyPartSections]);

  const recommendedItems = useMemo(() => {
    const items: { name: string; brand: string; sourceId: string; bodyPart: BodyPart }[] = [];
    const seen = new Set<string>();
    for (const part of BODY_PARTS) {
      for (const lt of (["base", "mid", "outer"] as const)) {
        for (const item of mutableLayers[part][lt] ?? []) {
          if (item.isRecommended && item.sourceId && !seen.has(item.sourceId)) {
            seen.add(item.sourceId);
            items.push({ name: item.name, brand: item.brand ?? "", sourceId: item.sourceId, bodyPart: part });
          }
        }
      }
    }
    return items;
  }, [mutableLayers]);

  const [addedToWardrobe, setAddedToWardrobe] = useState<Set<string>>(new Set());

  const handleAddToWardrobe = useCallback(async (sourceId: string, name: string, bodyPart: BodyPart) => {
    const itemType = bodyPart === "hands" ? "handwear" : bodyPart === "headNeck" ? "headwear" : "garment";
    try {
      const res = await fetch("/api/wardrobe/gear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: itemType, item_id: sourceId }),
      });
      if (res.ok) {
        setAddedToWardrobe((prev) => new Set(prev).add(sourceId));
        toast.success(`${name} added to your wardrobe`);
      } else if (res.status === 409) {
        setAddedToWardrobe((prev) => new Set(prev).add(sourceId));
        toast.info(`${name} is already in your wardrobe`);
      } else {
        toast.error("Failed to add item to wardrobe");
      }
    } catch {
      toast.error("Failed to add item to wardrobe");
    }
  }, []);

  // "In the pack" — diff climb vs descent mutable layers to find items
  // carried but not worn in each phase.
  const { climbPackItems, descentPackItems: descentPackItemsList } = useMemo(() => {
    if (!showDualComfortGauges) {
      return { climbPackItems: [] as string[], descentPackItems: [] as string[] };
    }

    function collectItemKeys(layers: MutableLayers): Set<string> {
      const keys = new Set<string>();
      for (const part of BODY_PARTS) {
        for (const lt of LAYER_TYPES) {
          for (const item of layers[part][lt] ?? []) {
            keys.add(item.sourceId || item.name);
          }
        }
      }
      return keys;
    }

    function collectUniqueNames(layers: MutableLayers, excludeKeys: Set<string>): string[] {
      const names: string[] = [];
      const seen = new Set<string>();
      for (const part of BODY_PARTS) {
        for (const lt of LAYER_TYPES) {
          for (const item of layers[part][lt] ?? []) {
            const key = item.sourceId || item.name;
            if (!excludeKeys.has(key) && !seen.has(key)) {
              seen.add(key);
              names.push(item.name);
            }
          }
        }
      }
      return names;
    }

    const climbKeys = collectItemKeys(mutableLayers);
    const descentKeys = collectItemKeys(descentMutableLayers);

    return {
      climbPackItems: collectUniqueNames(descentMutableLayers, climbKeys),
      descentPackItems: collectUniqueNames(mutableLayers, descentKeys),
    };
  }, [showDualComfortGauges, mutableLayers, descentMutableLayers]);

  const orderedBodyPartSections = bodyPartSections;
  const climbCloBreakdown: CloBreakdown | undefined = biophysicsActive && regionalClo
    ? (() => {
        const torso = bodyPartSections.find((s) => s.part === "torso")?.currentClo ?? regionalClo.torso;
        const arms = regionalClo.arms;
        const legs = bodyPartSections.find((s) => s.part === "legs")?.currentClo ?? regionalClo.legs;
        const wt = REGIONAL_WEIGHTS;
        return {
          lines: [
            { label: "Torso", detail: `${torso.toFixed(2)} x ${(wt.torso * 100).toFixed(0)}% = ${(torso * wt.torso).toFixed(2)}` },
            { label: "Arms", detail: `${arms.toFixed(2)} x ${(wt.arm * 100).toFixed(0)}% = ${(arms * wt.arm).toFixed(2)}` },
            { label: "Legs", detail: `${legs.toFixed(2)} x ${(wt.leg * 100).toFixed(0)}% = ${(legs * wt.leg).toFixed(2)}` },
          ],
          total: torso * wt.torso + arms * wt.arm + legs * wt.leg,
        };
      })()
    : undefined;
  const descentCloBreakdown: CloBreakdown | undefined =
    showDualComfortGauges && regionalClo && estimatedDescentClo !== undefined
      ? (() => {
          const torso = descentBodyPartSections.find((s) => s.part === "torso")?.currentClo ?? regionalClo.torso;
          const arms = regionalClo.arms;
          const legs = descentBodyPartSections.find((s) => s.part === "legs")?.currentClo ?? regionalClo.legs;
          const wt = REGIONAL_WEIGHTS;
          return {
            lines: [
              { label: "Torso", detail: `${torso.toFixed(2)} x ${(wt.torso * 100).toFixed(0)}% = ${(torso * wt.torso).toFixed(2)}` },
              { label: "Arms", detail: `${arms.toFixed(2)} x ${(wt.arm * 100).toFixed(0)}% = ${(arms * wt.arm).toFixed(2)}` },
              { label: "Legs", detail: `${legs.toFixed(2)} x ${(wt.leg * 100).toFixed(0)}% = ${(legs * wt.leg).toFixed(2)}` },
            ],
            total: estimatedDescentClo,
          };
        })()
      : undefined;
  const selectedActivity = activity
    ? ACTIVITIES.find((candidate) => candidate.value === activity)
    : null;
  const selectedActivityLabel = selectedActivity
    ? (ACTIVITY_HEADER_LABELS[selectedActivity.value] ?? selectedActivity.name)
    : null;

  return (
    <div className="flex flex-col gap-8 pb-24">
      {(onReset || selectedActivity) && (
        <div className="-mt-2 -mb-2 flex items-center justify-between gap-2">
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 text-sm font-medium text-white/75 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          ) : <span />}
          {selectedActivity && selectedActivityLabel && (
            onActivityChange ? (
              <Popover open={activityPopoverOpen} onOpenChange={(open) => { if (!weatherLoading) setActivityPopoverOpen(open); }}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={weatherLoading}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/[0.14]"
                  >
                    {weatherLoading ? <Loader2 className="size-3.5 animate-spin" /> : <selectedActivity.icon className="size-3.5" />}
                    <span className="max-w-[7.25rem] truncate sm:max-w-none">{selectedActivityLabel}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="end">
                  {ACTIVITIES.map((act) => (
                    <button
                      key={act.value}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-slate-100",
                        act.value === activity && "bg-slate-50 font-semibold"
                      )}
                      onClick={() => {
                        setActivityPopoverOpen(false);
                        if (act.value !== activity) {
                          void onActivityChange(act.value);
                        }
                      }}
                    >
                      <act.icon className="size-4 shrink-0 text-slate-500" />
                      <span className="flex-1 text-left">{act.name}</span>
                      {act.value === activity && (
                        <Check className="size-3.5 text-slate-500" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-white/75">
                <selectedActivity.icon className="size-3.5" />
                <span className="max-w-[7.25rem] truncate sm:max-w-none">{selectedActivityLabel}</span>
              </span>
            )
          )}
        </div>
      )}

      <div className={cn("flex flex-col gap-8 transition-opacity duration-200", weatherLoading && "opacity-50 pointer-events-none")}>
      {onWeatherChange ? (
        <>
          <WeatherHeader
            temperature={temperature}
            windspeed={windspeed}
            score={showDualComfortGauges ? undefined : thermalComfortScore}
            totalClo={effectiveTotalClo}
            targetRange={biophysicsData?.ireq?.target_range}
            regionalDeficit={maxRegionalDeficit}
            hasRegionalGap={hasRegionalGap}
            extremityDeficit={maxExtremityDeficit}
            hasExtremityGap={hasExtremityGap}
            interactive
            onEditWeather={() => setWeatherDrawerOpen(true)}
          />
          <WeatherEditDrawer
            open={weatherDrawerOpen}
            onOpenChange={setWeatherDrawerOpen}
            onSubmit={onWeatherChange}
            loading={weatherLoading}
          />
        </>
      ) : (
        <WeatherHeader
          temperature={temperature}
          windspeed={windspeed}
          score={showDualComfortGauges ? undefined : thermalComfortScore}
          totalClo={effectiveTotalClo}
          targetRange={biophysicsData?.ireq?.target_range}
          regionalDeficit={maxRegionalDeficit}
          hasRegionalGap={hasRegionalGap}
          extremityDeficit={maxExtremityDeficit}
          hasExtremityGap={hasExtremityGap}
        />
      )}

      {showDualComfortGauges ? (
        <section className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-3 sm:px-4">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Climb
              </p>
              <ThermalGauge
                totalClo={effectiveTotalClo}
                targetRange={uphillTargetRange}
                markerLabel=""
                showStatusPill={false}
                hideMarkerLabel
                cloBreakdown={climbCloBreakdown}
              />
            </div>
            {showRiskCard && decisionForRiskCard && decisionForRiskCard.riskType !== "comfortable" && (
              <details
                className={cn(
                  "group rounded-lg border px-3 py-2",
                  decisionForRiskCard.riskType === "cold"
                    ? "border-sky-400/40 bg-sky-500/15"
                    : "border-amber-400/40 bg-amber-500/15"
                )}
              >
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden",
                    decisionForRiskCard.riskType === "cold" ? "text-sky-200" : "text-amber-200"
                  )}
                  aria-label={climbRiskTitle}
                >
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="flex-1">{climbRiskTitle}</span>
                  <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-2 space-y-1.5 pb-1 text-xs text-white/80">
                  <p>{statusSummary}</p>
                  <p>{immediateAction}</p>
                </div>
              </details>
            )}
            <div className="border-t border-white/15 pt-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                Descent
              </p>
              <ThermalGauge
                totalClo={estimatedDescentClo}
                targetRange={downhillTargetRange}
                markerLabel=""
                showStatusPill={false}
                hideMarkerLabel
                cloBreakdown={descentCloBreakdown}
              />
            </div>
            {showDescentRiskCard && descentDecision && descentDecision.riskType !== "comfortable" && (
              <details
                className={cn(
                  "group rounded-lg border px-3 py-2",
                  descentDecision.riskType === "cold"
                    ? "border-sky-400/40 bg-sky-500/15"
                    : "border-amber-400/40 bg-amber-500/15"
                )}
              >
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden",
                    descentDecision.riskType === "cold" ? "text-sky-200" : "text-amber-200"
                  )}
                  aria-label={descentRiskTitle}
                >
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="flex-1">{descentRiskTitle}</span>
                  <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-2 space-y-1.5 pb-1 text-xs text-white/80">
                  <p>{descentStatusSummary}</p>
                  <p>{descentImmediateAction}</p>
                </div>
              </details>
            )}
          </div>
        </section>
      ) : (
        <>
          <ThermalGauge
            totalClo={effectiveTotalClo}
            targetRange={uphillTargetRange}
            showStatusPill={false}
            cloBreakdown={climbCloBreakdown}
          />
          {showRiskCard && decisionForRiskCard && decisionForRiskCard.riskType !== "comfortable" && (
            <details
              className={cn(
                "group rounded-lg border px-3 py-2",
                decisionForRiskCard.riskType === "cold"
                  ? "border-sky-400/40 bg-sky-500/15"
                  : "border-amber-400/40 bg-amber-500/15"
              )}
            >
              <summary
                className={cn(
                  "flex cursor-pointer list-none items-center gap-2 text-xs font-semibold [&::-webkit-details-marker]:hidden",
                  decisionForRiskCard.riskType === "cold" ? "text-sky-200" : "text-amber-200"
                )}
                aria-label={riskCardTitle}
              >
                <AlertTriangle className="size-3.5 shrink-0" />
                <span className="flex-1">{riskCardTitle}</span>
                <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-2 space-y-1.5 pb-1 text-xs text-white/80">
                <p>{statusSummary}</p>
                <p>{immediateAction}</p>
              </div>
            </details>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/75">
          Detailed Layer Breakdown
        </h3>
        {showDualComfortGauges && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setActivePhase("climb")}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                activePhase === "climb"
                  ? "border border-violet-400/60 bg-violet-500/25 text-violet-200"
                  : "border border-white/20 bg-white/[0.06] text-white/50 hover:text-white/70"
              )}
            >
              Climb
            </button>
            <button
              type="button"
              onClick={() => setActivePhase("descent")}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                activePhase === "descent"
                  ? "border border-teal-400/60 bg-teal-500/25 text-teal-200"
                  : "border border-white/20 bg-white/[0.06] text-white/50 hover:text-white/70"
              )}
            >
              Descent
            </button>
          </div>
        )}
      </div>
      <p className="-mt-4 text-xs text-white/60">
        Tap a body area to collapse or expand details.
      </p>
      {showDualComfortGauges ? (
        <div className="flex flex-col gap-6">
          {(activePhase === "climb" ? orderedBodyPartSections : descentBodyPartSections).map(({ part, layers, currentClo, targetClo }) => (
            <BodyPartSection
              key={part}
              bodyPart={part}
              layers={layers}
              biophysicsActive={biophysicsActive}
              currentClo={currentClo}
              targetClo={targetClo}
              itemMappings={itemMappings}
              colorScheme={activePhase}
              otherPhaseLayers={activePhase === "descent" ? mutableLayers[part] : descentMutableLayers[part]}
              syncLabel={activePhase === "descent" ? "Use climb" : "Use descent"}
              onItemTap={(layerType, index) =>
                setPickerTarget({ bodyPart: part, layerType, replaceIndex: index, phase: activePhase })
              }
              onItemRemove={(layerType, index) =>
                activePhase === "descent"
                  ? removeDescentItem(part, layerType, index)
                  : removeMutableItem(part, layerType, index)
              }
              onAddLayer={(layerType) =>
                setPickerTarget({ bodyPart: part, layerType, replaceIndex: null, phase: activePhase })
              }
              onSyncFromOtherPhase={activePhase === "descent"
                ? (layerType) => syncDescentFromClimb(part, layerType)
                : (layerType) => syncClimbFromDescent(part, layerType)
              }
              onMoveItem={biophysicsActive
                ? (fromLt, fromIdx, toLt) => {
                    if (activePhase === "descent") {
                      moveDescentItem(part, fromLt, fromIdx, toLt);
                    } else {
                      const item = mutableLayers[part][fromLt]?.[fromIdx];
                      if (!item) return;
                      removeMutableItem(part, fromLt, fromIdx);
                      addMutableItem(part, toLt, item);
                    }
                  }
                : undefined
              }
            />
          ))}
          {(() => {
            const items = activePhase === "climb" ? climbPackItems : descentPackItemsList;
            return (
              <div className="rounded-lg border border-white/20 bg-white/[0.06] px-3.5 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                  <Backpack className="size-3.5" />
                  In the Pack
                </div>
                {items.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {items.map((name) => (
                      <li key={name} className="text-sm text-white/80">
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-xs text-white/40">Nothing extra in the pack.</p>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {orderedBodyPartSections.map(({ part, layers, currentClo, targetClo }) => (
            <BodyPartSection
              key={part}
              bodyPart={part}
              layers={layers}
              biophysicsActive={biophysicsActive}
              currentClo={currentClo}
              targetClo={targetClo}
              itemMappings={itemMappings}
              onItemTap={(layerType, index) =>
                setPickerTarget({ bodyPart: part, layerType, replaceIndex: index })
              }
              onItemRemove={(layerType, index) => removeMutableItem(part, layerType, index)}
              onAddLayer={(layerType) =>
                setPickerTarget({ bodyPart: part, layerType, replaceIndex: null })
              }
              onMoveItem={biophysicsActive
                ? (fromLt, fromIdx, toLt) => {
                    const item = mutableLayers[part][fromLt]?.[fromIdx];
                    if (!item) return;
                    removeMutableItem(part, fromLt, fromIdx);
                    addMutableItem(part, toLt, item);
                  }
                : undefined
              }
            />
          ))}
        </div>
      )}

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

      {recommendedItems.length > 0 && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/90 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-700">SWTTR Recommended Items</p>
          <div className="space-y-2">
            {recommendedItems.map((item) => {
              const wasAdded = addedToWardrobe.has(item.sourceId);
              return (
                <div key={item.sourceId} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-950">{item.name}</p>
                    <p className="text-[11px] text-amber-800/70">{item.brand}</p>
                  </div>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`buy ${item.brand} ${item.name}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md border border-amber-400/60 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/80"
                  >
                    Buy it
                  </a>
                  <button
                    type="button"
                    disabled={wasAdded}
                    onClick={() => handleAddToWardrobe(item.sourceId, item.name, item.bodyPart)}
                    className={cn(
                      "shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                      wasAdded
                        ? "border-emerald-400/60 bg-emerald-50 text-emerald-700 cursor-default"
                        : "border-amber-400/60 bg-amber-100/70 text-amber-900 hover:bg-amber-200/80"
                    )}
                  >
                    {wasAdded ? (
                      <span className="flex items-center gap-1">
                        <Check className="size-3" />
                        Added
                      </span>
                    ) : (
                      "Add to wardrobe"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default LayerDisplay;

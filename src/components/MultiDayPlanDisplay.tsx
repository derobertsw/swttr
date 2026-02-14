"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarRange, CheckCircle2, Circle, CloudRain, Thermometer, Wind } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { DailyLayerPlan, MultiDayLayerPlan } from "@/types/plan";
import { Recommendation } from "@/types/recommendations";
import { WardrobeItem } from "@/types/wardrobe";
import { CATEGORY_TO_LAYER_TYPE } from "@/lib/layers";
import { useAuth } from "@clerk/nextjs";

type BodyPartKey = "torso" | "legs" | "hands" | "headNeck";
type LayerType = "base" | "mid" | "outer";
type PackingView = "packOnce" | "perDay";
type PackingFilter = "all" | "gaps" | BodyPartKey;
type MatchConfidence = "high" | "medium" | "low";

interface SuggestedCandidate {
  label: string;
  score: number;
  confidence: MatchConfidence;
}

interface PackingListData {
  byBodyPart: Record<
    BodyPartKey,
    Record<LayerType, Array<{
      mappingKey: string;
      standardOption: string;
      specificItem: string;
      source: "mapped" | "auto";
      confidence?: MatchConfidence;
    }>>
  >;
  gaps: Array<{
    mappingKey: string;
    bodyPart: BodyPartKey;
    layerType: LayerType;
    standardOption: string;
    suggestions: SuggestedCandidate[];
    priorityScore: number;
    priorityLabel: "high" | "medium" | "low";
  }>;
  extras: string[];
  totalAssignedItems: number;
  totalRequiredSlots: number;
}

const BODY_PART_ORDER: BodyPartKey[] = ["torso", "legs", "hands", "headNeck"];

const BODY_PART_LABELS: Record<BodyPartKey, string> = {
  torso: "Torso",
  legs: "Legs",
  hands: "Hands",
  headNeck: "Head/Neck",
};

const LAYER_LABELS: Record<LayerType, string> = {
  base: "Base",
  mid: "Mid",
  outer: "Outer",
};

const LAYER_TYPE_ORDER: LayerType[] = ["base", "mid", "outer"];
const LEGS_GARMENT_TYPES = new Set(["pants", "shorts", "bib"]);
const PACKING_FILTER_OPTIONS: Array<{ value: PackingFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "gaps", label: "Only gaps" },
  { value: "torso", label: "Torso" },
  { value: "legs", label: "Legs" },
  { value: "hands", label: "Hands" },
  { value: "headNeck", label: "Head/Neck" },
];

interface WardrobeCandidate {
  label: string;
  searchText: string;
  disabled: boolean;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function inferBodyPart(item: WardrobeItem): BodyPartKey {
  if (item.item_type === "handwear") return "hands";
  if (item.item_type === "headwear") return "headNeck";
  if (item.details.garment_type && LEGS_GARMENT_TYPES.has(item.details.garment_type)) return "legs";
  return "torso";
}

function inferLayerType(item: WardrobeItem): LayerType {
  const rawCategory = item.details.category
    ?? item.details.garment_type
    ?? item.details.handwear_type
    ?? item.details.headwear_type
    ?? "";

  const category = rawCategory.toLowerCase();

  if (item.item_type === "garment") {
    const mapped = CATEGORY_TO_LAYER_TYPE[category];
    if (mapped) return mapped;
  }

  if (category.includes("base") || category.includes("liner")) return "base";
  if (category.includes("shell") || category.includes("hard") || category.includes("soft") || category.includes("wind")) return "outer";
  return "mid";
}

function getWardrobeItemLabel(item: WardrobeItem): string {
  if (item.nickname && item.nickname.trim().length > 0) {
    return item.nickname.trim();
  }

  const brand = item.details.brand?.trim() ?? "";
  const model = item.details.model_name?.trim() ?? "";
  return `${brand} ${model}`.trim();
}

function createEmptyCandidateIndex(): Record<BodyPartKey, Record<LayerType, WardrobeCandidate[]>> {
  return {
    torso: { base: [], mid: [], outer: [] },
    legs: { base: [], mid: [], outer: [] },
    hands: { base: [], mid: [], outer: [] },
    headNeck: { base: [], mid: [], outer: [] },
  };
}

function buildWardrobeCandidateIndex(wardrobeItems: WardrobeItem[]): Record<BodyPartKey, Record<LayerType, WardrobeCandidate[]>> {
  const index = createEmptyCandidateIndex();

  wardrobeItems.forEach((item) => {
    const label = getWardrobeItemLabel(item);
    if (!label) return;

    const bodyPart = inferBodyPart(item);
    const layerType = inferLayerType(item);
    const searchText = [
      label,
      item.details.category,
      item.details.garment_type,
      item.details.handwear_type,
      item.details.headwear_type,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");

    index[bodyPart][layerType].push({
      label,
      searchText,
      disabled: Boolean(item.disabled),
    });
  });

  return index;
}

function scoreCandidate(standardOption: string, candidate: WardrobeCandidate): number {
  const optionNormalized = normalizeText(standardOption);
  const candidateNormalized = normalizeText(candidate.searchText);
  const optionTokens = new Set(tokenize(standardOption));
  const candidateTokens = new Set(tokenize(candidate.searchText));

  let score = 0;
  if (candidateNormalized.includes(optionNormalized) && optionNormalized.length > 0) {
    score += 18;
  }

  optionTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      score += 6;
    } else if (candidateNormalized.includes(token)) {
      score += 2;
    }
  });

  if (!candidate.disabled) score += 2;
  return score;
}

function scoreToConfidence(score: number): MatchConfidence {
  if (score >= 20) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function getMappingKey(bodyPart: BodyPartKey, layerType: LayerType, standardOption: string): string {
  return `${bodyPart}:${layerType}:${standardOption}`;
}

function getGapPriorityScore(bodyPart: BodyPartKey, layerType: LayerType, hasSuggestion: boolean): number {
  const bodyWeight: Record<BodyPartKey, number> = {
    torso: 40,
    legs: 32,
    hands: 22,
    headNeck: 20,
  };
  const layerWeight: Record<LayerType, number> = {
    base: 9,
    mid: 7,
    outer: 5,
  };
  return bodyWeight[bodyPart] + layerWeight[layerType] + (hasSuggestion ? 0 : 3);
}

function getPriorityLabel(priorityScore: number): "high" | "medium" | "low" {
  if (priorityScore >= 43) return "high";
  if (priorityScore >= 31) return "medium";
  return "low";
}

function suggestOwnedItemsForGap(
  gap: { bodyPart: BodyPartKey; layerType: LayerType; standardOption: string },
  candidateIndex: Record<BodyPartKey, Record<LayerType, WardrobeCandidate[]>>
): SuggestedCandidate[] {
  const candidates = candidateIndex[gap.bodyPart][gap.layerType];
  if (candidates.length === 0) return [];

  const enabledCandidates = candidates.filter((candidate) => !candidate.disabled);
  const pool = enabledCandidates.length > 0 ? enabledCandidates : candidates;
  const scored = pool
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(gap.standardOption, candidate),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });

  const bestByLabel = new Map<string, { label: string; score: number; confidence: MatchConfidence }>();
  scored.forEach((candidate) => {
    if (bestByLabel.has(candidate.label)) return;
    bestByLabel.set(candidate.label, {
      label: candidate.label,
      score: candidate.score,
      confidence: scoreToConfidence(candidate.score),
    });
  });

  const deduped = Array.from(bestByLabel.values());
  if (deduped.length === 0) return [];

  const topPositive = deduped.filter((candidate) => candidate.score > 0);
  return (topPositive.length > 0 ? topPositive : deduped).slice(0, 2);
}

function createEmptyLayerBuckets(): Record<BodyPartKey, Record<LayerType, Set<string>>> {
  return {
    torso: { base: new Set(), mid: new Set(), outer: new Set() },
    legs: { base: new Set(), mid: new Set(), outer: new Set() },
    hands: { base: new Set(), mid: new Set(), outer: new Set() },
    headNeck: { base: new Set(), mid: new Set(), outer: new Set() },
  };
}

function addRecommendationToBuckets(
  recommendation: Recommendation | null | undefined,
  buckets: Record<BodyPartKey, Record<LayerType, Set<string>>>
): void {
  if (!recommendation) return;

  for (const bodyPart of BODY_PART_ORDER) {
    const layers = recommendation[bodyPart];
    if (!layers) continue;

    LAYER_TYPE_ORDER.forEach((layerType) => {
      const items = layers[layerType] ?? [];
      items.forEach((item) => {
        const cleanName = item.name.trim();
        if (!cleanName) return;
        buckets[bodyPart][layerType].add(cleanName);
      });
    });
  }
}

function buildPackingListFromDays(
  days: DailyLayerPlan[],
  itemMappings: Map<string, string>,
  wardrobeItems: WardrobeItem[]
): PackingListData {
  const requiredSlots = createEmptyLayerBuckets();
  const candidateIndex = buildWardrobeCandidateIndex(wardrobeItems);
  const extras = new Set<string>();

  days.forEach((day) => {
    addRecommendationToBuckets(day.baseline.recommendation, requiredSlots);
    day.dayparts.forEach((daypart) => {
      addRecommendationToBuckets(daypart.recommendation, requiredSlots);
    });
    day.carryItems.forEach((item) => extras.add(item));
  });

  const byBodyPart: PackingListData["byBodyPart"] = {
    torso: {
      base: [],
      mid: [],
      outer: [],
    },
    legs: {
      base: [],
      mid: [],
      outer: [],
    },
    hands: {
      base: [],
      mid: [],
      outer: [],
    },
    headNeck: {
      base: [],
      mid: [],
      outer: [],
    },
  };

  const gaps: PackingListData["gaps"] = [];

  BODY_PART_ORDER.forEach((bodyPart) => {
    LAYER_TYPE_ORDER.forEach((layerType) => {
      const options = Array.from(requiredSlots[bodyPart][layerType]).sort();
      options.forEach((standardOption) => {
        const mappingKey = getMappingKey(bodyPart, layerType, standardOption);
        const mappedItem = itemMappings.get(mappingKey)?.trim();

        if (mappedItem) {
          byBodyPart[bodyPart][layerType].push({
            mappingKey,
            standardOption,
            specificItem: mappedItem,
            source: "mapped",
          });
          return;
        }

        const gap = {
          bodyPart,
          layerType,
          standardOption,
        };

        const suggestions = suggestOwnedItemsForGap(gap, candidateIndex);
        if (suggestions.length > 0) {
          byBodyPart[bodyPart][layerType].push({
            mappingKey,
            standardOption,
            specificItem: suggestions[0].label,
            source: "auto",
            confidence: suggestions[0].confidence,
          });
          return;
        }

        const priorityScore = getGapPriorityScore(bodyPart, layerType, suggestions.length > 0);
        gaps.push({
          mappingKey,
          ...gap,
          suggestions,
          priorityScore,
          priorityLabel: getPriorityLabel(priorityScore),
        });
      });
    });
  });

  const totalAssignedItems = BODY_PART_ORDER.reduce((total, bodyPart) => {
    const section = byBodyPart[bodyPart];
    return total + section.base.length + section.mid.length + section.outer.length;
  }, 0);
  const totalRequiredSlots = totalAssignedItems + gaps.length;

  return {
    byBodyPart,
    gaps: gaps.sort((a, b) => b.priorityScore - a.priorityScore),
    extras: Array.from(extras).sort(),
    totalAssignedItems,
    totalRequiredSlots,
  };
}

function buildPackingList(
  plan: MultiDayLayerPlan,
  itemMappings: Map<string, string>,
  wardrobeItems: WardrobeItem[]
): PackingListData {
  return buildPackingListFromDays(plan.days, itemMappings, wardrobeItems);
}

interface MultiDayPlanDisplayProps {
  plan: MultiDayLayerPlan;
  itemMappings?: Map<string, string>;
  onReset?: () => void;
}

function formatPlanRange(startDate: string, endDate: string): string {
  const start = format(new Date(`${startDate}T00:00:00`), "MMM d");
  const end = format(new Date(`${endDate}T00:00:00`), "MMM d");
  return start === end ? start : `${start} - ${end}`;
}

function getPriorityClasses(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "border-rose-200 bg-rose-50 text-rose-900";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getConfidenceLabel(confidence: MatchConfidence): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  return "Low confidence";
}

export default function MultiDayPlanDisplay({
  plan,
  itemMappings,
  onReset,
}: MultiDayPlanDisplayProps) {
  const { userId } = useAuth();
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [packingView, setPackingView] = useState<PackingView>("packOnce");
  const [activeFilter, setActiveFilter] = useState<PackingFilter>("all");
  const [quickFixAssignments, setQuickFixAssignments] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!userId) {
      setWardrobeItems([]);
      return;
    }

    let isCancelled = false;

    const fetchWardrobeItems = async () => {
      try {
        const response = await fetch("/api/wardrobe/gear");
        if (!response.ok) {
          if (!isCancelled) setWardrobeItems([]);
          return;
        }

        const payload = await response.json() as { items?: WardrobeItem[] };
        if (!isCancelled) {
          setWardrobeItems(Array.isArray(payload.items) ? payload.items : []);
        }
      } catch {
        if (!isCancelled) setWardrobeItems([]);
      }
    };

    void fetchWardrobeItems();
    return () => {
      isCancelled = true;
    };
  }, [userId]);

  const rangeLabel = formatPlanRange(plan.startDate, plan.endDate);
  const resolvedItemMappings = useMemo(() => {
    const merged = new Map(itemMappings ?? new Map<string, string>());
    quickFixAssignments.forEach((item, key) => merged.set(key, item));
    return merged;
  }, [itemMappings, quickFixAssignments]);

  const packingList = useMemo(
    () => buildPackingList(plan, resolvedItemMappings, wardrobeItems),
    [plan, resolvedItemMappings, wardrobeItems]
  );
  const dailyPackingLists = useMemo(
    () => plan.days.map((day) => ({
      day,
      packing: buildPackingListFromDays([day], resolvedItemMappings, wardrobeItems),
    })),
    [plan.days, resolvedItemMappings, wardrobeItems]
  );
  const visibleBodyParts = activeFilter === "all" || activeFilter === "gaps"
    ? BODY_PART_ORDER
    : BODY_PART_ORDER.filter((bodyPart) => bodyPart === activeFilter);
  const visibleGaps = packingList.gaps.filter((gap) =>
    activeFilter === "all" || activeFilter === "gaps" ? true : gap.bodyPart === activeFilter
  );

  const handleFixGapsClick = () => {
    setPackingView("packOnce");
    setActiveFilter("gaps");
    const gapsPanel = document.getElementById("packing-gaps");
    gapsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyLikelyMatch = (mappingKey: string, suggestion: string) => {
    setQuickFixAssignments((prev) => {
      const next = new Map(prev);
      next.set(mappingKey, suggestion);
      return next;
    });
  };

  return (
    <section className="w-full max-w-4xl space-y-4 pb-12">
      <div className="rounded-xl border border-white/35 bg-white/90 p-4 text-slate-900 shadow-[0_8px_30px_rgba(0,0,0,0.15)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan Ahead</p>
            <h2 className="mt-1 text-lg font-semibold">Multi-Day Layer Plan</h2>
          </div>
          {onReset ? (
            <Button type="button" variant="outline" onClick={onReset}>
              Plan Another Trip
            </Button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <CalendarRange className="size-3.5" />
            {rangeLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            Uses {plan.dayStartHour}:00-{plan.dayEndHour}:00 local hours
          </span>
        </div>
      </div>

      <article className="rounded-xl border border-white/35 bg-white/95 p-4 text-slate-900 shadow-[0_6px_22px_rgba(0,0,0,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Clothing Packing List</h3>
            <p className="text-xs text-slate-600">Mapped and auto-matched to your wardrobe items.</p>
            <p className="mt-2 text-xs text-slate-500">
              {packingList.totalRequiredSlots} required layer slots across this trip.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
                {packingList.totalAssignedItems} assigned
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
                {packingList.gaps.length} gaps
              </span>
            </div>
            {packingList.gaps.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className="h-8 bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                onClick={handleFixGapsClick}
              >
                Fix {packingList.gaps.length} gaps
              </Button>
            ) : null}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setPackingView("packOnce")}
                className={
                  packingView === "packOnce"
                    ? "rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600"
                }
              >
                Pack Once
              </button>
              <button
                type="button"
                onClick={() => setPackingView("perDay")}
                className={
                  packingView === "perDay"
                    ? "rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600"
                }
              >
                Per Day
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PACKING_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setActiveFilter(option.value)}
              className={
                activeFilter === option.value
                  ? "rounded-full border border-slate-300 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
                  : "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {BODY_PART_ORDER.map((bodyPart) => {
            const section = packingList.byBodyPart[bodyPart];
            const hasContent = section.base.length > 0 || section.mid.length > 0 || section.outer.length > 0;
            return (
              <div
                key={bodyPart}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <p className="text-sm font-semibold">{BODY_PART_LABELS[bodyPart]}</p>
                {hasContent ? (
                  <div className="mt-2 space-y-1.5">
                    {LAYER_TYPE_ORDER.map((layerType) =>
                      section[layerType].length > 0 ? (
                        <div key={layerType}>
                          <p className="text-xs font-medium text-slate-700">{LAYER_LABELS[layerType]}:</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {section[layerType].map((entry) => (
                              <span
                                key={`${entry.standardOption}:${entry.specificItem}`}
                                className={
                                  entry.source === "mapped"
                                    ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
                                    : "rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-900"
                                }
                                title={`Mapped from ${entry.standardOption}`}
                              >
                                {entry.specificItem}
                                {entry.source === "auto" ? " (auto)" : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No specific items mapped yet.</p>
                )}
              </div>
            );
          })}
        </div>

        {packingList.gaps.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Gaps To Fill
            </p>
            <p className="mt-1 text-xs text-amber-900/80">
              No wardrobe match found for these slots.
            </p>
            <div className="mt-2 grid gap-2">
              {packingList.gaps.map((gap) => (
                <div
                  key={`${gap.bodyPart}:${gap.layerType}:${gap.standardOption}`}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-2 text-[11px] text-amber-950"
                >
                  <p className="font-medium">
                    {BODY_PART_LABELS[gap.bodyPart]} {LAYER_LABELS[gap.layerType]}: {gap.standardOption}
                  </p>
                  {gap.suggestions.length > 0 ? (
                    <p className="mt-0.5 text-[11px] text-amber-900/80">
                      Likely owned: {gap.suggestions.join(", ")}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-amber-900/70">
                      No likely wardrobe match found.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {packingList.extras.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trip Extras</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {packingList.extras.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </article>

      <div className="grid gap-3">
        {plan.days.map((day) => (
          <article
            key={day.date}
            className="rounded-xl border border-white/35 bg-white/95 p-4 text-slate-900 shadow-[0_6px_22px_rgba(0,0,0,0.12)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{day.label}</h3>
                <p className="text-xs text-slate-600">{day.date}</p>
              </div>
              <div className="text-right text-xs text-slate-600">
                <p className="font-medium">Daily baseline</p>
                <p>{day.baseline.summary}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <Thermometer className="size-3.5" />
                {day.baseline.minTemp}°-{day.baseline.maxTemp}°F
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <Wind className="size-3.5" />
                up to {day.baseline.maxWindSpeed} mph
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                <CloudRain className="size-3.5" />
                {day.baseline.maxPrecipProbability}% precip chance
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {day.dayparts.map((daypart) => (
                <div
                  key={daypart.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-sm font-medium">
                      {daypart.label} <span className="text-xs text-slate-500">({daypart.timeRangeLabel})</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {daypart.minTemp}°-{daypart.maxTemp}°F, wind {daypart.maxWindSpeed} mph
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{daypart.adjustment}</p>
                </div>
              ))}
            </div>

            {day.carryItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {day.carryItems.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-900"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

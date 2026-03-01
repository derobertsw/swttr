import { DailyLayerPlan } from "@/types/plan";
import { Recommendation } from "@/types/recommendations";
import { WardrobeItem } from "@/types/wardrobe";
import { CATEGORY_TO_LAYER_TYPE } from "@/lib/layers";

type BodyPartKey = "torso" | "legs" | "hands" | "headNeck";
type LayerType = "base" | "mid" | "outer";
export type MatchConfidence = "high" | "medium" | "low";

export interface SuggestedCandidate {
  label: string;
  score: number;
  confidence: MatchConfidence;
}

export interface PackingListData {
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

interface WardrobeCandidate {
  label: string;
  searchText: string;
  disabled: boolean;
}

export const BODY_PART_ORDER: BodyPartKey[] = ["torso", "legs", "hands", "headNeck"];
export const LAYER_TYPE_ORDER: LayerType[] = ["base", "mid", "outer"];
const LEGS_GARMENT_TYPES = new Set(["pants", "shorts", "bib"]);

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

export function buildPackingListFromDays(
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
    torso: { base: [], mid: [], outer: [] },
    legs: { base: [], mid: [], outer: [] },
    hands: { base: [], mid: [], outer: [] },
    headNeck: { base: [], mid: [], outer: [] },
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

        const gap = { bodyPart, layerType, standardOption };

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

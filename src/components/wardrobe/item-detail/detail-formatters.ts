import type { WardrobeItem } from "@/types/wardrobe";
import { formatBodyPartLabel, getClo, getItemBodyArea, getItemCategoryLabel } from "../wardrobe-utils";

export function formatDetailValue(
  value: number | undefined | null,
  decimals: number = 2
): string {
  if (value === undefined || value === null) return "N/A";
  return value.toFixed(decimals);
}

function getGarmentCoverageAreas(details: WardrobeItem["details"]): string[] {
  const coverage: string[] = [];
  if (details.covers_torso) coverage.push("Torso");
  if (details.covers_arms) coverage.push("Arms");
  if (details.covers_legs) coverage.push("Legs");
  if (details.covers_head) coverage.push("Head");
  return coverage;
}

function getHeadCoverageAreas(details: WardrobeItem["details"]): string[] {
  const coverage: string[] = [];
  if (details.covers_ears) coverage.push("Ears");
  if (details.covers_neck) coverage.push("Neck");
  if (details.covers_face) coverage.push("Face");
  return coverage;
}

interface ItemFact {
  label: string;
  value: string;
}

function joinLowercase(areas: string[]): string {
  const text = areas.join(", ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The plain facts item details lead with, before any technical tables. */
export function getItemFacts(item: WardrobeItem): ItemFact[] {
  const { details } = item;
  const facts: ItemFact[] = [
    { label: "Type", value: getItemCategoryLabel(item) },
    { label: "Body area", value: formatBodyPartLabel(getItemBodyArea(item)) },
  ];

  const coverage =
    item.item_type === "garment"
      ? getGarmentCoverageAreas(details)
      : item.item_type === "headwear"
        ? getHeadCoverageAreas(details)
        : [];
  if (coverage.length > 0) facts.push({ label: "Covers", value: joinLowercase(coverage) });

  const clo = getClo(item);
  if (clo !== undefined) {
    facts.push({
      label: "Insulation",
      value: `${clo.toFixed(2)} clo${item.item_type === "custom" ? " (estimated)" : ""}`,
    });
  }

  if (item.item_type === "handwear" && details.dexterity_score !== undefined) {
    facts.push({ label: "Dexterity", value: `${details.dexterity_score}/10` });
  }

  return facts;
}

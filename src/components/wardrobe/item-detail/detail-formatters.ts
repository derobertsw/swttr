import type { WardrobeItem } from "@/types/wardrobe";

export function formatDetailValue(
  value: number | undefined | null,
  decimals: number = 2
): string {
  if (value === undefined || value === null) return "N/A";
  return value.toFixed(decimals);
}

export function getGarmentCoverageAreas(details: WardrobeItem["details"]): string[] {
  const coverage: string[] = [];
  if (details.covers_torso) coverage.push("Torso");
  if (details.covers_arms) coverage.push("Arms");
  if (details.covers_legs) coverage.push("Legs");
  if (details.covers_head) coverage.push("Head");
  return coverage;
}

export function getHeadCoverageAreas(details: WardrobeItem["details"]): string[] {
  const coverage: string[] = [];
  if (details.covers_ears) coverage.push("Ears");
  if (details.covers_neck) coverage.push("Neck");
  if (details.covers_face) coverage.push("Face");
  return coverage;
}

export function getItemHeaderContext(item: WardrobeItem): string {
  if (item.nickname?.trim()) return item.nickname.trim();

  if (item.item_type === "garment") {
    const coverage = getGarmentCoverageAreas(item.details);
    if (coverage.length === 0) return "Used in thermal recommendations.";
    return `Used for ${coverage.join(", ").toLowerCase()} recommendations.`;
  }

  if (item.item_type === "handwear") {
    const handwearType = item.details.handwear_type?.replace(/_/g, " ");
    return handwearType
      ? `${handwearType.charAt(0).toUpperCase()}${handwearType.slice(1)} guidance item.`
      : "Used for hand recommendations.";
  }

  const coverage = getHeadCoverageAreas(item.details);
  if (coverage.length > 0) {
    return `Used for ${coverage.join(", ").toLowerCase()} coverage guidance.`;
  }
  return "Used for head/neck recommendations.";
}

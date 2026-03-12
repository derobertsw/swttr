import type { WardrobeItem } from "@/types/wardrobe";
import { BODY_PART_ORDER, formatBodyPartLabel } from "./wardrobe-utils";

interface PartGroups {
  [part: string]: WardrobeItem[];
}

export interface WardrobeBodyPartSummary {
  part: string;
  label: string;
  activeCount: number;
  disabledCount: number;
  totalCount: number;
  isEmpty: boolean;
}

export interface WardrobeOverview {
  totalItems: number;
  activeItems: number;
  totalDisabledItems: number;
  coveredBodyParts: number;
  missingBodyParts: number;
  missingLabels: string[];
  headline: string;
  message: string;
  bodyPartSummaries: WardrobeBodyPartSummary[];
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function buildWardrobeOverview({
  wardrobeItems,
  groupedWardrobeItems,
  disabledItemsByPart,
}: {
  wardrobeItems: WardrobeItem[];
  groupedWardrobeItems: PartGroups;
  disabledItemsByPart: PartGroups;
}): WardrobeOverview {
  const bodyPartSummaries = BODY_PART_ORDER.map((part) => {
    const activeCount = groupedWardrobeItems[part]?.length ?? 0;
    const disabledCount = disabledItemsByPart[part]?.length ?? 0;
    const totalCount = activeCount + disabledCount;

    return {
      part,
      label: formatBodyPartLabel(part),
      activeCount,
      disabledCount,
      totalCount,
      isEmpty: totalCount === 0,
    };
  });

  const totalDisabledItems = bodyPartSummaries.reduce((total, part) => total + part.disabledCount, 0);
  const coveredBodyParts = bodyPartSummaries.filter((part) => part.totalCount > 0).length;
  const missingLabels = bodyPartSummaries.filter((part) => part.isEmpty).map((part) => part.label);
  const missingBodyParts = missingLabels.length;
  const activeItems = wardrobeItems.length - totalDisabledItems;

  let headline = "Start building your kit";
  let message = "Add a few core pieces to unlock gear-aware recommendations.";

  if (wardrobeItems.length > 0) {
    if (activeItems === 0) {
      headline = "Everything is paused";
      message = "Re-include the pieces you plan to bring on this trip.";
    } else if (missingBodyParts === 0 && totalDisabledItems === 0) {
      headline = "Every core zone is covered";
      message = "Your setup is ready. Adjust layers or add a custom piece anytime.";
    } else if (missingBodyParts === 0) {
      headline = "Your coverage is in good shape";
      message = "All zones are covered. Re-include paused pieces whenever you need them.";
    } else if (missingBodyParts === 1) {
      headline = `Add ${missingLabels[0]} next`;
      message = `Add ${missingLabels[0]} next to round out your setup.`;
    } else if (missingBodyParts === BODY_PART_ORDER.length) {
      headline = "Build coverage across the essentials";
      message = "Start with the pieces you wear most often.";
    } else {
      headline = `Fill ${missingBodyParts} remaining gear zones`;
      message = `Add ${joinLabels(missingLabels)} to improve recommendation accuracy.`;
    }
  }

  return {
    totalItems: wardrobeItems.length,
    activeItems,
    totalDisabledItems,
    coveredBodyParts,
    missingBodyParts,
    missingLabels,
    headline,
    message,
    bodyPartSummaries,
  };
}

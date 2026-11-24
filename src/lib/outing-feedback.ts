/**
 * Outing feedback (#8), shared by the page and the API: which suggested
 * items someone can say they wore. See docs/outing-feedback.md.
 */
import { kitWear } from "@/lib/trip-saved-kits";
import type { FeedbackBodyArea } from "@/types/outingFeedback";
import type { SavedKit } from "@/types/savedKit";
import { BODY_PARTS, type BodyPart } from "@/types/wardrobe";

const BODY_PART_AREA: Record<BodyPart, FeedbackBodyArea> = {
  torso: "torso", legs: "legs", headNeck: "head_neck", hands: "hands",
};

export interface SuggestedWornItem {
  area: FeedbackBodyArea;
  name: string;
  item_id?: string;
}

/**
 * Everything the kit suggested wearing, once each, by body area: a ski
 * tour's climb and descent together, and a plan day's whole day.
 */
export function suggestedWornItems(kit: SavedKit): SuggestedWornItem[] {
  const seen = new Set<string>();
  const items: SuggestedWornItem[] = [];
  for (const { wear } of kitWear(kit)) {
    for (const bodyPart of BODY_PARTS) {
      const layers = wear[bodyPart];
      for (const item of [...layers.base, ...(layers.mid ?? []), ...layers.outer]) {
        const key = `${bodyPart}:${item.sourceId ?? item.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ area: BODY_PART_AREA[bodyPart], name: item.name, ...(item.sourceId && { item_id: item.sourceId }) });
      }
    }
  }
  return items;
}

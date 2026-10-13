/**
 * A member's trip packing list (#177), worked out on the server from the
 * outfits saved to their trip days. See docs/trip-packing.md.
 */
import type { PackingListData } from "@/lib/packingList";
import type { TripDayCoverage } from "@/types/trip-coverage";
import type { BodyPart, LayerType } from "@/types/wardrobe";

/** Worn on a day, in some part of it, or carried. */
export type PackingUse = "wear" | "carry";

/**
 * Whose item it is: from the person's wardrobe, a suggestion that isn't in
 * it, or a general item that names no particular one.
 */
export type PackingOwnership = "owned" | "suggested" | "general";

/** An item the person's saved outfits call for, once however many days use it. */
export interface PackingItem {
  /**
   * Its identity across days and saves: the catalog or wardrobe item, or for
   * a general item, its body area, layer and name.
   */
  key: string;
  name: string;
  brand?: string;
  /** Where it's worn; null for an item that's only carried. */
  bodyPart: BodyPart | null;
  layerType: LayerType | null;
  ownership: PackingOwnership;
  /** Each day that calls for it, in date order, and whether it's worn or carried then. */
  days: Array<{ date: string; uses: PackingUse[] }>;
  /**
   * The keys of items that joined this one, like a general plan item named as
   * a catalog item worn elsewhere; their saved quantity and acknowledgement
   * still apply to it.
   */
  aliases?: string[];
  /** How many to pack: one, unless the person chose another number. */
  quantity: number;
  /** Since the person last acknowledged their list: new, or in place of items that left. */
  change?: { kind: "added" } | { kind: "replaced"; replaces: string[] };
}

/** An item that left the person's saved outfits since they last acknowledged their list. */
export interface PackingRemovedItem {
  key: string;
  name: string;
  /** The days it was for. */
  dates: string[];
}

/** An item the person added by hand. */
export interface PackingManualItem {
  id: string;
  name: string;
  quantity: number;
}

/** A day's category checklist, from before saved outfits. It names no particular items. */
export interface PackingChecklist {
  date: string;
  items: string[];
}

/** The kit items a person last acknowledged, by key, as `trip_member_packing.seen` keeps them. */
export type PackingSeen = Record<string, {
  name: string;
  dates: string[];
  /** Each day, body area and layer it was worn in, as "date:bodyPart:layerType". */
  slots: string[];
}>;

/** What POST /api/v1/trips/:id/pack takes: one change to the person's own list. */
export type PackingChange =
  | { op: "add_item"; id: string; name: string; quantity: number }
  | { op: "item_quantity"; id: string; quantity: number }
  | { op: "remove_item"; id: string }
  | { op: "quantity"; key: string; quantity: number }
  | { op: "acknowledge"; kits: Record<string, string> };

/** What POST /api/v1/trips/:id/pack returns: the person's saved choices. */
export interface PackingChoices {
  manual: PackingManualItem[];
  quantities: Record<string, number>;
}

export interface TripPackResponse {
  trip: { id: string; name: string; start_date: string; end_date: string };
  totalDays: number;
  coverage: TripDayCoverage[];
  /** From the person's saved outfits. */
  items: PackingItem[];
  removed: PackingRemovedItem[];
  /** Each of the person's kits by id, with its updated_at, sent back to acknowledge the changes. */
  kitVersions: Record<string, string>;
  checklists: PackingChecklist[];
  manual: PackingManualItem[];
  /** False when the person's own additions can't be read, so they can't be changed either. */
  editable: boolean;
  /** General guidance for the days without a saved outfit, from activity and weather. */
  suggestions: PackingListData;
  /** How many days the suggestions are for. */
  suggestedDays: number;
  skipped: { date: string; reason: string }[];
  groupGear: string[];
}

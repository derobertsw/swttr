/**
 * A member's trip packing list (#177), worked out on the server from the
 * outfits saved to their trip days. See docs/trip-packing.md.
 */
import type { PackingListData } from "@/lib/packingList";
import type { TripGroupGear } from "@/types/trips";
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
   * The other keys the same item can be saved under, from its name, body area
   * and layer: a catalog item's general key (a plan's item named as it) and a
   * worn item's carry key. A quantity saved under one
   * applies to it, whether or not an outfit still names it that way.
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

/** Exact item identities only; aliases never transfer a physical packing check. */
export type PackingChecks = Record<string, { packed: boolean; quantity: number; version: string }>;

export type PackingCheckChange = {
  op: "set_packed";
  key: string;
  packed: boolean;
  quantity: number;
  expected: string | null;
  mutation: string;
  kits: Record<string, string>;
};

/** What POST /api/v1/trips/:id/pack takes: one change to the person's own list. */
export type PackingChange =
  | PackingCheckChange
  | { op: "add_item"; id: string; name: string; quantity: number }
  | { op: "item_quantity"; id: string; quantity: number }
  | { op: "remove_item"; id: string }
  | { op: "quantity"; key: string; quantity: number }
  | { op: "acknowledge"; kits: Record<string, string> }
  | { op: "add_equipment"; ids: string[] }
  | { op: "equipment_quantity"; id: string; quantity: number }
  | { op: "remove_equipment"; id: string };

/**
 * `trip_member_packing.equipment`: each touring template item the person
 * added, or took out again, by template id (#212).
 */
export type PackingEquipmentChoices = Record<string, { status: "added" | "removed"; quantity: number }>;

/** What POST /api/v1/trips/:id/pack returns: the person's saved choices. */
export interface PackingChoices {
  manual: PackingManualItem[];
  quantities: Record<string, number>;
  checks: PackingChecks;
  equipment: PackingEquipmentChoices;
}

/** One item of the touring equipment template (#212). */
export interface EquipmentTemplateItem {
  /** Its identity in the template; it's never reused for another item. */
  id: string;
  name: string;
  /** Suggested additions start selected; optional items don't. */
  tier: "suggested" | "optional";
  /** Why it's on the list, shown as optional detail. */
  purpose: string;
}

/** A template item in the person's packing list, checked under `key` ("equipment:<id>"). */
export interface PackingEquipmentItem extends EquipmentTemplateItem {
  key: string;
  quantity: number;
}

/** A template item as the person's list stands now, for the Add touring equipment preview. */
export interface EquipmentTemplateOption extends EquipmentTemplateItem {
  /**
   * added: in their touring equipment. listed: not added, but an item of
   * theirs has its name (`listedAs`). removed: they took it out of their list.
   * available: none of these.
   */
  state: "added" | "listed" | "removed" | "available";
  listedAs?: string;
}

/** The person's touring equipment (#212). See docs/trip-touring-prep.md. */
export interface TouringEquipment {
  /** The trip's Backcountry days, which the equipment is for. */
  dates: string[];
  items: PackingEquipmentItem[];
  template: EquipmentTemplateOption[];
  /** False when the person's equipment can't be read or changed (before migration 032). */
  editable: boolean;
}

/** What GET /api/v1/trips/:id/pack/equipment returns, for a trip day. */
export interface TripEquipmentResponse {
  equipment: TouringEquipment;
  /** The person's packing checks for their equipment, by key. */
  checks: PackingChecks;
}

/**
 * What GET /api/v1/trips/:id/gear/touring returns: the shared touring items
 * template as the trip's shared gear stands, for the organizer (#212).
 */
export interface SharedTouringTemplate {
  /** The trip's Backcountry days, which the items are for. */
  dates: string[];
  /**
   * added: in shared gear under its own name. listed: in shared gear under
   * another of its names (`listedAs`). available: neither. Shared items are
   * never `removed`: a removed one is just gone.
   */
  template: EquipmentTemplateOption[];
}

/** What POST /api/v1/trips/:id/gear/touring returns, and its error's `added`: the names it added. */
export interface SharedTouringAdded {
  added: string[];
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
  checks: PackingChecks;
  /** False when the person's own additions can't be read, so they can't be changed either. */
  editable: boolean;
  /** General guidance for the days without a saved outfit, from activity and weather. */
  suggestions: PackingListData;
  /** How many days the suggestions are for. */
  suggestedDays: number;
  skipped: { date: string; reason: string }[];
  groupGear: TripGroupGear[];
  equipment: TouringEquipment;
}

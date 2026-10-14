/**
 * Packing from saved kits (#177): a member's packing list, worked out on the
 * server from the outfits saved to their trip days, and the changes since they
 * last acknowledged it. See docs/trip-packing.md.
 */
import { BODY_PART_ORDER, LAYER_TYPE_ORDER } from "@/lib/packingList";
import { kitWear } from "@/lib/trip-saved-kits";
import type { SavedKit } from "@/types/savedKit";
import type {
  PackingChange,
  PackingItem,
  PackingManualItem,
  PackingOwnership,
  PackingRemovedItem,
  PackingSeen,
  PackingUse,
} from "@/types/trip-packing";
import type { TripMemberDayKit } from "@/types/trips";

type Fields = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OWNERSHIP_RANK: Record<PackingOwnership, number> = { general: 0, suggested: 1, owned: 2 };
const USES: PackingUse[] = ["wear", "carry"];
export const MAX_QUANTITY = 20;
export const MAX_NAME = 80;

const isObject = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const isQuantity = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_QUANTITY;
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

/**
 * A name as an item's identity: compatibility forms folded, lowercase, and
 * punctuation and spacing collapsed, keeping letters and numbers in every
 * script so 手袋 and 帽子 stay two items. A name with no letters or numbers
 * keeps its own text.
 */
function identityText(value: string): string {
  const folded = value.normalize("NFKC").toLowerCase();
  return folded.replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim() || folded.trim();
}

/** A saved outfit on one of the person's trip days. */
export interface DayOutfit {
  date: string;
  outfit: SavedKit;
  savedAt: string | null;
}

/** An item as the outfits name it, before its quantity and changes are known. */
type DerivedItem = Omit<PackingItem, "quantity" | "change">;

interface Draft extends Omit<DerivedItem, "days" | "aliases"> {
  uses: Map<string, Set<PackingUse>>;
  /** When the outfit that named it was saved: the latest save's name is kept. */
  namedAt: string;
}

/** What an outfit carries rather than wears: each phase's carry list, or a plan day's. */
function outfitCarry(outfit: SavedKit): string[] {
  return outfit.kind === "plan_day" ? outfit.day?.carryItems ?? [] : (outfit.phases ?? []).flatMap((phase) => phase.carry ?? []);
}

function mergeInto(target: Draft, source: Draft) {
  for (const [date, uses] of source.uses) {
    const into = target.uses.get(date) ?? new Set<PackingUse>();
    uses.forEach((use) => into.add(use));
    target.uses.set(date, into);
  }
  if (OWNERSHIP_RANK[source.ownership] > OWNERSHIP_RANK[target.ownership]) target.ownership = source.ownership;
}

/**
 * The other keys the same item can be saved under, worked out from its own
 * name, body area and layer, so they hold whether or not an outfit still
 * names it that way: a catalog item's general key (a plan's item named as
 * it), and a worn item's carry key (carried under its name).
 */
function aliasesOf(item: Pick<Draft, "key" | "name" | "bodyPart" | "layerType">): string[] {
  if (!item.bodyPart) return [];
  const text = identityText(item.name);
  return [
    ...(item.key.startsWith("item:") ? [`general:${item.bodyPart}:${item.layerType}:${text}`] : []),
    `carry:${text}`,
  ].filter((alias) => alias !== item.key);
}

/** The one draft matching, or undefined when none or several do. */
function only(drafts: Draft[]): Draft | undefined {
  return drafts.length === 1 ? drafts[0] : undefined;
}

/**
 * Every item the outfits call for, once each, with each day it's for and
 * whether it's worn or carried then.
 *
 * - The same catalog or wardrobe item on several days is one item. So is a
 *   general item (one with no catalog identity) with the same body area,
 *   layer and name, and a general item with the name of the one catalog item
 *   worn there.
 * - A carried item worn in another part of the same outfit, like a ski tour's
 *   descent shell on the climb, is that item; so is one only carried that's
 *   worn on another day under the same name.
 * - An item is the person's own when any outfit had it from their wardrobe.
 *   `mapped` holds "bodyPart:layerType:name" for the names the person gave
 *   their own items, which a multi-day plan's items carry.
 * - Names come from the latest save.
 * - `aliases` lists the other keys the same item can be saved under (see
 *   aliasesOf), so a quantity or acknowledgement saved under one still
 *   applies after an outfit names the item another way.
 */
export function packingFromOutfits(outfits: DayOutfit[], mapped: ReadonlySet<string> = new Set()): DerivedItem[] {
  const drafts = new Map<string, Draft>();
  const mark = (draft: Draft, date: string, use: PackingUse) => {
    const uses = draft.uses.get(date) ?? new Set<PackingUse>();
    uses.add(use);
    draft.uses.set(date, uses);
  };
  const add = (date: string, use: PackingUse, item: Omit<Draft, "uses">) => {
    let draft = drafts.get(item.key);
    if (!draft) {
      draft = { ...item, uses: new Map() };
      drafts.set(item.key, draft);
    } else {
      if (OWNERSHIP_RANK[item.ownership] > OWNERSHIP_RANK[draft.ownership]) draft.ownership = item.ownership;
      // A worn item keeps the name it's worn under over a carry list's wording.
      if (item.namedAt >= draft.namedAt && (item.bodyPart || !draft.bodyPart)) {
        Object.assign(draft, { name: item.name, brand: item.brand, namedAt: item.namedAt });
      }
      if (item.bodyPart && !draft.bodyPart) Object.assign(draft, { bodyPart: item.bodyPart, layerType: item.layerType, name: item.name, brand: item.brand });
    }
    mark(draft, date, use);
  };

  for (const { date, outfit, savedAt } of [...outfits].sort((a, b) => a.date.localeCompare(b.date))) {
    const namedAt = savedAt ?? "";
    // Within this outfit, each worn name and the item it is.
    const worn = new Map<string, Draft>();
    for (const { wear } of kitWear(outfit)) {
      for (const bodyPart of BODY_PART_ORDER) {
        for (const layerType of LAYER_TYPE_ORDER) {
          for (const item of wear?.[bodyPart]?.[layerType] ?? []) {
            const name = item.name.trim();
            if (!name) continue;
            const key = item.sourceId ? `item:${item.sourceId}` : `general:${bodyPart}:${layerType}:${identityText(name)}`;
            const ownership: PackingOwnership = item.sourceId
              ? item.isRecommended ? "suggested" : "owned"
              : mapped.has(`${bodyPart}:${layerType}:${name}`) ? "owned" : "general";
            add(date, "wear", { key, name, ...(item.brand && { brand: item.brand }), bodyPart, layerType, ownership, namedAt });
            worn.set(identityText(name), drafts.get(key)!);
          }
        }
      }
    }
    for (const text of outfitCarry(outfit)) {
      const name = text.trim();
      if (!name) continue;
      const known = worn.get(identityText(name));
      if (known) mark(known, date, "carry");
      else add(date, "carry", { key: `carry:${identityText(name)}`, name, bodyPart: null, layerType: null, ownership: "general", namedAt });
    }
  }

  const all = [...drafts.values()];
  const wornIn = (draft: Draft) => all.filter((other) => other !== draft && drafts.has(other.key) && other.bodyPart
    && identityText(other.name) === identityText(draft.name));
  for (const draft of all) {
    if (!draft.key.startsWith("general:")) continue;
    const target = only(wornIn(draft).filter((other) => other.key.startsWith("item:")
      && other.bodyPart === draft.bodyPart && other.layerType === draft.layerType));
    if (target) { mergeInto(target, draft); drafts.delete(draft.key); }
  }
  for (const draft of all) {
    if (!draft.key.startsWith("carry:")) continue;
    const target = only(wornIn(draft));
    if (target) { mergeInto(target, draft); drafts.delete(draft.key); }
  }

  const order = (draft: Draft) => draft.bodyPart
    ? BODY_PART_ORDER.indexOf(draft.bodyPart) * 10 + LAYER_TYPE_ORDER.indexOf(draft.layerType ?? "base")
    : 100;
  return [...drafts.values()]
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map(({ uses, key, name, brand, bodyPart, layerType, ownership }) => ({
      key, name, ...(brand && { brand }), bodyPart, layerType, ownership,
      ...(bodyPart && { aliases: aliasesOf({ key, name, bodyPart, layerType }) }),
      days: [...uses.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([date, set]) => ({ date, uses: USES.filter((use) => set.has(use)) })),
    }));
}

/** The items as they're acknowledged, for `trip_member_packing.seen`. */
export function packingSeen(items: DerivedItem[]): PackingSeen {
  return Object.fromEntries(items.map((item) => [item.key, {
    name: item.name,
    dates: item.days.map((day) => day.date),
    slots: item.bodyPart
      ? item.days.filter((day) => day.uses.includes("wear")).map((day) => `${day.date}:${item.bodyPart}:${item.layerType}`)
      : [],
  }]));
}

/**
 * Each item with its quantity, and what changed since the person last
 * acknowledged their list: an item that's new where an item that left was
 * worn (the same day, body area and layer) replaces it, another new item is
 * added, and items that left without being replaced are listed as removed.
 * Nothing is flagged before the first acknowledgement. An item saved under
 * one of an item's aliases is that item, so it hasn't left, and its quantity
 * applies until one is chosen under the item's own key.
 */
export function packingWithChanges(items: DerivedItem[], quantities: Record<string, number>, seen: PackingSeen | null): {
  items: PackingItem[];
  removed: PackingRemovedItem[];
} {
  const current = new Set(items.flatMap((item) => [item.key, ...(item.aliases ?? [])]));
  const gone = seen ? Object.entries(seen).filter(([key]) => !current.has(key)) : [];
  const replaced = new Set<string>();
  const result = items.map((item): PackingItem => {
    const quantity = [item.key, ...(item.aliases ?? [])].map((key) => quantities[key]).find((value) => value !== undefined);
    const withQuantity = { ...item, quantity: quantity ?? 1 };
    if (!seen || [item.key, ...(item.aliases ?? [])].some((key) => seen[key])) return withQuantity;
    const slots = new Set(packingSeen([item])[item.key].slots);
    const replaces = gone.filter(([, before]) => before.slots.some((slot) => slots.has(slot)));
    if (replaces.length === 0) return { ...withQuantity, change: { kind: "added" } };
    replaces.forEach(([key]) => replaced.add(key));
    return { ...withQuantity, change: { kind: "replaced", replaces: replaces.map(([, before]) => before.name) } };
  });
  const removed = gone.filter(([key]) => !replaced.has(key)).map(([key, before]) => ({ key, name: before.name, dates: before.dates }));
  return { items: result, removed };
}

/** The person's kits that hold anything, an outfit or checklist items, by id, with their updated_at. */
export function kitVersions(kits: TripMemberDayKit[]): Record<string, string> {
  return Object.fromEntries(kits.filter((kit) => kit.outfit || kit.items.length > 0).map((kit) => [kit.id, kit.updated_at]));
}

/** Whether two sets of kit versions name the same kits at the same times, however the times are written. */
export function sameKitVersions(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => typeof b[key] === "string" && Date.parse(a[key]) === Date.parse(b[key]));
}

/** `trip_member_packing.seen` as saved, keeping only well-formed entries; null before the first acknowledgement. */
export function readSeen(value: unknown): PackingSeen | null {
  if (!isObject(value)) return null;
  const seen: PackingSeen = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isObject(entry) && typeof entry.name === "string" && isStrings(entry.dates) && isStrings(entry.slots)) {
      seen[key] = { name: entry.name, dates: entry.dates, slots: entry.slots };
    }
  }
  return seen;
}

/** `trip_member_packing.items` as saved, keeping only well-formed items. */
export function readManualItems(value: unknown): PackingManualItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isObject(item) && typeof item.id === "string" && typeof item.name === "string" && isQuantity(item.quantity)
    ? [{ id: item.id, name: item.name, quantity: item.quantity }]
    : []);
}

/** `trip_member_packing.quantities` as saved, keeping only valid quantities. */
export function readQuantities(value: unknown): Record<string, number> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => isQuantity(entry[1])));
}

/** Checks a change to the person's list; a string says what's wrong with it. */
export function parsePackingChange(body: unknown): PackingChange | string {
  if (!isObject(body)) return "Nothing to change.";
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  const quantity = body.quantity;
  const checkQuantity = () => isQuantity(quantity) ? null : `Choose a quantity from 1 to ${MAX_QUANTITY}.`;
  switch (body.op) {
    case "add_item": {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!UUID.test(id)) return "Invalid item.";
      if (!name || name.length > MAX_NAME) return `Name the item in 1 to ${MAX_NAME} characters.`;
      return checkQuantity() ?? { op: "add_item", id, name, quantity: quantity as number };
    }
    case "item_quantity":
      if (!UUID.test(id)) return "Invalid item.";
      return checkQuantity() ?? { op: "item_quantity", id, quantity: quantity as number };
    case "remove_item":
      return UUID.test(id) ? { op: "remove_item", id } : "Invalid item.";
    case "quantity":
      if (typeof body.key !== "string" || !body.key || body.key.length > 300) return "Invalid item.";
      return checkQuantity() ?? { op: "quantity", key: body.key, quantity: quantity as number };
    case "acknowledge":
      if (!isObject(body.kits) || !Object.values(body.kits).every((at) => typeof at === "string" && Number.isFinite(Date.parse(at)))) {
        return "Reload your list and try again.";
      }
      return { op: "acknowledge", kits: body.kits as Record<string, string> };
    default:
      return "Nothing to change.";
  }
}

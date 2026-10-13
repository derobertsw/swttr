import "server-only";
import { createHash } from "node:crypto";
import type { Recommendation, LayerItem } from "@/types/recommendations";
import type { SavedKit } from "@/types/savedKit";
import type { TripFull } from "@/types/trips";
import type { TripPackingManualItem, TripPackingRequirement, TripPackingReview, TripPackingSnapshot, TripPackingUse } from "@/types/trip-packing";

const parts = ["torso", "legs", "hands", "headNeck"] as const;
const layers = ["base", "mid", "outer"] as const;
const normalized = (name: string) => name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const token = (values: string[]) => JSON.stringify(values);

/** Exact kit content, not labels/ordering in the current wardrobe, guards a review. */
export function packingSources(full: TripFull, memberId: string) {
  return {
    start_date: full.trip.start_date, end_date: full.trip.end_date,
    days: full.days.filter(d => d.date >= full.trip.start_date && d.date <= full.trip.end_date)
      .sort((a, b) => a.date.localeCompare(b.date)).map(day => {
        const kit = full.kits.find(k => k.trip_day_id === day.id && k.trip_member_id === memberId);
        return { id: day.id, date: day.date, kit_id: kit?.id ?? null, outfit: kit?.outfit ?? null };
      }),
  };
}

// Sort object keys so Postgres jsonb serialization order never affects a token.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function revision(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

function outfits(kit: SavedKit): Array<{ phase: string; wear: Recommendation | null; carry: string[] }> {
  return kit.kind === "plan_day"
    ? [{ phase: "day", wear: kit.day.baseline.recommendation, carry: kit.day.carryItems },
      ...kit.day.dayparts.map(p => ({ phase: p.id, wear: p.recommendation, carry: [] }))]
    : kit.phases.map(p => ({ phase: p.id, wear: p.wear, carry: p.carry }));
}

function identity(item: LayerItem, part: string, layer: string) {
  const kind = item.isRecommended ? "suggestion" : item.isGeneric || !item.sourceId ? "unresolved" : "owned";
  // An unresolved choice is a slot, never an invented physical garment ID.
  const id = item.sourceId && !item.isGeneric
    ? token([kind, item.sourceId]) : token([kind, part, layer, normalized(item.name)]);
  return { id, kind } as Pick<TripPackingRequirement, "id" | "kind">;
}

/** Only this member's accepted snapshots supply personal requirements. */
export function deriveTripPacking(full: TripFull, memberId: string, manual: TripPackingManualItem[], quantities: Record<string, number>) {
  const requirements = new Map<string, TripPackingRequirement>();
  function add(id: string, name: string, kind: TripPackingRequirement["kind"], use: TripPackingUse) {
    const entry = requirements.get(id) ?? { id, name, kind, quantity: quantities[id] ?? 1, uses: [] };
    if (!entry.uses.some(u => canonical(u) === canonical(use))) entry.uses.push(use);
    requirements.set(id, entry);
  }
  for (const day of [...full.days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < full.trip.start_date || day.date > full.trip.end_date) continue;
    const kit = full.kits.find(k => k.trip_day_id === day.id && k.trip_member_id === memberId);
    if (!kit?.outfit) continue;
    const phases = outfits(kit.outfit);
    // Carry strings in v1 can refer to clothing worn in another phase. Match
    // only an unambiguous selection in this kit, never today's wardrobe.
    const named = new Map<string, Map<string, { id: string; kind: TripPackingRequirement["kind"] }>>();
    for (const phase of phases) for (const part of parts) for (const layer of layers) {
      for (const item of phase.wear?.[part][layer] ?? []) {
        const ref = identity(item, part, layer);
        const matches = named.get(normalized(item.name)) ?? new Map();
        matches.set(ref.id, ref); named.set(normalized(item.name), matches);
      }
    }
    for (const phase of phases) {
      const use = { date: day.date, phase: phase.phase, kit_id: kit.id };
      for (const part of parts) for (const layer of layers) for (const item of phase.wear?.[part][layer] ?? []) {
        const ref = identity(item, part, layer);
        add(ref.id, item.name, ref.kind, { ...use, purpose: "wear" });
      }
      for (const name of phase.carry) {
        const matches = named.get(normalized(name));
        const ref = matches?.size === 1 ? [...matches.values()][0] : { id: token(["unresolved", "carry", normalized(name)]), kind: "unresolved" as const };
        add(ref.id, name, ref.kind, { ...use, purpose: "carry" });
      }
    }
  }
  for (const item of manual) requirements.set(`manual:${item.id}`, { ...item, id: `manual:${item.id}`, kind: "manual", uses: [] });
  return [...requirements.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function packingReview(full: TripFull, memberId: string, snapshot: TripPackingSnapshot): TripPackingReview {
  const proposed = deriveTripPacking(full, memberId, snapshot.manual_items, snapshot.quantities);
  const before = new Map(snapshot.requirements.map(r => [r.id, r]));
  const after = new Map(proposed.map(r => [r.id, r]));
  const changes = {
    added: proposed.filter(r => !before.has(r.id)),
    removed: snapshot.requirements.filter(r => !after.has(r.id)),
    changed: proposed.filter(r => before.has(r.id) && canonical(before.get(r.id)) !== canonical(r)).map(r => ({ before: before.get(r.id)!, after: r })),
  };
  return { ...snapshot, proposed, changes, source_revision: revision(packingSources(full, memberId)), proposal_revision: revision(proposed) };
}

export const emptyPacking: TripPackingSnapshot = { revision: 0, requirements: [], manual_items: [], quantities: {} };

/** Bounds user-authored additions and quantity overrides; no client requirements are trusted. */
export function readPackingEdits(body: Record<string, unknown>) {
  const manual = body.manual_items;
  const quantities = body.quantities;
  if (!Array.isArray(manual) || manual.length > 100 || !quantities || typeof quantities !== "object" || Array.isArray(quantities) || Object.keys(quantities).length > 500) return null;
  const validQuantity = (v: unknown) => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 100;
  const ids = new Set<string>();
  const items: TripPackingManualItem[] = [];
  for (const item of manual) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id) || ids.has(item.id)
      || typeof item.name !== "string" || !item.name.trim() || item.name.length > 200 || !validQuantity(item.quantity)) return null;
    ids.add(item.id); items.push({ id: item.id, name: item.name.trim(), quantity: item.quantity });
  }
  if (!Object.values(quantities).every(validQuantity) || Object.keys(quantities).some(k => k.length > 1000)) return null;
  return { manual_items: items, quantities: quantities as Record<string, number> };
}

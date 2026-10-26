import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityText } from "@/lib/trip-packing";
import { changeSharedGear } from "@/lib/trip-shared-gear";
import type { EquipmentTemplateItem, EquipmentTemplateOption, SharedTouringAdded } from "@/types/trip-packing";
import type { TripGroupGear } from "@/types/trips";

/**
 * Shared touring items (#212): a template of group items for Backcountry
 * days, which the organizer adds to the trip's shared gear, unassigned.
 * Assigning, accepting and packing them is shared gear's own (#179). See
 * docs/trip-touring-prep.md.
 */

/**
 * The template, in the order it's listed. Ids name the item's row on a trip
 * (sharedTouringGearId), so an id is never removed or given to another item.
 */
export const SHARED_TOURING_ITEMS: readonly EquipmentTemplateItem[] = [
  {
    id: "first_aid", name: "First aid kit", tier: "suggested",
    purpose: "For injuries on the tour, from blisters to a fall, until help arrives. Someone in the group should know how to use it.",
  },
  {
    id: "repair_kit", name: "Repair kit", tier: "suggested",
    purpose: "Field fixes for skins, bindings, boots and poles, like ski straps, a multi-tool and spare binding parts.",
  },
  {
    id: "group_shelter", name: "Group shelter", tier: "suggested",
    purpose: "A lightweight shelter, like a bothy bag, the group can get into out of the wind while waiting out weather or looking after someone hurt.",
  },
];

/** Other names someone may have given a template item in shared gear. */
const ALSO_KNOWN_AS: Record<string, readonly string[]> = {
  first_aid: ["First aid", "First aid supplies", "Medical kit", "Med kit"],
  repair_kit: ["Ski repair kit", "Tool kit"],
  group_shelter: ["Bothy bag", "Bothy", "Emergency shelter"],
};

const TEMPLATE_IDS: ReadonlySet<string> = new Set(SHARED_TOURING_ITEMS.map((item) => item.id));

export const isSharedTouringId = (id: unknown): id is string => typeof id === "string" && TEMPLATE_IDS.has(id);

// A fixed namespace for sharedTouringGearId; changing it would let a template
// item be added twice to trips that already have it.
const NAMESPACE = Buffer.from("95be0950-7733-413c-b901-96cb705d2e0a".replace(/-/g, ""), "hex");

/**
 * A template item's shared gear id on a trip, a name-based UUID (version 5).
 * It's the same every time, so adding the item again, after a lost response
 * or from two tabs at once, returns the row that's there instead of adding a
 * second (update_trip_shared_gear's create retry).
 */
export function sharedTouringGearId(tripId: string, templateId: string): string {
  const hash = createHash("sha1").update(NAMESPACE).update(`${tripId}/${templateId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The template as the trip's shared gear stands. An item counts as added when
 * its own row is there, or any item has its name; under another of its names
 * ("Bothy bag") it's listed, so it isn't suggested a second time either.
 */
export function buildSharedTouringTemplate(tripId: string, gear: Pick<TripGroupGear, "id" | "description">[]): EquipmentTemplateOption[] {
  const ids = new Set(gear.map((item) => item.id));
  const byName = new Map(gear.map((item) => [identityText(item.description), item.description]));
  return SHARED_TOURING_ITEMS.map((item) => {
    if (ids.has(sharedTouringGearId(tripId, item.id)) || byName.has(identityText(item.name))) return { ...item, state: "added" };
    const listedAs = (ALSO_KNOWN_AS[item.id] ?? []).map((name) => byName.get(identityText(name))).find((name) => name !== undefined);
    return listedAs ? { ...item, state: "listed", listedAs } : { ...item, state: "available" };
  });
}

/** The trip's shared gear, as much as the template needs. */
async function readSharedGearNames(supabase: SupabaseClient, tripId: string) {
  const { data, error } = await supabase.from("trip_group_gear").select("id, description").eq("trip_id", tripId);
  return error ? null : (data ?? []) as Pick<TripGroupGear, "id" | "description">[];
}

/**
 * Adds the template items `ids` that aren't in the trip's shared gear,
 * unassigned, in the template's order. Each is its own save, so when one
 * fails the ones before it stay added, and the error's `added` names them;
 * trying again adds only the rest.
 */
export async function addSharedTouringItems(supabase: SupabaseClient, tripId: string, userId: string, ids: readonly string[]) {
  const gear = await readSharedGearNames(supabase, tripId);
  if (!gear) return NextResponse.json({ error: "Couldn't read shared gear. Try again." }, { status: 500 });
  const added: string[] = [];
  for (const option of buildSharedTouringTemplate(tripId, gear)) {
    if (!ids.includes(option.id) || option.state !== "available") continue;
    const response = await changeSharedGear(supabase, tripId, userId, sharedTouringGearId(tripId, option.id),
      { action: "create", description: option.name, assignee_member_id: null });
    if (!response.ok) {
      const { error } = await response.json() as { error: string };
      return NextResponse.json({ error, added }, { status: response.status });
    }
    added.push(option.name);
  }
  return NextResponse.json({ added } satisfies SharedTouringAdded, { status: added.length > 0 ? 201 : 200 });
}

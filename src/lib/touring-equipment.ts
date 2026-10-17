/**
 * Touring equipment (#212): a template of personal items for Backcountry
 * days, which each person adds to their own packing list and checks there.
 * See docs/trip-touring-prep.md.
 */
import { identityText } from "@/lib/trip-packing";
import type {
  EquipmentTemplateItem,
  EquipmentTemplateOption,
  PackingEquipmentChoices,
  PackingEquipmentItem,
  TouringEquipment,
} from "@/types/trip-packing";

/**
 * The template, in the order it's listed. The rescue gear follows the
 * National Avalanche Center's guidance (avalanche.org, "Get the gear"):
 * always carry a transceiver, probe and shovel, and know how to use them;
 * consider an airbag pack. Ids are stored in members' lists, so an id is
 * never removed or given to another item.
 */
export const TOURING_EQUIPMENT: readonly EquipmentTemplateItem[] = [
  {
    id: "transceiver", name: "Avalanche transceiver", tier: "suggested",
    purpose: "Sends a signal, and searches for one, to find someone buried in an avalanche. Wear it switched on, and know how to use it.",
  },
  {
    id: "probe", name: "Avalanche probe", tier: "suggested",
    purpose: "Pinpoints a buried person once the transceiver search gets you close.",
  },
  {
    id: "shovel", name: "Avalanche shovel", tier: "suggested",
    purpose: "Digs out a buried person. Avalanche debris is dense and hard, so bring a sturdy one.",
  },
  {
    id: "skins", name: "Climbing skins", tier: "suggested",
    purpose: "Grip for skinning uphill.",
  },
  {
    id: "airbag", name: "Avalanche airbag pack", tier: "optional",
    purpose: "Deployed in an avalanche, it can help keep you near the surface. It doesn't replace the transceiver, probe and shovel.",
  },
  {
    id: "ski_crampons", name: "Ski crampons", tier: "optional",
    purpose: "Grip on firm or icy climbs where skins slip.",
  },
  {
    id: "helmet", name: "Helmet", tier: "optional",
    purpose: "Head protection on the descent and in steep or rocky terrain.",
  },
  {
    id: "headlamp", name: "Headlamp", tier: "optional",
    purpose: "For early starts and returns after dark.",
  },
];

/** Other names a person may have given a template item in their own list. */
const ALSO_KNOWN_AS: Record<string, readonly string[]> = {
  transceiver: ["Transceiver", "Avalanche beacon", "Beacon"],
  probe: ["Probe"],
  shovel: ["Shovel"],
  skins: ["Skins"],
  airbag: ["Airbag pack", "Airbag"],
  ski_crampons: ["Harscheisen"],
  helmet: ["Ski helmet"],
  headlamp: ["Head torch"],
};

const TEMPLATE_IDS: ReadonlySet<string> = new Set(TOURING_EQUIPMENT.map((item) => item.id));

export const isTemplateId = (id: unknown): id is string => typeof id === "string" && TEMPLATE_IDS.has(id);

/** The packing-check key of a template item. */
export const equipmentKey = (id: string) => `equipment:${id}`;

/** `trip_member_packing.equipment` as saved, keeping only well-formed template items. */
export function readEquipment(value: unknown): PackingEquipmentChoices {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, entry]) => {
    if (!isTemplateId(id) || typeof entry !== "object" || entry === null) return [];
    const { status, quantity } = entry as Record<string, unknown>;
    return (status === "added" || status === "removed") && Number.isInteger(quantity) && Number(quantity) >= 1 && Number(quantity) <= 20
      ? [[id, { status, quantity: quantity as number }]] : [];
  }));
}

/**
 * The person's touring equipment: the template items in their list, and the
 * template as their list stands. `names` are the names of everything else in
 * their list (outfit items and items added by hand): a template item they
 * already have under one of its names shows as listed, so the preview doesn't
 * suggest adding it twice. A name never carries a packing check across.
 */
export function buildTouringEquipment({ dates, saved, names, editable }: {
  dates: string[];
  saved: PackingEquipmentChoices;
  names: string[];
  editable: boolean;
}): TouringEquipment {
  const byName = new Map(names.map((name) => [identityText(name), name]));
  const template: EquipmentTemplateOption[] = TOURING_EQUIPMENT.map((item) => {
    if (saved[item.id]?.status === "added") return { ...item, state: "added" };
    const listedAs = [item.name, ...ALSO_KNOWN_AS[item.id] ?? []].map((name) => byName.get(identityText(name))).find((name) => name !== undefined);
    if (listedAs) return { ...item, state: "listed", listedAs };
    return { ...item, state: saved[item.id]?.status === "removed" ? "removed" : "available" };
  });
  return { dates, items: itemsIn(saved), template, editable };
}

/** The template items in the person's list, in the template's order. */
function itemsIn(saved: PackingEquipmentChoices): PackingEquipmentItem[] {
  return TOURING_EQUIPMENT.flatMap((item) => {
    const choice = saved[item.id];
    return choice?.status === "added" ? [{ ...item, key: equipmentKey(item.id), quantity: choice.quantity }] : [];
  });
}

/**
 * The equipment after a saved change: `choices` is what the server returned.
 * Template items keep their place and their other names; a page uses this to
 * show a saved change without reading the whole list again.
 */
export function withEquipmentChoices(equipment: TouringEquipment, choices: PackingEquipmentChoices): TouringEquipment {
  const template = equipment.template.map((option): EquipmentTemplateOption => {
    const status = choices[option.id]?.status;
    if (status === "added") return { ...option, state: "added" };
    if (option.listedAs) return { ...option, state: "listed" };
    return { ...option, state: status === "removed" ? "removed" : "available" };
  });
  return { ...equipment, items: itemsIn(choices), template };
}

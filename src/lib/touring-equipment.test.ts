import { describe, expect, it } from "vitest";
import { buildTouringEquipment, readEquipment, TOURING_EQUIPMENT, withEquipmentChoices } from "@/lib/touring-equipment";

const states = (equipment: ReturnType<typeof buildTouringEquipment>) =>
  Object.fromEntries(equipment.template.map((option) => [option.id, option.listedAs ? `${option.state}:${option.listedAs}` : option.state]));

describe("touring equipment", () => {
  it("has the rescue gear as suggested additions, with unique ids", () => {
    const suggested = TOURING_EQUIPMENT.filter((item) => item.tier === "suggested").map((item) => item.id);
    expect(suggested).toEqual(expect.arrayContaining(["transceiver", "probe", "shovel"]));
    expect(new Set(TOURING_EQUIPMENT.map((item) => item.id)).size).toBe(TOURING_EQUIPMENT.length);
    expect(TOURING_EQUIPMENT.every((item) => /^[a-z][a-z0-9_]{0,39}$/.test(item.id) && item.purpose.length > 0)).toBe(true);
  });

  it("keeps only well-formed template items when reading the saved column", () => {
    expect(readEquipment({
      probe: { status: "added", quantity: 2 }, shovel: { status: "removed", quantity: 1 },
      rope: { status: "added", quantity: 1 }, skins: { status: "packed", quantity: 1 }, helmet: { status: "added", quantity: 21 },
    })).toEqual({ probe: { status: "added", quantity: 2 }, shovel: { status: "removed", quantity: 1 } });
    expect(readEquipment(null)).toEqual({});
    expect(readEquipment([])).toEqual({});
  });

  it("lists added items in template order, and the template as the person's list stands", () => {
    const equipment = buildTouringEquipment({
      dates: ["2026-02-13"],
      saved: { shovel: { status: "added", quantity: 1 }, transceiver: { status: "added", quantity: 2 }, airbag: { status: "removed", quantity: 1 } },
      // A hand-added "beacon" and an outfit's "Head Torch" are already in the list under other names.
      names: ["Beacon", "Head Torch", "Ski shell"],
      editable: true,
    });
    expect(equipment.items.map((item) => [item.key, item.quantity])).toEqual([["equipment:transceiver", 2], ["equipment:shovel", 1]]);
    expect(states(equipment)).toEqual({
      transceiver: "added", probe: "available", shovel: "added", skins: "available",
      airbag: "removed", ski_crampons: "available", helmet: "available", headlamp: "listed:Head Torch",
    });
  });

  it("shows a saved change without reading the list again", () => {
    const before = buildTouringEquipment({ dates: [], saved: {}, names: ["Probe"], editable: true });
    const after = withEquipmentChoices(before, { transceiver: { status: "added", quantity: 1 }, probe: { status: "added", quantity: 1 }, shovel: { status: "removed", quantity: 1 } });
    expect(after.items.map((item) => item.id)).toEqual(["transceiver", "probe"]);
    expect(states(after)).toMatchObject({ transceiver: "added", probe: "added:Probe", shovel: "removed", skins: "available" });
    // Removed again, an item they have under another name shows as listed.
    expect(states(withEquipmentChoices(after, { probe: { status: "removed", quantity: 1 } }))).toMatchObject({ probe: "listed:Probe", transceiver: "available" });
  });
});

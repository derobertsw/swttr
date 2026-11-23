import { describe, expect, it } from "vitest";
import { buildTouringEquipment, readEquipment, TOURING_EQUIPMENT, withEquipmentChoices } from "@/lib/touring-equipment";

const states = (equipment: ReturnType<typeof buildTouringEquipment>) =>
  Object.fromEntries(equipment.template.map((option) => [option.id, option.listedAs ? `${option.state}:${option.listedAs}` : option.state]));

describe("touring equipment", () => {
  it("has the rescue gear and the helmet as suggested additions, with unique ids", () => {
    const suggested = TOURING_EQUIPMENT.filter((item) => item.tier === "suggested").map((item) => item.id);
    expect(suggested).toEqual(["transceiver", "probe", "shovel", "skins", "helmet"]);
    expect(TOURING_EQUIPMENT.filter((item) => item.tier === "optional").map((item) => item.id)).toEqual(["airbag", "ski_crampons", "headlamp"]);
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

  it("lists the helmet as the one worn on a Backcountry day, under its model's name", () => {
    const tour = [{ date: "2026-02-13", uses: ["wear" as const] }];
    const worn = [
      { key: "item:hw-1", name: "Smith Vantage MIPS", bodyPart: "headNeck" as const, layerType: "outer" as const, days: tour },
      { key: "item:hw-2", name: "Smartwool Merino Beanie", bodyPart: "headNeck" as const, layerType: "base" as const, days: tour },
    ];
    const dates = ["2026-02-13"];
    const equipment = buildTouringEquipment({ dates, saved: {}, names: worn.map((item) => item.name), worn, editable: true });
    expect(states(equipment)).toMatchObject({ helmet: "listed:Smith Vantage MIPS" });
    // A general guide's goggles share the slot, but aren't a wardrobe or catalog item.
    const goggles = [{ key: "general:headNeck:outer:goggles", name: "Goggles", bodyPart: "headNeck" as const, layerType: "outer" as const, days: tour }];
    expect(states(buildTouringEquipment({ dates, saved: {}, names: ["Goggles"], worn: goggles, editable: true }))).toMatchObject({ helmet: "available" });
    // A biking day's helmet is a bike helmet, which doesn't stand in for a ski helmet.
    const bike = [{ key: "item:hw-3", name: "Giro Syntax MIPS", bodyPart: "headNeck" as const, layerType: "outer" as const, days: [{ date: "2026-02-14", uses: ["wear" as const] }] }];
    expect(states(buildTouringEquipment({ dates, saved: {}, names: ["Giro Syntax MIPS"], worn: bike, editable: true }))).toMatchObject({ helmet: "available" });
    // Only carried on the Backcountry day, it isn't the one worn on the descent.
    const carried = [{ ...worn[0], days: [{ date: "2026-02-13", uses: ["carry" as const] }] }];
    expect(states(buildTouringEquipment({ dates, saved: {}, names: [], worn: carried, editable: true }))).toMatchObject({ helmet: "available" });
    // Added from the template, it's the template's own, whatever the outfit wears.
    expect(states(buildTouringEquipment({ dates, saved: { helmet: { status: "added", quantity: 1 } }, names: [], worn, editable: true })))
      .toMatchObject({ helmet: "added" });
  });

  it("shows a saved change without reading the list again", () => {
    const before = buildTouringEquipment({ dates: [], saved: {}, names: ["Probe"], editable: true });
    const after = withEquipmentChoices(before, { transceiver: { status: "added", quantity: 1 }, probe: { status: "added", quantity: 1 }, shovel: { status: "removed", quantity: 1 } },
      ["transceiver", "probe", "shovel"]);
    expect(after.items.map((item) => item.id)).toEqual(["transceiver", "probe"]);
    expect(states(after)).toMatchObject({ transceiver: "added", probe: "added:Probe", shovel: "removed", skins: "available" });
    // Removed again, an item they have under another name shows as listed.
    expect(states(withEquipmentChoices(after, { probe: { status: "removed", quantity: 1 } }, ["probe"])))
      .toMatchObject({ probe: "listed:Probe", transceiver: "added" });
  });

  it("changes only the items a response is for, so a late response can't undo a later change", () => {
    const both = buildTouringEquipment({ dates: [], names: [], editable: true,
      saved: { transceiver: { status: "added", quantity: 1 }, probe: { status: "added", quantity: 2 } } });
    // Probe's removal answered first, with transceiver already removed.
    const probeRemoved = withEquipmentChoices(both, { transceiver: { status: "removed", quantity: 1 }, probe: { status: "removed", quantity: 2 } }, ["probe"]);
    expect(probeRemoved.items.map((item) => item.id)).toEqual(["transceiver"]);
    // Transceiver's removal answers last, from before probe was removed.
    const bothRemoved = withEquipmentChoices(probeRemoved, { transceiver: { status: "removed", quantity: 1 }, probe: { status: "added", quantity: 2 } }, ["transceiver"]);
    expect(bothRemoved.items).toEqual([]);
    expect(states(bothRemoved)).toMatchObject({ transceiver: "removed", probe: "removed" });
  });
});

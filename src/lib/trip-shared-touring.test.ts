import { describe, expect, it } from "vitest";
import { buildSharedTouringTemplate, isSharedTouringId, SHARED_TOURING_ITEMS, sharedTouringGearId } from "@/lib/trip-shared-touring";

const TRIP = "0b5f1d8e-3c7a-4f6b-9a2e-5d4c3b2a1f00";
const OTHER = "1c6e2f9a-4d8b-4a7c-8b3f-6e5d4c3b2a10";

describe("shared touring items template", () => {
  it("lists first aid, a repair kit and a group shelter, each with a purpose", () => {
    expect(SHARED_TOURING_ITEMS.map((item) => item.name)).toEqual(["First aid kit", "Repair kit", "Group shelter"]);
    expect(SHARED_TOURING_ITEMS.every((item) => item.tier === "suggested" && item.purpose.length > 0)).toBe(true);
    expect(isSharedTouringId("first_aid")).toBe(true);
    expect(isSharedTouringId("transceiver")).toBe(false);
    expect(isSharedTouringId(undefined)).toBe(false);
  });

  it("gives each item one fixed id per trip, as a version 5 UUID", () => {
    const id = sharedTouringGearId(TRIP, "first_aid");
    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(sharedTouringGearId(TRIP, "first_aid")).toBe(id);
    expect(new Set([id, sharedTouringGearId(TRIP, "repair_kit"), sharedTouringGearId(OTHER, "first_aid")]).size).toBe(3);
  });

  it("offers every item while shared gear has none of them", () => {
    const template = buildSharedTouringTemplate(TRIP, [{ id: "gear-tent", description: "Tent" }]);
    expect(template.map((option) => [option.id, option.state])).toEqual([
      ["first_aid", "available"], ["repair_kit", "available"], ["group_shelter", "available"],
    ]);
  });

  it("counts an item added from the template, or one with its name, as in shared gear", () => {
    const template = buildSharedTouringTemplate(TRIP, [
      { id: sharedTouringGearId(TRIP, "first_aid"), description: "First aid kit" },
      // Added by hand, before the template: the name matches however it's written.
      { id: "gear-repair", description: "  repair-KIT " },
    ]);
    expect(template.map((option) => option.state)).toEqual(["added", "added", "available"]);
  });

  it("shows an item under another of its names as listed, so it isn't suggested again", () => {
    const template = buildSharedTouringTemplate(TRIP, [{ id: "gear-bothy", description: "Bothy bag" }, { id: "gear-aid", description: "First aid" }]);
    expect(template.find((option) => option.id === "group_shelter")).toMatchObject({ state: "listed", listedAs: "Bothy bag" });
    expect(template.find((option) => option.id === "first_aid")).toMatchObject({ state: "listed", listedAs: "First aid" });
  });

  it("doesn't count another trip's template row", () => {
    const template = buildSharedTouringTemplate(TRIP, [{ id: sharedTouringGearId(OTHER, "group_shelter"), description: "Shelter" }]);
    expect(template.find((option) => option.id === "group_shelter")?.state).toBe("available");
  });
});

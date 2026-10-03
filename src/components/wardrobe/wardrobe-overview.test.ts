import { describe, expect, it } from "vitest";
import type { WardrobeItem } from "@/types/wardrobe";
import { buildWardrobeOverview } from "./wardrobe-overview";

function createWardrobeItem(id: string, disabled = false): WardrobeItem {
  return {
    id,
    item_id: id,
    item_type: "garment",
    disabled,
    details: {
      brand: "Test Brand",
      model_name: `Model ${id}`,
      category: "mid_layer_light",
      garment_type: "jacket",
      rcl_clo: 0.5,
    },
  };
}

describe("buildWardrobeOverview", () => {
  it("counts an empty wardrobe without calling it all excluded", () => {
    expect(buildWardrobeOverview([])).toEqual({
      totalItems: 0,
      excludedItems: 0,
      allExcluded: false,
      countLine: "0 items",
    });
  });

  it("only mentions exclusion when something is excluded", () => {
    expect(buildWardrobeOverview([createWardrobeItem("a")]).countLine).toBe("1 item");
    expect(
      buildWardrobeOverview([createWardrobeItem("a"), createWardrobeItem("b", true), createWardrobeItem("c")]).countLine
    ).toBe("3 items · 1 excluded from recommendations");
  });

  it("flags a wardrobe where every item is excluded", () => {
    const overview = buildWardrobeOverview([createWardrobeItem("a", true), createWardrobeItem("b", true)]);

    expect(overview.allExcluded).toBe(true);
    expect(overview.countLine).toBe("2 items · 2 excluded from recommendations");
  });
});

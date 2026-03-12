import { describe, expect, it } from "vitest";
import type { WardrobeItem } from "@/types/wardrobe";
import { buildWardrobeOverview } from "./wardrobe-overview";
import { formatBodyPartLabel } from "./wardrobe-utils";

function createWardrobeItem(id: string): WardrobeItem {
  return {
    id,
    item_id: id,
    item_type: "garment",
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
  it("formats canonical body-part keys for display", () => {
    expect(formatBodyPartLabel("headNeck")).toBe("Head + Neck");
  });

  it("returns starter guidance for an empty wardrobe", () => {
    const overview = buildWardrobeOverview({
      wardrobeItems: [],
      groupedWardrobeItems: {},
      disabledItemsByPart: {},
    });

    expect(overview.totalItems).toBe(0);
    expect(overview.coveredBodyParts).toBe(0);
    expect(overview.missingBodyParts).toBe(4);
    expect(overview.headline).toBe("Start building your kit");
    expect(overview.message).toBe("Add a few core pieces to unlock gear-aware recommendations.");
  });

  it("calls out missing zones when coverage is partial", () => {
    const overview = buildWardrobeOverview({
      wardrobeItems: [createWardrobeItem("torso-1"), createWardrobeItem("legs-1")],
      groupedWardrobeItems: {
        torso: [createWardrobeItem("torso-1")],
        legs: [createWardrobeItem("legs-1")],
      },
      disabledItemsByPart: {},
    });

    expect(overview.coveredBodyParts).toBe(2);
    expect(overview.missingLabels).toEqual(["Hands", "Head + Neck"]);
    expect(overview.headline).toBe("Fill 2 remaining gear zones");
    expect(overview.message).toBe("Add Hands and Head + Neck to improve recommendation accuracy.");
  });

  it("surfaces paused items when every zone is represented", () => {
    const pausedHands = createWardrobeItem("hands-1");
    pausedHands.disabled = true;

    const overview = buildWardrobeOverview({
      wardrobeItems: [
        createWardrobeItem("torso-1"),
        createWardrobeItem("legs-1"),
        pausedHands,
        createWardrobeItem("head-1"),
      ],
      groupedWardrobeItems: {
        torso: [createWardrobeItem("torso-1")],
        legs: [createWardrobeItem("legs-1")],
        hands: [],
        "head & neck": [createWardrobeItem("head-1")],
      },
      disabledItemsByPart: {
        hands: [pausedHands],
      },
    });

    expect(overview.coveredBodyParts).toBe(4);
    expect(overview.totalDisabledItems).toBe(1);
    expect(overview.headline).toBe("Your coverage is in good shape");
    expect(overview.message).toBe("All zones are covered. Re-include paused pieces whenever you need them.");
  });
});

import { describe, expect, it } from "vitest";
import { buildPackingListFromDays } from "@/lib/packingList";
import type { DailyLayerPlan } from "@/types/plan";
import type { WardrobeItem } from "@/types/wardrobe";

const DAY: DailyLayerPlan = {
  date: "2026-10-01",
  label: "Thu, Oct 1",
  baseline: {
    minTemp: 30,
    maxTemp: 40,
    maxWindSpeed: 5,
    maxPrecipProbability: 0,
    effectiveTemperature: 30,
    recommendation: {
      torso: { base: [], mid: [{ name: "Fleece jacket" }], outer: [] },
      legs: { base: [], outer: [] },
      hands: { base: [], outer: [] },
      headNeck: { base: [], outer: [] },
    },
  },
  changesFromPreviousDay: null,
  dayparts: [],
  carryItems: [],
};

function garment(id: string, brand: string, model: string, category: string, garmentType: string, disabled = false) {
  return {
    id,
    item_type: "garment",
    item_id: `${id}-garment`,
    disabled,
    details: { brand, model_name: model, category, garment_type: garmentType },
  } as WardrobeItem;
}

/** An owned mid layer with nothing in common with "Fleece jacket". */
const VEST = garment("vest", "Patagonia", "Nano Puff", "insulation_synthetic", "vest");

describe("buildPackingListFromDays", () => {
  it("leaves a slot unmatched when no owned item in its layer has anything in common with it", () => {
    const list = buildPackingListFromDays([DAY], new Map(), [VEST]);

    expect(list.byBodyPart.torso.mid).toEqual([]);
    expect(list.gaps).toEqual([
      expect.objectContaining({ bodyPart: "torso", layerType: "mid", standardOption: "Fleece jacket", suggestions: [] }),
    ]);
  });

  it("matches an owned item that shares words with the slot", () => {
    const fleece = garment("fleece", "Patagonia", "R1 Fleece", "mid_layer_light", "jacket");

    const list = buildPackingListFromDays([DAY], new Map(), [VEST, fleece]);

    expect(list.byBodyPart.torso.mid).toEqual([
      expect.objectContaining({ standardOption: "Fleece jacket", specificItem: "Patagonia R1 Fleece", source: "auto" }),
    ]);
    expect(list.gaps).toEqual([]);
  });

  it("falls back to a matching item excluded from recommendations over an unrelated enabled one", () => {
    const excludedFleece = garment("fleece", "Patagonia", "R1 Fleece", "mid_layer_light", "jacket", true);

    const list = buildPackingListFromDays([DAY], new Map(), [VEST, excludedFleece]);

    expect(list.byBodyPart.torso.mid).toEqual([
      expect.objectContaining({ specificItem: "Patagonia R1 Fleece", source: "auto" }),
    ]);
  });
});

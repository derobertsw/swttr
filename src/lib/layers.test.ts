import { describe, it, expect } from "vitest";
import {
  buildDescentLayers,
  buildRecommendedLayers,
  collectInUseIds,
  garmentsToLayerSet,
  itemCloByBodyPart,
  itemNamesMissingFrom,
} from "./layers";
import type { RecommendedGarment, RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";

describe("garmentsToLayerSet", () => {
  it("maps outer_insulated garments to mid layer", () => {
    const garments: RecommendedGarment[] = [
      {
        id: "insulated-jacket",
        name: "Insulated Jacket",
        category: "outer_insulated",
        rcl: 0.8,
        covers_torso: true,
        covers_legs: false,
      },
    ];

    const torsoLayers = garmentsToLayerSet(garments, "torso");

    expect(torsoLayers.mid).toHaveLength(1);
    expect(torsoLayers.mid?.[0]?.name).toBe("Insulated Jacket");
    expect(torsoLayers.outer).toHaveLength(0);
  });
});

const GARMENTS: RecommendedGarment[] = [
  { id: "g-base", name: "Merino Top", category: "base_layer", rcl: 0.3, rcl_torso: 0.4, covers_torso: true, covers_legs: false },
  { id: "g-shell", name: "Shell Pants", category: "hard_shell", rcl: 0.2, rcl_legs: 0.25, covers_torso: false, covers_legs: true },
];
const CLIMB_GLOVES: RecommendedHandwear = { id: "h-1", name: "Liner Gloves", type: "liner", rcl: 0.3 };
const DESCENT_GLOVES: RecommendedHandwear = { id: "h-2", name: "Ski Mitts", type: "mitten", rcl: 1.1 };
const HEADWEAR: RecommendedHeadwear = {
  head_warmth: { id: "hw-1", name: "Beanie", type: "beanie", rcl: 0.2 },
  neck_warmth: { id: "hw-2", name: "Gaiter", type: "buff_thin", rcl: 0.1 },
  helmet: { id: "hw-3", name: "Helmet", type: "ski_helmet", rcl: 0.3 },
};

describe("buildRecommendedLayers", () => {
  it("places garments by coverage, gloves as outer, and headwear warmth as base under the helmet", () => {
    const layers = buildRecommendedLayers(GARMENTS, CLIMB_GLOVES, HEADWEAR);
    expect(layers.torso.base).toEqual([{ name: "Merino Top", rcl: 0.4, sourceId: "g-base" }]);
    expect(layers.legs.outer).toEqual([{ name: "Shell Pants", rcl: 0.25, sourceId: "g-shell" }]);
    expect(layers.hands.outer.map((i) => i.name)).toEqual(["Liner Gloves"]);
    expect(layers.headNeck.base.map((i) => i.name)).toEqual(["Beanie", "Gaiter"]);
    expect(layers.headNeck.outer.map((i) => i.name)).toEqual(["Helmet"]);
  });
});

describe("buildDescentLayers", () => {
  it("adds pack items to the torso and switches to descent gloves and headwear", () => {
    const layers = buildDescentLayers(
      GARMENTS,
      CLIMB_GLOVES,
      { ...HEADWEAR, helmet: null },
      [{ id: "p-1", name: "Puffy", rcl_clo: 0.9 }],
      DESCENT_GLOVES,
      HEADWEAR
    );
    expect(layers.torso.outer).toEqual([{ name: "Puffy", rcl: 0.9, sourceId: "p-1" }]);
    expect(layers.hands.outer.map((i) => i.name)).toEqual(["Ski Mitts"]);
    expect(layers.headNeck.outer.map((i) => i.name)).toEqual(["Helmet"]);
  });

  it("keeps the climb gloves and headwear when the descent has none of its own", () => {
    const layers = buildDescentLayers(GARMENTS, CLIMB_GLOVES, HEADWEAR, [], null, null);
    expect(layers.hands.outer.map((i) => i.name)).toEqual(["Liner Gloves"]);
    expect(layers.headNeck.base.map((i) => i.name)).toEqual(["Beanie", "Gaiter"]);
  });
});

describe("collectInUseIds and itemCloByBodyPart", () => {
  it("collect every worn item's id and clo per body part", () => {
    const layers = buildRecommendedLayers(GARMENTS, CLIMB_GLOVES, HEADWEAR);
    layers.torso.mid = [{ name: "Unrated fleece" }];

    expect([...collectInUseIds(layers)].sort()).toEqual(["g-base", "g-shell", "h-1", "hw-1", "hw-2", "hw-3"]);
    expect(itemCloByBodyPart(layers)).toEqual({
      torso: [0.4, 0],
      legs: [0.25],
      hands: [0.3],
      headNeck: [0.2, 0.1, 0.3],
    });
  });
});

describe("itemNamesMissingFrom", () => {
  it("lists items worn in one phase but not the other, once each", () => {
    const climb = buildRecommendedLayers(GARMENTS, CLIMB_GLOVES, null);
    const descent = buildDescentLayers(GARMENTS, CLIMB_GLOVES, null, [{ id: "p-1", name: "Puffy", rcl_clo: 0.9 }], DESCENT_GLOVES, null);
    descent.legs.mid = [{ name: "Puffy", sourceId: "p-1" }];

    expect(itemNamesMissingFrom(descent, climb)).toEqual(["Puffy", "Ski Mitts"]);
    expect(itemNamesMissingFrom(climb, descent)).toEqual(["Liner Gloves"]);
  });
});

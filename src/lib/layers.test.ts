import { describe, it, expect } from "vitest";
import { garmentsToLayerSet } from "./layers";
import type { RecommendedGarment } from "@/types/biophysics";

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
    expect(torsoLayers.mid[0].name).toBe("Insulated Jacket");
    expect(torsoLayers.outer).toHaveLength(0);
  });
});

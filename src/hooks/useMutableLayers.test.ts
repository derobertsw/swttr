import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMutableLayers } from "./useMutableLayers";
import type { BiophysicsRecommendation, RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";

function makeMinimalBiophysics(
  garments: BiophysicsRecommendation["recommendation"]["garments"] = []
): BiophysicsRecommendation {
  return {
    recommendation: { garments },
    biophysics: {} as BiophysicsRecommendation["biophysics"],
  } as BiophysicsRecommendation;
}

const HANDWEAR_A: RecommendedHandwear = {
  id: "glove-a",
  name: "Glove A",
  rcl: 0.5,
};

const HANDWEAR_B: RecommendedHandwear = {
  id: "glove-b",
  name: "Glove B",
  rcl: 0.8,
};

const HEADWEAR_A: RecommendedHeadwear = {
  head_warmth: { id: "beanie-a", name: "Beanie A", rcl: 0.2 },
  neck_warmth: null,
  helmet: null,
};

const HEADWEAR_B: RecommendedHeadwear = {
  head_warmth: { id: "beanie-b", name: "Beanie B", rcl: 0.4 },
  neck_warmth: { id: "gaiter-b", name: "Gaiter B", rcl: 0.15 },
  helmet: null,
};

describe("useMutableLayers", () => {
  it("initialises hands layers from handwear prop", () => {
    const bio = makeMinimalBiophysics();
    const { result } = renderHook(() =>
      useMutableLayers(bio, HANDWEAR_A, null)
    );

    expect(result.current.mutableLayers.hands.outer).toHaveLength(1);
    expect(result.current.mutableLayers.hands.outer[0].name).toBe("Glove A");
  });

  it("initialises headNeck layers from headwear prop", () => {
    const bio = makeMinimalBiophysics();
    const { result } = renderHook(() =>
      useMutableLayers(bio, null, HEADWEAR_A)
    );

    expect(result.current.mutableLayers.headNeck.base).toHaveLength(1);
    expect(result.current.mutableLayers.headNeck.base[0].name).toBe("Beanie A");
  });

  it("rebuilds layers when handwear changes without garments changing", () => {
    const bio = makeMinimalBiophysics();
    const { result, rerender } = renderHook(
      ({ handwear }) => useMutableLayers(bio, handwear, null),
      { initialProps: { handwear: HANDWEAR_A as RecommendedHandwear | null } }
    );

    expect(result.current.mutableLayers.hands.outer[0].name).toBe("Glove A");

    rerender({ handwear: HANDWEAR_B });

    expect(result.current.mutableLayers.hands.outer[0].name).toBe("Glove B");
    expect(result.current.mutableLayers.hands.outer[0].rcl).toBe(0.8);
  });

  it("rebuilds layers when headwear changes without garments changing", () => {
    const bio = makeMinimalBiophysics();
    const { result, rerender } = renderHook(
      ({ headwear }) => useMutableLayers(bio, null, headwear),
      { initialProps: { headwear: HEADWEAR_A as RecommendedHeadwear | null } }
    );

    expect(result.current.mutableLayers.headNeck.base).toHaveLength(1);

    rerender({ headwear: HEADWEAR_B });

    expect(result.current.mutableLayers.headNeck.base).toHaveLength(2);
    expect(result.current.mutableLayers.headNeck.base[0].name).toBe("Beanie B");
    expect(result.current.mutableLayers.headNeck.base[1].name).toBe("Gaiter B");
  });

  it("recalculates original clo baselines when extremities change", () => {
    const bio = makeMinimalBiophysics();
    const { result, rerender } = renderHook(
      ({ handwear }) => useMutableLayers(bio, handwear, null),
      { initialProps: { handwear: HANDWEAR_A as RecommendedHandwear | null } }
    );

    // Initial delta should be 0
    expect(result.current.layerEditDelta.hands).toBe(0);

    rerender({ handwear: HANDWEAR_B });

    // After rebuild, delta should still be 0 (baseline reset to new value)
    expect(result.current.layerEditDelta.hands).toBe(0);
  });

  it("tracks in-use item IDs from all body parts including extremities", () => {
    const bio = makeMinimalBiophysics();
    const { result } = renderHook(() =>
      useMutableLayers(bio, HANDWEAR_A, HEADWEAR_A)
    );

    expect(result.current.inUseItemIds.has("glove-a")).toBe(true);
    expect(result.current.inUseItemIds.has("beanie-a")).toBe(true);
  });

  it("addItem and removeItem work for extremity body parts", () => {
    const bio = makeMinimalBiophysics();
    const { result } = renderHook(() =>
      useMutableLayers(bio, null, null)
    );

    expect(result.current.mutableLayers.hands.outer).toHaveLength(0);

    act(() => {
      result.current.addItem("hands", "outer", {
        name: "New Glove",
        rcl: 0.6,
        sourceId: "new-glove",
      });
    });

    expect(result.current.mutableLayers.hands.outer).toHaveLength(1);
    expect(result.current.mutableLayers.hands.outer[0].name).toBe("New Glove");

    act(() => {
      result.current.removeItem("hands", "outer", 0);
    });

    expect(result.current.mutableLayers.hands.outer).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEditableLayers } from "./useEditableLayers";
import { buildRecommendedLayers, type BodyPartLayers } from "@/lib/layers";
import type { RecommendedHandwear, RecommendedHeadwear } from "@/types/biophysics";

const HANDWEAR_A: RecommendedHandwear = { id: "glove-a", name: "Glove A", type: "insulated", rcl: 0.5 };
const HANDWEAR_B: RecommendedHandwear = { id: "glove-b", name: "Glove B", type: "insulated", rcl: 0.8 };

const HEADWEAR_A: RecommendedHeadwear = {
  head_warmth: { id: "beanie-a", name: "Beanie A", type: "beanie", rcl: 0.2 },
  neck_warmth: null,
  helmet: null,
};

const HEADWEAR_B: RecommendedHeadwear = {
  head_warmth: { id: "beanie-b", name: "Beanie B", type: "beanie", rcl: 0.4 },
  neck_warmth: { id: "gaiter-b", name: "Gaiter B", type: "neck_gaiter", rcl: 0.15 },
  helmet: null,
};

function useLayersFor(handwear: RecommendedHandwear | null, headwear: RecommendedHeadwear | null) {
  // Rebuilt every render, as a caller without memoization would.
  return useEditableLayers(buildRecommendedLayers([], handwear, headwear));
}

describe("useEditableLayers", () => {
  it("starts from the initial layers", () => {
    const { result } = renderHook(() => useLayersFor(HANDWEAR_A, HEADWEAR_A));
    expect(result.current.layers.hands.outer[0].name).toBe("Glove A");
    expect(result.current.layers.headNeck.base[0].name).toBe("Beanie A");
  });

  it("keeps edits when equal initial layers are rebuilt", () => {
    const { result, rerender } = renderHook(() => useLayersFor(HANDWEAR_A, null));

    act(() => result.current.addItem("hands", "base", { name: "Liner", rcl: 0.1 }));
    rerender();

    expect(result.current.layers.hands.base.map((i) => i.name)).toEqual(["Liner"]);
  });

  it("resets to new initial layers when the recommendation changes", () => {
    const { result, rerender } = renderHook(
      ({ handwear, headwear }) => useLayersFor(handwear, headwear),
      { initialProps: { handwear: HANDWEAR_A, headwear: HEADWEAR_A } }
    );

    act(() => result.current.addItem("hands", "base", { name: "Liner", rcl: 0.1 }));
    rerender({ handwear: HANDWEAR_B, headwear: HEADWEAR_B });

    expect(result.current.layers.hands.base).toEqual([]);
    expect(result.current.layers.hands.outer[0]).toMatchObject({ name: "Glove B", rcl: 0.8 });
    expect(result.current.layers.headNeck.base.map((i) => i.name)).toEqual(["Beanie B", "Gaiter B"]);
  });

  it("adds, replaces, and removes items", () => {
    const { result } = renderHook(() => useLayersFor(null, null));

    act(() => result.current.addItem("hands", "outer", { name: "New Glove", rcl: 0.6 }));
    act(() => result.current.replaceItem("hands", "outer", 0, { name: "Mitt", rcl: 1.2 }));
    expect(result.current.layers.hands.outer).toEqual([{ name: "Mitt", rcl: 1.2 }]);

    act(() => result.current.removeItem("hands", "outer", 0));
    expect(result.current.layers.hands.outer).toEqual([]);
  });

  it("ignores out-of-range edits without changing state", () => {
    const { result } = renderHook(() => useLayersFor(HANDWEAR_A, null));
    const before = result.current.layers;

    act(() => result.current.removeItem("hands", "outer", 5));
    act(() => result.current.replaceItem("hands", "outer", -1, { name: "Nope" }));
    act(() => result.current.moveItem("hands", "base", 0, "outer"));

    expect(result.current.layers).toBe(before);
  });

  it("moves an item to another layer type and copies a layer", () => {
    const initial: BodyPartLayers = {
      torso: { base: [{ name: "Tee" }], mid: [{ name: "Fleece" }], outer: [] },
      legs: { base: [], mid: [], outer: [] },
      hands: { base: [], mid: [], outer: [] },
      headNeck: { base: [], mid: [], outer: [] },
    };
    const { result } = renderHook(() => useEditableLayers(initial));

    act(() => result.current.moveItem("torso", "mid", 0, "outer"));
    expect(result.current.layers.torso).toMatchObject({ mid: [], outer: [{ name: "Fleece" }] });

    act(() => result.current.setLayerItems("legs", "base", [{ name: "Tights" }]));
    expect(result.current.layers.legs.base).toEqual([{ name: "Tights" }]);
  });
});

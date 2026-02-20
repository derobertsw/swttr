import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLayerPicker } from "./useLayerPicker";
import type { WardrobeItem, AvailableItem } from "@/types/wardrobe";

vi.mock("@/hooks/useUserId", () => ({
  useUserId: vi.fn(() => "user-1"),
}));

function makeWardrobeItem(
  overrides: Partial<WardrobeItem> & { item_type: WardrobeItem["item_type"]; item_id: string }
): WardrobeItem {
  return {
    id: overrides.item_id,
    item_type: overrides.item_type,
    item_id: overrides.item_id,
    nickname: overrides.nickname,
    disabled: overrides.disabled,
    details: {
      brand: "TestBrand",
      model_name: "TestModel",
      ...overrides.details,
    },
  };
}

const GLOVE_WARDROBE: WardrobeItem = makeWardrobeItem({
  item_type: "handwear",
  item_id: "glove-1",
  details: {
    brand: "BrandH",
    model_name: "Warm Glove",
    handwear_type: "insulated",
    rcl_clo: 0.55,
  },
});

const BEANIE_WARDROBE: WardrobeItem = makeWardrobeItem({
  item_type: "headwear",
  item_id: "beanie-1",
  details: {
    brand: "BrandHead",
    model_name: "Fleece Beanie",
    headwear_type: "beanie",
    rcl_clo: 0.22,
  },
});

const JACKET_WARDROBE: WardrobeItem = makeWardrobeItem({
  item_type: "garment",
  item_id: "jacket-1",
  details: {
    brand: "BrandJ",
    model_name: "Mid Layer",
    category: "mid_layer_heavy",
    garment_type: "jacket",
    garment_thermal_properties: { rcl_whole_body: 0.8, rcl_torso: 0.85, rcl_legs: 0 },
  },
});

function mockFetchResponses(
  wardrobeItems: WardrobeItem[],
  availableItems: AvailableItem[] = []
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/api/wardrobe/gear")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: wardrobeItems }),
        });
      }
      if (url.includes("/api/wardrobe/available")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: availableItems }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    })
  );
}

describe("useLayerPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("includes handwear items when querying hands body part", async () => {
    mockFetchResponses([GLOVE_WARDROBE, JACKET_WARDROBE]);

    const { result } = renderHook(() =>
      useLayerPicker(new Set())
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { wardrobeItems } = result.current.getItems("hands", "outer");
    expect(wardrobeItems).toHaveLength(1);
    expect(wardrobeItems[0].id).toBe("glove-1");
    expect(wardrobeItems[0].name).toBe("Warm Glove");
  });

  it("includes headwear items when querying headNeck body part", async () => {
    mockFetchResponses([BEANIE_WARDROBE, JACKET_WARDROBE]);

    const { result } = renderHook(() =>
      useLayerPicker(new Set())
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { wardrobeItems } = result.current.getItems("headNeck", "base");
    expect(wardrobeItems).toHaveLength(1);
    expect(wardrobeItems[0].id).toBe("beanie-1");
  });

  it("headwear is compatible with both base and mid layer slots", async () => {
    mockFetchResponses([BEANIE_WARDROBE]);

    const { result } = renderHook(() =>
      useLayerPicker(new Set())
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // headwear defaults to "base", which is compatible with base and mid
    const base = result.current.getItems("headNeck", "base");
    const mid = result.current.getItems("headNeck", "mid");
    expect(base.wardrobeItems).toHaveLength(1);
    expect(mid.wardrobeItems).toHaveLength(1);
  });

  it("does not include handwear in torso results", async () => {
    mockFetchResponses([GLOVE_WARDROBE, JACKET_WARDROBE]);

    const { result } = renderHook(() =>
      useLayerPicker(new Set())
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { wardrobeItems } = result.current.getItems("torso", "mid");
    expect(wardrobeItems.every((item) => item.id !== "glove-1")).toBe(true);
  });

  it("marks items as in-use when their IDs are in the set", async () => {
    mockFetchResponses([GLOVE_WARDROBE]);

    const { result } = renderHook(() =>
      useLayerPicker(new Set(["glove-1"]))
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { wardrobeItems } = result.current.getItems("hands", "outer");
    expect(wardrobeItems[0].isInUse).toBe(true);
  });
});

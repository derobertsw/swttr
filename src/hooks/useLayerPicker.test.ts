import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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
    garment_thermal_properties: {
      garment_id: "jacket-1",
      rcl_whole_body: 0.8,
      rcl_torso: 0.85,
      rcl_legs: 0,
      estimation_method: "lab_tested",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
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
  it('preserves partial coverage and estimate metadata and keeps missing regional warmth unknown', async () => {
    mockFetchResponses([{
      ...JACKET_WARDROBE,
      details: { ...JACKET_WARDROBE.details, garment_thermal_properties: undefined },
    }], [{
      id: 'shorts', type: 'garment', brand: 'SWTTR', model_name: 'Shorts',
      category: 'base_layer', garment_type: 'shorts', usage: 'standalone', coverage_legs: 0.3,
      rcl_clo: 0.02, rcl_legs: 0.06, thermal_provenance: { generic_estimate: true },
    }, {
      id: 'unknown-pants', type: 'garment', brand: 'Example', model_name: 'Unknown pants',
      category: 'base_layer', garment_type: 'pants', rcl_clo: 0.8,
    }]);
    const { result } = renderHook(() => useLayerPicker(new Set()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { recommendedItems } = result.current.getItems('legs', 'base', 0);
    expect(recommendedItems[0]).toMatchObject({ id: 'shorts', item_type: 'garment', usage: 'standalone', coverage_legs: 0.3, rcl: 0.06, thermal_provenance: { generic_estimate: true } });
    expect(recommendedItems[1].rcl).toBeUndefined();
    expect(result.current.getItems('torso', 'mid').wardrobeItems[0].rcl).toBeUndefined();
  });
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

  it("lists a catalog item under the wardrobe after it's added and the wardrobe reloads", async () => {
    const catalogGlove: AvailableItem = {
      id: "glove-1",
      type: "handwear",
      brand: "BrandH",
      model_name: "Warm Glove",
      category: "",
      rcl_clo: 0.55,
    };
    mockFetchResponses([], [catalogGlove]);
    const { result } = renderHook(() => useLayerPicker(new Set()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getItems("hands", "outer").recommendedItems.map((item) => item.id)).toEqual(["glove-1"]);

    mockFetchResponses([GLOVE_WARDROBE], [catalogGlove]);
    act(() => result.current.reload());

    await waitFor(() =>
      expect(result.current.getItems("hands", "outer").wardrobeItems.map((item) => item.id)).toEqual(["glove-1"])
    );
    expect(result.current.getItems("hands", "outer").recommendedItems).toEqual([]);
  });

  describe("when loading fails", () => {
    const catalogHeadband: AvailableItem = {
      id: "headband-1",
      type: "headwear",
      brand: "BrandHead",
      model_name: "Headband",
      category: "",
      rcl_clo: 0.1,
    };

    /** Fails `failing` URLs (500, or a network error) and serves the rest. */
    function mockFetchFailing(failing: Record<string, "500" | "network">) {
      const fetchMock = vi.fn((url: string) => {
        const failure = Object.entries(failing).find(([path]) => url.includes(path))?.[1];
        if (failure === "network") return Promise.reject(new TypeError("Failed to fetch"));
        if (failure === "500") return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "boom" }) });
        const items = url.includes("/api/wardrobe/gear") ? [BEANIE_WARDROBE] : [catalogHeadband];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    const headNeckIds = (result: { current: ReturnType<typeof useLayerPicker> }) => {
      const { wardrobeItems, recommendedItems } = result.current.getItems("headNeck", "base");
      return { wardrobe: wardrobeItems.map((item) => item.id), other: recommendedItems.map((item) => item.id) };
    };

    it("keeps the loaded items when a reload fails", async () => {
      mockFetchFailing({});
      const { result } = renderHook(() => useLayerPicker(new Set()));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(headNeckIds(result)).toEqual({ wardrobe: ["beanie-1"], other: ["headband-1"] });

      const fetchMock = mockFetchFailing({ "/api/wardrobe/gear": "network", "/api/wardrobe/available": "500" });
      act(() => result.current.reload());
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      await act(async () => {});

      expect(headNeckIds(result)).toEqual({ wardrobe: ["beanie-1"], other: ["headband-1"] });
    });

    it("shows the wardrobe when only the catalog fails on the first load", async () => {
      mockFetchFailing({ "/api/wardrobe/available": "500" });
      const { result } = renderHook(() => useLayerPicker(new Set()));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(headNeckIds(result)).toEqual({ wardrobe: ["beanie-1"], other: [] });
    });
  });
});

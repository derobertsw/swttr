import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";
const mockGetSupabase = vi.mocked(getSupabase);

function makeOrderedQuery<T>(data: T[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn(),
  };

  builder.order
    .mockReturnValueOnce(builder)
    .mockResolvedValueOnce({ data, error: null });

  return builder;
}

describe("Wardrobe Available API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty items when database is not configured", async () => {
    mockGetSupabase.mockReturnValue(null);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toEqual([]);
  });

  it("normalizes garment rcl values from object and array relationship shapes", async () => {
    const garmentsQuery = makeOrderedQuery([
      {
        id: "g-object",
        brand: "BrandA",
        model_name: "Object Shape",
        category: "mid_layer_heavy",
        garment_type: "jacket",
        garment_thermal_properties: { rcl_whole_body: "0.62" },
      },
      {
        id: "g-array",
        brand: "BrandB",
        model_name: "Array Shape",
        category: "base_layer",
        garment_type: "pants",
        garment_thermal_properties: [{ rcl_whole_body: 0.31 }],
      },
    ]);

    const handwearQuery = makeOrderedQuery([
      {
        id: "h1",
        brand: "HandBrand",
        model_name: "Warm Gloves",
        handwear_type: "insulated",
        rcl_clo: 0.44,
        dexterity_score: 7,
      },
    ]);

    const headwearQuery = makeOrderedQuery([
      {
        id: "hd1",
        brand: "HeadBrand",
        model_name: "Beanie",
        headwear_type: "beanie",
        rcl_clo: 0.18,
        covers_ears: true,
        covers_neck: false,
        covers_face: false,
      },
    ]);

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "garments") return garmentsQuery;
        if (table === "handwear") return handwearQuery;
        if (table === "headwear") return headwearQuery;
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

    const response = await GET();
    const payload = await response.json();
    const items = payload.items as Array<Record<string, unknown>>;

    const objectShapeGarment = items.find((item) => item.id === "g-object");
    const arrayShapeGarment = items.find((item) => item.id === "g-array");

    expect(response.status).toBe(200);
    expect(objectShapeGarment?.rcl_clo).toBe(0.62);
    expect(arrayShapeGarment?.rcl_clo).toBe(0.31);
  });
});


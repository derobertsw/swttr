import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from 'next/server';
import { POST as evaluate } from '@/app/api/v1/ensembles/evaluate/route';
import { createFakeSupabase } from '@/test/fakeSupabase';
import catalog from '@/test/fixtures/gear-catalog.json';
import { GET } from "./route";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "@/lib/supabase";
const mockGetSupabase = vi.mocked(getSupabase);

function makeOrderedQuery<T>(data: T[] | null, error: { message: string } | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn(),
  };

  builder.order
    .mockReturnValueOnce(builder)
    .mockResolvedValueOnce({ data, error });

  return builder;
}

describe("Wardrobe Available API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the catalog as unavailable when the database is not configured", async () => {
    mockGetSupabase.mockReturnValue(null);

    const response = await GET();

    expect(response.status).toBe(503);
    expect((await response.json()).items).toBeUndefined();
  });

  it("fails instead of returning a partial catalog when a query errors", async () => {
    const queries: Record<string, ReturnType<typeof makeOrderedQuery>> = {
      garments: makeOrderedQuery([{ id: "g1", brand: "A", model_name: "Shell" }]),
      handwear: makeOrderedQuery(null, { message: "timeout" }),
      headwear: makeOrderedQuery([]),
    };
    mockGetSupabase.mockReturnValue({
      from: vi.fn((table: string) => queries[table]),
    } as unknown as ReturnType<typeof getSupabase>);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect((await response.json()).items).toBeUndefined();
  });

  it.each(['complete', 'missing arm evaporation', 'missing whole body', 'uncovered torso'])('agrees with evaluation about %s warmth', async kind => {
    const base = catalog.garments.find(g => g.covers_torso && g.covers_arms)!;
    const garment = {
      ...base,
      covers_torso: kind !== 'uncovered torso',
      garment_thermal_properties: [{ ...base.garment_thermal_properties,
        ...(kind === 'missing arm evaporation' ? { recl_arms: null } : {}),
        ...(kind === 'missing whole body' ? { rcl_whole_body: null } : {}),
      }],
    };
    mockGetSupabase.mockReturnValue(createFakeSupabase({ garments: [garment] }) as unknown as ReturnType<typeof getSupabase>);
    const { items: [item] } = await (await GET()).json();
    const result = await evaluate(new NextRequest('http://localhost/api/v1/ensembles/evaluate', {
      method: 'POST', body: JSON.stringify({ phases: [{
        items: { torso: [{ sourceId: garment.id, item_type: 'garment' }], legs: [], hands: [], headNeck: [] }, targets: {},
      }] }),
    }));
    expect(result.status).toBe(200);
    const { phases: [phase] } = await result.json();
    if (kind === 'complete') {
      expect(item.thermal_data_status).toBe('known');
      expect(phase.items.torso[0].rcl).toBe(item.rcl_torso);
    } else {
      expect(item.rcl_torso).toBeUndefined();
      expect(phase.thermal_data_status).toBe('unknown');
      if (kind !== 'uncovered torso') expect(item.thermal_data_status).toBe('unknown');
    }
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


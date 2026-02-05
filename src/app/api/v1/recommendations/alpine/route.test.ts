import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from '@/lib/supabase';
const mockGetSupabase = vi.mocked(getSupabase);

const createMockGarment = (overrides: Record<string, unknown> = {}) => ({
  id: 'garment-1',
  brand: 'TestBrand',
  model_name: 'TestModel',
  category: 'base_layer',
  covers_torso: true,
  covers_arms: true,
  covers_legs: false,
  weight_grams: 200,
  garment_thermal_properties: {
    rcl_torso: 0.2,
    rcl_arms: 0.1,
    rcl_legs: 0,
    rcl_whole_body: 0.15,
    recl_torso: 0.02,
    recl_arms: 0.01,
    recl_legs: 0,
    recl_whole_body: 0.015,
    evap_potential: 0.3,
  },
  garment_protection: {
    windproof_rating: 'none',
    waterproof_rating: 'none',
    waterproof_mm: 0,
  },
  garment_activity_ratings: {
    alpine_skiing_score: 8,
  },
  ...overrides,
});

const createMockSupabase = (options: { garments?: unknown[]; wardrobeIds?: string[] } = {}) => {
  const { garments = [], wardrobeIds = [] } = options;

  let currentTable = '';

  const chainableMock = {
    select: vi.fn(() => chainableMock),
    eq: vi.fn(() => chainableMock),
    in: vi.fn(() => chainableMock),
    gte: vi.fn(() => chainableMock),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chainableMock as any).then = (resolve: (value: { data: unknown; error: unknown }) => void) => {
    if (currentTable === 'user_wardrobe') {
      resolve({
        data: wardrobeIds.map((id) => ({ item_id: id })),
        error: null,
      });
    } else if (currentTable === 'garments') {
      resolve({
        data: garments,
        error: null,
      });
    } else if (currentTable === 'handwear') {
      resolve({ data: [], error: null });
    } else if (currentTable === 'headwear') {
      resolve({ data: [], error: null });
    } else {
      resolve({ data: [], error: null });
    }
    return Promise.resolve();
  };

  return {
    from: vi.fn((table: string) => {
      currentTable = table;
      return chainableMock;
    }),
  };
};

const createRequest = (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
  return new NextRequest('http://localhost:3000/api/v1/recommendations/alpine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
};

describe('Alpine Recommendations API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include torso and legs mid/insulation items when available', async () => {
    const garments = [
      createMockGarment({
        id: 'base-torso',
        model_name: 'Torso Base',
        category: 'base_layer',
        covers_torso: true,
        covers_legs: false,
        garment_thermal_properties: { rcl_whole_body: 0.1, evap_potential: 0.3 },
      }),
      createMockGarment({
        id: 'base-legs',
        model_name: 'Legs Base',
        category: 'base_layer',
        covers_torso: false,
        covers_legs: true,
        garment_thermal_properties: { rcl_whole_body: 0.1, evap_potential: 0.3 },
      }),
      createMockGarment({
        id: 'mid-torso',
        model_name: 'Torso Mid',
        category: 'mid_layer_light',
        covers_torso: true,
        covers_legs: false,
        garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.25 },
      }),
      createMockGarment({
        id: 'ins-legs',
        model_name: 'Legs Insulation',
        category: 'insulation_synthetic',
        covers_torso: false,
        covers_legs: true,
        garment_thermal_properties: { rcl_whole_body: 0.2, evap_potential: 0.2 },
      }),
      createMockGarment({
        id: 'shell-torso',
        model_name: 'Torso Shell',
        category: 'hard_shell',
        covers_torso: true,
        covers_legs: false,
        garment_thermal_properties: { rcl_whole_body: 0.1, evap_potential: 0.15 },
        garment_protection: { waterproof_mm: 20000 },
      }),
      createMockGarment({
        id: 'shell-legs',
        model_name: 'Legs Shell',
        category: 'hard_shell',
        covers_torso: false,
        covers_legs: true,
        garment_thermal_properties: { rcl_whole_body: 0.1, evap_potential: 0.15 },
        garment_protection: { waterproof_mm: 18000 },
      }),
    ];

    const mockSupabase = createMockSupabase({ garments });
    mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

    const request = createRequest({
      weather: { temperature: 15, wind_speed: 10 },
    });

    const response = await POST(request);
    const data = await response.json();

    const rec = data.recommendation as { garments: Array<{ name: string }> };
    const names = rec.garments.map((g) => g.name);

    expect(names).toContain('TestBrand Torso Mid');
    expect(names).toContain('TestBrand Legs Insulation');
  });
});

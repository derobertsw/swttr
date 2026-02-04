import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from '@/lib/supabase';
const mockGetSupabase = vi.mocked(getSupabase);

// Test fixtures
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
    rcl_torso: 0.3,
    rcl_arms: 0.2,
    rcl_legs: 0,
    rcl_whole_body: 0.25,
    recl_torso: 0.03,
    recl_arms: 0.02,
    recl_legs: 0,
    recl_whole_body: 0.025,
    evap_potential: 0.35,
  },
  garment_protection: {
    windproof_rating: 'none',
    waterproof_rating: 'none',
  },
  garment_activity_ratings: {
    ski_touring_uphill_score: 8,
    ski_touring_downhill_score: 6,
  },
  ...overrides,
});

const createMockLegsBaseLayer = () => ({
  id: 'garment-legs-1',
  brand: 'TestBrand',
  model_name: 'Tights',
  category: 'base_layer',
  covers_torso: false,
  covers_arms: false,
  covers_legs: true,
  weight_grams: 150,
  garment_thermal_properties: {
    rcl_torso: 0,
    rcl_arms: 0,
    rcl_legs: 0.3,
    rcl_whole_body: 0.15,
    evap_potential: 0.30,
  },
  garment_protection: {
    windproof_rating: 'none',
    waterproof_rating: 'none',
  },
  garment_activity_ratings: {
    ski_touring_uphill_score: 8,
    ski_touring_downhill_score: 7,
  },
});

const createMockInsulation = () => ({
  id: 'garment-ins-1',
  brand: 'TestBrand',
  model_name: 'Puffy',
  category: 'insulation_synthetic',
  covers_torso: true,
  covers_arms: true,
  covers_legs: false,
  weight_grams: 350,
  garment_thermal_properties: {
    rcl_torso: 1.2,
    rcl_arms: 0.8,
    rcl_legs: 0,
    rcl_whole_body: 0.8,
    evap_potential: 0.15,
  },
  garment_protection: {
    windproof_rating: 'partial',
    waterproof_rating: 'none',
  },
  garment_activity_ratings: {
    ski_touring_uphill_score: 4,
    ski_touring_downhill_score: 9,
  },
});

const createMockSoftShell = () => ({
  id: 'garment-shell-1',
  brand: 'TestBrand',
  model_name: 'Soft Shell',
  category: 'soft_shell',
  covers_torso: true,
  covers_arms: true,
  covers_legs: false,
  weight_grams: 300,
  garment_thermal_properties: {
    rcl_torso: 0.4,
    rcl_arms: 0.3,
    rcl_legs: 0,
    rcl_whole_body: 0.3,
    evap_potential: 0.22,
  },
  garment_protection: {
    windproof_rating: 'full',
    waterproof_rating: 'none',
  },
  garment_activity_ratings: {
    ski_touring_uphill_score: 7,
    ski_touring_downhill_score: 8,
  },
});

const createMockHandwear = () => ({
  id: 'handwear-1',
  brand: 'TestBrand',
  model_name: 'Gloves',
  handwear_type: 'insulated_glove',
  rcl_clo: 1.5,
  dexterity_score: 7,
  waterproof: true,
  windproof: true,
  min_temp_active: -15,
  min_temp_static: -5,
});

const createMockHeadwear = () => [
  {
    id: 'headwear-1',
    brand: 'TestBrand',
    model_name: 'Beanie',
    headwear_type: 'midweight_beanie',
    rcl_clo: 0.8,
    covers_ears: true,
    covers_neck: false,
    covers_face: false,
    min_temp_active: -20,
  },
  {
    id: 'headwear-2',
    brand: 'TestBrand',
    model_name: 'Helmet',
    headwear_type: 'ski_helmet',
    rcl_clo: 0.5,
    covers_ears: true,
    covers_neck: false,
    covers_face: false,
  },
  {
    id: 'headwear-3',
    brand: 'TestBrand',
    model_name: 'Buff',
    headwear_type: 'buff_thin',
    rcl_clo: 0.2,
    covers_ears: false,
    covers_neck: true,
    covers_face: false,
  },
];

// Helper to create a chainable mock that properly returns promises
const createMockSupabase = (options: {
  garments?: unknown[];
  handwear?: unknown[];
  headwear?: unknown[];
  wardrobeIds?: string[];
  error?: { message: string } | null;
} = {}) => {
  const {
    garments = [createMockGarment(), createMockLegsBaseLayer(), createMockInsulation(), createMockSoftShell()],
    handwear = [createMockHandwear()],
    headwear = createMockHeadwear(),
    wardrobeIds = [],
    error = null,
  } = options;

  // Create a mock that tracks which table is being queried
  let currentTable = '';

  const chainableMock = {
    select: vi.fn(() => chainableMock),
    eq: vi.fn(() => chainableMock),
    in: vi.fn(() => chainableMock),
    gte: vi.fn(() => chainableMock),
  };

  // Override the mock to return the correct data when awaited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chainableMock as any).then = (resolve: (value: { data: unknown; error: unknown }) => void) => {
    if (currentTable === 'user_wardrobe') {
      resolve({
        data: wardrobeIds.map(id => ({ item_id: id })),
        error: null,
      });
    } else if (currentTable === 'garments') {
      resolve({
        data: error ? null : garments,
        error,
      });
    } else if (currentTable === 'handwear') {
      resolve({
        data: handwear,
        error: null,
      });
    } else if (currentTable === 'headwear') {
      resolve({
        data: headwear,
        error: null,
      });
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

// Helper to create mock request
const createRequest = (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
  return new NextRequest('http://localhost:3000/api/v1/recommendations/ski-touring', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
};

describe('Ski Touring Recommendations API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Validation', () => {
    describe('database configuration', () => {
      it('should return 503 when database is not configured', async () => {
        mockGetSupabase.mockReturnValue(null);

        const request = createRequest({
          weather: { temperature: 25, wind_speed: 10 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(503);
        expect(data.error).toBe('Database not configured');
      });
    });

    describe('missing weather data', () => {
      it('should return 400 when weather object is missing', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({});

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('weather.temperature and weather.wind_speed are required');
      });

      it('should return 400 when temperature is missing', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { wind_speed: 10 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('weather.temperature and weather.wind_speed are required');
      });

      it('should return 400 when wind_speed is missing', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 25 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('weather.temperature and weather.wind_speed are required');
      });
    });

    describe('edge case weather values', () => {
      it('should accept wind_speed of 0', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 25, wind_speed: 0 },
        });

        const response = await POST(request);

        // Should not return 400 for missing wind_speed when value is 0
        expect(response.status).not.toBe(400);
      });

      // Note: The current validation uses falsy check for temperature,
      // which means temperature of 0 is incorrectly rejected.
      // This test documents the current behavior.
      it('should reject temperature of 0 due to falsy check (known limitation)', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 0, wind_speed: 10 },
        });

        const response = await POST(request);
        const data = await response.json();

        // Current behavior: 0 is treated as falsy/missing
        // This could be considered a bug - temperature 0°F is valid
        expect(response.status).toBe(400);
        expect(data.error).toBe('weather.temperature and weather.wind_speed are required');
      });

      it('should handle negative temperatures', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: -20, wind_speed: 15 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.conditions.temperature).toBe('-20°F');
      });

      it('should handle high wind speeds', async () => {
        const mockSupabase = createMockSupabase();
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 20, wind_speed: 50 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.conditions.wind_speed).toBe('50 mph');
      });
    });
  });

  describe('Successful Recommendation Generation', () => {
    it('should return 200 with valid weather input', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10 },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
    });

    it('should include conditions in response', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10, precipitation: true },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.conditions).toBeDefined();
      expect(data.conditions.temperature).toBe('25°F');
      expect(data.conditions.wind_speed).toBe('10 mph');
      expect(data.conditions.precipitation).toBe(true);
    });

    it('should handle optional humidity parameter', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10, humidity: 75 },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle prioritize_light_pack option', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10 },
        prioritize_light_pack: true,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Response Structure - BiophysicsRecommendation Format', () => {
    let responseData: Record<string, unknown>;

    beforeEach(async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 20, wind_speed: 8, humidity: 50, precipitation: false },
      });

      const response = await POST(request);
      responseData = await response.json();
    });

    describe('conditions', () => {
      it('should include temperature formatted with unit', () => {
        expect(responseData.conditions).toBeDefined();
        const conditions = responseData.conditions as Record<string, unknown>;
        expect(conditions.temperature).toBe('20°F');
      });

      it('should include wind_speed formatted with unit', () => {
        const conditions = responseData.conditions as Record<string, unknown>;
        expect(conditions.wind_speed).toBe('8 mph');
      });

      it('should include precipitation boolean', () => {
        const conditions = responseData.conditions as Record<string, unknown>;
        expect(conditions.precipitation).toBe(false);
      });
    });

    describe('ireq', () => {
      it('should include uphill IREQ values', () => {
        expect(responseData.ireq).toBeDefined();
        const ireq = responseData.ireq as Record<string, unknown>;
        expect(ireq.uphill).toBeDefined();
        const uphill = ireq.uphill as Record<string, number>;
        expect(typeof uphill.min).toBe('number');
        expect(typeof uphill.neutral).toBe('number');
        expect(uphill.neutral).toBeGreaterThanOrEqual(uphill.min);
      });

      it('should include downhill IREQ values', () => {
        const ireq = responseData.ireq as Record<string, unknown>;
        expect(ireq.downhill).toBeDefined();
        const downhill = ireq.downhill as Record<string, number>;
        expect(typeof downhill.min).toBe('number');
        expect(typeof downhill.neutral).toBe('number');
        expect(downhill.neutral).toBeGreaterThanOrEqual(downhill.min);
      });

      it('should include target_range as [min, max] tuple', () => {
        const ireq = responseData.ireq as Record<string, unknown>;
        expect(ireq.target_range).toBeDefined();
        const targetRange = ireq.target_range as [number, number];
        expect(Array.isArray(targetRange)).toBe(true);
        expect(targetRange).toHaveLength(2);
        expect(typeof targetRange[0]).toBe('number');
        expect(typeof targetRange[1]).toBe('number');
        expect(targetRange[1]).toBeGreaterThanOrEqual(targetRange[0]);
      });

      it('should include regional IREQ values', () => {
        const ireq = responseData.ireq as Record<string, unknown>;
        expect(ireq.regional).toBeDefined();
        const regional = ireq.regional as Record<string, unknown>;
        expect(regional.min).toBeDefined();
        expect(regional.neutral).toBeDefined();
        const minRegional = regional.min as Record<string, number>;
        expect(typeof minRegional.torso).toBe('number');
        expect(typeof minRegional.arms).toBe('number');
        expect(typeof minRegional.legs).toBe('number');
      });

      it('should include extremity IREQ values', () => {
        const ireq = responseData.ireq as Record<string, unknown>;
        expect(ireq.extremity).toBeDefined();
        const extremity = ireq.extremity as Record<string, unknown>;
        expect(extremity.min).toBeDefined();
        expect(extremity.neutral).toBeDefined();
        const minExtremity = extremity.min as Record<string, number>;
        expect(typeof minExtremity.hands).toBe('number');
        expect(typeof minExtremity.head).toBe('number');
      });
    });

    describe('recommendation', () => {
      it('should include garments array', () => {
        expect(responseData.recommendation).toBeDefined();
        const recommendation = responseData.recommendation as Record<string, unknown>;
        expect(recommendation.garments).toBeDefined();
        expect(Array.isArray(recommendation.garments)).toBe(true);
      });

      it('should format garments with required properties', () => {
        const recommendation = responseData.recommendation as Record<string, unknown>;
        const garments = recommendation.garments as Array<Record<string, unknown>>;

        if (garments.length > 0) {
          const garment = garments[0];
          expect(garment.id).toBeDefined();
          expect(garment.name).toBeDefined();
          expect(garment.category).toBeDefined();
        }
      });

      it('should include handwear (may be null)', () => {
        const recommendation = responseData.recommendation as Record<string, unknown>;
        // handwear can be null if no suitable handwear found
        expect('handwear' in recommendation).toBe(true);
      });

      it('should include headwear object with helmet, head_warmth, and neck_warmth', () => {
        const recommendation = responseData.recommendation as Record<string, unknown>;
        expect(recommendation.headwear).toBeDefined();
        const headwear = recommendation.headwear as Record<string, unknown>;
        expect('helmet' in headwear).toBe(true);
        expect('head_warmth' in headwear).toBe(true);
        expect('neck_warmth' in headwear).toBe(true);
      });

      it('should include ensemble_properties with thermal data', () => {
        const recommendation = responseData.recommendation as Record<string, unknown>;
        expect(recommendation.ensemble_properties).toBeDefined();
        const props = recommendation.ensemble_properties as Record<string, unknown>;
        expect(typeof props.total_clo).toBe('number');
        expect(props.regional_clo).toBeDefined();
        const regionalClo = props.regional_clo as Record<string, number>;
        expect(typeof regionalClo.torso).toBe('number');
        expect(typeof regionalClo.arms).toBe('number');
        expect(typeof regionalClo.legs).toBe('number');
        expect(typeof props.evap_potential).toBe('number');
        expect(typeof props.permeability_index).toBe('number');
      });

      it('should include score as a number', () => {
        const recommendation = responseData.recommendation as Record<string, unknown>;
        expect(typeof recommendation.score).toBe('number');
      });

      it('should include component_scores object', () => {
        const recommendation = responseData.recommendation as Record<string, unknown>;
        expect(recommendation.component_scores).toBeDefined();
        expect(typeof recommendation.component_scores).toBe('object');
      });
    });

    describe('pack_items', () => {
      it('should include pack_items with garments array', () => {
        expect(responseData.pack_items).toBeDefined();
        const packItems = responseData.pack_items as Record<string, unknown>;
        expect(packItems.garments).toBeDefined();
        expect(Array.isArray(packItems.garments)).toBe(true);
      });

      it('should include total_weight_g', () => {
        const packItems = responseData.pack_items as Record<string, unknown>;
        expect(typeof packItems.total_weight_g).toBe('number');
      });

      it('should format pack items with id, name, and weight_g', () => {
        const packItems = responseData.pack_items as Record<string, unknown>;
        const garments = packItems.garments as Array<Record<string, unknown>>;

        if (garments.length > 0) {
          const item = garments[0];
          expect(item.id).toBeDefined();
          expect(item.name).toBeDefined();
          expect('weight_g' in item).toBe(true);
        }
      });
    });

    describe('transition_protocol', () => {
      it('should include transition_protocol', () => {
        expect(responseData.transition_protocol).toBeDefined();
      });

      it('should include priority level', () => {
        const protocol = responseData.transition_protocol as Record<string, unknown>;
        expect(protocol.priority).toBeDefined();
        expect(['urgent', 'quick', 'normal']).toContain(protocol.priority);
      });

      it('should include time_limit_minutes (may be null)', () => {
        const protocol = responseData.transition_protocol as Record<string, unknown>;
        expect('time_limit_minutes' in protocol).toBe(true);
      });

      it('should include steps array', () => {
        const protocol = responseData.transition_protocol as Record<string, unknown>;
        expect(protocol.steps).toBeDefined();
        expect(Array.isArray(protocol.steps)).toBe(true);
      });

      it('should include warnings array', () => {
        const protocol = responseData.transition_protocol as Record<string, unknown>;
        expect(protocol.warnings).toBeDefined();
        expect(Array.isArray(protocol.warnings)).toBe(true);
      });
    });

    describe('warnings', () => {
      it('should include warnings array', () => {
        expect(responseData.warnings).toBeDefined();
        expect(Array.isArray(responseData.warnings)).toBe(true);
      });
    });

    describe('guidance', () => {
      it('should include guidance array with strings', () => {
        expect(responseData.guidance).toBeDefined();
        expect(Array.isArray(responseData.guidance)).toBe(true);
        const guidance = responseData.guidance as string[];
        if (guidance.length > 0) {
          expect(typeof guidance[0]).toBe('string');
        }
      });

      it('should include uphill and downhill target info in guidance', () => {
        const guidance = responseData.guidance as string[];
        const hasUphillTarget = guidance.some(g => g.toLowerCase().includes('uphill'));
        const hasDownhillTarget = guidance.some(g => g.toLowerCase().includes('downhill'));
        expect(hasUphillTarget).toBe(true);
        expect(hasDownhillTarget).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    describe('database errors', () => {
      it('should return 500 when garment fetch fails', async () => {
        const mockSupabase = createMockSupabase({
          error: { message: 'Database connection failed' },
        });
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 25, wind_speed: 10 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe('Database connection failed');
      });
    });

    describe('no garments available', () => {
      it('should return message when no suitable garments found', async () => {
        const mockSupabase = createMockSupabase({ garments: [] });
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 25, wind_speed: 10 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('No suitable garments found in database');
        expect(data.ireq).toBeDefined();
        expect(data.guidance).toBeDefined();
      });

      it('should still return IREQ values when no garments found', async () => {
        const mockSupabase = createMockSupabase({ garments: [] });
        mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

        const request = createRequest({
          weather: { temperature: 25, wind_speed: 10 },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(data.ireq.uphill).toBeDefined();
        expect(data.ireq.downhill).toBeDefined();
        expect(data.ireq.transition).toBeDefined();
      });
    });
  });

  describe('IREQ Calculations', () => {
    it('should calculate different IREQ for uphill vs downhill', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 15, wind_speed: 10 },
      });

      const response = await POST(request);
      const data = await response.json();

      const ireq = data.ireq;
      // Downhill should require more insulation due to lower metabolic rate and higher wind
      expect(ireq.downhill.neutral).toBeGreaterThan(ireq.uphill.neutral);
    });

    it('should have higher IREQ in colder conditions', async () => {
      // Test warm conditions (30°F)
      const warmMockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(warmMockSupabase as unknown as ReturnType<typeof getSupabase>);

      const warmRequest = createRequest({
        weather: { temperature: 30, wind_speed: 5 },
      });
      const warmResponse = await POST(warmRequest);
      const warmData = await warmResponse.json();

      // Test cold conditions (5°F - using non-zero to avoid validation bug)
      const coldMockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(coldMockSupabase as unknown as ReturnType<typeof getSupabase>);

      const coldRequest = createRequest({
        weather: { temperature: 5, wind_speed: 5 },
      });
      const coldResponse = await POST(coldRequest);
      const coldData = await coldResponse.json();

      expect(coldData.ireq.uphill.neutral).toBeGreaterThan(warmData.ireq.uphill.neutral);
    });

    it('should have higher IREQ in windy conditions', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const calmRequest = createRequest({
        weather: { temperature: 20, wind_speed: 2 },
      });
      const windyRequest = createRequest({
        weather: { temperature: 20, wind_speed: 25 },
      });

      const calmResponse = await POST(calmRequest);
      const calmData = await calmResponse.json();

      mockGetSupabase.mockReturnValue(createMockSupabase() as unknown as ReturnType<typeof getSupabase>);

      const windyResponse = await POST(windyRequest);
      const windyData = await windyResponse.json();

      expect(windyData.ireq.downhill.neutral).toBeGreaterThan(calmData.ireq.downhill.neutral);
    });
  });

  describe('Transition Protocol Generation', () => {
    it('should generate urgent transition protocol in very cold conditions', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: -30, wind_speed: 20 },
      });

      const response = await POST(request);
      const data = await response.json();

      const protocol = data.transition_protocol;
      // In very cold conditions, expect urgent or quick priority
      expect(['urgent', 'quick']).toContain(protocol.priority);
    });

    it('should include time limit for urgent/quick transitions', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: -25, wind_speed: 15 },
      });

      const response = await POST(request);
      const data = await response.json();

      const protocol = data.transition_protocol;
      if (protocol.priority === 'urgent' || protocol.priority === 'quick') {
        expect(protocol.time_limit_minutes).toBeDefined();
        expect(typeof protocol.time_limit_minutes).toBe('number');
      }
    });

    it('should add wind shelter warning in high wind', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 15, wind_speed: 30 },
      });

      const response = await POST(request);
      const data = await response.json();

      const protocol = data.transition_protocol;
      const hasWindWarning = protocol.warnings.some(
        (w: string) => w.toLowerCase().includes('wind')
      );
      expect(hasWindWarning).toBe(true);
    });
  });

  describe('Precipitation Handling', () => {
    it('should handle precipitation flag in conditions', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10, precipitation: true },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.conditions.precipitation).toBe(true);
    });

    it('should default precipitation to false when not provided', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10 },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.conditions.precipitation).toBe(false);
    });
  });

  describe('User ID Header', () => {
    it('should work without user ID header', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 25, wind_speed: 10 },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should accept user ID header for wardrobe filtering', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest(
        { weather: { temperature: 25, wind_speed: 10 } },
        { 'x-user-id': 'test-user-123' }
      );

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Guidance Content', () => {
    it('should provide temperature-appropriate guidance for warm conditions', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 40, wind_speed: 5 },
      });

      const response = await POST(request);
      const data = await response.json();

      const guidance = data.guidance as string[];
      const hasWarmGuidance = guidance.some(
        g => g.toLowerCase().includes('warm') || g.toLowerCase().includes('minimal')
      );
      expect(hasWarmGuidance).toBe(true);
    });

    it('should provide temperature-appropriate guidance for cold conditions', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: -10, wind_speed: 10 },
      });

      const response = await POST(request);
      const data = await response.json();

      const guidance = data.guidance as string[];
      const hasColdGuidance = guidance.some(
        g => g.toLowerCase().includes('cold') || g.toLowerCase().includes('robust')
      );
      expect(hasColdGuidance).toBe(true);
    });

    it('should include breathability guidance', async () => {
      const mockSupabase = createMockSupabase();
      mockGetSupabase.mockReturnValue(mockSupabase as unknown as ReturnType<typeof getSupabase>);

      const request = createRequest({
        weather: { temperature: 20, wind_speed: 8 },
      });

      const response = await POST(request);
      const data = await response.json();

      const guidance = data.guidance as string[];
      const hasBreathabilityGuidance = guidance.some(
        g => g.toLowerCase().includes('breathability') || g.toLowerCase().includes('evap')
      );
      expect(hasBreathabilityGuidance).toBe(true);
    });
  });
});

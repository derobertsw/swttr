import { describe, it, expect, vi } from 'vitest';
import { fetchUserHandwear, fetchUserHeadwear, fetchGarmentsWithDetails } from './database';
import type { getSupabase } from '@/lib/supabase';

type SupabaseStub = NonNullable<ReturnType<typeof getSupabase>>;

interface QueryResult {
  data: unknown;
  error: null;
}

function createStubQuery(result: QueryResult) {
  const query = {
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  };
  return query;
}

function createStubSupabase(resultsByTable: Record<string, QueryResult>) {
  const selects: Record<string, string> = {};
  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        selects[table] = columns;
        return createStubQuery(resultsByTable[table] ?? { data: [], error: null });
      }),
    })),
  };
  return { supabase: supabase as unknown as SupabaseStub, selects };
}

const catalogHandwear = [
  { id: 'h1', brand: 'A', model_name: 'Glove', handwear_type: 'glove', rcl_clo: 0.2 },
  { id: 'h2', brand: 'B', model_name: 'Mitt', handwear_type: 'mitten', rcl_clo: 0.5 },
];

const catalogHeadwear = [
  { id: 'b1', brand: 'A', model_name: 'Beanie', headwear_type: 'midweight_beanie', rcl_clo: 0.1 },
];

describe('fetchUserHandwear', () => {
  it('falls back to the full catalog for anonymous callers', async () => {
    const { supabase } = createStubSupabase({
      handwear: { data: catalogHandwear, error: null },
    });

    const result = await fetchUserHandwear(supabase, null);

    expect(result).toEqual(catalogHandwear);
  });

  it('returns empty for signed-in users with no wardrobe handwear', async () => {
    const { supabase } = createStubSupabase({
      user_wardrobe: { data: [], error: null },
      handwear: { data: catalogHandwear, error: null },
    });

    const result = await fetchUserHandwear(supabase, 'user_123');

    expect(result).toEqual([]);
  });
});

describe('fetchUserHeadwear', () => {
  it('falls back to the full catalog for anonymous callers', async () => {
    const { supabase } = createStubSupabase({
      headwear: { data: catalogHeadwear, error: null },
    });

    const result = await fetchUserHeadwear(supabase, null);

    expect(result).toEqual(catalogHeadwear);
  });

  it('returns empty for signed-in users with no wardrobe headwear', async () => {
    const { supabase } = createStubSupabase({
      user_wardrobe: { data: [], error: null },
      headwear: { data: catalogHeadwear, error: null },
    });

    const result = await fetchUserHeadwear(supabase, 'user_123');

    expect(result).toEqual([]);
  });
});

describe('fetchGarmentsWithDetails', () => {
  it('uses an inner join on activity ratings when an activity filter is set', async () => {
    const { supabase, selects } = createStubSupabase({
      garments: { data: [], error: null },
    });

    await fetchGarmentsWithDetails(supabase, {
      activityFilter: { field: 'alpine_skiing_score', minScore: 5 },
    });

    expect(selects.garments).toContain('garment_activity_ratings!inner (*)');
  });

  it('uses a plain embed when fetching wardrobe garments', async () => {
    const { supabase, selects } = createStubSupabase({
      garments: { data: [], error: null },
    });

    await fetchGarmentsWithDetails(supabase, { wardrobeIds: ['g1'] });

    expect(selects.garments).toContain('garment_activity_ratings (*)');
    expect(selects.garments).not.toContain('!inner');
  });
});

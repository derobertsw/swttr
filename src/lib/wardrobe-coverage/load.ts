import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadGearPool } from '@/lib/recommendations/gear-pool';
import { fetchUserHandwear, fetchUserHeadwear } from '@/lib/recommendations/database';
import type { RecommendationRequest } from '@/lib/recommendations/request';
import type { WardrobeCoverage } from '@/types/wardrobe-coverage';
import { evaluateCoverage, type WardrobeGear } from './evaluate';
import { GRID_VERSION } from './grid';

/** Catalog edits are rare; this bounds how long one can go unseen. */
const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 200;

type Result = Omit<WardrobeCoverage, 'cached'>;
const cache = new Map<string, { expires: number; result: Promise<Result> }>();

type Supabase = RecommendationRequest['supabase'];

/** The wardrobe's included items, which is all a result depends on besides the grid and catalog. */
async function contentsKey(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_wardrobe')
    .select('item_type, item_id')
    .eq('user_id', userId)
    .eq('disabled', false);
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as { item_type: string; item_id: string }[])
    .map((row) => `${row.item_type}:${row.item_id}`).sort();
  return createHash('sha256').update([GRID_VERSION, userId, ...items].join('\n')).digest('hex');
}

/** The wardrobe as the recommendation routes load it, without the catalog fallback. */
async function loadWardrobe(supabase: Supabase, userId: string): Promise<WardrobeGear> {
  const request = { supabase, userId, useWardrobeOnly: true } as RecommendationRequest;
  const loaded = await loadGearPool(request, {});
  if (loaded.status === 'error') throw new Error(loaded.message);
  if (loaded.status === 'ok') {
    const { garments = [], handwear, headwear } = loaded.pool;
    return { garments, handwear, headwear };
  }
  // No usable garments: the accessories still count as items.
  const [handwear, headwear] = await Promise.all([fetchUserHandwear(supabase, userId), fetchUserHeadwear(supabase, userId)]);
  return { garments: [], handwear, headwear };
}

async function compute(supabase: Supabase, userId: string): Promise<Result> {
  return evaluateCoverage(await loadWardrobe(supabase, userId), { supabase, userId });
}

/**
 * Coverage of the user's wardrobe, cached per user and wardrobe contents so
 * reopening Wardrobe, or adding back what was removed, doesn't rerun the grid.
 * Concurrent requests for the same contents share one run.
 */
export async function getWardrobeCoverage(supabase: Supabase, userId: string): Promise<WardrobeCoverage> {
  const key = await contentsKey(supabase, userId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    // Most recently used last, so the oldest is evicted first.
    cache.delete(key);
    cache.set(key, hit);
    return { ...(await hit.result), cached: true };
  }
  const result = compute(supabase, userId);
  cache.set(key, { expires: now + TTL_MS, result });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  try {
    return { ...(await result), cached: false };
  } catch (error) {
    if (cache.get(key)?.result === result) cache.delete(key);
    throw error;
  }
}

/** Tests only. */
export function clearWardrobeCoverageCache() {
  cache.clear();
}

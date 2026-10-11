import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

type PublicItemType = 'garment' | 'handwear' | 'headwear';
type Row = { id: string };
const TTL_MS = 30_000;
const MAX_ENTRIES = 1000;
const caches = new WeakMap<SupabaseClient, Map<string, { row: Row; expires: number }>>();

/** Public catalog rows only. Private custom items are always read with owner filtering. */
export function cacheCatalogRows(client: SupabaseClient, type: PublicItemType, rows: Row[]) {
  let cache = caches.get(client);
  if (!cache) { cache = new Map(); caches.set(client, cache); }
  const expires = Date.now() + TTL_MS;
  for (const row of rows) {
    const key = `${type}:${row.id.toLowerCase()}`;
    cache.delete(key);
    cache.set(key, { row, expires });
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  }
}

export function cachedCatalogRow(client: SupabaseClient, type: PublicItemType, id: string): Row | undefined {
  const cache = caches.get(client);
  const key = `${type}:${id.toLowerCase()}`;
  const hit = cache?.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) { cache!.delete(key); return undefined; }
  return hit.row;
}

import "server-only";

const windows = new Map<string, number[]>();

/**
 * Allows `limit` requests per key in a sliding window. Best effort: each
 * server instance counts on its own, which still stops one browser tab from
 * spending a provider's daily quota in a loop.
 */
export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (windows.get(key) ?? []).filter((time) => now - time < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  windows.set(key, recent);
  if (windows.size > 1_000) {
    for (const [other, times] of windows) if (!times.some((time) => now - time < windowMs)) windows.delete(other);
  }
  return allowed;
}

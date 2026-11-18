/** Stands in for src/lib/rate-limit.ts: the harness reloads pages faster than a person would. */
export function allowRequest(): boolean {
  return true;
}

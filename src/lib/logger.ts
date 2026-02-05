/**
 * Lightweight logging wrapper.
 * Logs in development, silent in production.
 */

const isDev = process.env.NODE_ENV !== "production";

export function logWarn(context: string, error: unknown): void {
  if (isDev) {
    console.warn(`[${context}]`, error instanceof Error ? error.message : error);
  }
}

export function logError(context: string, error: unknown): void {
  if (isDev) {
    console.error(`[${context}]`, error instanceof Error ? error.message : error);
  }
}

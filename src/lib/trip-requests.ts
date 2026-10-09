import type { TripFull } from "@/types/trips";

export class TripRequestError extends Error {
  constructor(message: string, readonly status: number, readonly details?: Record<string, unknown>) { super(message); }
}

type TripRequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Calls a trip API route and returns its JSON body. It resolves only when the
 * server confirms the request, and otherwise throws with the route's reason,
 * so a trip page never shows a save that didn't happen.
 */
export async function tripRequest<T>(
  url: string,
  method: TripRequestMethod = "GET",
  body?: unknown,
  options: { signal?: AbortSignal } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("Check your connection and try again.");
  }
  // A signed-out request can come back as an HTML page rather than JSON.
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = (data as { error?: unknown } | null)?.error;
    throw new TripRequestError(
      typeof reason === "string" && reason ? reason : `Request failed (${res.status})`, res.status,
      data && typeof data === "object" ? data as Record<string, unknown> : undefined
    );
  }
  return data as T;
}

/** tripRequest that gives up after 20 seconds, saying the edits are still there. */
export async function timedTripRequest<T>(url: string, method: TripRequestMethod, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try { return await tripRequest<T>(url, method, body, { signal: controller.signal }); }
  catch (err) {
    if (controller.signal.aborted) throw new Error("The request took too long. Your changes are still here; try again.");
    throw err;
  } finally { window.clearTimeout(timeout); }
}

export function fetchTripFull(tripId: string): Promise<TripFull> {
  return tripRequest<TripFull>(`/api/v1/trips/${tripId}`);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

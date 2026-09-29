import type { TripFull } from "@/types/trips";

type TripRequestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Calls a trip API route and returns its JSON body. It resolves only when the
 * server confirms the request, and otherwise throws with the route's reason,
 * so a trip page never shows a save that didn't happen.
 */
export async function tripRequest<T>(
  url: string,
  method: TripRequestMethod = "GET",
  body?: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
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
    throw new Error(
      typeof reason === "string" && reason ? reason : `Request failed (${res.status})`
    );
  }
  return data as T;
}

export function fetchTripFull(tripId: string): Promise<TripFull> {
  return tripRequest<TripFull>(`/api/v1/trips/${tripId}`);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

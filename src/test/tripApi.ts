import { vi } from "vitest";
import type { Trip, TripFull, TripMember, TripStop } from "@/types/trips";

/**
 * Trip fixtures and a fake trip API for page tests. `fakeTripApi` answers
 * fetch calls from a table keyed by "METHOD /path" (query strings ignored) and
 * rejects anything else, so an unexpected request fails loudly.
 */

export const TRIP: Trip = {
  id: "trip-1",
  owner_user_id: "user-1",
  name: "Whistler",
  start_date: "2026-10-10",
  end_date: "2026-10-12",
  status: "planning",
  created_at: "2026-09-28T00:00:00Z",
  updated_at: "2026-09-28T00:00:00Z",
};

export const ORGANIZER: TripMember = {
  id: "member-you",
  trip_id: TRIP.id,
  user_id: "user-1",
  display_name: "You",
  role: "organizer",
  status: "joined",
  invite_token: null,
  created_at: "2026-09-28T00:00:00Z",
};

export const SAM: TripMember = {
  id: "member-sam",
  trip_id: TRIP.id,
  user_id: null,
  display_name: "Sam",
  role: "member",
  status: "invited",
  invite_token: "invite-sam",
  created_at: "2026-09-28T00:00:00Z",
};

export const STOWE_STOP: TripStop = {
  id: "stop-stowe",
  trip_id: TRIP.id,
  position: 0,
  name: "Stowe, Vermont",
  latitude: 44.47,
  longitude: -72.69,
  activities: [],
  created_at: "2026-09-28T00:00:00Z",
};

/** A place as /api/geocode returns it. */
export const STOWE_PLACE = {
  id: 1,
  name: "Stowe",
  region: "Vermont",
  country: "United States",
  latitude: 44.47,
  longitude: -72.69,
};

export function tripFull(overrides: Partial<TripFull> = {}): TripFull {
  return {
    trip: TRIP,
    stops: [],
    members: [ORGANIZER],
    days: [],
    kits: [],
    gear: [],
    ...overrides,
  };
}

interface FakeReply {
  status: number;
  /** Omit for a body that isn't JSON, like the HTML page a signed-out request gets. */
  body?: unknown;
}

export const reply = (status: number, body?: unknown): FakeReply => ({ status, body });

type Route = FakeReply | ((requestBody: unknown) => FakeReply);

export function fakeTripApi(routes: Record<string, Route>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url.split("?")[0]}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request: ${method} ${url}`);
    const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const { status, body } = typeof route === "function" ? route(requestBody) : route;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        body === undefined
          ? Promise.reject(new SyntaxError("Unexpected token '<'"))
          : Promise.resolve(body),
    } as Response;
  });
}

/** The JSON bodies sent with each call to "METHOD /path". */
export function sentBodies(fetchMock: ReturnType<typeof fakeTripApi>, key: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => `${init?.method ?? "GET"} ${url.split("?")[0]}` === key)
    .map(([, init]) => (typeof init?.body === "string" ? JSON.parse(init.body) : undefined));
}

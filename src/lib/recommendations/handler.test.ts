import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createRecommendationRoute, type SportRecommender } from "./handler";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => null }));

/** A query builder whose every query resolves to the given result. */
function clientResolving(result: { data: unknown; error: unknown }) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    gte: () => query,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { from: () => query };
}

const sport: SportRecommender<{ target: number }> = {
  catalog: {},
  computeTargets: () => ({ target: 1 }),
  emptyResponse: (_request, targets) => ({ targets }),
  recommend: () => {
    throw new Error("not reached: these tests have no usable gear");
  },
};

const POST = createRecommendationRoute(sport);

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/recommendations/test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("createRecommendationRoute", () => {
  it("returns 500 when garments cannot be loaded", async () => {
    state.client = clientResolving({ data: null, error: { message: "connection refused" } });

    const response = await POST(request({ weather: { temperature: 20, wind_speed: 5 } }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "connection refused" });
  });

  it("returns targets with a message when no garments are available", async () => {
    state.client = clientResolving({ data: [], error: null });

    const response = await POST(request({ weather: { temperature: 20, wind_speed: 5 } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "No suitable garments found in database",
      targets: { target: 1 },
    });
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const handler = vi.fn(async () => Response.json({ ok: true }));

/** Load a fresh copy of the module so each test sees its own env. */
async function loadRoute(secretKey?: string) {
  vi.resetModules();
  if (secretKey) vi.stubEnv("MPP_SECRET_KEY", secretKey);
  else vi.stubEnv("MPP_SECRET_KEY", "");
  const { paidRecommendationRoute } = await import("./mpp");
  return paidRecommendationRoute("0.02", handler);
}

function post(body: string) {
  return new Request("http://localhost/api/agent/recommendations/running", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const VALID_BODY = JSON.stringify({ weather: { temperature: 30, wind_speed: 5 } });

afterEach(() => {
  vi.unstubAllEnvs();
  handler.mockClear();
});

describe("paidRecommendationRoute", () => {
  it("rejects invalid weather before charging", async () => {
    const route = await loadRoute("test-secret");
    const response = await route(post(JSON.stringify({ weather: { temperature: "cold" } })));
    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and wardrobe-only requests before charging", async () => {
    const route = await loadRoute("test-secret");
    expect((await route(post("{"))).status).toBe(400);
    expect(
      (await route(post(JSON.stringify({ weather: { temperature: 30, wind_speed: 5 }, use_wardrobe_only: true })))).status
    ).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 503 instead of throwing when MPP is not configured", async () => {
    const route = await loadRoute();
    const response = await route(post(VALID_BODY));
    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("issues a 402 payment challenge for an unpaid valid request", async () => {
    const route = await loadRoute("test-secret-key-for-unit-tests-only");
    const response = await route(post(VALID_BODY));
    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });
});

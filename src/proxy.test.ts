// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

// A signed-out visitor. protect() is Clerk's sign-in gate, which answers with a
// redirect to sign-in (development) or a 404 page (production).
const auth = vi.hoisted(() => Object.assign(async () => ({ userId: null }), { protect: vi.fn() }));

vi.mock("@clerk/nextjs/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clerk/nextjs/server")>()),
  clerkMiddleware:
    (handler: (clerkAuth: typeof auth, request: NextRequest) => unknown) => (request: NextRequest) =>
      handler(auth, request),
}));

import proxy from "./proxy";

async function visit(path: string, method = "GET") {
  const request = new NextRequest(`http://localhost:3000${path}`, { method });
  return (await proxy(request, {} as NextFetchEvent)) as Response | undefined;
}

describe("proxy, signed out", () => {
  beforeEach(() => {
    auth.protect.mockClear();
  });

  it("lets visitors build a multi-day plan", async () => {
    expect(await visit("/api/plan-ahead", "POST")).toBeUndefined();
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("asks visitors to sign in for their own gear and trips", async () => {
    await visit("/api/wardrobe/items");
    await visit("/trips");
    expect(auth.protect).toHaveBeenCalledTimes(2);
  });

  it("answers recommendation requests with a JSON 401 the app can read", async () => {
    const response = await visit("/api/v1/recommendations/alpine", "POST");
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: expect.stringMatching(/^Authentication required/) });
    expect(auth.protect).not.toHaveBeenCalled();
  });
});

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

async function visit(path: string, method = "GET", userAgent = "Mozilla/5.0") {
  const request = new NextRequest(`http://localhost:3000${path}`, { method, headers: { "user-agent": userAgent } });
  return (await proxy(request, {} as NextFetchEvent)) as Response | undefined;
}

describe("proxy, signed out", () => {
  beforeEach(() => {
    auth.protect.mockClear();
  });

  it("lets visitors build a multi-day plan and its packing list", async () => {
    expect(await visit("/api/plan-ahead", "POST")).toBeUndefined();
    expect(await visit("/api/packing-list", "POST")).toBeUndefined();
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("asks visitors to sign in for their own gear and trips", async () => {
    await visit("/api/wardrobe/items");
    await visit("/trips");
    expect(auth.protect).toHaveBeenCalledTimes(2);
  });

  it.each(["SWTTRNativeMac/1", "SWTTRNativeTabs"])("keeps protected page auth on the app origin in %s", async (marker) => {
    await visit("/wardrobe?from=outing", "GET", `Mozilla/5.0 ${marker}`);
    expect(auth.protect).toHaveBeenCalledWith({
      unauthenticatedUrl: "http://localhost:3000/sign-in?redirect_url=%2Fwardrobe%3Ffrom%3Douting",
    });
    await visit("/trips/abc/days/2026-10-11", "GET", marker);
    const url = new URL(auth.protect.mock.calls[1][0].unauthenticatedUrl);
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("redirect_url")).toBe("/trips/abc/days/2026-10-11");
  });

  it("keeps browser and native API protection as before", async () => {
    await visit("/wardrobe");
    await visit("/api/wardrobe/items", "GET", "SWTTRNativeMac/1");
    expect(auth.protect.mock.calls).toEqual([[], []]);
  });

  it.each(["/sign-in", "/sign-up", "/sign-in/sso-callback"])("keeps native auth pages public: %s", async (path) => {
    await visit(path, "GET", "SWTTRNativeMac/1");
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("keeps native recommendation requests at JSON 401", async () => {
    const response = await visit("/api/v1/recommendations/alpine", "POST", "SWTTRNativeMac/1");
    expect(response?.status).toBe(401);
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("answers recommendation requests with a JSON 401 the app can read", async () => {
    const response = await visit("/api/v1/recommendations/alpine", "POST");
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: expect.stringMatching(/^Authentication required/) });
    expect(auth.protect).not.toHaveBeenCalled();
  });
});

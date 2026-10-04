import { describe, expect, it } from "vitest";
import { RESUME_OUTING_PATH, safeReturnPath, signInHref } from "./outingReturn";

describe("outingReturn", () => {
  it("signs in and comes back to the outing, without the outing in the address", () => {
    expect(signInHref(RESUME_OUTING_PATH)).toBe("/sign-in?redirect_url=%2F%3Fresume%3Douting");
  });

  it.each([
    ["Gear up, asking for the outing again", "/?resume=outing", "/?resume=outing"],
    ["Wardrobe, opened from an outing", "/wardrobe?from=outing", "/wardrobe?from=outing"],
    ["a trip", "/trips/3f1c2b7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", "/trips/3f1c2b7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"],
    ["the FAQ", "/faq", "/faq"],
    ["a protected page as Clerk sends it, on this site", "http://localhost:3000/wardrobe", "/wardrobe"],
  ])("returns to %s", (_, redirectUrl, expected) => {
    expect(safeReturnPath(redirectUrl, "localhost:3000")).toBe(expected);
  });

  it.each([
    ["nowhere in particular", undefined],
    ["more than one place", ["/wardrobe", "/faq"]],
    ["another site", "https://example.com/wardrobe"],
    ["another site, without a scheme", "//example.com/wardrobe"],
    ["another site, behind a backslash", "/\\example.com/wardrobe"],
    ["this site's page on another port", "http://localhost:4000/wardrobe"],
    ["a script", "javascript:alert(1)"],
    ["an API route", "/api/wardrobe/gear"],
    ["sign-in itself", "/sign-in"],
    ["a page that doesn't exist", "/admin"],
  ])("goes to Gear up instead of %s", (_, redirectUrl) => {
    expect(safeReturnPath(redirectUrl, "localhost:3000")).toBe("/");
  });

  it("accepts only paths when the site's own host isn't known", () => {
    expect(safeReturnPath("/wardrobe", null)).toBe("/wardrobe");
    expect(safeReturnPath("http://localhost:3000/wardrobe", null)).toBe("/");
  });
});

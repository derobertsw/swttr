import { expect, it } from "vitest";
import { GET } from "./route";

it("redirects the stable feedback URL to the current form", () => {
  const response = GET();
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toMatch(/^https:\/\/docs\.google\.com\/forms\//);
});

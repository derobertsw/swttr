// @vitest-environment node
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { registerWebMCPTools } from "@/lib/webmcp/adapter";
import { useWebMCPTools } from "./useWebMCPTools";

it("renders on the server without reading browser globals, even with the flag on", async () => {
  const tools = [{ name: "fixture", description: "Fixture", execute: () => "ok" }];
  function Page() {
    useWebMCPTools(tools, "anonymous", true);
    return <p>Ordinary Gear up page</p>;
  }
  expect(typeof document).toBe("undefined");
  expect(renderToString(<Page />)).toBe("<p>Ordinary Gear up page</p>");
  expect(await registerWebMCPTools(tools, true).ready).toBe(false);
});

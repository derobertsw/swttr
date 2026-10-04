import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useItemMappings } from "./useItemMappings";

let mockUserId: string | null = "user_a";
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => mockUserId }));

/** Each account has named one of its standard layers. */
function stubMappings() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        mappings: [{ body_part: "upper_body", layer_type: "base", standard_option: "Base layer", custom_name: `${mockUserId}'s top` }],
      }),
    }))
  );
}

describe("useItemMappings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockUserId = "user_a";
  });

  it("shows only the signed-in account's names, never the last account's", async () => {
    stubMappings();
    const { result, rerender } = renderHook(() => useItemMappings());
    await waitFor(() => expect(result.current.itemMappings.get("upper_body:base:Base layer")).toBe("user_a's top"));

    mockUserId = null;
    rerender();
    expect(result.current.itemMappings.size).toBe(0);

    mockUserId = "user_b";
    rerender();
    expect(result.current.itemMappings.size).toBe(0);
    await waitFor(() => expect(result.current.itemMappings.get("upper_body:base:Base layer")).toBe("user_b's top"));
  });
});

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { fetchUserWardrobeItems } from "@/lib/userWardrobe";
import type { DailyLayerPlan } from "@/types/plan";
import { POST } from "./route";

// A signed-out visitor: no user, so no wardrobe to match against.
vi.mock("@/lib/auth", () => ({ getAuthUserId: vi.fn(async () => null) }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn(() => ({})) }));
vi.mock("@/lib/userWardrobe", () => ({ fetchUserWardrobeItems: vi.fn(async () => []) }));

const DAY: DailyLayerPlan = {
  date: "2026-10-01",
  label: "Thu, Oct 1",
  baseline: {
    minTemp: 41,
    maxTemp: 53,
    maxWindSpeed: 10,
    maxPrecipProbability: 11,
    effectiveTemperature: 41,
    recommendation: {
      torso: { base: [{ name: "Midweight base layer" }], outer: [{ name: "Shell jacket" }] },
      legs: { base: [{ name: "Base layer bottoms" }], outer: [{ name: "Ski pants" }] },
      hands: { base: [], outer: [{ name: "Insulated gloves" }] },
      headNeck: { base: [], outer: [{ name: "Helmet" }] },
    },
  },
  changesFromPreviousDay: null,
  dayparts: [],
  carryItems: [],
};

describe("POST /api/packing-list", () => {
  it("builds a signed-out visitor's packing list without reading a wardrobe", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/packing-list", {
        method: "POST",
        body: JSON.stringify({ days: [DAY] }),
      })
    );

    expect(response.status).toBe(200);
    const { packingList, wardrobe } = await response.json();
    expect(wardrobe).toBe("signedOut");
    expect(packingList.totalRequiredSlots).toBe(6);
    expect(packingList.gaps).toContainEqual(
      expect.objectContaining({ bodyPart: "torso", layerType: "outer", standardOption: "Shell jacket" })
    );
    expect(fetchUserWardrobeItems).not.toHaveBeenCalled();
  });

  it("matches a signed-in user's packing list against their wardrobe", async () => {
    vi.mocked(getAuthUserId).mockResolvedValueOnce("user_1");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/packing-list", {
        method: "POST",
        body: JSON.stringify({ days: [DAY] }),
      })
    );

    const { wardrobe } = await response.json();
    expect(wardrobe).toBe("matched");
    expect(fetchUserWardrobeItems).toHaveBeenCalledWith(expect.anything(), "user_1");
  });

  it("says when a signed-in user's wardrobe couldn't be read", async () => {
    vi.mocked(getAuthUserId).mockResolvedValueOnce("user_1");
    vi.mocked(getSupabase).mockReturnValueOnce(null);
    const response = await POST(
      new NextRequest("http://localhost:3000/api/packing-list", {
        method: "POST",
        body: JSON.stringify({ days: [DAY] }),
      })
    );

    const { packingList, wardrobe } = await response.json();
    expect(wardrobe).toBe("unavailable");
    expect(packingList.totalRequiredSlots).toBe(6);
  });
});

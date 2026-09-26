import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { GET, POST } from "./route";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => "user_1" }));

beforeEach(() => {
  state.client = createFakeSupabase({
    user_wardrobe: [
      { id: "w1", user_id: "user_1", item_type: "garment", item_id: "g1", created_at: "2026-01-01", disabled: false },
      { id: "w2", user_id: "user_1", item_type: "handwear", item_id: "h1", created_at: "2026-03-01", disabled: true },
      { id: "w3", user_id: "user_1", item_type: "custom", item_id: "c1", created_at: "2026-02-01" },
      { id: "w4", user_id: "user_1", item_type: "custom", item_id: "c2", created_at: "2026-01-15" },
      { id: "w5", user_id: "user_2", item_type: "garment", item_id: "g1", created_at: "2026-04-01" },
    ],
    garments: [
      { id: "g1", brand: "Patagonia", model_name: "R1", garment_thermal_properties: { rcl_whole_body: 0.5 } },
    ],
    handwear: [{ id: "h1", brand: "Hestra", model_name: "Army Leather" }],
    headwear: [],
    user_custom_items: [
      { id: "c1", user_id: "user_1", custom_name: "Old fleece", rcl_clo: 0.4, body_part: "torso", layer_type: "mid", generic_option: "Fleece" },
      // Belongs to someone else, so it must not resolve for user_1.
      { id: "c2", user_id: "user_2", custom_name: "Not mine", rcl_clo: 0.3, body_part: "legs", layer_type: "base", generic_option: "Tights" },
    ],
  });
});

describe("GET /api/wardrobe/gear", () => {
  it("returns the user's items newest first with their details", async () => {
    const body = await (await GET()).json();

    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["w2", "w3", "w4", "w1"]);
    expect(body.items[0]).toMatchObject({ item_type: "handwear", disabled: true, details: { model_name: "Army Leather" } });
    expect(body.items[1]).toMatchObject({
      disabled: false,
      details: { brand: "Custom", model_name: "Old fleece", rcl_clo: 0.4, generic_option: "Fleece" },
    });
    expect(body.items[2].details).toBeNull();
    expect(body.items[3].details).toMatchObject({ model_name: "R1", garment_thermal_properties: { rcl_whole_body: 0.5 } });
  });
});

describe("POST /api/wardrobe/gear", () => {
  const post = (body: string) =>
    POST(new NextRequest("http://localhost/api/wardrobe/gear", { method: "POST", body }));

  it("rejects a malformed body with 400", async () => {
    expect((await post("{nope")).status).toBe(400);
  });

  it("returns 404 for someone else's custom item", async () => {
    expect((await post(JSON.stringify({ item_type: "custom", item_id: "c2" }))).status).toBe(404);
  });
});

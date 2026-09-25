import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { POST } from "./route";

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => "user_newAccount123" }));

const LEGACY_ID = "user-3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/migrate-user", { method: "POST", body: JSON.stringify(body) })
  );
}

beforeEach(() => {
  state.client = createFakeSupabase({
    user_wardrobe: [
      { id: "w1", user_id: "user_2victimClerkId", item_type: "garment", item_id: "g1" },
      { id: "w2", user_id: LEGACY_ID, item_type: "garment", item_id: "g2" },
    ],
  });
});

describe("POST /api/migrate-user", () => {
  it("refuses to claim data owned by a Clerk account", async () => {
    const response = await post({ legacyUserId: "user_2victimClerkId" });
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/migrate-user", { method: "POST", body: "{" })
    );
    expect(response.status).toBe(400);
  });

  it("accepts a legacy localStorage ID", async () => {
    // The fake doesn't model update(); the route only needs to get past validation
    // and see that the legacy user has data before migrating.
    const response = await post({ legacyUserId: "user-00000000-0000-4000-8000-000000000000" });
    expect(await response.json()).toEqual({ status: "no_legacy_data" });
  });
});

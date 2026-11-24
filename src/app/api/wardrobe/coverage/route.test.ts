// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "@/test/fixtures/gear-catalog.json";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { clearWardrobeCoverageCache } from "@/lib/wardrobe-coverage/load";
import type { WardrobeCoverage } from "@/types/wardrobe-coverage";
import { GET } from "./route";

const state = vi.hoisted(() => ({ client: null as unknown, userId: "user_1" as string | null }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => state.userId }));

type Row = Record<string, unknown>;
let wardrobe: Row[];

const own = (item_type: string, item: { id: string }, extra: Row = {}) =>
  ({ user_id: "user_1", item_type, item_id: item.id, disabled: false, ...extra });

beforeEach(() => {
  clearWardrobeCoverageCache();
  state.userId = "user_1";
  wardrobe = [
    ...catalog.garments.slice(0, 12).map((g) => own("garment", g)),
    own("handwear", catalog.handwear[0]),
    own("headwear", catalog.headwear[0]),
    // Excluded items and someone else's gear never count.
    own("garment", catalog.garments[20], { disabled: true }),
    { user_id: "user_2", item_type: "garment", item_id: catalog.garments[30].id, disabled: false },
  ];
  state.client = createFakeSupabase({ ...catalog, user_wardrobe: wardrobe } as never);
});

async function get(): Promise<{ status: number; body: WardrobeCoverage }> {
  const response = await GET();
  return { status: response.status, body: await response.json() };
}

describe("GET /api/wardrobe/coverage", () => {
  it("requires sign-in", async () => {
    state.userId = null;
    const { status } = await get();
    expect(status).toBe(401);
  });

  it("measures only the signed-in user's included items", async () => {
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.scenario_count).toBe(34);
    expect(body.cached).toBe(false);
    const keys = [...body.workhorses, ...body.idle_items].map((item) => item.key);
    expect(keys).not.toContain(`garment:${catalog.garments[20].id}`);
    expect(keys).not.toContain(`garment:${catalog.garments[30].id}`);
    expect(keys).toContain(`handwear:${catalog.handwear[0].id}`);
  });

  it("serves the same contents from the cache, and recomputes when they change", async () => {
    const first = await get();
    const again = await get();
    expect(again.body.cached).toBe(true);
    expect({ ...again.body, cached: false }).toEqual(first.body);

    wardrobe.push(own("headwear", catalog.headwear.find((h) => h.headwear_type === "ski_helmet")!));
    const changed = await get();
    expect(changed.body.cached).toBe(false);
    expect(changed.body.efficiency.modeled_items).toBe(first.body.efficiency.modeled_items + 1);

    // Excluding an item changes the contents too.
    (wardrobe[0] as Row).disabled = true;
    expect((await get()).body.cached).toBe(false);
  });

  it("returns 500 when the wardrobe can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.client = createFakeSupabase({}, { missing: ["user_wardrobe"] });
    const { status } = await get();
    expect(status).toBe(500);
  });
});

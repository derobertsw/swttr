import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { packingReview, emptyPacking } from "@/lib/trip-packing";
import { ORGANIZER } from "@/test/tripApi";
import { packingTrip } from "@/test/tripPacking";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { GET, POST } from "./route";

vi.mock("@/lib/trips", async original => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn() }));
vi.mock("@/lib/userWardrobe", () => ({ fetchUserWardrobeItems: vi.fn().mockResolvedValue([]) }));
const ctx = { params: Promise.resolve({ id: "trip-1" }) };
const rpc = vi.fn();
let full = packingTrip();
function request(body: object) { return new NextRequest("http://localhost/api/v1/trips/trip-1/pack", { method: "POST", body: JSON.stringify(body) }); }
const applyBody = () => {
  const review = packingReview(full, ORGANIZER.id, emptyPacking);
  return { action: "apply", revision: 0, source_revision: review.source_revision, proposal_revision: review.proposal_revision, manual_items: [], quantities: {} };
};

describe("packing saved-kit API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); full = packingTrip();
    const supabase = { ...createFakeSupabase({}), rpc };
    vi.mocked(requireTripAccess).mockResolvedValue({ trip: full.trip, userId: "user-1", supabase: supabase as unknown as SupabaseClient });
    vi.mocked(loadTripFull).mockResolvedValue(full);
    rpc.mockResolvedValue({ data: { ...emptyPacking, revision: 1, requirements: packingReview(full, ORGANIZER.id, emptyPacking).proposed }, error: null });
  });
  it("uses accepted kits without asking weather or remapping current wardrobe", async () => {
    const fetch = vi.spyOn(global, "fetch");
    const response = await GET(new NextRequest("http://localhost/pack"), ctx);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.coverage.every((day: { savedKit?: boolean }) => day.savedKit)).toBe(true);
    expect(data.packing.proposed.find((item: { name: string }) => item.name === "Ski shell").uses).toHaveLength(3);
    expect(data.packingList.totalRequiredSlots).toBe(0);
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it("previews edits without writing and persists only server-derived requirements on Apply", async () => {
    const preview = await POST(request({ ...applyBody(), action: "preview" }), ctx);
    expect(preview.status).toBe(200); expect(rpc).not.toHaveBeenCalled();
    const response = await POST(request({ ...applyBody(), requirements: [{ name: "Forged crew gear" }] }), ctx);
    expect(response.status).toBe(200);
    expect(rpc.mock.calls[0][1].p_user_id).toBe("user-1");
    expect(rpc.mock.calls[0][1].p_requirements.some((item: { name: string }) => item.name === "Forged crew gear")).toBe(false);
  });
  it("rejects a changed kit, tampered proposal or unreviewed manual quantity", async () => {
    const before = applyBody(); full.kits[0].outfit = null;
    expect((await POST(request(before), ctx)).status).toBe(409);
    expect((await POST(request({ ...applyBody(), proposal_revision: "forged" }), ctx)).status).toBe(409);
    expect((await POST(request({ ...applyBody(), quantities: { '["owned","g-3"]': 2 } }), ctx)).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["40001", "42501", "XX000"])("handles transactional error %s without reporting Saved", async code => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    const response = await POST(request(applyBody()), ctx);
    expect(response.status).toBe(code === "40001" ? 409 : code === "42501" ? 404 : 503);
    expect(await response.json()).toHaveProperty("error");
  });
  it("preserves API access checks and never derives from another member", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    expect((await POST(request(applyBody()), ctx)).status).toBe(404); expect(loadTripFull).not.toHaveBeenCalled();
    vi.mocked(requireTripAccess).mockResolvedValue({ trip: full.trip, userId: "other-member", supabase: createFakeSupabase({}) as unknown as SupabaseClient });
    expect((await POST(request(applyBody()), ctx)).status).toBe(404);
  });
  it("fails closed when saved kits cannot be loaded rather than proposing removals", async () => {
    vi.mocked(loadTripFull).mockRejectedValue(new Error("database failed"));
    expect((await POST(request(applyBody()), ctx)).status).toBe(503);
    expect((await GET(new NextRequest("http://localhost/pack"), ctx)).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});

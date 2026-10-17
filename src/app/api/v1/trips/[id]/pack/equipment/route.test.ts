import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ORGANIZER, SAM } from "@/test/tripApi";
import type { TripEquipmentResponse } from "@/types/trip-packing";
import type { TripFull, TripMember } from "@/types/trips";
import { GET } from "./route";

vi.mock("@/lib/trips", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn(),
}));

const ANA: TripMember = { ...SAM, id: "member-ana", user_id: "user-2", display_name: "Ana", status: "joined" };
const version = "fd037a5d-b4d4-4b2e-8d6a-624ca9c8503b";

function mockTrip(packing: Record<string, unknown>[], userId = "user-1") {
  const full: TripFull = {
    trip: { id: "trip-1", owner_user_id: "user-1", name: "Tour", start_date: "2026-02-13", end_date: "2026-02-14", status: "planning", created_at: "", updated_at: "" },
    stops: [{ id: "stop-1", trip_id: "trip-1", position: 0, name: "Pinkham Notch", latitude: 44.26, longitude: -71.25, activities: ["Backcountry"], created_at: "" }],
    days: [
      { id: "day-1", trip_id: "trip-1", stop_id: "stop-1", date: "2026-02-13", activity: "Backcountry" },
      { id: "day-2", trip_id: "trip-1", stop_id: "stop-1", date: "2026-02-14", activity: "Rest" },
    ],
    members: [ORGANIZER, ANA], kits: [], gear: [],
  };
  vi.mocked(loadTripFull).mockResolvedValue(full);
  vi.mocked(requireTripAccess).mockResolvedValue({
    trip: full.trip, userId,
    supabase: createFakeSupabase({ trip_member_packing: packing, user_item_mappings: [] }) as unknown as SupabaseClient,
  });
}

const getEquipment = () => GET(new NextRequest("http://localhost:3000/api/v1/trips/trip-1/pack/equipment"),
  { params: Promise.resolve({ id: "trip-1" }) });

describe("GET /api/v1/trips/[id]/pack/equipment", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns the person's own equipment and only its packing checks", async () => {
    mockTrip([
      { trip_member_id: ORGANIZER.id, items: [], quantities: {}, equipment: { probe: { status: "added", quantity: 1 } },
        checks: { "equipment:probe": { packed: true, quantity: 1, version }, "item:g-3": { packed: true, quantity: 1, version } } },
      { trip_member_id: ANA.id, items: [], quantities: {}, equipment: { shovel: { status: "added", quantity: 1 } },
        checks: { "equipment:shovel": { packed: true, quantity: 1, version } } },
    ]);
    const response = await getEquipment();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data: TripEquipmentResponse = await response.json();
    expect(data.equipment.dates).toEqual(["2026-02-13"]);
    expect(data.equipment.items.map((item) => item.id)).toEqual(["probe"]);
    expect(data.checks).toEqual({ "equipment:probe": { packed: true, quantity: 1, version } });
  });

  it("offers no changes to someone who isn't a member", async () => {
    mockTrip([], "user-9");
    const data: TripEquipmentResponse = await (await getEquipment()).json();
    expect(data.equipment).toMatchObject({ editable: false, items: [] });
  });

  it("preserves the trip authorization error", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    expect((await getEquipment()).status).toBe(404);
  });
});

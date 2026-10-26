import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess, loadTripFull } from "@/lib/trips";
import { sharedTouringGearId } from "@/lib/trip-shared-touring";
import { ORGANIZER } from "@/test/tripApi";
import type { SharedTouringTemplate } from "@/types/trip-packing";
import type { TripFull } from "@/types/trips";
import { GET, POST } from "./route";

vi.mock("@/lib/trips", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn(),
}));

const TRIP_ID = "0b5f1d8e-3c7a-4f6b-9a2e-5d4c3b2a1f00";
type GearRow = { id: string; trip_id: string; description: string };
let rows: GearRow[];
let readError: { code: string } | null;
const rpc = vi.fn();
const supabase = {
  from: () => ({ select: () => ({ eq: async (_column: string, tripId: string) => readError
    ? { data: null, error: readError } : { data: rows.filter((row) => row.trip_id === tripId), error: null } }) }),
  rpc,
} as unknown as SupabaseClient;

function mockTrip(gear: { id: string; description: string }[] = []) {
  const full: TripFull = {
    trip: { id: TRIP_ID, owner_user_id: "user-1", name: "Tour", start_date: "2026-02-13", end_date: "2026-02-15", status: "planning", created_at: "", updated_at: "" },
    stops: [{ id: "stop-1", trip_id: TRIP_ID, position: 0, name: "Pinkham Notch", latitude: 44.26, longitude: -71.25, activities: ["Backcountry"], created_at: "" }],
    days: [
      { id: "day-1", trip_id: TRIP_ID, stop_id: "stop-1", date: "2026-02-13", activity: null },
      { id: "day-2", trip_id: TRIP_ID, stop_id: "stop-1", date: "2026-02-14", activity: "Rest" },
      { id: "day-3", trip_id: TRIP_ID, stop_id: "stop-1", date: "2026-02-15", activity: "Backcountry" },
    ],
    members: [ORGANIZER], kits: [],
    gear: gear.map((item, index) => ({ ...item, trip_id: TRIP_ID, assignee_member_id: null, sort_order: index, created_at: "" })),
  };
  rows = gear.map((item) => ({ ...item, trip_id: TRIP_ID }));
  vi.mocked(loadTripFull).mockResolvedValue(full);
  vi.mocked(requireTripAccess).mockResolvedValue({ trip: full.trip, userId: "user-1", supabase });
}

const ctx = { params: Promise.resolve({ id: TRIP_ID }) };
const url = `http://localhost:3000/api/v1/trips/${TRIP_ID}/gear/touring`;
const post = (body: unknown) => POST(new NextRequest(url, { method: "POST", body: JSON.stringify(body) }), ctx);

describe("GET /api/v1/trips/[id]/gear/touring", () => {
  beforeEach(() => { vi.clearAllMocks(); readError = null; });

  it("returns the trip's Backcountry days and the template as shared gear stands, for the organizer only", async () => {
    mockTrip([{ id: "gear-bothy", description: "Bothy bag" }, { id: "gear-aid", description: "First aid kit" }]);
    const response = await GET(new NextRequest(url), ctx);
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP_ID, { organizerOnly: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const data: SharedTouringTemplate = await response.json();
    // The first day is Backcountry through its stop, the last on its own.
    expect(data.dates).toEqual(["2026-02-13", "2026-02-15"]);
    expect(data.template.map((option) => [option.id, option.state, option.listedAs])).toEqual([
      ["first_aid", "added", undefined], ["repair_kit", "available", undefined], ["group_shelter", "listed", "Bothy bag"],
    ]);
  });

  it("preserves the authorization error, like Organizer only for a member", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await GET(new NextRequest(url), ctx)).status).toBe(403);
    expect(loadTripFull).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/trips/[id]/gear/touring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readError = null;
    rpc.mockImplementation(async (_name: string, args: { p_id: string; p_change: { description: string } }) => {
      rows.push({ id: args.p_id, trip_id: TRIP_ID, description: args.p_change.description });
      return { data: { id: args.p_id }, error: null };
    });
  });

  it("adds the chosen items unassigned, in the template's order, each under its fixed id", async () => {
    mockTrip();
    const response = await post({ ids: ["group_shelter", "first_aid"] });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ added: ["First aid kit", "Group shelter"] });
    expect(rpc.mock.calls.map(([name, args]) => [name, args])).toEqual([
      ["update_trip_shared_gear", { p_trip: TRIP_ID, p_user: "user-1", p_id: sharedTouringGearId(TRIP_ID, "first_aid"),
        p_change: { action: "create", description: "First aid kit", assignee_member_id: null } }],
      ["update_trip_shared_gear", { p_trip: TRIP_ID, p_user: "user-1", p_id: sharedTouringGearId(TRIP_ID, "group_shelter"),
        p_change: { action: "create", description: "Group shelter", assignee_member_id: null } }],
    ]);
  });

  it("adds nothing twice: reapplying, or an item already there under any of its names", async () => {
    mockTrip([{ id: "gear-bothy", description: "Bothy bag" }]);
    expect((await post({ ids: ["first_aid", "group_shelter"] })).status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1);
    const again = await post({ ids: ["first_aid", "group_shelter"] });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ added: [] });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps what it added before a failure, says so, and adds only the rest on a retry", async () => {
    mockTrip();
    rpc.mockImplementationOnce(async (_name: string, args: { p_id: string }) => {
      rows.push({ id: args.p_id, trip_id: TRIP_ID, description: "First aid kit" });
      return { data: { id: args.p_id }, error: null };
    }).mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    const failed = await post({ ids: ["first_aid", "repair_kit", "group_shelter"] });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Couldn't save shared gear. Reload to check whether it saved, then try again.", added: ["First aid kit"] });
    expect(rpc).toHaveBeenCalledTimes(2);

    const retry = await post({ ids: ["first_aid", "repair_kit", "group_shelter"] });
    expect(await retry.json()).toEqual({ added: ["Repair kit", "Group shelter"] });
    expect(rpc.mock.calls.slice(2).map(([, args]) => args.p_change.description)).toEqual(["Repair kit", "Group shelter"]);
  });

  it.each([["P0409", 409], ["42501", 403], ["P0002", 404]])("passes on the shared gear function's %s as %s", async (code, status) => {
    mockTrip();
    rpc.mockResolvedValue({ data: null, error: { code, message: "Reload shared gear" } });
    const response = await post({ ids: ["first_aid"] });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Reload shared gear", added: [] });
  });

  it.each([null, {}, { ids: [] }, { ids: "first_aid" }, { ids: ["transceiver"] }, { ids: ["first_aid", "first_aid"] },
    { ids: ["first_aid", "repair_kit", "group_shelter", "first_aid"] }])("refuses %j before changing anything", async (body) => {
    mockTrip();
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("changes nothing when shared gear can't be read", async () => {
    mockTrip();
    readError = { code: "XX000" };
    expect((await post({ ids: ["first_aid"] })).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is for the organizer only", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await post({ ids: ["first_aid"] })).status).toBe(403);
    expect(requireTripAccess).toHaveBeenCalledWith(TRIP_ID, { organizerOnly: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});

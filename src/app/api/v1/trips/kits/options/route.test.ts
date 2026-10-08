import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { listTripsForUser } from "@/lib/trips";
import { savedOutfit } from "@/test/savedKit";
import { TRIP } from "@/test/tripApi";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), listTripsForUser: vi.fn() }));

const options = (body: unknown) => POST(new NextRequest("http://localhost/api/v1/trips/kits/options", { method: "POST", body: JSON.stringify(body) }));

describe("Where an outfit can be saved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", supabase: {} as SupabaseClient });
    vi.mocked(listTripsForUser).mockResolvedValue([
      { ...TRIP, start_date: "2026-10-09", end_date: "2026-10-12", member_count: 3, stop_count: 1 },
      { ...TRIP, id: "trip-2", name: "Spring", start_date: "2027-03-01", end_date: "2027-03-05", member_count: 1, stop_count: 0 },
    ]);
  });

  it("gives the outing's trip date and each trip's day for it", async () => {
    const response = await options({ outfit: savedOutfit() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: "2026-10-10",
      suggested_name: "Stowe trip",
      destination: "Stowe, Vermont",
      trips: [
        { id: TRIP.id, name: TRIP.name, start_date: "2026-10-09", end_date: "2026-10-12", member_count: 3, day_number: 2 },
        { id: "trip-2", name: "Spring", start_date: "2027-03-01", end_date: "2027-03-05", member_count: 1, day_number: null },
      ],
    });
    expect(listTripsForUser).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("refuses an outfit that can't be saved", async () => {
    expect((await options({ outfit: { ...savedOutfit(), advice: { kind: "none", reason: "no_gear" } } })).status).toBe(400);
    expect(listTripsForUser).not.toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Authentication required" }, { status: 401 }));
    expect((await options({ outfit: savedOutfit() })).status).toBe(401);
  });
});

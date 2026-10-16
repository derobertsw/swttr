// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { driveTrip } from "@/test/driveTrip";
import type { TripDriveEstimates } from "@/types/trips";
import { GET } from "./route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn() }));

const full = driveTrip();
const get = () => GET(new Request("http://localhost/api/v1/trips/trip-drive/drive-estimates"), { params: Promise.resolve({ id: full.trip.id }) });
const ANSWER = { sources_to_targets: [[
  { distance: 9000, time: 720, source_index: 0, target_index: 0 },
  { distance: 64000, time: 4440, source_index: 0, target_index: 1 },
]] };

describe("GET drive estimates", () => {
  const fetchMock = vi.fn();
  const upsert = vi.fn();
  let stored: unknown[];
  let tableError: { code: string } | null;
  beforeEach(() => {
    vi.clearAllMocks();
    stored = []; tableError = null;
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response(JSON.stringify(ANSWER)));
    upsert.mockResolvedValue({ error: null });
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("trip_drive_estimates");
        return { select: () => ({ eq: async () => ({ data: tableError ? null : stored, error: tableError }) }), upsert };
      },
    } as unknown as SupabaseClient;
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId: `member-${Math.random()}`, trip: full.trip });
    vi.mocked(loadTripFull).mockResolvedValue(full);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("gives any trip member every day's drive and stores what it calculated", async () => {
    const response = await get();
    expect(requireTripAccess).toHaveBeenCalledWith(full.trip.id);
    expect(response.status).toBe(200);
    const body = await response.json() as TripDriveEstimates;
    expect(body.days.map((day) => day.state)).toEqual(["missing_origin", "available", "available", "origin_not_located"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith([
      expect.objectContaining({ trip_id: full.trip.id, provider: "geoapify", date: "2027-01-09", status: "ok", duration_seconds: 720 }),
      expect.objectContaining({ trip_id: full.trip.id, provider: "geoapify", date: "2027-01-10", status: "ok", duration_seconds: 4440 }),
    ], { onConflict: "trip_id,date" });
  });
  it("reports a provider failure on the days, not as an error, so the plan still shows", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    const response = await get();
    expect(response.status).toBe(200);
    expect((await response.json() as TripDriveEstimates).days.map((day) => day.state)).toEqual(["missing_origin", "unavailable", "unavailable", "origin_not_located"]);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("still calculates before migration 028, without storing", async () => {
    tableError = { code: "PGRST205" };
    upsert.mockResolvedValue({ error: { code: "PGRST205" } });
    const body = await (await get()).json() as TripDriveEstimates;
    expect(body.days[1].state).toBe("available");
  });
  it("refuses anyone who can't see the trip, as requireTripAccess does", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Not found" }, { status: 404 }));
    expect((await get()).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("limits each person to 30 requests a minute", async () => {
    for (let i = 0; i < 30; i++) expect((await get()).status).toBe(200);
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
  });
});

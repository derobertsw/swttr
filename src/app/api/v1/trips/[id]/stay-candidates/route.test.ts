// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTripFull, requireTripAccess } from "@/lib/trips";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { place, splitDriveTrip } from "@/test/driveTrip";
import { PINE, SPLIT_TRIP } from "@/test/splitStays";
import type { TripStayCandidates, TripStayComparison } from "@/types/trips";
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[candidateId]/route";
import { GET as COMPARE } from "./compare/route";

vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(), loadTripFull: vi.fn() }));

const optionId = "3c000000-0000-4000-8000-000000000001";
const RIDGE = place("Ridge chalet", 44.5012, -72.7519);
const params = { params: Promise.resolve({ id: SPLIT_TRIP.id }) };
const withOption = { params: Promise.resolve({ id: SPLIT_TRIP.id, candidateId: optionId }) };
const json = (method: string, body: unknown) => new Request(`http://localhost/api/v1/trips/${SPLIT_TRIP.id}/stay-candidates`, { method, body: JSON.stringify(body) });
const savedRow = { id: optionId, trip_id: SPLIT_TRIP.id, name: "Ridge chalet", check_in: "2026-10-09", check_out: "2026-10-11", address: null, property_url: null,
  notes: null, location: RIDGE, cost_amount: 840, cost_currency: "USD", revision: 1, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };

describe("Stay options API (#213)", () => {
  let rpc: ReturnType<typeof vi.fn>;
  let tables: Record<string, Record<string, unknown>[]>;
  let missing: string[];
  beforeEach(() => {
    vi.clearAllMocks();
    rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null });
    tables = { trip_stay_candidates: [] };
    missing = [];
    vi.mocked(requireTripAccess).mockImplementation(async () => {
      const supabase = { ...createFakeSupabase(tables, { missing }), rpc } as unknown as SupabaseClient;
      return { supabase, userId: "user-1", trip: SPLIT_TRIP };
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("lets anyone on the trip read the options, and says when they can't be saved yet", async () => {
    tables.trip_stay_candidates.push(savedRow);
    const response = await GET(new Request("http://localhost"), params);
    expect(requireTripAccess).toHaveBeenCalledWith(SPLIT_TRIP.id);
    const body = await response.json() as TripStayCandidates;
    expect(body).toMatchObject({ available: true, default_window: { first_night: "2026-10-09", checkout: "2026-10-12" } });
    expect(body.candidates).toEqual([expect.objectContaining({ name: "Ridge chalet", date_label: "Fri Oct 9 → Sun Oct 11 · 2 nights", cost_label: "About $840 total for Fri Oct 9 → Sun Oct 11 · 2 nights" })]);
    missing = ["trip_stay_candidates"];
    expect(await (await GET(new Request("http://localhost"), params)).json()).toMatchObject({ available: false, candidates: [] });
  });

  it("saves an option for the organizer only, from validated fields", async () => {
    const response = await POST(json("POST", { candidate: { id: optionId, name: " Ridge chalet ", check_in: "2026-10-09", check_out: "2026-10-11", location: RIDGE,
      cost_amount: "840", cost_currency: "USD", stay_id: "injected" }, expected_revision: null }), params);
    expect(requireTripAccess).toHaveBeenCalledWith(SPLIT_TRIP.id, { organizerOnly: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ candidate: { id: optionId, revision: 1, date_label: "Fri Oct 9 → Sun Oct 11 · 2 nights" } });
    expect(rpc).toHaveBeenCalledWith("mutate_trip_stay_candidate", { p_trip_id: SPLIT_TRIP.id, p_user_id: "user-1", p_action: "save", p_payload: {
      id: optionId, name: "Ridge chalet", check_in: "2026-10-09", check_out: "2026-10-11", address: null, property_url: null, notes: null,
      location: RIDGE, cost_amount: 840, cost_currency: "USD", expected_revision: null } });
    vi.mocked(requireTripAccess).mockResolvedValueOnce(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await POST(json("POST", { candidate: { id: optionId, name: "Ridge chalet" }, expected_revision: null }), params)).status).toBe(403);
  });

  it("rejects invalid fields before saving, naming the field", async () => {
    const response = await POST(json("POST", { candidate: { id: optionId, name: "Ridge chalet", cost_amount: 800, cost_currency: "USD" }, expected_revision: null }), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Add the nights this cost covers, or clear the cost.", field: "check_in" });
    // A new option has no revision; an edit needs the one it opened.
    expect((await POST(json("POST", { candidate: { id: optionId, name: "Ridge chalet" }, expected_revision: 1 }), params)).status).toBe(400);
    expect((await PATCH(json("PATCH", { candidate: { name: "Ridge chalet" } }), withOption)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("edits the option the route names, and returns the saved one with a conflict", async () => {
    tables.trip_stay_candidates.push({ ...savedRow, revision: 3, notes: "Sauna" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    const response = await PATCH(json("PATCH", { candidate: { id: "3c000000-0000-4000-8000-000000000009", name: "Ridge chalet" }, expected_revision: 2 }), withOption);
    expect(rpc.mock.calls[0][1].p_payload).toMatchObject({ id: optionId, expected_revision: 2 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "This option changed since you opened it. Review the saved option, then save again.", current: { revision: 3, notes: "Sauna" } });
  });

  it("explains each refusal", async () => {
    const refused = async (code: string, hint?: string) => {
      rpc.mockResolvedValueOnce({ data: null, error: { code, hint } });
      const response = await POST(json("POST", { candidate: { id: optionId, name: "Ridge chalet" }, expected_revision: null }), params);
      return [response.status, (await response.json()).error];
    };
    expect(await refused("23505")).toEqual([409, "This place is already an option for these nights."]);
    expect(await refused("22023", "limit")).toEqual([400, "A trip can have up to 30 options. Remove one first."]);
    expect(await refused("P0002")).toEqual([404, "This option was removed. Your changes are still here; save them as a new option."]);
    // Before the migration there's nowhere to save one.
    expect(await refused("PGRST202")).toEqual([503, "Stay options can't be saved yet. You can still compare saved stays."]);
    expect(await refused("XX000")).toEqual([500, "Couldn't save the option. Your changes are still here; try again."]);
  });

  it("removes an option as the editor saw it", async () => {
    rpc.mockResolvedValueOnce({ data: { id: optionId, removed: true }, error: null });
    const response = await DELETE(json("DELETE", { expected_revision: 2 }), withOption);
    expect(await response.json()).toEqual({ id: optionId, removed: true });
    expect(rpc).toHaveBeenCalledWith("mutate_trip_stay_candidate", { p_trip_id: SPLIT_TRIP.id, p_user_id: "user-1", p_action: "remove", p_payload: { id: optionId, expected_revision: 2 } });
    expect((await DELETE(json("DELETE", {}), withOption)).status).toBe(400);
  });
});

describe("Stay comparison API (#213)", () => {
  const fetchMock = vi.fn();
  let tables: Record<string, Record<string, unknown>[]>;
  const compare = (query: string, userId = `member-${Math.random()}`) => {
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: createFakeSupabase(tables) as unknown as SupabaseClient, userId, trip: SPLIT_TRIP });
    return COMPARE(new Request(`http://localhost/api/v1/trips/${SPLIT_TRIP.id}/stay-candidates/compare?${query}`), params);
  };
  beforeEach(() => {
    vi.clearAllMocks();
    tables = { trip_stay_candidates: [savedRow], trip_drive_estimates: [], trip_stay_candidate_routes: [], trip_drive_manual_estimates: [] };
    vi.mocked(loadTripFull).mockResolvedValue(splitDriveTrip());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { sources: unknown[] };
      return new Response(JSON.stringify({ sources_to_targets: body.sources.map((_, index) => [{ source_index: index, target_index: 0, time: 600 + index * 300, distance: 9000 }]) }));
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("compares a saved stay and an option for anyone on the trip", async () => {
    const response = await compare(`options=stay:${PINE.id},candidate:${optionId}&first_night=2026-10-09&checkout=2026-10-11`);
    expect(requireTripAccess).toHaveBeenCalledWith(SPLIT_TRIP.id);
    expect(response.status).toBe(200);
    const body = await response.json() as TripStayComparison;
    expect(body.options.map((option) => option.name)).toEqual(["Pine rental", "Ridge chalet"]);
    expect(body.days.map((day) => day.drives.map((drive) => drive.known))).toEqual([[true, true], [true, true]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for two or three stays before routing anything", async () => {
    const response = await compare(`options=candidate:${optionId}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Choose two or three stays to compare.", field: "options" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an option from another trip", async () => {
    tables.trip_stay_candidates = [];
    const response = await compare(`options=stay:${PINE.id},candidate:${optionId}`);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("compares saved stays before the options migration", async () => {
    tables = { trip_drive_estimates: [], trip_drive_manual_estimates: [] };
    vi.mocked(requireTripAccess).mockResolvedValue({ supabase: createFakeSupabase(tables, { missing: ["trip_stay_candidates", "trip_stay_candidate_routes"] }) as unknown as SupabaseClient, userId: "u", trip: SPLIT_TRIP });
    const full = splitDriveTrip();
    const response = await COMPARE(new Request(`http://localhost/x?options=stay:${full.lodging!.stays[0].id},stay:${full.lodging!.stays[2].id}`), params);
    expect(response.status).toBe(200);
    expect((await response.json() as TripStayComparison).options.map((option) => option.name)).toEqual(["Pine rental", "Mountain lodge"]);
  });

  it("limits how often one person compares", async () => {
    for (let index = 0; index < 30; index++) expect((await compare(`options=stay:${PINE.id},candidate:${optionId}`, "busy-user")).status).toBe(200);
    expect((await compare(`options=stay:${PINE.id},candidate:${optionId}`, "busy-user")).status).toBe(429);
  });
});

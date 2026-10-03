import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { TRIP } from "@/test/tripApi";
import { POST } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));
const rpc = vi.fn();
const input = { creation_id: "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563", name: " Ski weekend ", start_date: "2026-10-10", end_date: "2026-10-12", destination: { name: "Stowe", latitude: 44.47, longitude: -72.69 }, activity: "Alpine" };
const create = (body: unknown) => POST(new NextRequest("http://localhost/api/v1/trips", { method: "POST", body: JSON.stringify(body) }));

describe("Atomic trip creation route", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireUser).mockResolvedValue({ userId: "user-1", supabase: { rpc } as unknown as SupabaseClient }); rpc.mockResolvedValue({ data: { trip: TRIP, created: true }, error: null }); });
  it("uses the authenticated owner and sends one transaction including the destination and activity", async () => {
    expect((await create({ ...input, owner_user_id: "other-user" })).status).toBe(201);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_trip_draft", expect.objectContaining({ p_trip_id: input.creation_id, p_owner_user_id: "user-1", p_name: "Ski weekend", p_destination: input.destination, p_activity: "Alpine" }));
  });
  it("returns the existing saved trip for an idempotent replay", async () => {
    rpc.mockResolvedValue({ data: { trip: TRIP, created: false }, error: null });
    const response = await create(input); expect(response.status).toBe(200); expect(await response.json()).toEqual({ trip: TRIP, created: false });
  });
  it("keeps compatibility with older name-and-date callers", async () => {
    expect((await create({ name: "Old draft", start_date: input.start_date, end_date: input.end_date })).status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_trip_draft", expect.objectContaining({ p_trip_id: expect.any(String), p_destination: null, p_activity: null }));
  });
  it("accepts zero coordinates and one-day trips", async () => {
    expect((await create({ ...input, end_date: input.start_date, destination: { name: "Equator", latitude: 0, longitude: 0 } })).status).toBe(201);
  });
  it.each([null, { ...input, name: 42 }, { ...input, name: " " }, { ...input, name: "x".repeat(201) }, { ...input, start_date: "2026-02-30" }, { ...input, start_date: "bad" }, { ...input, end_date: "2026-10-09" }, { ...input, end_date: "9999-12-31" }, { ...input, activity: "Flying" }, { ...input, creation_id: "not-a-uuid" }, { ...input, destination: { name: "Stowe", latitude: null, longitude: 10 } }, { ...input, destination: { name: "Stowe", latitude: 91, longitude: 10 } }])("rejects invalid input before touching the database (%#)", async (body) => { expect((await create(body)).status).toBe(400); expect(rpc).not.toHaveBeenCalled(); });
  it("returns a retryable failure when the transaction fails", async () => { rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "Internal details" } }); const response = await create(input); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "Couldn't save the trip. Retry with the same draft." }); });
  it("doesn't disclose another owner's trip on a draft collision", async () => { rpc.mockResolvedValue({ data: null, error: { code: "42501" } }); expect((await create(input)).status).toBe(409); });
  it("preserves authentication failures without a database request", async () => { vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 })); expect((await create(input)).status).toBe(401); expect(rpc).not.toHaveBeenCalled(); });
});

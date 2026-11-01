import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/api";
import { TRIP } from "@/test/tripApi";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { PUT } from "./route";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireUser: vi.fn() }));

const dayId = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const rpc = vi.fn();
const request = (body: unknown) => new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/notes`, { method: "PUT", body: JSON.stringify(body) });
const context = (date = "2026-10-10") => ({ params: Promise.resolve({ id: TRIP.id, date }) });
const body = { day_id: dayId, notes: "Tickets at the will-call window.", expected: { notes: null } };

function identity(userId: string, status = "joined") {
  const supabase = { ...createFakeSupabase({
    trips: [TRIP as unknown as Record<string, unknown>], trip_members: [{ trip_id: TRIP.id, user_id: "member-user", status }],
  }), rpc } as unknown as SupabaseClient;
  vi.mocked(requireUser).mockResolvedValue({ userId, supabase });
}

describe("Day notes API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    identity("user-1");
  });

  it("saves the organizer's notes for the day, trimmed, with what the editor showed", async () => {
    const response = await PUT(request({ ...body, notes: "  Rentals at Base Lodge by 8:15.\r\nTickets at will-call.\n", expected: { notes: "Old" }, user_id: "other-user", date: "2026-10-11" }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_trip_day_notes", { p_trip_id: TRIP.id, p_user_id: "user-1", p_payload: {
      date: "2026-10-10", day_id: dayId, notes: "Rentals at Base Lodge by 8:15.\nTickets at will-call.", expected: { notes: "Old" },
    } });
  });

  it.each([null, "", "  \n "])("clears them for %j", async (notes) => {
    expect((await PUT(request({ ...body, notes, expected: { notes: "Old" } }), context())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_trip_day_notes", expect.objectContaining({ p_payload: expect.objectContaining({ notes: null }) }));
  });

  it("takes up to 2,000 characters", async () => {
    expect((await PUT(request({ ...body, notes: "a".repeat(2000) }), context())).status).toBe(200);
    const response = await PUT(request({ ...body, notes: "a".repeat(2001) }), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Use up to 2,000 characters for the notes.", field: "notes" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("lets members read but not write", async () => {
    identity("member-user");
    expect((await PUT(request(body), context())).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["outsider", "left"])("doesn't disclose the trip to %s users", async (kind) => {
    identity(kind === "left" ? "member-user" : "outsider", kind);
    expect((await PUT(request(body), context())).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the signed-out access rules", async () => {
    vi.mocked(requireUser).mockResolvedValue(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await PUT(request(body), context())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...body, notes: 42 }, "notes"],
    [{ ...body, day_id: "day-1" }, undefined],
    [{ ...body, expected: undefined }, undefined],
    [{ ...body, expected: {} }, undefined],
    [{ ...body, expected: { notes: 1 } }, undefined],
    [[], undefined],
  ])("rejects invalid requests before the transaction (%#)", async (input, field) => {
    const response = await PUT(request(input), context());
    expect(response.status).toBe(400);
    if (field) expect(await response.json()).toMatchObject({ field });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a date that isn't a calendar date as not found", async () => {
    expect((await PUT(request(body), context("2026-02-30"))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([["PT409", 409], ["40001", 409], ["PGRST202", 503], ["42883", 503], ["42501", 403], ["P0002", 404], ["22023", 400], ["XX000", 500]])(
    "sanitizes %s transaction failures", async (code, status) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "Internal database details" } });
      const response = await PUT(request(body), context());
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain("Internal database details");
    });
});

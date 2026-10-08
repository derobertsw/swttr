import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import type { TripMember } from "@/types/trips";
import { PUT } from "./route";

vi.mock("@/lib/trips", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(),
}));

type Member = Pick<TripMember, "id" | "user_id" | "status"> & { trip_id: string };
const MEMBERS: Member[] = [
  { id: "member-owner", trip_id: TRIP.id, user_id: "user-1", status: "joined" },
  { id: "member-ana", trip_id: TRIP.id, user_id: "user-2", status: "joined" },
  { id: "member-guest", trip_id: TRIP.id, user_id: null, status: "guest" },
  { id: "member-left", trip_id: TRIP.id, user_id: "user-3", status: "left" },
  { id: "member-elsewhere", trip_id: "other-trip", user_id: "user-2", status: "joined" },
];

function mockDatabase(userId: string) {
  const upsert = vi.fn((row: object) => ({
    select: () => ({ single: async () => ({ data: { id: "kit-1", ...row }, error: null }) }),
  }));
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      upsert,
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
      maybeSingle: vi.fn(async () => {
        if (table === "trip_members") {
          return { data: MEMBERS.find((m) => m.trip_id === filters.trip_id && m.id === filters.id) ?? null, error: null };
        }
        if (table === "trip_days") return { data: { id: "day-1" }, error: null };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    return query;
  });
  vi.mocked(requireTripAccess).mockResolvedValue({ trip: TRIP, userId, supabase: { from } as unknown as SupabaseClient });
  return { upsert };
}

const put = (memberId: string, body: unknown = { items: ["shell"], effort: "hard", state: "ok", note: null }) =>
  PUT(new NextRequest(`http://localhost/api/v1/trips/${TRIP.id}/days/2026-10-10/kits/${memberId}`, {
    method: "PUT", body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: TRIP.id, date: "2026-10-10", memberId }) });

describe("Change a member's day checklist", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("lets a member change their own kit, leaving any saved outfit alone", async () => {
    const db = mockDatabase("user-2");
    expect((await put("member-ana")).status).toBe(200);
    expect(db.upsert).toHaveBeenCalledWith(
      { trip_day_id: "day-1", trip_member_id: "member-ana", items: ["shell"], effort: "hard", note: null, state: "ok" },
      { onConflict: "trip_day_id,trip_member_id" }
    );
  });

  it("lets the organizer change a guest's kit, but not another member's", async () => {
    const db = mockDatabase("user-1");
    expect((await put("member-guest")).status).toBe(200);
    expect((await put("member-ana")).status).toBe(403);
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });

  it("doesn't let a member change the organizer's or a guest's kit", async () => {
    const db = mockDatabase("user-2");
    expect((await put("member-owner")).status).toBe(403);
    expect((await put("member-guest")).status).toBe(403);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("doesn't save a kit for someone who left or belongs to another trip", async () => {
    const db = mockDatabase("user-2");
    expect((await put("member-left")).status).toBe(404);
    expect((await put("member-elsewhere")).status).toBe(404);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { items: "shell" },
    { items: [1] },
    { effort: "extreme" },
    { state: "done" },
    { note: 5 },
  ])("refuses an invalid kit (%o)", async (body) => {
    const db = mockDatabase("user-2");
    expect((await put("member-ana", body)).status).toBe(400);
    expect(db.upsert).not.toHaveBeenCalled();
  });
});

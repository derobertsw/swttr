import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTripAccess } from "@/lib/trips";
import { TRIP } from "@/test/tripApi";
import type { TripDay } from "@/types/trips";
import { POST } from "./route";

vi.mock("@/lib/trips", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn(),
}));

const createDay = (date = "2026-10-10", body?: unknown) => POST(new NextRequest(
  `http://localhost/api/v1/trips/${TRIP.id}/days/${date}`,
  { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }
), { params: Promise.resolve({ id: TRIP.id, date }) });

function mockDatabase(initial: TripDay[] = [], failure?: "insert" | "read") {
  const rows = [...initial];
  const upsert = vi.fn(async (row: Pick<TripDay, "trip_id" | "date">, options: { ignoreDuplicates: boolean }) => {
    if (failure === "insert") return { error: { message: "Database unavailable" } };
    const existing = rows.find((day) => day.trip_id === row.trip_id && day.date === row.date);
    if (!existing) rows.push({ ...row, id: "restored-day", activity: null, stop_id: null });
    else if (!options.ignoreDuplicates) Object.assign(existing, row);
    return { error: null };
  });
  const from = vi.fn((table: string) => {
    if (table !== "trip_days") throw new Error(`Unexpected table: ${table}`);
    const filters: Record<string, unknown> = {};
    const query = {
      upsert,
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
      single: vi.fn(async () => failure === "read"
        ? { data: null, error: { message: "Couldn't read the saved day" } }
        : { data: rows.find((row) => Object.entries(filters).every(([key, value]) => row[key as keyof TripDay] === value)), error: null }),
    };
    return query;
  });
  vi.mocked(requireTripAccess).mockResolvedValue({ trip: TRIP, userId: "user-1", supabase: { from } as unknown as SupabaseClient });
  return { rows, from, upsert };
}

describe("Restore a trip day", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("restores a valid trip date without trusting fields from another trip", async () => {
    const db = mockDatabase();
    const response = await createDay("2026-10-10", { trip_id: "another-trip", stop_id: "another-stop", activity: "Run" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ day: {
      id: "restored-day", trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: null,
    } });
    expect(db.upsert).toHaveBeenCalledWith({ trip_id: TRIP.id, date: "2026-10-10" }, { onConflict: "trip_id,date", ignoreDuplicates: true });
    expect(db.rows).toHaveLength(1);
    expect(db.from.mock.calls.every(([table]) => table === "trip_days")).toBe(true);
  });

  it("preserves an existing plan and cannot return a matching date from another trip", async () => {
    const saved: TripDay = { id: "saved-day", trip_id: TRIP.id, date: "2026-10-10", stop_id: "saved-stop", activity: "Hike" };
    const db = mockDatabase([{ ...saved, trip_id: "another-trip", id: "other-day" }, saved]);
    const [first, second] = await Promise.all([createDay(), createDay()]);
    expect(await first.json()).toEqual({ day: saved });
    expect(await second.json()).toEqual({ day: saved });
    expect(db.rows).toHaveLength(2);
    expect(db.rows[1]).toEqual(saved);
  });

  it("creates one row when two requests restore the same missing day", async () => {
    const db = mockDatabase();
    const responses = await Promise.all([createDay(), createDay()]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(db.rows).toHaveLength(1);
  });

  it.each(["2026-10-09", "2026-10-13", "not-a-date", "2026-10-10T00:00Z", "2026-02-30"])("rejects date %s before writing", async (date) => {
    const db = mockDatabase();
    expect((await createDay(date)).status).toBe(404);
    expect(db.from).not.toHaveBeenCalled();
  });

  it.each([401, 404])("preserves access denial %s before writing", async (status) => {
    const db = mockDatabase();
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Denied" }, { status }));
    expect((await createDay()).status).toBe(status);
    expect(db.from).not.toHaveBeenCalled();
  });

  it.each(["insert", "read"] as const)("reports a %s failure without claiming a saved plan", async (failure) => {
    mockDatabase([], failure);
    const response = await createDay();
    expect(response.status).toBe(500);
    expect(await response.json()).toHaveProperty("error");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { readJson, requireUser } from "./api";
import { requireTripAccess } from "./trips";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  client: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({ getSupabase: () => state.client }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => state.userId }));

async function errorOf(result: unknown) {
  expect(result).toBeInstanceOf(NextResponse);
  const response = result as NextResponse;
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.userId = "user_owner";
  state.client = createFakeSupabase({
    trips: [{ id: "trip-1", owner_user_id: "user_owner", name: "Hut trip" }],
    trip_members: [
      { id: "m-1", trip_id: "trip-1", user_id: "user_owner", status: "joined" },
      { id: "m-2", trip_id: "trip-1", user_id: "user_member", status: "joined" },
      { id: "m-3", trip_id: "trip-1", user_id: "user_left", status: "left" },
    ],
  });
});

describe("requireUser", () => {
  it("returns 401 when signed out", async () => {
    state.userId = null;
    expect(await errorOf(await requireUser())).toEqual({
      status: 401,
      body: { error: "Authentication required" },
    });
  });

  it("returns 503 when the database is not configured", async () => {
    state.client = null;
    expect((await errorOf(await requireUser())).status).toBe(503);
  });

  it("returns the user and client", async () => {
    const result = await requireUser();
    expect(result).toEqual({ userId: "user_owner", supabase: state.client });
  });
});

describe("readJson", () => {
  const post = (body: string) =>
    new Request("http://localhost/api", { method: "POST", body });

  it("parses a JSON body", async () => {
    expect(await readJson(post('{"name":"Hut trip"}'))).toEqual({ name: "Hut trip" });
  });

  it("returns null for a malformed or empty body", async () => {
    expect(await readJson(post("{not json"))).toBeNull();
    expect(await readJson(post(""))).toBeNull();
  });
});

describe("requireTripAccess", () => {
  it("lets the owner in, with the trip", async () => {
    const result = await requireTripAccess("trip-1", { organizerOnly: true });
    expect(result).toMatchObject({ userId: "user_owner", trip: { id: "trip-1" } });
  });

  it("lets a joined member in", async () => {
    state.userId = "user_member";
    expect(await requireTripAccess("trip-1")).toMatchObject({ trip: { id: "trip-1" } });
  });

  it("returns 403 for members on organizer-only actions", async () => {
    state.userId = "user_member";
    expect(await errorOf(await requireTripAccess("trip-1", { organizerOnly: true }))).toEqual({
      status: 403,
      body: { error: "Organizer only" },
    });
  });

  it("returns 404 for people who left, strangers, and missing trips", async () => {
    state.userId = "user_left";
    expect((await errorOf(await requireTripAccess("trip-1"))).status).toBe(404);
    state.userId = "user_stranger";
    expect((await errorOf(await requireTripAccess("trip-1"))).status).toBe(404);
    state.userId = "user_owner";
    expect((await errorOf(await requireTripAccess("trip-missing"))).status).toBe(404);
  });
});

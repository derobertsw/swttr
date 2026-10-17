import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { getAuthUserId } from "@/lib/auth";
import { requireTripAccess } from "@/lib/trips";
import { createFakeSupabase } from "@/test/fakeSupabase";
import { ORGANIZER, SAM, TRIP } from "@/test/tripApi";
import { GET, POST } from "./route";
import { PATCH, DELETE } from "../../[id]/members/[memberId]/route";
import { POST as addMember } from "../../[id]/members/route";

vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUserId: vi.fn() }));
vi.mock("@/lib/trips", async (original) => ({ ...await original<typeof import("@/lib/trips")>(), requireTripAccess: vi.fn() }));

const request = new NextRequest("http://localhost/api/v1/trips/invite/invite-sam");
const ctx = (token = "invite-sam") => ({ params: Promise.resolve({ token }) });
const memberCtx = { params: Promise.resolve({ id: TRIP.id, memberId: SAM.id }) };
const change = (action: string, token: string | null = "invite-sam") => PATCH(new NextRequest(request.url, { method: "PATCH", body: JSON.stringify({ invite_action: action, invite_token: token }) }), memberCtx);
let tables: { trips: Record<string, unknown>[]; trip_members: Record<string, unknown>[]; trip_group_gear: Record<string, unknown>[] };

beforeEach(() => {
  vi.clearAllMocks();
  tables = { trips: [{ ...TRIP }], trip_members: [{ ...ORGANIZER }, { ...SAM }], trip_group_gear: [] };
  const supabase = createFakeSupabase(tables) as unknown as SupabaseClient;
  vi.mocked(getSupabase).mockReturnValue(supabase);
  vi.mocked(getAuthUserId).mockResolvedValue("synthetic-sam");
  vi.mocked(requireTripAccess).mockResolvedValue({ supabase, userId: "user-1", trip: TRIP });
});

describe("Invitation lifecycle with synthetic accounts", () => {
  it("previews only an available link for signed-out visitors and requires sign-in to claim", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(null);
    expect(await (await GET(request, ctx())).json()).toMatchObject({ state: "available", trip: { name: TRIP.name } });
    expect((await POST(request, ctx())).status).toBe(401);
    expect(tables.trip_members[1].status).toBe("invited");
  });

  it("recovers lost success responses and repeated visits without changing the member id or duplicating it", async () => {
    expect(await (await POST(request, ctx())).json()).toEqual({ trip_id: TRIP.id, already_joined: false });
    expect(await (await POST(request, ctx())).json()).toEqual({ trip_id: TRIP.id, already_joined: true });
    expect(await (await GET(request, ctx())).json()).toMatchObject({ state: "joined", trip: { id: TRIP.id } });
    expect(tables.trip_members).toHaveLength(2);
    expect(tables.trip_members[1]).toMatchObject({ id: SAM.id, invite_token: "invite-sam", user_id: "synthetic-sam", status: "joined" });
  });

  it("doesn't reveal a used link to a signed-out or wrong account, and resolves it after switching back", async () => {
    await POST(request, ctx());
    const invalid = await (await GET(request, ctx("invalid"))).json();
    for (const account of [null, "synthetic-other"]) {
      vi.mocked(getAuthUserId).mockResolvedValue(account);
      expect(await (await GET(request, ctx())).json()).toEqual(invalid);
      if (account) expect(await (await POST(request, ctx())).json()).toEqual(invalid);
    }
    vi.mocked(getAuthUserId).mockResolvedValue("synthetic-sam");
    expect(await (await GET(request, ctx())).json()).toMatchObject({ state: "joined" });
  });

  it("only lets one of two different accounts claim the same member", async () => {
    vi.mocked(getAuthUserId).mockResolvedValueOnce("synthetic-sam").mockResolvedValueOnce("synthetic-other");
    const responses = await Promise.all([POST(request, ctx()), POST(request, ctx())]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(tables.trip_members.filter((m) => m.status === "joined" && m.role !== "organizer")).toHaveLength(1);
  });

  it("recovers simultaneous claims from the same account", async () => {
    const responses = await Promise.all([POST(request, ctx()), POST(request, ctx())]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(tables.trip_members).toHaveLength(2);
  });

  it("keeps another person's pending invitation when an existing member follows it", async () => {
    vi.mocked(getAuthUserId).mockResolvedValue(ORGANIZER.user_id);
    expect(await (await POST(request, ctx())).json()).toEqual({ trip_id: TRIP.id, already_joined: true });
    expect(tables.trip_members[1]).toEqual(SAM);
  });

  it("replaces and revokes only the reviewed pending link, preserving the member", async () => {
    expect((await change("replace")).status).toBe(200);
    const replacement = tables.trip_members[1].invite_token as string;
    expect(replacement).not.toBe("invite-sam");
    expect((await POST(request, ctx())).status).toBe(404);
    expect((await change("revoke")).status).toBe(409);
    expect((await change("revoke", replacement)).status).toBe(200);
    expect((await POST(request, ctx(replacement))).status).toBe(404);
    expect((await change("replace", null)).status).toBe(200);
    expect(tables.trip_members[1]).toMatchObject({ id: SAM.id, status: "invited", user_id: null });
  });

  it("a stale claim cannot overwrite a revocation or replacement", async () => {
    const database = createFakeSupabase(tables);
    let release!: () => void;
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    vi.mocked(getSupabase).mockReturnValue({ from: (table: string) => {
      const query = database.from(table);
      let claiming = false;
      const wrapped: typeof query = new Proxy(query, { get(target, property) {
        if (property === "update") return (patch: Record<string, unknown>) => { claiming = patch.status === "joined"; target.update(patch); return wrapped; };
        if (property === "maybeSingle" && claiming) return async () => { reached(); await paused; return target.maybeSingle(); };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? (...args: unknown[]) => { const result = value.apply(target, args); return result === target ? wrapped : result; } : value;
      } });
      return wrapped;
    } } as unknown as SupabaseClient);
    const claim = POST(request, ctx());
    await ready;
    expect((await change("revoke")).status).toBe(200);
    release();
    expect((await claim).status).toBe(404);
    expect(tables.trip_members[1]).toMatchObject({ user_id: null, invite_token: null, status: "invited" });
  });

  it("a joined link cannot be revoked or replaced as a pending invitation", async () => {
    await POST(request, ctx());
    expect((await change("revoke")).status).toBe(409);
    expect((await change("replace")).status).toBe(409);
    expect(await (await POST(request, ctx())).json()).toMatchObject({ already_joined: true });
  });

  it("removed and left members cannot recover access with a used link", async () => {
    await POST(request, ctx());
    tables.trip_members[1].status = "left";
    expect((await POST(request, ctx())).status).toBe(404);
    expect((await GET(request, ctx())).status).toBe(404);
    await DELETE(request, memberCtx);
    expect((await POST(request, ctx())).status).toBe(404);
    expect((await GET(request, ctx())).status).toBe(404);
  });

  it("uses organizer authorization for creation, revocation, replacement, and removal", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(NextResponse.json({ error: "Organizer only" }, { status: 403 }));
    expect((await change("replace")).status).toBe(403);
    expect((await change("revoke")).status).toBe(403);
    expect((await DELETE(request, memberCtx)).status).toBe(403);
    expect((await addMember(new NextRequest(request.url, { method: "POST", body: JSON.stringify({ display_name: "Alex", kind: "guest" }) }), { params: Promise.resolve({ id: TRIP.id }) })).status).toBe(403);
    expect(vi.mocked(requireTripAccess).mock.calls.every(([, options]) => options?.organizerOnly)).toBe(true);
    expect(tables.trip_members).toHaveLength(2);
  });

  it("blocks direct status/role edits and reports database failures separately from unavailable links", async () => {
    expect((await PATCH(new NextRequest(request.url, { method: "PATCH", body: JSON.stringify({ display_name: "Sam", status: "invited" }) }), memberCtx)).status).toBe(400);
    const failed = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "private db detail" } }) }) }) }) };
    vi.mocked(getSupabase).mockReturnValue(failed as unknown as SupabaseClient);
    expect((await GET(request, ctx())).status).toBe(503);
    expect(await (await POST(request, ctx())).json()).toEqual({ error: "Couldn't load the invitation. Try again." });
  });
});

// @vitest-environment node
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/supabase";
import { createAccountDeletionDatabase, DELETED, OTHER, rowsMentioning, seedAccounts, snapshot } from "@/test/accountDeletionDb";
import { POST } from "./route";

vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));

// Clerk signs with a secret from its dashboard; these tests sign with their own.
const SECRET = randomBytes(24);
const SIGNING_SECRET = `whsec_${SECRET.toString("base64")}`;

type Signing = { secret?: Buffer; id?: string; timestamp?: number; headers?: Record<string, string | undefined> };
/** A request signed the way Clerk (Svix) signs webhook deliveries. */
function delivery(payload: unknown, { secret = SECRET, id = `msg_${randomUUID()}`, timestamp = Math.floor(Date.now() / 1000), headers = {} }: Signing = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  const all: Record<string, string | undefined> = {
    "content-type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}`, ...headers,
  };
  return new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST", body, headers: Object.fromEntries(Object.entries(all).filter((entry): entry is [string, string] => entry[1] !== undefined)),
  });
}
const event = (type: string, data: Record<string, unknown>) =>
  ({ type, object: "event", data, timestamp: Date.now(), instance_id: "ins_test", event_attributes: { http_request: { client_ip: "", user_agent: "" } } });
const userDeleted = (id: unknown = DELETED) => event("user.deleted", { deleted: true, id, object: "user" });

describe("POST /api/webhooks/clerk", () => {
  let db: PGlite;
  // Supabase's rpc(), answered by Postgres with the real migrations.
  const rpc = vi.fn(async (fn: string, args: { p_user_id: string }) => {
    try {
      const { rows } = await db.query<{ result: unknown }>(`SELECT public.${fn}($1) AS result`, [args.p_user_id]);
      return { data: rows[0].result, error: null };
    } catch (error) {
      return { data: null, error: { code: (error as { code?: string }).code ?? "", message: "database error" } };
    }
  });
  const logs: unknown[][] = [];

  beforeAll(async () => { db = await createAccountDeletionDatabase(); }, 60_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", SIGNING_SECRET);
    vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as SupabaseClient);
    logs.length = 0;
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args); });
    }
    await db.exec("TRUNCATE trips, user_preferences, user_wardrobe, user_item_mappings, user_custom_items, trip_kit_saves CASCADE;");
    await seedAccounts(db);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("deletes exactly the deleted account's data and leaves other accounts alone", async () => {
    const othersBefore = await rowsMentioning(db, OTHER);
    const response = await POST(delivery(userDeleted()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, deleted: expect.objectContaining({ trips: 1, trip_memberships: 1, user_preferences: 1 }) });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_user_data", { p_user_id: DELETED });
    expect(await rowsMentioning(db, DELETED)).toEqual({});
    const othersAfter = await rowsMentioning(db, OTHER);
    for (const table of ["user_preferences", "user_wardrobe", "user_item_mappings", "user_custom_items", "trips"]) {
      expect(othersAfter[table], table).toBe(othersBefore[table]);
    }
  });

  it("answers a replay with 200 and changes nothing", async () => {
    const request = delivery(userDeleted());
    const replay = request.clone();
    expect((await POST(request)).status).toBe(200);
    const before = await snapshot(db);
    const response = await POST(replay as NextRequest);
    expect(response.status).toBe(200);
    expect(Object.values((await response.json()).deleted).every((count) => count === 0)).toBe(true);
    expect(await snapshot(db)).toEqual(before);
  });

  it("answers 200 for an account it has no data for, such as Clerk's test event", async () => {
    const before = await snapshot(db);
    const response = await POST(delivery(userDeleted("user_29w83sxmDNGwOuEthce5gg56FcC")));
    expect(response.status).toBe(200);
    expect(await snapshot(db)).toEqual(before);
  });

  it.each([
    ["signed with another secret", { secret: randomBytes(24) }],
    ["too old to trust", { timestamp: Math.floor(Date.now() / 1000) - 3600 }],
    ["missing its signature", { headers: { "svix-signature": undefined } }],
    ["missing its ID", { headers: { "svix-id": undefined } }],
  ])("rejects a request %s with 400 and deletes nothing", async (_name, signing: Signing) => {
    const before = await snapshot(db);
    const response = await POST(delivery(userDeleted(), signing));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(await snapshot(db)).toEqual(before);
  });

  it("rejects a body changed after signing", async () => {
    const signed = delivery(userDeleted(OTHER));
    const tampered = new NextRequest(signed.url, { method: "POST", headers: signed.headers, body: JSON.stringify(userDeleted(DELETED)) });
    expect((await POST(tampered)).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["user.created", "user.updated", "session.created", "organization.deleted"])("acknowledges and ignores %s", async (type) => {
    const before = await snapshot(db);
    const response = await POST(delivery(event(type, { id: DELETED, object: "user" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: type });
    expect(rpc).not.toHaveBeenCalled();
    expect(await snapshot(db)).toEqual(before);
  });

  it.each(["", "user-6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f", 42, null])("rejects user.deleted with user ID %j", async (id) => {
    expect((await POST(delivery(userDeleted(id)))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects user.deleted without a user ID", async () => {
    expect((await POST(delivery(event("user.deleted", { deleted: true, object: "user" })))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 503 without a signing secret, so Clerk retries once it's set", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    expect((await POST(delivery(userDeleted()))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 503 without a database", async () => {
    vi.mocked(getSupabase).mockReturnValue(null);
    expect((await POST(delivery(userDeleted()))).status).toBe(503);
  });

  it.each(["PGRST202", "42883"])("answers 503 before the migration is applied (%s), naming it in the log", async (code) => {
    rpc.mockResolvedValueOnce({ data: null, error: { code, message: "Could not find the function" } });
    const response = await POST(delivery(userDeleted()));
    expect(response.status).toBe(503);
    expect(logs.flat().join(" ")).toContain("20261116150000_delete_user_data.sql");
    expect(await rowsMentioning(db, DELETED)).not.toEqual({});
  });

  it("answers 500 when the delete fails, so Clerk retries", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40P01", message: `deadlock detected for ${DELETED}` } });
    expect((await POST(delivery(userDeleted()))).status).toBe(500);
  });

  it("never logs the user ID or the payload", async () => {
    await POST(delivery(userDeleted()));
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40P01", message: `deadlock detected for ${DELETED}` } });
    await POST(delivery(userDeleted()));
    await POST(delivery(userDeleted(), { secret: randomBytes(24) }));
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(logs)).not.toContain(DELETED);
  });
});

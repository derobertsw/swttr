// @vitest-environment node
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const tripId = "a2eb3ecb-a7ac-4b6d-98e3-701c694d8563";
const otherTrip = "2d6b6e38-77b6-46bc-8d6c-906fbb40d633";
const hotel = "40f9f55e-0e74-4c4a-923f-d7a3f92468a0";
const hut = "a682b8af-d26b-4213-a816-39de3eb155eb";
let db: PGlite;
const input = (id = hotel, extra: object = {}) => ({ id, name: id === hotel ? "Hotel" : "Hut", check_in: null, check_out: null, booking_status: "not_booked", existing: false, ...extra });
const mutate = async (revision: number, action = "save", payload: object = input(), replace = false, requestId = randomUUID(), owner = "user-1", trip = tripId) => {
  return (await db.query<{ result: { revision: number } }>("SELECT public.mutate_trip_lodging($1,$2,$3,$4,$5,$6,$7) AS result", [trip, owner, revision, requestId, action, JSON.stringify(payload), replace])).rows[0].result;
};
const nights = async () => (await db.query<{ date: string; stay_id: string | null; status: string }>("SELECT date::text, stay_id, status FROM trip_lodging_nights WHERE trip_id = $1 ORDER BY date", [tripId])).rows;
const revision = async () => (await db.query<{ lodging_revision: number }>("SELECT lodging_revision FROM trips WHERE id = $1", [tripId])).rows[0].lodging_revision;

describe("Crew lodging transactions in Postgres", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;");
    await db.exec(await readFile("supabase/migrations/012_trips.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/017_trip_stays.sql", "utf8"));
    // Every test here runs against 025's version of the lodging transaction.
    await db.exec(await readFile("supabase/migrations/025_trip_stay_locations.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261020000407_trip_conflicts_no_retry.sql", "utf8"));
  }, 20_000);
  beforeEach(async () => {
    await db.exec("TRUNCATE trips CASCADE;");
    await db.query("INSERT INTO trips (id,owner_user_id,name,start_date,end_date) VALUES ($1,'user-1','Weekend','2026-10-09','2026-10-11'), ($2,'other-user','Other','2026-10-09','2026-10-11')", [tripId, otherTrip]);
  });
  afterAll(async () => { await db?.close(); });
  it("saves a name-only draft without nights, coordinates or an inferred booking", async () => {
    expect(await mutate(0)).toEqual({ revision: 1 });
    expect(await nights()).toEqual([]);
    expect((await db.query("SELECT check_in, check_out, address, booking_status FROM trip_stays")).rows[0]).toEqual({ check_in: null, check_out: null, address: null, booking_status: "not_booked" });
  });
  it("covers Friday and Saturday nights for a Friday–Sunday stay", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-09", check_out: "2026-10-11" }));
    expect((await nights()).map((night) => night.date)).toEqual(["2026-10-09", "2026-10-10"]);
  });
  it("allows back-to-back stays and an explicit pre-trip night", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-08", check_out: "2026-10-10" }));
    await mutate(1, "save", input(hut, { check_in: "2026-10-10", check_out: "2026-10-12" }));
    expect((await nights()).map((night) => [night.date, night.stay_id])).toEqual([["2026-10-08", hotel], ["2026-10-09", hotel], ["2026-10-10", hut], ["2026-10-11", hut]]);
  });
  it("requires explicit overlap replacement and retains the old stay and booking", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-09", check_out: "2026-10-11", booking_status: "booked" }));
    const candidate = input(hut, { check_in: "2026-10-10", check_out: "2026-10-12" });
    await expect(mutate(1, "save", candidate)).rejects.toMatchObject({ code: "23P01" });
    expect(await revision()).toBe(1);
    await mutate(1, "save", candidate, true);
    expect((await nights()).map((night) => night.stay_id)).toEqual([hotel, hut, hut]);
    expect((await db.query("SELECT booking_status FROM trip_stays WHERE id = $1", [hotel])).rows[0]).toEqual({ booking_status: "booked" });
    // Editing notes on the old stay must not reclaim a replaced night.
    await mutate(2, "save", input(hotel, { existing: true, check_in: "2026-10-09", check_out: "2026-10-11", booking_status: "booked", notes: "Meet in lobby" }));
    expect((await nights()).map((night) => night.stay_id)).toEqual([hotel, hut, hut]);
  });
  it("rejects a stale second session before changing records or assignments", async () => {
    await mutate(0);
    await expect(mutate(0, "save", input(hotel, { existing: true, name: "Stale name" }))).rejects.toMatchObject({ code: "PT409" });
    expect((await db.query("SELECT name FROM trip_stays")).rows[0]).toEqual({ name: "Hotel" });
  });
  it("checks for an existing property and dates before adding a duplicate", async () => {
    await mutate(0);
    await expect(mutate(1, "save", input(hut, { name: " hotel " }))).rejects.toMatchObject({ code: "23505" });
    expect(await revision()).toBe(1);
    await mutate(1, "save", input(hut, { name: "Hotel", check_in: "2026-10-11", check_out: "2026-10-12" }));
    expect((await db.query("SELECT id FROM trip_stays")).rows).toHaveLength(2);
  });
  it("retries an uncertain response without duplicating or overwriting newer work", async () => {
    const requestId = randomUUID();
    const first = await mutate(0, "save", input(), false, requestId);
    await mutate(1, "save", input(hotel, { existing: true, name: "Newer name" }));
    expect(await mutate(0, "save", input(), false, requestId)).toEqual(first);
    expect(await revision()).toBe(2);
    expect((await db.query("SELECT name FROM trip_stays")).rows).toEqual([{ name: "Newer name" }]);
    await expect(mutate(0, "save", input(hotel, { name: "Different input" }), false, requestId)).rejects.toMatchObject({ code: "22023" });
  });
  it("distinguishes No stay needed and clearing a night from a chosen stay", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-09", check_out: "2026-10-11" }));
    await expect(mutate(1, "night", { date: "2026-10-10", status: "no_stay" })).rejects.toMatchObject({ code: "23P01" });
    await mutate(1, "night", { date: "2026-10-10", status: "no_stay" }, true);
    expect((await nights())[1]).toEqual({ date: "2026-10-10", stay_id: null, status: "no_stay" });
    await mutate(2, "night", { date: "2026-10-10", status: "unplanned" });
    expect((await nights()).length).toBe(1);
    await expect(mutate(3, "night", { date: "2026-10-13", status: "no_stay" })).rejects.toMatchObject({ code: "22023" });
  });
  it("removes only the target stay's nights without changing another stay", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-09", check_out: "2026-10-10" }));
    await mutate(1, "save", input(hut, { check_in: "2026-10-10", check_out: "2026-10-12" }));
    await mutate(2, "remove", { id: hotel });
    expect((await nights()).map((night) => night.stay_id)).toEqual([hut, hut]);
  });
  it("rolls back an invalid stay including its revision and previous nights", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-09", check_out: "2026-10-11" }));
    await expect(mutate(1, "save", input(hotel, { existing: true, check_in: "2026-10-10", check_out: "2026-10-09" }))).rejects.toMatchObject({ code: "23514" });
    expect(await revision()).toBe(1);
    expect((await nights()).length).toBe(2);
  });
  it("rejects non-organizers and cross-trip stay IDs", async () => {
    await expect(mutate(0, "save", input(), false, randomUUID(), "member-user")).rejects.toMatchObject({ code: "42501" });
    await mutate(0, "save", input(), false, randomUUID(), "other-user", otherTrip);
    await expect(mutate(0, "save", input(hotel, { existing: true }))).rejects.toMatchObject({ code: "42501" });
    await expect(mutate(0, "remove", { id: hotel })).rejects.toMatchObject({ code: "42501" });
    expect(await revision()).toBe(0);
    await expect(db.query("INSERT INTO trip_lodging_nights (trip_id,date,stay_id,status) VALUES ($1,'2026-10-09',$2,'assigned')", [tripId, hotel])).rejects.toMatchObject({ code: "23503" });
  });
  it("preserves stay dates, night assignments and bookings when a trip is shortened", async () => {
    await mutate(0, "save", input(hotel, { check_in: "2026-10-09", check_out: "2026-10-12", booking_status: "booked" }));
    await db.query("UPDATE trips SET end_date = '2026-10-10' WHERE id = $1", [tripId]);
    expect((await nights()).length).toBe(3);
    expect((await db.query("SELECT check_out::text, booking_status FROM trip_stays")).rows[0]).toEqual({ check_out: "2026-10-12", booking_status: "booked" });
    expect(await revision()).toBe(2);
    await expect(mutate(1, "save", input(hotel, { existing: true }))).rejects.toMatchObject({ code: "PT409" });
  });
  describe("stay locations (#208)", () => {
    const topnotch = { label: "Topnotch Resort", address: "4000 Mountain Road, Stowe, VT", latitude: 44.49391, longitude: -72.73918, precision: "exact",
      time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: "51a8d60c", attribution: "© OpenStreetMap contributors" };
    const location = async () => (await db.query<{ location: unknown }>("SELECT location FROM trip_stays WHERE id = $1", [hotel])).rows[0].location;
    it("saves a place with the stay and keeps it through saves that don't mention it", async () => {
      await mutate(0, "save", input(hotel, { location: topnotch }));
      expect(await location()).toEqual(topnotch);
      await mutate(1, "save", input(hotel, { existing: true, notes: "Meet in lobby" }));
      expect(await location()).toEqual(topnotch);
    });
    it("replaces a corrected place and removes it on an explicit null", async () => {
      await mutate(0, "save", input(hotel, { location: { ...topnotch, label: "Wrong lot", precision: "approximate" } }));
      await mutate(1, "save", input(hotel, { existing: true, location: topnotch }));
      expect(await location()).toEqual(topnotch);
      await mutate(2, "save", input(hotel, { existing: true, location: null }));
      expect(await location()).toBeNull();
    });
    it("leaves the saved place and revision alone when a replacement is rejected", async () => {
      await mutate(0, "save", input(hotel, { location: topnotch }));
      await expect(mutate(1, "save", input(hotel, { existing: true, location: { ...topnotch, latitude: 0, longitude: 0 } }))).rejects.toMatchObject({ code: "23514" });
      expect(await location()).toEqual(topnotch);
      expect(await revision()).toBe(1);
    });
    it.each([
      ["0, 0", { latitude: 0, longitude: 0 }],
      ["an out-of-range latitude", { latitude: 90.5 }],
      ["a longitude as text", { longitude: "-72.7" }],
      ["no label", { label: undefined }],
      ["an unknown precision", { precision: "rooftop" }],
      ["typed coordinates with a provider ID", { source: "manual", provider: null }],
    ])("refuses a stored place with %s", async (_, change) => {
      await mutate(0);
      await expect(db.query("UPDATE trip_stays SET location = $1 WHERE id = $2", [JSON.stringify({ ...topnotch, ...change }), hotel])).rejects.toMatchObject({ code: "23514" });
    });
    it("accepts typed coordinates without provider data", async () => {
      const typed = { label: "Entered coordinates", address: "44.49391, -72.73918", latitude: 44.49391, longitude: -72.73918, precision: "exact",
        time_zone: null, source: "manual", provider: null, provider_id: null, attribution: null };
      await mutate(0, "save", input(hotel, { location: typed }));
      expect(await location()).toEqual(typed);
    });
  });
  it("blocks browser roles at both the RPC and table boundaries", async () => {
    const signature = "public.mutate_trip_lodging(uuid,text,integer,uuid,text,jsonb,boolean)";
    expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS anon, has_function_privilege('authenticated',$1,'EXECUTE') AS authenticated, has_function_privilege('service_role',$1,'EXECUTE') AS service", [signature])).rows[0]).toEqual({ anon: false, authenticated: false, service: true });
    for (const table of ["trip_stays", "trip_lodging_nights", "trip_lodging_mutations"]) {
      expect((await db.query("SELECT has_table_privilege('anon',$1,'SELECT') AS anon, has_table_privilege('authenticated',$1,'INSERT') AS authenticated, has_table_privilege('service_role',$1,'SELECT,INSERT,UPDATE,DELETE') AS service", [table])).rows[0]).toEqual({ anon: false, authenticated: false, service: true });
    }
  });
});

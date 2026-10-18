// Run against a disposable local PostgreSQL cluster; see README.md.
// pg is supplied by the verification environment, not an app dependency.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const pg = await import(process.env.SWTTR_PG_CLIENT_MODULE ?? "pg");
const { Client } = pg.default ?? pg;
const url = new URL(process.env.SWTTR_TEST_POSTGRES_URL);
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Use a disposable local cluster");
const database = `shared_gear_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: url.href });
const clients = [];
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  const testUrl = new URL(url); testUrl.pathname = `/${database}`;
  for (let i = 0; i < 3; i++) {
    const client = new Client({ connectionString: testUrl.href });
    await client.connect(); clients.push(client);
    await client.query("SET deadlock_timeout = '100ms'; SET statement_timeout = '3s'");
  }
  const [a, b, observer] = clients;
  // The roles are cluster-wide, so use an existing Supabase local cluster or
  // initialize these names only on a disposable verification cluster.
  await admin.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  END $$`);
  await a.query("CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$");
  await a.query(await readFile(new URL("../../../supabase/migrations/012_trips.sql", import.meta.url), "utf8"));
  const migration = process.env.SWTTR_SHARED_GEAR_MIGRATION ?? new URL("../../../supabase/migrations/20261018131917_trip_shared_gear_responsibility.sql", import.meta.url);
  await a.query(await readFile(migration, "utf8"));
  const trip = randomUUID(), ana = randomUUID(), guest = randomUUID();
  async function reset() {
    await a.query("TRUNCATE public.trips CASCADE");
    await a.query("INSERT INTO trips (id, owner_user_id, name, start_date, end_date) VALUES ($1, 'owner', 'Lock regression', '2026-10-18', '2026-10-19')", [trip]);
    await a.query("INSERT INTO trip_members (id, trip_id, user_id, display_name, role, status) VALUES ($1, $3, 'ana', 'Ana', 'member', 'joined'), ($2, $3, NULL, 'Guest', 'guest', 'guest')", [ana, guest, trip]);
    return (await a.query("SELECT update_trip_shared_gear($1, 'owner', $2, $3) AS gear", [trip, randomUUID(), { action: "create", description: "Stove", assignee_member_id: ana }])).rows[0].gear;
  }
  async function waitBlocked(blocked, blocker, settled) {
    for (let i = 0; i < 150; i++) {
      const { rows } = await observer.query("SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked", [blocked.processID, blocker.processID]);
      if (rows[0].blocked) return;
      assert.ok(!settled(), "Mutation bypassed the in-progress membership edit");
      await delay(10);
    }
    assert.fail("Expected the membership edit and mutation to serialize");
  }
  for (const scenario of [
    { action: "accept", target: ana, departure: "delete", code: "P0002" },
    { action: "assign", target: ana, departure: "delete", code: "P0409" },
    { action: "assign", target: guest, departure: "delete", code: "22023" },
    { action: "accept", target: ana, departure: "left", code: "P0002" },
    { action: "assign", target: guest, departure: "left", code: "22023" },
  ]) {
    const gear = await reset();
    await a.query("BEGIN");
    await a.query(`SELECT id FROM trip_members WHERE id = $1 FOR ${scenario.departure === "left" ? "NO KEY UPDATE" : "UPDATE"}`, [scenario.target]);
    let settled = false;
    const mutation = b.query("SELECT update_trip_shared_gear($1, $2, $3, $4)", [trip, scenario.action === "accept" ? "ana" : "owner", gear.id,
      { action: scenario.action, expected_revision: gear.revision, assignee_member_id: guest }])
      .then((result) => { settled = true; return { result }; }, (error) => { settled = true; return { error }; });
    await waitBlocked(b, a, () => settled);
    if (scenario.departure === "delete") await a.query("DELETE FROM trip_members WHERE id = $1", [scenario.target]);
    else await a.query("UPDATE trip_members SET status = 'left' WHERE id = $1", [scenario.target]);
    await a.query("COMMIT");
    const outcome = await mutation;
    assert.equal(outcome.error?.code, scenario.code, outcome.error?.message);
    const current = (await a.query("SELECT * FROM trip_group_gear WHERE id = $1", [gear.id])).rows[0];
    assert.equal(current.accepted_at, null);
    assert.equal(current.packed_at, null);
    console.log(`PASS ${scenario.action} vs ${scenario.departure} ${scenario.target === ana ? "current recipient" : "target recipient"}: ${scenario.code}, no deadlock`);
  }
  const gear = await reset();
  await b.query("BEGIN");
  await b.query("SELECT update_trip_shared_gear($1, 'ana', $2, $3)", [trip, gear.id, { action: "accept", expected_revision: gear.revision }]);
  let settled = false;
  const removal = a.query("DELETE FROM trip_members WHERE id = $1", [ana]).then(() => { settled = true; });
  await waitBlocked(a, b, () => settled);
  await b.query("COMMIT"); await removal;
  const released = (await a.query("SELECT * FROM trip_group_gear WHERE id = $1", [gear.id])).rows[0];
  assert.equal(released.assignee_member_id, null); assert.equal(released.accepted_at, null);
  console.log("PASS confirmation first, then removal: removal waits and clears confirmation");
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await admin.end();
}

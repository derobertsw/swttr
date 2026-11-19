// Fixture API server for the #213 browser checks, adapted from #337's
// (docs/qa/337-group-planning/api.mjs, whose sign-in, database and rate-limit
// stand-ins in server/ it reuses). It runs the app's real /api/v1/trips route
// handlers against the fixture database in fixtures.ts. The Next shim in
// shim.patch rewrites /api/v1/trips/qa213-* to it. No database, Clerk or
// provider is ever called: the routing provider is down for the whole run, so
// only the drives fixtures.ts stored are known.
//
//   API_PORT=3492 node docs/qa/213-compare-stays/api.mjs
//
// Unlike #337's, saves work in memory, so a journey can add an option or use
// one for the nights and see the result:
// - mutate_trip_stay_candidate: adds, changes (revision checked) and removes options.
// - mutate_trip_lodging and use_trip_stay_candidate: "save" and "assign" through the
//   server's own applyLodgingChange, checking the revision, crew key, option
//   revision and replacement as the transactions do.
// Force a failure instead with an override:
//   POST /__qa/overrides {"rpc:use_trip_stay_candidate": {"code": "PT409"}, "POST /api/v1/trips/<id>/...": {"status": 500, "body": {...}}}
//   DELETE /__qa/overrides, POST /__qa/reset, GET /__qa/log, GET /__qa/tables?trip=<id>
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const shared = resolve(root, 'docs/qa/337-group-planning/server');
const port = Number(process.env.API_PORT ?? 3492);

// No real provider or database, whatever .env.local says.
process.env.GEOAPIFY_API_KEY = 'qa213-fixture-key';
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY']) delete process.env[key];

// Each trip's fixed "now", advancing in real time from the server's start.
const RealDate = Date;
let started = RealDate.now();
let offset = 0;
class FixtureDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }
  static now() { return RealDate.now() + offset; }
}
globalThis.Date = FixtureDate;

globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  // The routing provider is down for the whole run.
  if (url.hostname === 'geoapify.com' || url.hostname.endsWith('.geoapify.com')) throw new TypeError('fetch failed');
  if (url.host === 'api.open-meteo.com') return new Response('{"error":true,"reason":"fixture: no forecasts"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  throw new Error(`QA fixture: blocked a request to ${url.host}`);
};

const vite = await createVite({
  configFile: false, root, appType: 'custom', logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: {
    alias: [
      { find: 'server-only', replacement: resolve(root, 'node_modules/server-only/empty.js') },
      { find: /^@\/lib\/auth$/, replacement: resolve(shared, 'auth.ts') },
      { find: /^@\/lib\/supabase$/, replacement: resolve(shared, 'supabase.ts') },
      { find: /^@\/lib\/rate-limit$/, replacement: resolve(shared, 'rate-limit.ts') },
      { find: /^@\//, replacement: `${resolve(root, 'src')}/` },
    ],
  },
});
const load = (file) => vite.ssrLoadModule(resolve(root, file));
const fixtures = await load('docs/qa/213-compare-stays/fixtures.ts');
const { createFakeSupabase } = await load('src/test/fakeSupabase.ts');
const { request: current } = await load('docs/qa/337-group-planning/server/state.ts');
const lodging = await load('src/lib/trip-lodging.ts');
const { applyLodgingChange } = await load('src/lib/trip-lodging-changes.ts');
const { NextRequest } = await import('next/server.js');

// Every trip route, its path pattern and its module, loaded before any request.
const base = resolve(root, 'src/app/api/v1/trips');
const routes = [];
for (const file of (await readdir(base, { recursive: true })).filter((name) => name.endsWith('route.ts'))) {
  const segments = ['api', 'v1', 'trips', ...file.split('/').slice(0, -1)];
  routes.push({ file, segments, module: await load(`src/app/api/v1/trips/${file}`) });
}
// Literal segments win over dynamic ones, as in Next.
routes.sort((a, b) => b.segments.filter((s) => !s.startsWith('[')).length - a.segments.filter((s) => !s.startsWith('[')).length);
function match(pathname) {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  for (const route of routes) {
    if (route.segments.length !== parts.length) continue;
    const params = {};
    if (route.segments.every((segment, index) => segment.startsWith('[') ? (params[segment.slice(1, -1)] = parts[index], true) : segment === parts[index])) {
      return { route, params };
    }
  }
  return null;
}

let databases = {};
let overrides = {};
let receipts = new Map();
const log = [];
async function reset() {
  // Each reset starts the trips' clocks again, so stored drives' ages read as fixtures.ts set them.
  started = RealDate.now();
  offset = 0;
  databases = await fixtures.buildFixtureDatabase();
  overrides = {};
  receipts = new Map();
}
await reset();

const stamp = () => new FixtureDate().toISOString();

/** mutate_trip_stay_candidate, in memory: organizer, revision, duplicates and the 30-option cap. */
function candidateRpc(tables, { p_user_id: userId, p_action: action, p_payload: payload }) {
  const trip = tables.trips[0];
  if (trip.owner_user_id !== userId) return { error: { code: '42501' } };
  const list = tables.trip_stay_candidates ??= [];
  const saved = list.find((row) => row.id === payload.id);
  if (action === 'remove') {
    if (!saved) return { data: { id: payload.id, removed: true } };
    if (saved.revision !== payload.expected_revision) return { error: { code: 'PT409' } };
    list.splice(list.indexOf(saved), 1);
    return { data: { id: payload.id, removed: true } };
  }
  const { expected_revision: expected, ...fields } = payload;
  if (expected === null && saved) return { data: saved };
  if (expected !== null && !saved) return { error: { code: 'P0002' } };
  if (saved && saved.revision !== expected) return { error: { code: 'PT409' } };
  const same = (row) => row.id !== fields.id && row.name.toLowerCase() === fields.name.toLowerCase() && (row.address ?? '') === (fields.address ?? '')
    && row.check_in === fields.check_in && row.check_out === fields.check_out;
  if (list.some(same)) return { error: { code: '23505' } };
  if (!saved && list.length >= 30) return { error: { code: '22023', hint: 'limit' } };
  const row = { ...saved, ...fields, trip_id: trip.id, revision: (saved?.revision ?? 0) + 1, created_at: saved?.created_at ?? stamp(), updated_at: stamp() };
  if (saved) list.splice(list.indexOf(saved), 1, row); else list.push(row);
  return { data: row };
}

/** mutate_trip_lodging (and use_trip_stay_candidate with `option`), in memory, for "save" and "assign". */
async function lodgingRpc(tables, params, option) {
  const replay = receipts.get(params.p_request_id);
  if (replay) return replay.body === JSON.stringify(params) ? { data: replay.data } : { error: { code: '22023' } };
  const trip = tables.trips[0];
  if (trip.owner_user_id !== params.p_user_id) return { error: { code: '42501' } };
  const fake = createFakeSupabase(tables);
  const [rows, members] = await Promise.all([lodging.loadLodgingRows(fake, trip.id), lodging.loadLodgingMembers(fake, trip.id)]);
  const now = lodging.buildLodging(trip, rows.stays, rows.assignments, { members, attendance: rows.attendance, per_member: true });
  if (now.revision !== params.p_expected_revision || now.people_key !== params.p_payload.people_key) return { error: { code: 'PT409' } };
  if (option) {
    const saved = (tables.trip_stay_candidates ?? []).find((row) => row.id === option.id);
    if (!saved || saved.revision !== option.revision) return { error: { code: 'PT409', hint: 'option' } };
  }
  const payload = { ...params.p_payload };
  delete payload.people_key;
  let change;
  if (params.p_action === 'save') {
    const { existing, occupants, ...stay } = payload;
    change = { action: 'save', stay, existing, ...(occupants ? { occupants } : {}) };
  } else if (params.p_action === 'assign') change = { action: 'assign', assignments: payload.assignments };
  else return { error: { code: 'QA000', message: `QA fixture: ${params.p_action} isn't modelled` } };
  const applied = applyLodgingChange(trip, rows, members, change);
  if ('error' in applied) return { error: { code: '22023', hint: 'rejected' } };
  if (applied.conflicts.size && !params.p_replace_nights) return { error: { code: '23P01' } };
  tables.trip_stays = applied.stays.map((stay) => {
    const before = rows.stays.find((entry) => entry.id === stay.id);
    return { ...before, ...stay, trip_id: trip.id, created_at: before?.created_at ?? stamp(), updated_at: before && JSON.stringify(before) === JSON.stringify({ ...before, ...stay }) ? before.updated_at : stamp() };
  });
  tables.trip_member_lodging_nights = applied.assignments.map((row) => ({ ...row, trip_id: trip.id }));
  trip.lodging_revision = (trip.lodging_revision ?? 0) + 1;
  const data = { revision: trip.lodging_revision };
  receipts.set(params.p_request_id, { body: JSON.stringify(params), data });
  return { data };
}

/** The fake client, with the upsert drive estimates use and rpc for saves. */
function client(tables) {
  const fake = createFakeSupabase(tables);
  return {
    from(table) {
      const query = fake.from(table);
      // Calculated drives aren't kept: with the provider down there are none.
      if (!query.upsert) query.upsert = () => Promise.resolve({ data: null, error: null });
      return query;
    },
    async rpc(name, params) {
      const forced = overrides[`rpc:${name}`];
      if (forced) {
        if (forced.times !== undefined && --forced.times <= 0) delete overrides[`rpc:${name}`];
        return { data: null, error: forced };
      }
      if (name === 'mutate_trip_stay_candidate') return candidateRpc(tables, params);
      if (name === 'mutate_trip_lodging') return lodgingRpc(tables, params);
      if (name === 'use_trip_stay_candidate') {
        const { p_candidate_id: id, p_candidate_revision: revision, ...rest } = params;
        return lodgingRpc(tables, { ...rest, p_action: 'save' }, { id, revision });
      }
      return { data: null, error: { code: 'QA000', message: `QA fixture: ${name} isn't modelled` } };
    },
  };
}

const readBody = (req) => new Promise((done) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => done(Buffer.concat(chunks)));
});
const viewerOf = (req) => req.headers['x-qa213-viewer'] ?? /(?:^|;\s*)qa213_viewer=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;

async function handle(req, res, url, body) {
  const viewer = viewerOf(req);
  const key = `${req.method} ${url.pathname}`;
  const tripId = url.pathname.split('/')[4];
  const entry = { at: new RealDate().toISOString(), key, search: url.search, viewer, status: 0, body: body.length ? body.toString().slice(0, 2000) : undefined };
  log.push(entry);
  if (log.length > 3000) log.shift();
  const forced = overrides[key];
  if (forced) {
    if (forced.times !== undefined && --forced.times <= 0) delete overrides[key];
    if (forced.delay) await new Promise((done) => setTimeout(done, forced.delay));
    if (forced.status) {
      entry.status = forced.status;
      res.writeHead(forced.status, { 'Content-Type': forced.body === undefined ? 'text/html' : 'application/json' });
      res.end(forced.body === undefined ? '<html>fixture</html>' : JSON.stringify(forced.body));
      return;
    }
  }
  const found = match(url.pathname);
  const handler = found?.route.module[req.method];
  if (!found || !handler || !(tripId in databases)) {
    entry.status = 404;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  current.userId = viewer;
  current.supabase = client(databases[tripId]);
  const pinned = fixtures.FIXTURE_TRIPS[tripId]?.now;
  offset = pinned ? RealDate.parse(pinned) - started : 0;
  try {
    const request = new NextRequest(new URL(`${url.pathname}${url.search}`, 'http://localhost:3432'), {
      method: req.method, headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) || body.length === 0 ? undefined : body,
    });
    const response = await handler(request, { params: Promise.resolve(found.params) });
    entry.status = response.status;
    const text = Buffer.from(await response.arrayBuffer());
    if (response.status >= 400) entry.response = text.toString().slice(0, 500);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(text);
  } catch (error) {
    entry.status = 500;
    entry.error = String(error?.stack ?? error);
    console.error(key, error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'QA fixture server error' }));
  } finally {
    offset = 0;
    current.userId = null;
    current.supabase = null;
  }
}

// One request at a time: the clock and the signed-in person are process-wide.
let queue = Promise.resolve();
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = await readBody(req);
  const json = (value) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/__qa/overrides') {
    if (req.method === 'DELETE') overrides = {};
    else Object.assign(overrides, JSON.parse(body.toString() || '{}'));
    return json(overrides);
  }
  if (url.pathname === '/__qa/reset') {
    queue = queue.then(reset);
    await queue;
    return json({ reset: true });
  }
  if (url.pathname === '/__qa/log') return json(log);
  if (url.pathname === '/__qa/tables') return json(databases[url.searchParams.get('trip')] ?? null);
  if (url.pathname === '/__qa/health') return json({ ok: true });
  queue = queue.then(() => handle(req, res, url, body)).catch((error) => console.error(error));
}).listen(port, '127.0.0.1', () => console.log(`QA #213 fixture API on http://127.0.0.1:${port} (${routes.length} trip routes)`));

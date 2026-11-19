// Fixture API server for the #214 browser checks. Like #337's api.mjs, it runs
// the app's real /api/v1/trips route handlers (the brief route among them)
// against #337's fictional fixture database, with only sign-in, the database
// client and the rate limiter swapped (docs/qa/337-group-planning/server/).
// No database, Clerk, routing or forecast provider is ever called.
//
//   API_PORT=39214 node docs/qa/214-offline-brief/api.mjs
//
// The signed-in person is the `qa337_viewer` cookie (fake-clerk.tsx sets the
// same one). What it adds to #337's server:
//   GET /api/v1/trips            the trip list, over every fixture trip
//   GET /qa214/clerk             answers, so the fake Clerk "loads" online
//   POST /__qa/mutate            {"trip","table","where":{...},"set":{...}} or "delete":true,
//                                to change the trip under a saved copy
//   POST /__qa/overrides         {"GET /api/v1/trips/<id>/brief": {"status": 503, "body": {...}}
//                                 or {"truncate": true} (half the body, then the connection drops)
//                                 or {"corrupt": true} (whole JSON, one day missing), "times": 1}
//   DELETE /__qa/overrides, POST /__qa/reset, GET /__qa/log
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const fixtureDir = resolve(root, 'docs/qa/337-group-planning');
const port = Number(process.env.API_PORT ?? 39214);

process.env.GEOAPIFY_API_KEY = 'qa214-fixture-key';
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY']) delete process.env[key];

// Each trip's fixed "now", advancing in real time from the last reset.
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

// The brief route never calls a provider; anything outbound is refused.
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'geoapify.com' || url.hostname.endsWith('.geoapify.com')) throw new TypeError('fetch failed');
  throw new Error(`QA fixture: blocked a request to ${url.host}`);
};

const vite = await createVite({
  configFile: false, root, appType: 'custom', logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: {
    alias: [
      { find: 'server-only', replacement: resolve(root, 'node_modules/server-only/empty.js') },
      { find: /^@\/lib\/auth$/, replacement: resolve(fixtureDir, 'server/auth.ts') },
      { find: /^@\/lib\/supabase$/, replacement: resolve(fixtureDir, 'server/supabase.ts') },
      { find: /^@\/lib\/rate-limit$/, replacement: resolve(fixtureDir, 'server/rate-limit.ts') },
      { find: /^@\//, replacement: `${resolve(root, 'src')}/` },
    ],
  },
});
const load = (file) => vite.ssrLoadModule(resolve(root, file));
const fixtures = await load('docs/qa/337-group-planning/fixtures.ts');
const { createFakeSupabase } = await load('src/test/fakeSupabase.ts');
const { request: current } = await load('docs/qa/337-group-planning/server/state.ts');
const { NextRequest } = await import('next/server.js');

const base = resolve(root, 'src/app/api/v1/trips');
const routes = [];
for (const file of (await readdir(base, { recursive: true })).filter((name) => name.endsWith('route.ts'))) {
  const segments = ['api', 'v1', 'trips', ...file.split('/').slice(0, -1)].filter((segment) => segment !== '');
  routes.push({ file, segments, module: await load(`src/app/api/v1/trips/${file}`) });
}
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
const log = [];
async function reset() {
  offset = 0;
  started = RealDate.now();
  databases = await fixtures.buildFixtureDatabase();
  overrides = {};
}
await reset();

/** Every trip's rows together, for the trip list. */
function merged() {
  const tables = {};
  for (const trip of Object.values(databases)) {
    for (const [name, rows] of Object.entries(trip)) (tables[name] ??= []).push(...rows);
  }
  return tables;
}

function client(tables) {
  const fake = createFakeSupabase(tables);
  return {
    from(table) {
      const query = fake.from(table);
      if (!query.upsert) query.upsert = () => Promise.resolve({ data: null, error: null });
      return query;
    },
    async rpc() {
      return { data: null, error: { code: 'QA000', message: 'QA fixture: saves are switched off' } };
    },
  };
}

const readBody = (req) => new Promise((done) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => done(Buffer.concat(chunks)));
});
const viewerOf = (req) => /(?:^|;\s*)qa337_viewer=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;

async function handle(req, res, url, body) {
  const viewer = viewerOf(req);
  const key = `${req.method} ${url.pathname}`;
  const tripId = url.pathname.split('/')[4];
  const entry = { at: new RealDate().toISOString(), key, search: url.search, viewer, status: 0 };
  log.push(entry);
  if (log.length > 2000) log.shift();
  const forced = overrides[key];
  if (forced && forced.times !== undefined && --forced.times <= 0) delete overrides[key];
  if (forced?.delay) await new Promise((done) => setTimeout(done, forced.delay));
  if (forced?.status) {
    entry.status = forced.status;
    res.writeHead(forced.status, { 'Content-Type': forced.body === undefined ? 'text/html' : 'application/json' });
    res.end(forced.body === undefined ? '<html>fixture</html>' : JSON.stringify(forced.body));
    return;
  }
  const found = match(url.pathname);
  const handler = found?.route.module[req.method];
  const list = url.pathname === '/api/v1/trips';
  if (!found || !handler || !(list || tripId in databases || tripId === 'kits')) {
    entry.status = 404;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  current.userId = viewer;
  current.supabase = client(list ? merged() : databases[tripId] ?? {});
  const pinned = fixtures.FIXTURE_TRIPS[tripId]?.now;
  offset = pinned ? RealDate.parse(pinned) - started : 0;
  try {
    const request = new NextRequest(new URL(`${url.pathname}${url.search}`, 'http://localhost:3433'), {
      method: req.method, headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) || body.length === 0 ? undefined : body,
    });
    const response = await handler(request, { params: Promise.resolve(found.params) });
    entry.status = response.status;
    const headers = Object.fromEntries(response.headers);
    let payload = Buffer.from(await response.arrayBuffer());
    if (forced?.corrupt && response.ok) {
      // Whole, valid JSON, but the brief lost a day: it no longer matches its covered dates.
      const json = JSON.parse(payload.toString());
      json.brief.days.pop();
      payload = Buffer.from(JSON.stringify(json));
      entry.forced = 'corrupt';
    }
    headers['content-length'] = String(payload.length);
    res.writeHead(response.status, headers);
    if (forced?.truncate) {
      // Half the brief arrives, then the connection drops.
      entry.forced = 'truncate';
      res.write(payload.subarray(0, Math.floor(payload.length / 2)));
      setTimeout(() => res.destroy(), 50);
      return;
    }
    res.end(payload);
  } catch (error) {
    entry.status = 500;
    // The request log (GET /__qa/log) keeps the message only; the stack goes to this server's console.
    entry.error = String(error?.message ?? error);
    console.error(key, error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'QA fixture server error' }));
  } finally {
    offset = 0;
    current.userId = null;
    current.supabase = null;
  }
}

function mutate({ trip, table, where, set, delete: remove }) {
  const rows = databases[trip]?.[table];
  if (!rows) throw new Error(`No table ${table} on ${trip}`);
  const hits = rows.filter((row) => Object.entries(where).every(([field, value]) => row[field] === value));
  if (remove) databases[trip][table] = rows.filter((row) => !hits.includes(row));
  else for (const row of hits) Object.assign(row, set);
  return hits.length;
}

let queue = Promise.resolve();
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = await readBody(req);
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/qa214/clerk') return json({ loaded: true });
  if (url.pathname === '/__qa/overrides') {
    if (req.method === 'DELETE') overrides = {};
    else Object.assign(overrides, JSON.parse(body.toString() || '{}'));
    return json(overrides);
  }
  if (url.pathname === '/__qa/mutate') {
    try { return json({ changed: mutate(JSON.parse(body.toString())) }); } catch (error) { return json({ error: String(error) }, 400); }
  }
  if (url.pathname === '/__qa/reset') {
    queue = queue.then(reset);
    await queue;
    return json({ reset: true });
  }
  if (url.pathname === '/__qa/log') return json(log);
  if (url.pathname === '/__qa/health') return json({ ok: true });
  queue = queue.then(() => handle(req, res, url, body)).catch((error) => console.error(error));
}).listen(port, '127.0.0.1', () => console.log(`QA #214 fixture API on http://127.0.0.1:${port} (${routes.length} trip routes)`));

// Fixture API server for the #211 browser checks. Like #337's api.mjs, it runs
// the app's real /api/v1/trips route handlers (and everything they call), with
// only sign-in, the database client and the rate limiter swapped, reusing
// #337's stand-ins (../337-group-planning/server/). The database is db.mjs:
// PGlite with every migration applied, so saves run the real SQL functions.
// shim.patch rewrites /api/v1/trips/00000211-* to it.
//
//   API_PORT=34312 node docs/qa/211-conditions/api.mjs
//
// The signed-in person is the `qa211_viewer` cookie or the x-qa211-viewer
// header (a Clerk user id from VIEWERS in fixtures.mjs). Outbound requests are
// stubbed: Open-Meteo answers time zones but its forecast is down (503),
// Avalanche Canada answers fixtures.mjs's areas, routing fails, and anything
// else is refused. Test hooks:
//   POST /__qa/overrides {"rpc:record_trip_conditions_review": {"code": "XX000", "message": "...", "times": 1},
//                         "POST /api/v1/trips/<id>/...": {"status": 503, "times": 1}, "avalanche-canada": "down"}
//   DELETE /__qa/overrides, POST /__qa/reset, GET /__qa/log, GET /__qa/health
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabase, supabaseFor } from './db.mjs';
import { AVALANCHE_CANADA, seed } from './fixtures.mjs';

const root = process.cwd();
const shared = resolve(root, 'docs/qa/337-group-planning/server');
const port = Number(process.env.API_PORT ?? 34312);

// No real provider or database, whatever .env.local says.
process.env.GEOAPIFY_API_KEY = 'qa211-fixture-key';
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY']) delete process.env[key];

let overrides = {};
const take = (key) => {
  const forced = overrides[key];
  if (forced && forced.times !== undefined && --forced.times <= 0) delete overrides[key];
  return forced;
};

globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.host === 'api.open-meteo.com') {
    const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
    // The forecast provider is down for the whole run; time zone lookups still answer.
    if (url.searchParams.has('hourly')) return new Response('{"error":true,"reason":"fixture outage"}', { status: 503 });
    return Response.json({ latitude, longitude, timezone: longitude < -100 ? 'America/Vancouver' : 'America/New_York' });
  }
  if (url.host === 'avcan-services-api.prod.avalanche.ca') {
    if (overrides['avalanche-canada'] === 'down') return new Response('unavailable', { status: 503 });
    if (url.pathname.endsWith('/areas')) return Response.json(AVALANCHE_CANADA.areas);
    if (url.pathname.endsWith('/metadata')) return Response.json(AVALANCHE_CANADA.metadata);
  }
  if (url.hostname === 'geoapify.com' || url.hostname.endsWith('.geoapify.com')) throw new TypeError('fetch failed');
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
const { request: current } = await load('docs/qa/337-group-planning/server/state.ts');
const { NextRequest } = await import('next/server.js');

const base = resolve(root, 'src/app/api/v1/trips');
const routes = [];
for (const file of (await readdir(base, { recursive: true })).filter((name) => name.endsWith('route.ts'))) {
  routes.push({ file, segments: ['api', 'v1', 'trips', ...file.split('/').slice(0, -1)], module: await load(`src/app/api/v1/trips/${file}`) });
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

let db, client;
const log = [];
async function reset() {
  await db?.close();
  db = await createDatabase(root);
  await seed(db);
  overrides = {};
  // An injected failure answers in place of the function, so nothing is saved.
  client = supabaseFor(db, { before: (name) => take(`rpc:${name}`) });
}
await reset();

const readBody = (req) => new Promise((done) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => done(Buffer.concat(chunks)));
});
const viewerOf = (req) => req.headers['x-qa211-viewer'] ?? /(?:^|;\s*)qa211_viewer=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;

async function handle(req, res, url, body) {
  const viewer = viewerOf(req);
  const key = `${req.method} ${url.pathname}`;
  const entry = { at: new Date().toISOString(), key, viewer, status: 0, body: body.length ? body.toString().slice(0, 2000) : undefined };
  log.push(entry);
  if (log.length > 5000) log.shift();
  const forced = take(key);
  if (forced?.status) {
    entry.status = forced.status;
    res.writeHead(forced.status, { 'Content-Type': forced.body === undefined ? 'text/html' : 'application/json' });
    res.end(forced.body === undefined ? '<html>fixture</html>' : JSON.stringify(forced.body));
    return;
  }
  const found = match(url.pathname);
  const handler = found?.route.module[req.method];
  if (!found || !handler) {
    entry.status = 404;
    res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  current.userId = viewer;
  current.supabase = client;
  try {
    const request = new NextRequest(new URL(`${url.pathname}${url.search}`, 'http://localhost:3431'), {
      method: req.method, headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) || body.length === 0 ? undefined : body,
    });
    const response = await handler(request, { params: Promise.resolve(found.params) });
    const bytes = Buffer.from(await response.arrayBuffer());
    entry.status = response.status;
    if (req.method !== 'GET') entry.response = bytes.toString().slice(0, 2000);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(bytes);
  } catch (error) {
    entry.status = 500;
    entry.error = String(error?.stack ?? error);
    console.error(key, error);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'QA fixture server error' }));
  } finally {
    current.userId = null;
    current.supabase = null;
  }
}

// One request at a time: the signed-in person is process-wide.
let queue = Promise.resolve();
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const body = await readBody(req);
  const json = (value) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
  if (url.pathname === '/__qa/overrides') {
    if (req.method === 'DELETE') overrides = {}; else Object.assign(overrides, JSON.parse(body.toString() || '{}'));
    return json(overrides);
  }
  if (url.pathname === '/__qa/reset') { queue = queue.then(reset); await queue; log.length = 0; return json({ reset: true }); }
  if (url.pathname === '/__qa/log') return json(log);
  if (url.pathname === '/__qa/sql') {
    // Read-only checks of what was stored, for the record (run.mjs).
    const result = await (queue = queue.then(() => db.query(`SELECT coalesce(json_agg(q), '[]'::json) AS rows FROM (${body.toString()}) q`)));
    return json(result.rows[0].rows);
  }
  if (url.pathname === '/__qa/health') return res.writeHead(200).end('ok');
  queue = queue.then(() => handle(req, res, url, body)).catch((error) => console.error(error));
}).listen(port, '127.0.0.1', () => console.log(`QA #211 fixture API on http://127.0.0.1:${port} (${routes.length} trip routes)`));

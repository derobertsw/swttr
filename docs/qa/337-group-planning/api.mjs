// Fixture API server for the #337 browser validation. It runs the app's real
// /api/v1/trips route handlers (and everything they call) against the fixture
// database in fixtures.ts, with only sign-in, the database client and the
// rate limiter swapped (see server/). The Next shim in shim.patch rewrites
// /api/v1/trips/qa337-* to it. No database, Clerk, routing or forecast
// provider is ever called: forecasts and time zones come from a stub, and the
// routing provider always fails, as when it's down.
//
//   API_PORT=3417 node docs/qa/337-group-planning/api.mjs
//
// The signed-in person is the `qa337_viewer` cookie (a Clerk user id from
// VIEWERS in fixtures.ts). Saves reach the route, which then gets a database
// error unless an override says otherwise:
//   POST /__qa/overrides {"PUT /api/v1/trips/<id>/...": {"status": 503, "body": {...}, "delay": 1500, "times": 1},
//                         "rpc:set_trip_day_notes": {"code": "PT409", "message": "..."}}
//   DELETE /__qa/overrides, POST /__qa/reset, GET /__qa/log
import { createServer as createVite } from 'vite';
import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const here = resolve(root, 'docs/qa/337-group-planning');
const port = Number(process.env.API_PORT ?? 3417);

// No real provider or database, whatever .env.local says.
process.env.GEOAPIFY_API_KEY = 'qa337-fixture-key';
for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLERK_SECRET_KEY']) delete process.env[key];

// Each trip's fixed "now", advancing in real time from the server's start.
const RealDate = Date;
const started = RealDate.now();
let offset = 0;
class FixtureDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }
  static now() { return RealDate.now() + offset; }
}
globalThis.Date = FixtureDate;

let failing = [];
const ZONE = 'America/New_York';
/** Open-Meteo as the forecast code reads it: 16 days of hours from the destination's midnight. */
function forecast(latitude, longitude) {
  if (failing.some((point) => Math.abs(point.latitude - latitude) < 1e-6 && Math.abs(point.longitude - longitude) < 1e-6)) {
    return new Response('{"error":true,"reason":"fixture outage"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const now = new FixtureDate();
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  // "GMT-4" → 4 hours behind UTC.
  const behind = -Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, timeZoneName: 'shortOffset' }).formatToParts(now)
    .find((part) => part.type === 'timeZoneName').value.replace('GMT', '') || 0);
  const midnight = RealDate.parse(`${local}T00:00:00Z`) + behind * 3_600_000;
  const winter = now.getUTCMonth() < 2 || now.getUTCMonth() === 11;
  const time = [], temperature_2m = [], wind_speed_10m = [], precipitation_probability = [];
  for (let hour = 0; hour < 16 * 24; hour += 1) {
    const clock = hour % 24;
    time.push(Math.round((midnight + hour * 3_600_000) / 1000));
    temperature_2m.push((winter ? 12 : 36) + 10 * Math.sin(((clock - 9) / 24) * 2 * Math.PI) + (hour % 48 === 0 ? 1 : 0));
    wind_speed_10m.push(8 + (clock % 7));
    precipitation_probability.push(clock > 12 && clock < 18 ? 40 : 15);
  }
  return Response.json({ latitude, longitude, timezone: ZONE, hourly: { time, temperature_2m, wind_speed_10m, precipitation_probability } });
}
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.host === 'api.open-meteo.com') {
    const latitude = Number(url.searchParams.get('latitude')), longitude = Number(url.searchParams.get('longitude'));
    return url.searchParams.has('hourly') ? forecast(latitude, longitude) : Response.json({ latitude, longitude, timezone: ZONE });
  }
  // The routing provider is down for the whole run.
  if (url.hostname === 'geoapify.com' || url.hostname.endsWith('.geoapify.com')) throw new TypeError('fetch failed');
  throw new Error(`QA fixture: blocked a request to ${url.host}`);
};

const vite = await createVite({
  configFile: false, root, appType: 'custom', logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: {
    alias: [
      { find: 'server-only', replacement: resolve(root, 'node_modules/server-only/empty.js') },
      { find: /^@\/lib\/auth$/, replacement: resolve(here, 'server/auth.ts') },
      { find: /^@\/lib\/supabase$/, replacement: resolve(here, 'server/supabase.ts') },
      { find: /^@\/lib\/rate-limit$/, replacement: resolve(here, 'server/rate-limit.ts') },
      { find: /^@\//, replacement: `${resolve(root, 'src')}/` },
    ],
  },
});
const load = (file) => vite.ssrLoadModule(resolve(root, file));
const fixtures = await load('docs/qa/337-group-planning/fixtures.ts');
const { createFakeSupabase } = await load('src/test/fakeSupabase.ts');
const { request: current } = await load('docs/qa/337-group-planning/server/state.ts');
const { NextRequest } = await import('next/server.js');
failing = fixtures.FAILING_FORECASTS;

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
const log = [];
async function reset() {
  offset = 0;
  databases = Object.fromEntries(Object.entries(await fixtures.buildFixtureDatabase()).map(([id, tables]) => [id, tables]));
  overrides = {};
}
await reset();

/** The fake client, with the upsert drive estimates use and rpc for saves. */
function client(tables) {
  const fake = createFakeSupabase(tables);
  return {
    from(table) {
      const query = fake.from(table);
      if (!query.upsert) query.upsert = () => Promise.resolve({ data: null, error: null });
      return query;
    },
    async rpc(name) {
      const forced = overrides[`rpc:${name}`];
      return { data: null, error: forced ?? { code: 'QA000', message: 'QA fixture: saves are switched off' } };
    },
  };
}

const readBody = (req) => new Promise((done) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => done(Buffer.concat(chunks)));
});
const viewerOf = (req) => req.headers['x-qa337-viewer'] ?? /(?:^|;\s*)qa337_viewer=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? null;

async function handle(req, res, url, body) {
  const viewer = viewerOf(req);
  const key = `${req.method} ${url.pathname}`;
  const tripId = url.pathname.split('/')[4];
  const entry = { at: new RealDate().toISOString(), key, viewer, status: 0 };
  log.push(entry);
  if (log.length > 2000) log.shift();
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
  if (!found || !handler || !(tripId in databases || tripId === 'kits' || tripId === 'invite')) {
    entry.status = 404;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  current.userId = viewer;
  current.supabase = client(databases[tripId] ?? {});
  const pinned = fixtures.FIXTURE_TRIPS[tripId]?.now;
  offset = pinned ? RealDate.parse(pinned) - started : 0;
  try {
    const request = new NextRequest(new URL(`${url.pathname}${url.search}`, 'http://localhost:3416'), {
      method: req.method, headers: { 'content-type': req.headers['content-type'] ?? 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) || body.length === 0 ? undefined : body,
    });
    const response = await handler(request, { params: Promise.resolve(found.params) });
    entry.status = response.status;
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
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
  if (url.pathname === '/__qa/overrides') {
    if (req.method === 'DELETE') overrides = {};
    else Object.assign(overrides, JSON.parse(body.toString() || '{}'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(overrides));
    return;
  }
  if (url.pathname === '/__qa/reset') {
    queue = queue.then(reset);
    await queue;
    res.writeHead(200).end('reset');
    return;
  }
  if (url.pathname === '/__qa/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(log));
    return;
  }
  if (url.pathname === '/__qa/health') {
    res.writeHead(200).end('ok');
    return;
  }
  queue = queue.then(() => handle(req, res, url, body)).catch((error) => console.error(error));
}).listen(port, '127.0.0.1', () => console.log(`QA #337 fixture API on http://127.0.0.1:${port} (${routes.length} trip routes)`));

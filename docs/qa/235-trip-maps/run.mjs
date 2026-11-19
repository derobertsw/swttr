// #235 trip map checks against a local production build with the QA-only
// preview edits (see README.md, "Re-running"):
//   node docs/qa/235-trip-maps/run.mjs [--base http://127.0.0.1:3435] [--out <dir>] [group ...]
// Groups: lazy journeys departures edge keyboard ax recovery stale layout perf shots,
// plus three that only run when named:
// - offline (#214's saved brief and offline entry) needs --upstream <next start URL>:
//   --base is then a gate this script closes, so even the service worker finds no server.
// - edits (map links into the editors, and a failed edit).
// - compare (box 6's core trip load) needs --compare name=url=dir,... with each
//   build's server and its .next directory, e.g. before=http://localhost:3437=../qa-235-before/.next.
// Every trip API request is answered in the browser from fixtures.ts; Clerk is
// blocked; OpenFreeMap tiles are fetched once and then served from
// <out>/tile-cache, except in `perf`, which measures the real network.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { connect, createServer as tcpServer } from 'node:net';
import { launch, sleep } from './cdp.mjs';
import { loadFixtures } from './fixtures.mjs';

/** A JS string literal for code evaluated in the page, safe inside any script context. */
function literal(value) {
  const unsafe = { '<': '\\u003C', '>': '\\u003E', '/': '\\u002F', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\0': '\\0', '\u2028': '\\u2028', '\u2029': '\\u2029' };
  return JSON.stringify(value).replace(/[<>\b\f\n\r\t\0\u2028\u2029]/g, (char) => unsafe[char]);
}

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args.splice(index, 2)[1];
};
const BASE = option('--base', 'http://127.0.0.1:3435');
const OUT = resolve(option('--out', 'docs/qa/235-trip-maps/out'));
const UPSTREAM = option('--upstream', null);
const COMPARE = option('--compare', '');
const ALL = ['lazy', 'journeys', 'departures', 'edge', 'keyboard', 'ax', 'recovery', 'stale', 'layout', 'perf', 'shots'];
const groups = args.length ? args : ALL;
const API_DELAY = 150;
const fx = await loadFixtures();

/**
 * With --upstream, --base is a TCP gate in front of `next start`. down() drops
 * every connection and stops listening, so the page, the service worker and
 * Chrome itself find no server: a real loss of connection, not just a tab's.
 */
const gate = UPSTREAM ? await (async () => {
  const from = new URL(BASE), to = new URL(UPSTREAM), sockets = new Set();
  let server = null;
  const up = () => new Promise((done, fail) => {
    if (server) return done();
    const current = server = tcpServer((client) => {
      // A connection Chrome opens while the gate closes is dropped too.
      if (server !== current) return client.destroy();
      const target = connect(Number(to.port), to.hostname);
      const end = () => { client.destroy(); target.destroy(); sockets.delete(client); sockets.delete(target); };
      for (const socket of [client, target]) { sockets.add(socket); socket.on('error', end); socket.on('close', end); }
      client.pipe(target).pipe(client);
    });
    server.once('error', fail);
    server.listen(Number(from.port), from.hostname, done);
  });
  // Stops listening at once; close() only calls back once every connection is gone, so don't wait for it.
  const down = async () => {
    if (!server) return;
    const closing = server; server = null;
    closing.close();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await sleep(100);
  };
  await up();
  return { up, down };
})() : null;
await mkdir(join(OUT, 'tile-cache'), { recursive: true });
// Groups run separately add to the same results file.
const results = await readFile(join(OUT, 'results.json'), 'utf8').then(JSON.parse).catch(() => ({}));
const shot = (name) => join(OUT, `${name}.png`);
const SAT = '2027-01-09', SUN = '2027-01-10';

// ---------- in-page helpers ----------
const helpers = (viewer) => `
try { localStorage.setItem('qa235User', ${literal(viewer)}); } catch {}
window.__qa = {
  norm: (text) => (text || '').replace(/\\s+/g, ' ').trim(),
  find(selector, text) { return [...document.querySelectorAll(selector)].find((el) => !text || __qa.norm(el.textContent).includes(text) || (el.getAttribute('aria-label') || '').includes(text)); },
  click(selector, text) { const el = __qa.find(selector, text); if (!el) throw new Error('No ' + selector + ' ' + (text || '')); el.click(); return true; },
  select(id, value) { const el = document.getElementById(id); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('change', { bubbles: true })); return el.value; },
  describe(el) {
    if (!el || el === document.body) return 'body';
    const name = el.getAttribute('aria-label') || __qa.norm(el.textContent).slice(0, 80);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '') + ' "' + name + '"';
  },
  focusRing(el) { const s = getComputedStyle(el); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none'); },
  visible(el) { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !el.closest('[aria-hidden=true], .sr-only'); },
  rowText(term) { const dt = [...document.querySelectorAll('#map-day-heading ~ dl dt')].find((el) => __qa.norm(el.textContent) === term); return dt ? __qa.norm(dt.nextElementSibling.textContent) : null; },
  overflow() {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('main *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= width + 1) return false;
      for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) if (getComputedStyle(up).overflowX !== 'visible') return false;
      return true;
    }).slice(0, 8).map(__qa.describe);
    return { innerWidth, clientWidth: width, scrollWidth: document.documentElement.scrollWidth, offenders };
  },
  targets(scope = 'main') {
    const root = document.querySelector(scope) || document.body;
    return [...root.querySelectorAll('a[href], button, select, input, summary, [role=button]')].filter((el) => __qa.visible(el) && !el.disabled)
      .map((el) => { const r = el.getBoundingClientRect(); return { el: __qa.describe(el), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((t) => t.w < 44 || t.h < 44);
  },
  rgba(color) {
    const c = __qa.canvas || (__qa.canvas = document.createElement('canvas')); c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255];
  },
  luminance([r, g, b]) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); },
  background(el) {
    const layers = [];
    for (let up = el; up; up = up.parentElement) { const bg = __qa.rgba(getComputedStyle(up).backgroundColor); if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; } }
    let out = __qa.rgba(getComputedStyle(document.documentElement).backgroundColor); if (out[3] < 1) out = [255, 255, 255, 1];
    for (const layer of layers.reverse()) out = out.map((v, i) => i < 3 ? layer[i] * layer[3] + v * (1 - layer[3]) : 1);
    return out;
  },
  contrast(scope = 'main') {
    const root = document.querySelector(scope) || document.body, seen = new Set(), failures = [];
    let checked = 0, min = 99;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent.trim() || !__qa.visible(el) || el.closest('canvas, .maplibregl-canvas-container, [disabled]')) continue;
      seen.add(el);
      const s = getComputedStyle(el); if (parseFloat(s.opacity) < 1) continue;
      const fg = __qa.rgba(s.color), bg = __qa.background(el);
      const color = fg.map((v, i) => i < 3 ? v * fg[3] + bg[i] * (1 - fg[3]) : 1);
      const [hi, lo] = [__qa.luminance(color), __qa.luminance(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05), size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      checked++; min = Math.min(min, ratio);
      if (ratio < (large ? 3 : 4.5)) failures.push({ text: __qa.norm(el.textContent).slice(0, 60), ratio: Math.round(ratio * 100) / 100, size });
    }
    return { checked, min: Math.round(min * 100) / 100, failures: failures.slice(0, 10) };
  },
  attribution() {
    const el = document.querySelector('footer[aria-label="Map and place attribution"]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), map = document.querySelector('.maplibregl-map'), s = getComputedStyle(el);
    return { text: __qa.norm(el.textContent), visible: __qa.visible(el), top: Math.round(r.top + scrollY), height: Math.round(r.height), fontSize: s.fontSize,
      belowMap: map ? Math.round(r.top - map.getBoundingClientRect().bottom) : null, links: [...el.querySelectorAll('a')].map((a) => ({ text: __qa.norm(a.textContent), href: a.href, h: Math.round(a.getBoundingClientRect().height) })) };
  },
  live() { return [...document.querySelectorAll('[role=status],[aria-live],[role=alert]')].map((el) => __qa.norm(el.textContent)).filter(Boolean); },
  canvasReady() { const zoom = document.querySelector('button[aria-label="Zoom in"]'); return !!zoom && !zoom.disabled; },
};`;

// ---------- fixture API, tile cache and blocking ----------
const cacheFile = (url) => join(OUT, 'tile-cache', createHash('sha1').update(url).digest('hex'));
function geometry(trip, date, revision) {
  const day = trip.map.days.find((entry) => entry.date === date);
  if (!day) return { status: 404, body: { error: 'Day not found' } };
  if (!revision) return { status: 400, body: { error: 'Choose a route revision.' } };
  const drive = [day.geometry, ...(day.departures ?? []).map((departure) => departure.geometry)].find((entry) => entry.revision === revision)
    ?? (revision === day.revision ? day.geometry : null);
  if (!drive) return { status: 409, body: { error: 'The day changed. Refresh the trip map.', code: 'revision_changed' } };
  const base = { trip_id: trip.map.trip.id, day_id: day.id, date, revision, mode: 'drive', origin_place_id: drive.origin_place_id, access_place_id: drive.access_place_id };
  const line = trip.lines[revision];
  return { delay: 300, body: line
    ? { ...base, state: 'available', geometry: { type: 'MultiLineString', coordinates: line }, provider: 'geoapify', calculated_at: '2027-01-07T15:00:00Z', attribution: [{ label: 'Powered by Geoapify', url: 'https://www.geoapify.com/' }] }
    : { ...base, state: drive.state === 'not_applicable' ? 'not_applicable' : 'unavailable', geometry: null } };
}
function tripApi(url, method, viewer, data = fx) {
  const match = url.pathname.match(/^\/api\/v1\/trips\/(trip-(?:drive|edge|split))(\/.*)?$/);
  if (!match) return { status: 503, body: { error: 'Not served by the #235 fixture' } };
  const trip = data[match[1]], rest = match[2] ?? '';
  if (method !== 'GET') return { status: 503, body: { error: 'The #235 fixture is read-only' } };
  if (rest === '') return trip.full[viewer] ? { body: trip.full[viewer], delay: API_DELAY } : { status: 403, body: { error: 'Not a member of this trip' } };
  if (rest === '/map') return { body: trip.map, delay: API_DELAY };
  if (rest === '/drive-estimates') return { body: trip.estimates, delay: API_DELAY };
  if (rest === '/brief') {
    // #214's brief, built by the production builder for the default days only.
    const brief = trip.brief?.[viewer], asked = url.searchParams.get('dates');
    if (!brief) return { status: 503, body: { error: 'No #235 fixture brief for this viewer' } };
    if (asked && asked !== brief.brief.covered.dates.join(',')) return { status: 503, body: { error: 'The #235 fixture brief has the default days only' } };
    return { body: brief, delay: API_DELAY };
  }
  const days = rest.match(/^\/days\/([\d-]+)\/geometry$/);
  if (days) return geometry(trip, days[1], url.searchParams.get('revision'));
  return { status: 503, body: { error: 'Not part of the #235 fixture' } };
}
const deferred = () => { let release; const promise = new Promise((done) => { release = done; }); return { promise, release }; };

const log = (...parts) => { if (process.env.QA_VERBOSE) console.log(new Date().toISOString().slice(11, 19), ...parts); };
async function open(browser, { viewer = 'user-1', width = 1440, height = 1000, dpr = 2, mobile, scheme = 'light', motion = 'no-preference', tiles = 'cache', statics = false, base = BASE } = {}) {
  const page = await browser.newPage();
  page.base = base;
  await page.viewport(width, height, { dpr, mobile: mobile ?? width < 768 });
  await page.media({ scheme, motion });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: helpers(viewer) });
  page.rules = [];           // (url, request) => answer | undefined, first match wins
  page.api = [];             // every trip API request: { path, at }
  page.viewer = viewer;
  const patterns = [`${base}/api/*`, '*clerk*', ...tiles === 'network' ? [] : ['*openfreemap.org*'], ...statics ? [`${base}/_next/static/*`] : []];
  page.fetchPatterns = patterns.map((urlPattern) => ({ urlPattern, requestStage: 'Request' }));
  if (tiles === 'cache') page.fetchPatterns.push({ urlPattern: '*openfreemap.org*', requestStage: 'Response' });
  page.on('Fetch.requestPaused', (params, session) => void handle(page, params, session).catch((error) => {
    if (!/Invalid InterceptionId|Invalid state|No such|Target closed|session/i.test(error.message)) console.error('intercept', params.request.url.slice(0, 120), error.message);
  }));
  await page.send('Fetch.enable', { patterns: page.fetchPatterns });
  return page;
}
async function handle(page, { requestId, request, responseStatusCode }, session) {
  const url = new URL(request.url);
  if (/clerk/.test(url.hostname)) return page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, session);
  if (responseStatusCode !== undefined) {   // Response stage: an OpenFreeMap answer to keep for the next run
    if (responseStatusCode === 200) {
      const { body, base64Encoded } = await page.send('Fetch.getResponseBody', { requestId }, session);
      await writeFile(cacheFile(request.url), JSON.stringify({ body, base64Encoded }));
    }
    return page.send('Fetch.continueRequest', { requestId }, session);
  }
  for (const rule of page.rules) {
    const answer = await rule(url, request);
    if (answer) return respond(page, session, requestId, answer);
  }
  if (url.hostname === 'openfreemap.org' || url.hostname.endsWith('.openfreemap.org')) {
    const cached = await readFile(cacheFile(request.url), 'utf8').then(JSON.parse).catch(() => null);
    if (!cached) return page.send('Fetch.continueRequest', { requestId }, session);
    const type = url.pathname.endsWith('.pbf') ? 'application/x-protobuf' : url.pathname.endsWith('.png') ? 'image/png' : 'application/json';
    return page.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }],
      body: cached.base64Encoded ? cached.body : Buffer.from(cached.body).toString('base64') }, session);
  }
  if (url.origin === page.base && url.pathname.startsWith('/api/')) {
    page.api.push({ path: url.pathname + url.search, method: request.method, at: Date.now() });
    return respond(page, session, requestId, tripApi(url, request.method, page.viewer, page.data ?? fx));
  }
  return page.send('Fetch.continueRequest', { requestId }, session);
}
async function respond(page, session, requestId, answer) {
  if (answer.hold) await answer.hold;
  if (answer.delay) await sleep(answer.delay);
  if (answer.fail) return page.send('Fetch.failRequest', { requestId, errorReason: answer.fail }, session);
  if (answer.continue) return page.send('Fetch.continueRequest', { requestId }, session);
  return page.fulfill(session, requestId, answer.status ?? 200, answer.body ?? {});
}
const block = (pattern, fail = 'Failed') => (url) => pattern.test(url.href) ? { fail } : undefined;
const count = (page, pattern) => page.api.filter((entry) => pattern.test(entry.path)).length;
const mapLoaded = (page) => page.requests.some((entry) => /\/_next\/static\/chunks\//.test(entry.url) && MAP_CHUNKS.some((name) => entry.url.endsWith(name)));
const tileRequests = (page) => page.requests.filter((entry) => /openfreemap\.org/.test(entry.url));
/** MapLibre's load event comes before the first tiles paint: wait until tile traffic has been quiet for a second. */
async function settle(page, timeout = 15_000) {
  const started = Date.now();
  await page.waitFor('__qa.canvasReady() || !document.querySelector(".maplibregl-map")', 30_000).catch(() => {});
  while (Date.now() - started < timeout && !await quiet(page)) { /* quiet() waits a second each time */ }
  await sleep(600);
}
async function quiet(page) {
  const before = tileRequests(page).length;
  await sleep(1000);
  return tileRequests(page).length === before && !tileRequests(page).some((entry) => entry.end === undefined && !entry.failed && entry.status === undefined);
}
const ready = (page) => page.waitFor('document.querySelector(\'ul[aria-label="Itinerary places"] button\') || document.querySelector("#map-day-heading")', 20_000);

// The client chunks holding MapLibre, from this build's static output.
const chunkDir = resolve('.next/static/chunks');
const MAP_CHUNKS = [];
const MAP_CSS = [];
for (const name of await readdir(chunkDir)) {
  if (name.endsWith('.js') && /MapLibre GL JS|maplibregl/.test(await readFile(join(chunkDir, name), 'utf8'))) MAP_CHUNKS.push(name);
  if (name.endsWith('.css') && /\.maplibregl-map/.test(await readFile(join(chunkDir, name), 'utf8'))) MAP_CSS.push(name);
}
const mapCss = (page) => page.requests.some((entry) => MAP_CSS.some((name) => entry.url.endsWith(name)));

const browser = await launch();
console.log(`${browser.product}; map chunks ${MAP_CHUNKS.join(', ')}`);
const run = async (name, check) => {
  if (!groups.includes(name)) return;
  const started = Date.now();
  try { results[name] = await check(); } catch (error) { results[name] = { error: error.stack }; }
  console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(1)} s${results[name]?.error ? ` FAILED\n${results[name].error}` : ''}`);
  await writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
};

// ---------- lazy loading and request discipline ----------
await run('lazy', async () => {
  const out = {};
  const page = await open(browser);
  await page.goto(`${BASE}/trips/trip-drive`);
  await page.waitFor('__qa.find("h2", "Places") && /places shown/.test(document.body.textContent)', 20_000);
  await sleep(3000);
  out.overview = { mapChunk: mapLoaded(page), tiles: tileRequests(page).length, worker: page.requests.some((entry) => /maplibre-gl-worker/.test(entry.url)),
    css: mapCss(page), api: page.api.map((entry) => entry.path), places: await page.eval('__qa.norm(__qa.find("section", "View trip map")?.textContent)') };
  await page.eval('__qa.click("a", "View trip map")');
  await page.waitFor('location.pathname.endsWith("/map")');
  await ready(page);
  await page.waitFor('__qa.canvasReady()', 30_000);
  out.openedMap = { mapChunk: mapLoaded(page), css: mapCss(page), tiles: tileRequests(page).length, worker: page.requests.some((entry) => /maplibre-gl-worker/.test(entry.url)), api: page.api.map((entry) => entry.path) };
  const before = page.api.length;
  // Dates, selection, zoom and panning: none of them may route.
  for (const date of ['2027-01-08', SAT, SUN, '2027-01-11', '']) { await page.eval(`__qa.select("map-date", ${literal(date)})`); await sleep(400); }
  await page.eval('__qa.click(\'ul[aria-label="Itinerary places"] button\')'); await sleep(300);
  await page.eval('__qa.click(\'button[aria-label="Zoom in"]\')'); await page.eval('__qa.click(\'button[aria-label="Zoom out"]\')');
  const box = await page.eval('(() => { const r = document.querySelector(".maplibregl-canvas").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
  await page.drag(box, [box[0] + 120, box[1] + 60]); await page.drag(box, [box[0] - 160, box[1] - 40]);
  await sleep(1500);
  out.interactions = { apiAfterOpen: page.api.slice(before).map((entry) => entry.path) };
  await page.eval(`__qa.select("map-date", "${SAT}")`); await sleep(400);
  await page.eval('__qa.click("button", "Show drive")');
  await page.waitFor('/Road route line:/.test(document.body.textContent)');
  await page.eval('__qa.click("button", "Show whole day")'); await sleep(200); await page.eval('__qa.click("button", "Show drive")'); await sleep(800);
  out.showDrive = { geometry: page.api.filter((entry) => /geometry/.test(entry.path)).map((entry) => entry.path.replace(/revision=[^&]+/, 'revision=…')) };
  await page.close();

  const day = await open(browser);
  await day.goto(`${BASE}/trips/trip-drive/days/${SAT}`);
  await day.waitFor('__qa.find("a", "View day map")', 20_000);
  await sleep(3000);
  out.dayPage = { mapChunk: mapLoaded(day), css: mapCss(day), tiles: tileRequests(day).length, api: day.api.map((entry) => entry.path), link: await day.eval('__qa.find("a", "View day map").getAttribute("href")') };
  await day.close();

  const list = await open(browser, { width: 390, height: 844 });
  await list.goto(`${BASE}/trips/trip-drive/map?view=list`);
  await ready(list); await sleep(2500);
  out.phoneListDeepLink = { mapChunk: mapLoaded(list), tiles: tileRequests(list).length };
  await list.eval('__qa.click("button", "Map")');
  await list.waitFor('__qa.canvasReady()', 30_000);
  out.phoneListThenMap = { mapChunk: mapLoaded(list), tiles: tileRequests(list).length };
  await list.close();
  out.mapChunks = MAP_CHUNKS; out.mapCss = MAP_CSS;
  return out;
});

// ---------- journeys: organizer and member ----------
await run('journeys', async () => {
  const out = {};
  const page = await open(browser);
  await page.goto(`${BASE}/trips/trip-drive/days/${SAT}`);
  await page.waitFor('__qa.find("a", "View day map")', 20_000);
  await page.eval('__qa.click("a", "View day map")');
  await page.waitFor('document.querySelector("#map-day-heading")', 20_000);
  await page.waitFor('__qa.canvasReady()', 30_000);
  out.organizerDay = {
    url: await page.eval('location.pathname + location.search'), back: await page.eval('__qa.find("a", "Back to")?.textContent + " → " + __qa.find("a", "Back to")?.getAttribute("href")'),
    heading: await page.eval('__qa.norm(document.querySelector("#map-day-heading").textContent)'),
    rows: await page.eval('Object.fromEntries([...document.querySelectorAll("#map-day-heading ~ dl > div > dt")].map((dt) => [__qa.norm(dt.textContent), __qa.norm(dt.nextElementSibling.textContent)]))'),
    list: await page.eval('[...document.querySelectorAll(\'ul[aria-label="Itinerary places"] button\')].map((b) => __qa.norm(b.textContent))'),
    links: await page.eval('[...document.querySelectorAll("#map-day-heading ~ div a, #map-day-heading ~ p a")].map((a) => ({ text: __qa.norm(a.textContent), label: a.getAttribute("aria-label"), href: a.getAttribute("href"), target: a.target, rel: a.rel }))'),
    counts: await page.eval('__qa.find("p", "places shown")?.textContent'),
  };
  await page.eval('__qa.click("button", "Show drive")');
  await page.waitFor('/Road route line:/.test(document.body.textContent)');
  await settle(page);
  await page.screenshot(shot('desktop-1440-day-show-drive-light'));
  out.organizerDay.lineStatus = await page.eval('__qa.live().filter((t) => /route line/i.test(t))');
  // A place's own links, then the external handoff and return.
  await page.eval('__qa.click(\'ul[aria-label="Itinerary places"] button\', "Spruce Peak lot")');
  await page.waitFor('document.querySelector("#selected-place-heading")');
  out.organizerDay.placeDetail = await page.eval('({ heading: __qa.norm(document.querySelector("#selected-place-heading").textContent), links: [...document.querySelector("#selected-place-heading").parentElement.querySelectorAll("a")].map((a) => ({ text: __qa.norm(a.textContent), href: a.getAttribute("href"), target: a.target })), focus: __qa.describe(document.activeElement), live: __qa.live() })');
  log('journeys: external return');
  const geometryBefore = count(page, /geometry/), mapBefore = count(page, /\/map$/);
  await page.eval('window.dispatchEvent(new Event("blur")); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus"))');
  await sleep(1500);
  out.returnFromHandoff = { mapRefetches: count(page, /\/map$/) - mapBefore, geometryRequests: count(page, /geometry/) - geometryBefore, url: await page.eval('location.search'),
    lineStill: await page.eval('/Road route line:/.test(document.body.textContent)'), selected: await page.eval('document.querySelector("#selected-place-heading")?.textContent') };
  log('journeys: back to day');
  await page.eval('__qa.click("a", "Back to day")');
  await page.waitFor(`location.pathname.endsWith("/days/${SAT}") && __qa.find("a", "View day map")`, 20_000);
  await sleep(500);
  out.backToDay = { url: await page.eval('location.pathname'), focus: await page.eval('__qa.describe(document.activeElement)'), scrollY: await page.eval('scrollY') };
  log('journeys: closing organizer page');
  await page.close();

  log('journeys: member');
  const member = await open(browser, { viewer: 'user-sam' });
  await member.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
  await member.waitFor('document.querySelector("#map-day-heading")', 20_000);
  await member.eval('__qa.click(\'ul[aria-label="Itinerary places"] button\', "Stowe Motel")');
  await sleep(500);
  out.member = {
    links: await member.eval('[...document.querySelectorAll("main a")].map((a) => __qa.norm(a.textContent)).filter((t) => /Edit|Directions|View|Open|Set|Choose|Check/.test(t))'),
    edits: await member.eval('[...document.querySelectorAll("main a")].filter((a) => /^Edit/.test(__qa.norm(a.textContent))).length'),
  };
  await member.close();

  log('journeys: member overview');
  const overview = await open(browser, { viewer: 'user-sam', width: 390, height: 1400 });
  await overview.goto(`${BASE}/trips/trip-drive`);
  await overview.waitFor('/places shown/.test(document.body.textContent)', 20_000);
  out.memberOverview = await overview.eval('__qa.norm(document.querySelector("#trip-places-heading").parentElement.textContent)');
  await overview.close();
  return out;
});

// ---------- #333 departures ----------
await run('departures', async () => {
  const out = {};
  const day = fx['trip-split'].map.days.find((entry) => entry.date === '2026-10-10');
  const revisions = Object.fromEntries(day.departures.map((departure) => [departure.label, departure.geometry.revision]));
  for (const [viewer, name] of [['user-eli', 'Eli'], ['user-casey', 'Casey'], ['user-1', 'Alex (organizer)']]) {
    const page = await open(browser, { viewer, width: 390, height: 1700 });
    await page.goto(`${BASE}/trips/trip-split/map?date=2026-10-10`);
    await page.waitFor('document.querySelector("#map-day-heading")', 20_000);
    await page.waitFor('__qa.canvasReady()', 30_000).catch(() => {});
    const read = () => page.eval(`({ start: __qa.rowText("Starting from"), getting: __qa.rowText("Getting there"), tonight: __qa.rowText("Staying tonight"), departures: __qa.rowText("Departures"),
      pressed: [...document.querySelectorAll("button[aria-pressed]")].filter((b) => /departure/.test(b.textContent)).map((b) => __qa.norm(b.textContent) + "=" + b.getAttribute("aria-pressed")),
      directions: document.querySelector('a[aria-label^="Directions to"]')?.getAttribute("href") ?? null,
      list: [...document.querySelectorAll('ul[aria-label="Itinerary places"] button')].map((b) => __qa.norm(b.querySelector("span").textContent)) })`);
    const entry = { own: await read() };
    if (viewer === 'user-1') { await settle(page); await page.screenshot(shot('phone-390-departures-alex')); }
    if (viewer === 'user-eli') {
      await settle(page);
      await page.screenshot(shot('phone-390-departures-eli'));
      await page.eval('__qa.click("button", "Show drive")');
      await page.waitFor('/Road route line:/.test(document.body.textContent)');
      entry.ownLine = { status: await page.eval('__qa.live().find((t) => /Road route line/.test(t))'), requested: page.api.filter((e) => /geometry/.test(e.path)).map((e) => decodeURIComponent(e.path.split('revision=')[1])) };
      entry.ownLine.matches = entry.ownLine.requested.map((revision) => Object.keys(revisions).find((label) => revisions[label] === revision) ?? 'unknown');
      await page.eval('__qa.click("button", "Show Pine rental departure")');
      await sleep(500);
      entry.chosen = await read();
      entry.chosen.geometryRequestsBeforeShowDrive = page.api.filter((e) => /geometry/.test(e.path)).length;
      await page.eval('__qa.click("button", "Show drive")');
      await page.waitFor('/Road route line:/.test(document.body.textContent)');
      const requested = page.api.filter((e) => /geometry/.test(e.path)).map((e) => decodeURIComponent(e.path.split('revision=')[1]));
      entry.chosenLine = { status: await page.eval('__qa.live().find((t) => /Road route line/.test(t))'), matches: requested.map((revision) => Object.keys(revisions).find((label) => revisions[label] === revision) ?? 'unknown') };
    }
    out[name] = entry;
    await page.close();
  }
  out.coordinates = Object.fromEntries(fx['trip-split'].map.places.filter((p) => p.coordinates).map((p) => [p.name, `${p.coordinates.latitude},${p.coordinates.longitude}`]));
  return out;
});

// ---------- edge states ----------
await run('edge', async () => {
  const out = {};
  const page = await open(browser, { width: 1440, height: 1400 });
  for (const date of ['2027-01-15', '2027-01-16', '2027-01-17', '2027-01-18']) {
    await page.goto(`${BASE}/trips/trip-edge/map?date=${date}`);
    await page.waitFor('document.querySelector("#map-day-heading")', 20_000);
    await page.waitFor('__qa.canvasReady()', 30_000).catch(() => {});
    const geometryBefore = count(page, /geometry/);
    const showDrive = await page.eval('!!__qa.find("button", "Show drive")');
    if (showDrive) { await page.eval('__qa.click("button", "Show drive")'); await sleep(1200); }
    out[date] = {
      heading: await page.eval('__qa.norm(document.querySelector("#map-day-heading").textContent)'),
      rows: await page.eval('Object.fromEntries([...document.querySelectorAll("#map-day-heading ~ dl > div > dt")].map((dt) => [__qa.norm(dt.textContent), __qa.norm(dt.nextElementSibling.textContent)]))'),
      list: await page.eval('[...document.querySelectorAll(\'ul[aria-label="Itinerary places"] button\')].map((b) => __qa.norm(b.textContent))'),
      links: await page.eval('[...document.querySelectorAll("#map-day-heading ~ div a")].map((a) => __qa.norm(a.textContent) + " → " + a.getAttribute("href"))'),
      showDrive, lineStatus: await page.eval('__qa.live().filter((t) => /route|line/i.test(t))'), geometryRequests: count(page, /geometry/) - geometryBefore,
      counts: await page.eval('__qa.find("p", "places shown")?.textContent'),
    };
    if (date === '2027-01-15') { await settle(page); await page.screenshot(shot('desktop-1440-edge-unroutable-hut')); }
  }
  // A whole-trip deep link to a date that has left the itinerary, and a removed place.
  await page.goto(`${BASE}/trips/trip-edge/map?date=2027-01-20&place=stop:gone:access_point`);
  await ready(page).catch(() => {});
  await sleep(800);
  out.removedDate = await page.eval('__qa.live()');
  await page.close();
  return out;
});

// ---------- keyboard and focus ----------
async function tabWalk(page, steps) {
  const walk = [];
  for (let step = 0; step < steps; step++) {
    await page.key('Tab');
    await sleep(60);
    walk.push(await page.eval('({ el: __qa.describe(document.activeElement), ring: __qa.focusRing(document.activeElement), inMain: !!document.activeElement.closest("main") })'));
  }
  return walk;
}
await run('keyboard', async () => {
  const out = {};
  const page = await open(browser, { width: 1440, height: 1000 });
  await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
  await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
  await page.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
  out.desktopWalk = await tabWalk(page, 45);
  // Skip map, list selection and zoom from the keyboard.
  await page.eval('__qa.find("button", "Skip map").focus()');
  await page.key('Enter'); await sleep(300);
  out.skipMap = await page.eval('__qa.describe(document.activeElement)');
  await page.eval('document.querySelector(\'ul[aria-label="Itinerary places"] button\').focus()');
  await page.key('Enter'); await sleep(400);
  out.selectByEnter = await page.eval('({ focus: __qa.describe(document.activeElement), pressed: document.querySelector(\'ul[aria-label="Itinerary places"] button\').getAttribute("aria-pressed"), live: __qa.live().filter((t) => /^Selected/.test(t)), url: location.search })');
  await page.eval('document.querySelector(\'ul[aria-label="Itinerary places"] li:nth-child(3) button\').focus()');
  await page.key(' '); await sleep(400);
  out.selectBySpace = await page.eval('({ focus: __qa.describe(document.activeElement), url: location.search })');
  await page.eval('document.querySelector(\'button[aria-label="Zoom in"]\').focus()');
  await page.key('Enter'); await sleep(200);
  out.zoomByEnter = await page.eval('({ focus: __qa.describe(document.activeElement), ring: __qa.focusRing(document.activeElement) })');
  out.canvas = await page.eval('(() => { const c = document.querySelector(".maplibregl-canvas"); return { tabindex: c.getAttribute("tabindex"), label: c.getAttribute("aria-label"), role: c.getAttribute("role") }; })()');
  // Show drive / whole day by keyboard.
  await page.eval('__qa.find("button", "Show drive").focus()');
  await page.key('Enter');
  await page.waitFor('/Road route line:/.test(document.body.textContent)');
  out.showDriveByEnter = await page.eval('({ focus: __qa.describe(document.activeElement), pressed: __qa.find("button", "Show drive").getAttribute("aria-pressed") })');
  await page.close();

  const phone = await open(browser, { width: 390, height: 844 });
  await phone.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
  await ready(phone); await phone.waitFor('__qa.canvasReady()', 30_000);
  await phone.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
  out.phoneWalk = await tabWalk(phone, 40);
  out.phoneVisualOrder = await phone.eval(`(() => { const top = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null; };
    return { mapTop: top(".maplibregl-map"), zoomTop: top('button[aria-label="Zoom in"]'), attributionTop: top('footer[aria-label="Map and place attribution"]'), daySummaryTop: top("#map-day-heading") }; })()`);
  // Phone failure recovery: Use list moves focus to the list.
  await phone.eval('__qa.find("button", "Skip map").focus()'); await phone.key('Enter'); await sleep(400);
  out.phoneSkipMap = await phone.eval('({ focus: __qa.describe(document.activeElement), url: location.search, listVisible: __qa.visible(document.querySelector(\'ul[aria-label="Itinerary places"]\')) })');
  await phone.close();
  return out;
});

// ---------- accessibility tree ----------
await run('ax', async () => {
  const page = await open(browser, { width: 1440, height: 1000 });
  await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}&place=${encodeURIComponent('stop:stop-stowe:access_point')}`);
  await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
  await sleep(500);
  const { nodes } = await page.send('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const interesting = new Set(['button', 'link', 'combobox', 'region', 'list', 'listitem', 'heading', 'status', 'alert', 'group', 'Canvas', 'image', 'img', 'contentinfo', 'navigation', 'main', 'definition', 'term', 'DescriptionList', 'LabelText', 'generic']);
  const flat = nodes.filter((node) => !node.ignored && interesting.has(node.role?.value)).map((node) => {
    const props = Object.fromEntries((node.properties ?? []).map((prop) => [prop.name, prop.value?.value]));
    return { role: node.role.value, name: node.name?.value ?? '', ...props.pressed !== undefined ? { pressed: props.pressed } : {}, ...props.disabled ? { disabled: true } : {}, ...props.level ? { level: props.level } : {}, ...props.live ? { live: props.live } : {}, parent: byId.get(node.parentId)?.role?.value };
  }).filter((node) => node.role !== 'generic' || node.name);
  const unnamed = flat.filter((node) => ['button', 'link', 'combobox'].includes(node.role) && !node.name);
  // Elements whose aria-label the tree drops, because their role can't be named.
  const droppedLabels = await page.eval(`[...document.querySelectorAll("main [aria-label]")].filter((el) => !el.getAttribute("role") && ["DIV", "SPAN", "FOOTER", "P"].includes(el.tagName)).map(__qa.describe)`);
  await writeFile(join(OUT, 'ax-tree-day-map.json'), JSON.stringify(flat, null, 1));
  await page.close();
  return { nodes: flat.length, unnamed, droppedLabels, landmarks: flat.filter((node) => ['region', 'main', 'navigation', 'contentinfo', 'group', 'list'].includes(node.role)).map((node) => `${node.role}: ${node.name}`),
    canvas: flat.filter((node) => ['Canvas', 'image', 'img'].includes(node.role) || /map/i.test(node.name) && node.role === 'region'), statuses: flat.filter((node) => ['status', 'alert'].includes(node.role)).map((node) => node.name),
    headings: flat.filter((node) => node.role === 'heading').map((node) => `h${node.level}: ${node.name}`) };
});

// ---------- failure and recovery ----------
async function failureCase(name, { rules = [], before, after, viewer = 'user-1', width = 1440, height = 1000, browserArgs, statics = false } = {}) {
  const host = browserArgs ? await launch({ args: browserArgs }) : browser;
  const page = await open(host, { viewer, width, height, statics });
  page.rules.push(...rules);
  await before?.(page);
  const started = Date.now();
  await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
  let outcome;
  try {
    await page.waitFor('__qa.canvasReady() || __qa.find("h2", "Map unavailable") || __qa.find("h2", "Map needs a connection") || __qa.find("[role=alert], p", "Couldn")', 35_000);
    outcome = await page.eval('__qa.canvasReady() ? "canvas ready" : __qa.norm((__qa.find("h2", "Map unavailable") || __qa.find("h2", "Map needs a connection") || __qa.find("[role=alert], p", "Couldn")).textContent)');
  } catch { outcome = 'nothing within 35 s'; }
  const result = { outcome, ms: Date.now() - started, list: await page.eval('document.querySelectorAll(\'ul[aria-label="Itinerary places"] button\').length'),
    summary: await page.eval('!!document.querySelector("#map-day-heading")'), buttons: await page.eval('[...document.querySelectorAll("main button")].filter((b) => __qa.visible(b)).map((b) => __qa.norm(b.textContent) + (b.disabled ? " (disabled)" : "")).filter((t) => /Retry|Use list|Show drive|Map|List/.test(t))'),
    attribution: await page.eval('__qa.attribution()?.text ?? null'), tiles: tileRequests(page).map((entry) => entry.failed ?? entry.status).reduce((acc, value) => ({ ...acc, [value ?? 'pending']: (acc[value ?? 'pending'] ?? 0) + 1 }), {}) };
  if (after) Object.assign(result, await after(page));
  await settle(page, 8000);
  await page.screenshot(shot(`failure-${name}`)).catch(() => {});
  await page.close();
  if (browserArgs) await host.close();
  return result;
}
await run('recovery', async () => {
  const out = { ...results.recovery };
  const only = process.env.QA_CASES?.split(',');
  const want = (name) => !only || only.includes(name);
  if (want('styleBlocked')) out.styleBlocked = await failureCase('style-blocked', { rules: [block(/openfreemap\.org\/styles\//)], after: async (page) => {
    await page.eval('__qa.click("button", "Use list")'); await sleep(400);
    const useList = await page.eval('({ focus: __qa.describe(document.activeElement), list: __qa.visible(document.querySelector(\'ul[aria-label="Itinerary places"]\')) })');
    page.rules.length = 0;
    await page.eval('__qa.click("button", "Retry map")');
    const retried = await page.waitFor('__qa.canvasReady()', 30_000).then(() => 'canvas ready after retry', () => 'still unavailable');
    return { useList, retried };
  } });
  if (want('tilesBlocked')) out.tilesBlocked = await failureCase('tiles-blocked', { rules: [block(/openfreemap\.org\/planet\/.+\.pbf/)] });
  if (want('tileJsonBlocked')) out.tileJsonBlocked = await failureCase('tilejson-blocked', { rules: [block(/openfreemap\.org\/planet(\?|$)/)] });
  if (want('glyphsBlocked')) out.glyphsBlocked = await failureCase('glyphs-blocked', { rules: [block(/openfreemap\.org\/fonts\//)] });
  if (want('spriteBlocked')) out.spriteBlocked = await failureCase('sprite-blocked', { rules: [block(/openfreemap\.org\/sprites\//)] });
  if (want('workerBlocked')) out.workerBlocked = await failureCase('worker-blocked', { statics: true, rules: [block(/maplibre-gl-worker/)], after: async (page) => ({ workerRequests: page.requests.filter((entry) => /maplibre-gl-worker/.test(entry.url)).map((entry) => entry.failed ?? entry.status) }) });
  if (want('chunkBlocked')) out.chunkBlocked = await failureCase('chunk-blocked', { statics: true, rules: [block(new RegExp(MAP_CHUNKS.map((name) => name.replace('.', '\\.')).join('|')))] });
  if (want('webglDisabled')) out.webglDisabled = await failureCase('webgl-disabled', { browserArgs: ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] });
  if (want('offlineAfterLoad')) out.offlineAfterLoad = await failureCase('offline', { after: async (page) => {
    await page.offline(true); await sleep(800);
    const card = await page.eval('__qa.norm(__qa.find("h2", "Map needs a connection")?.parentElement.textContent)');
    const disabled = await page.eval('__qa.find("button", "Show drive")?.disabled');
    await page.eval('__qa.click(\'ul[aria-label="Itinerary places"] button\')'); await sleep(300);
    const selectable = await page.eval('!!document.querySelector("#selected-place-heading")');
    await page.screenshot(shot('offline-desktop'));
    await page.offline(false); await sleep(1500);
    return { card, showDriveDisabled: disabled, listStillSelectable: selectable, backOnline: await page.eval('__qa.canvasReady() || __qa.norm(document.querySelector("section[aria-label=\\"Map view\\"]")?.textContent).slice(0, 80)') };
  } });
  if (want('mapApi500')) out.mapApi500 = await failureCase('map-api-500', { rules: [(url) => /\/map$/.test(url.pathname) ? { status: 500, body: { error: "Couldn't load trip places. Try again." } } : undefined], after: async (page) => {
    page.rules.length = 0;
    await page.eval('__qa.click("button", "Retry places")');
    return { retry: await page.waitFor('__qa.canvasReady()', 30_000).then(() => 'loaded after Retry places', () => 'not loaded') };
  } });
  if (want('accessLost')) out.accessLost = await failureCase('access-lost', { after: async (page) => {
    page.rules.push((url) => /\/api\/v1\/trips\/trip-drive/.test(url.pathname) ? { status: 403, body: { error: "You don't have access to this trip." } } : undefined);
    await page.eval('window.dispatchEvent(new Event("focus"))'); await sleep(1500);
    return { afterRevoke: { list: await page.eval('document.querySelectorAll(\'ul[aria-label="Itinerary places"] button\').length'), summary: await page.eval('!!document.querySelector("#map-day-heading")'),
      canvas: await page.eval('!!document.querySelector(".maplibregl-map")'), text: await page.eval('__qa.norm(document.querySelector("main").textContent).slice(0, 300)') } };
  } });
  // Route line: provider failure, quota, timeout and no route.
  const line = async (name, answer, wait = 'Route line unavailable|No road route|Too many|took too long') => {
    const page = await open(browser);
    page.rules.push((url) => /geometry/.test(url.pathname) ? answer : undefined);
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    await page.eval('__qa.click("button", "Show drive")');
    const settled = await page.waitFor(`new RegExp(${literal(wait)}).test(__qa.live().join(" "))`, name === 'hang' ? 25_000 : 10_000).then(() => true, () => false);
    const status = await page.eval('__qa.live().filter((t) => /route|line|Loading/i.test(t))');
    const buttons = await page.eval('[...document.querySelectorAll("main button")].map((b) => __qa.norm(b.textContent)).filter((t) => /route line/i.test(t))');
    const rows = await page.eval('__qa.rowText("Getting there")');
    let retry = null;
    if (buttons.some((text) => /Retry/.test(text))) {
      page.rules.length = 0;
      await page.eval('__qa.click("button", "Retry route line")');
      retry = await page.waitFor('/Road route line:/.test(document.body.textContent)', 10_000).then(() => 'line drawn after retry', () => 'no line after retry');
    }
    if (name === 'server-error') await page.screenshot(shot('desktop-route-line-unavailable'));
    await page.close();
    return { settled, status, buttons, gettingThere: rows, retry };
  };
  if (want('line500')) out.line500 = await line('server-error', { status: 500, body: { error: 'Route line unavailable. Try again.' } });
  if (want('line429')) out.line429 = await line('quota', { status: 429, body: { error: 'Too many requests. Try again in a minute.' } });
  if (want('lineUnavailable')) out.lineUnavailable = await (async () => {
    const page = await open(browser);
    page.rules.push((url) => {
      if (!/geometry/.test(url.pathname)) return undefined;
      const answer = geometry(fx['trip-drive'], SAT, url.searchParams.get('revision'));
      return { body: { ...answer.body, state: 'unavailable', geometry: null, provider: undefined, calculated_at: undefined, attribution: undefined } };
    });
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    await page.eval('__qa.click("button", "Show drive")'); await sleep(1500);
    const result = { status: await page.eval('__qa.live().filter((t) => /route|line/i.test(t))'), gettingThere: await page.eval('__qa.rowText("Getting there")') };
    await page.close();
    return result;
  })();
  if (want('lineNoRoute')) out.lineNoRoute = await (async () => {
    const page = await open(browser);
    page.rules.push((url) => {
      if (!/geometry/.test(url.pathname)) return undefined;
      const answer = geometry(fx['trip-drive'], SAT, url.searchParams.get('revision'));
      return { body: { ...answer.body, state: 'no_route', geometry: null } };
    });
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    await page.eval('__qa.click("button", "Show drive")'); await sleep(1500);
    const result = { status: await page.eval('__qa.live().filter((t) => /route|line/i.test(t))') };
    await page.close();
    return result;
  })();
  if (want('lineHang')) out.lineHang = await line('hang', { hold: new Promise(() => {}) }, 'Route line unavailable|took too long|No road route');
  return out;
});

// ---------- stale and out-of-order responses ----------
await run('stale', async () => {
  const out = {};
  // 1. The Saturday line answers after the view moved to Sunday.
  {
    const page = await open(browser);
    const gate = deferred();
    page.rules.push((url) => /\/days\/2027-01-09\/geometry/.test(url.pathname) ? { hold: gate.promise, ...geometry(fx['trip-drive'], SAT, url.searchParams.get('revision')) } : undefined);
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    await page.eval('__qa.click("button", "Show drive")'); await sleep(300);
    const loading = await page.eval('__qa.live().filter((t) => /route line/i.test(t))');
    await page.eval(`__qa.select("map-date", "${SUN}")`); await sleep(300);
    await page.eval('__qa.click("button", "Show drive")');
    await page.waitFor('/Road route line:|Route line unavailable/.test(document.body.textContent)', 10_000).catch(() => {});
    const sundayBefore = await page.eval('__qa.live().filter((t) => /route line/i.test(t))');
    gate.release(); await sleep(1500);
    out.dayMovedBeforeAnswer = { loading, sundayBefore, sundayAfterLateSaturday: await page.eval('__qa.live().filter((t) => /route line/i.test(t))'),
      saturdayRequest: page.requests.filter((entry) => /2027-01-09\/geometry/.test(entry.url)).map((entry) => entry.failed ?? entry.status) };
    await page.eval(`__qa.select("map-date", "${SAT}")`); await sleep(800);
    out.dayMovedBeforeAnswer.backOnSaturday = await page.eval('({ status: __qa.live().filter((t) => /route line/i.test(t)), showDrivePressed: __qa.find("button", "Show drive")?.getAttribute("aria-pressed") })');
    await page.close();
  }
  // 2. Rapid date switching with Show drive on every drivable day: requests only on Show drive, and the last day wins.
  {
    const page = await open(browser);
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    for (const date of [SAT, SUN, SAT, SUN, '2027-01-11', SAT]) {
      await page.eval(`__qa.select("map-date", "${date}")`); await sleep(60);
      await page.eval('__qa.find("button", "Show drive") && !__qa.find("button", "Show drive").disabled && __qa.click("button", "Show drive")');
      await sleep(60);
    }
    await sleep(2000);
    out.rapidSwitch = { geometryRequests: page.requests.filter((entry) => /geometry/.test(entry.url)).map((entry) => `${entry.url.match(/days\/([\d-]+)/)[1]} ${entry.failed ?? entry.status}`),
      final: await page.eval('({ date: document.getElementById("map-date").value, status: __qa.live().filter((t) => /route line/i.test(t)) })') };
    await page.close();
  }
  // 3. An older map snapshot answers after a newer one.
  {
    const page = await open(browser);
    const gate = deferred();
    const newer = structuredClone(fx);
    newer['trip-drive'].map.places.find((place) => place.id === 'stay:stay-motel:location').name = 'Stowe Motel (renamed in the newer snapshot)';
    newer['trip-drive'].map.revision = 'newer-snapshot';
    let maps = 0;
    page.rules.push((url) => {
      if (!/trip-drive\/map$/.test(url.pathname)) return undefined;
      maps++;
      return maps === 1 ? { hold: gate.promise, body: fx['trip-drive'].map } : { body: newer['trip-drive'].map };
    });
    await page.goto(`${BASE}/trips/trip-drive/map`);
    await page.waitFor('document.querySelector("h1")', 20_000); await sleep(800);
    await page.eval('window.dispatchEvent(new Event("focus"))');
    await ready(page); await sleep(400);
    const newerShown = await page.eval('/renamed in the newer snapshot/.test(document.body.textContent)');
    gate.release(); await sleep(1500);
    out.olderSnapshotLate = { mapRequests: maps, newerShown, stillNewerAfterOldAnswer: await page.eval('/renamed in the newer snapshot/.test(document.body.textContent)') };
    await page.close();
  }
  // 4. The drive's endpoints change while its line is loading, then while it is shown.
  {
    const page = await open(browser);
    const gate = deferred();
    const moved = structuredClone(fx);
    const saturday = moved['trip-drive'].map.days.find((day) => day.date === SAT);
    saturday.geometry = { ...saturday.geometry, revision: 'moved-origin-revision' };
    saturday.departures = saturday.departures.map((departure) => departure.crew ? { ...departure, geometry: saturday.geometry } : departure);
    moved['trip-drive'].map.revision = 'moved';
    page.rules.push((url) => /2027-01-09\/geometry/.test(url.pathname) && url.searchParams.get('revision') !== 'moved-origin-revision' ? { hold: gate.promise, ...geometry(fx['trip-drive'], SAT, url.searchParams.get('revision')) } : undefined);
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    await page.eval('__qa.click("button", "Show drive")'); await sleep(300);
    page.data = moved;
    await page.eval('window.dispatchEvent(new Event("focus"))'); await sleep(800);
    const afterMove = await page.eval('__qa.live().filter((t) => /route line/i.test(t))');
    gate.release(); await sleep(1500);
    out.endpointsChangedWhileLoading = { afterMove, afterOldAnswer: await page.eval('__qa.live().filter((t) => /route line/i.test(t))') };
    // Shown, then the snapshot changes the pair again.
    page.data = fx; page.rules.length = 0;
    await page.eval('window.dispatchEvent(new Event("focus"))'); await sleep(800);
    await page.eval('__qa.click("button", "Load route line") || true').catch(() => {});
    await page.waitFor('/Road route line:/.test(document.body.textContent)', 10_000).catch(() => {});
    const shown = await page.eval('__qa.live().filter((t) => /route line/i.test(t))');
    page.data = moved;
    await page.eval('window.dispatchEvent(new Event("focus"))'); await sleep(800);
    out.endpointsChangedWhileShown = { shown, afterChange: await page.eval('__qa.live().filter((t) => /route line/i.test(t))') };
    await page.close();
  }
  // 5. A selected place that the newer snapshot removed.
  {
    const page = await open(browser);
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SUN}&place=${encodeURIComponent('stay:stay-inn:location')}`);
    await ready(page); await sleep(500);
    const before = await page.eval('document.querySelector("#selected-place-heading")?.textContent');
    const removed = structuredClone(fx);
    removed['trip-drive'].map.places = removed['trip-drive'].map.places.filter((place) => place.id !== 'stay:stay-inn:location');
    page.data = removed;
    await page.eval('window.dispatchEvent(new Event("focus"))'); await sleep(1200);
    out.selectedPlaceRemoved = { before, after: await page.eval('__qa.live().filter((t) => /no longer/.test(t))'), focus: await page.eval('__qa.describe(document.activeElement)') };
    await page.close();
  }
  return out;
});

// ---------- layout, appearance, zoom and motion ----------
await run('layout', async () => {
  const out = {};
  const capture = async (name, { width, height = 900, dpr = 2, mobile, scheme = 'light', motion, path, viewer, fontSize, settle: waitForMap = true }) => {
    const page = await open(browser, { width, height, dpr, mobile, scheme, motion, viewer });
    if (fontSize) await page.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: Math.round(fontSize * 0.8125) } });
    await page.goto(`${BASE}${path}`);
    await ready(page);
    if (waitForMap) await settle(page); else await sleep(700);
    const result = { overflow: await page.eval('__qa.overflow()'), smallTargets: await page.eval('__qa.targets()'), attribution: await page.eval('__qa.attribution()'),
      contrast: await page.eval('__qa.contrast()'), rootFont: await page.eval('getComputedStyle(document.documentElement).fontSize') };
    if (mobile ?? width < 768) {
      // Capture the whole page: a viewport as tall as the content.
      const full = await page.eval('document.documentElement.scrollHeight');
      await page.viewport(width, Math.min(full, 3000), { dpr, mobile: mobile ?? width < 768 });
      if (waitForMap) await settle(page); else await sleep(900);
    }
    await page.screenshot(shot(name));
    await page.close();
    return result;
  };
  for (const scheme of ['light', 'dark']) for (const width of [320, 390, 768, 1024, 1440]) {
    out[`${width}-${scheme}`] = await capture(`layout-${width}-${scheme}-day`, { width, scheme, path: `/trips/trip-drive/map?date=${SAT}` });
  }
  out['390-list-member'] = await capture('layout-390-light-list-member', { width: 390, path: `/trips/trip-drive/map?date=${SUN}&view=list`, viewer: 'user-sam', settle: false });
  out['320-all-days'] = await capture('layout-320-light-all-days', { width: 320, path: '/trips/trip-drive/map' });
  // A longer access point name in the Directions button, at 100% text.
  out['320-long-directions'] = await capture('layout-320-light-long-directions', { width: 320, path: '/trips/trip-edge/map?date=2027-01-18&view=list', settle: false });
  // 200% and 400% page zoom on a 1280 × 800 window, and 200% text alone.
  out['zoom-200'] = await capture('zoom-200-640', { width: 640, height: 400, dpr: 2, mobile: false, path: `/trips/trip-drive/map?date=${SAT}` });
  out['zoom-400'] = await capture('reflow-400-320x256', { width: 320, height: 256, dpr: 4, mobile: false, path: `/trips/trip-drive/map?date=${SAT}` });
  out['text-200-desktop'] = await capture('text-200-1280', { width: 1280, height: 900, dpr: 1, mobile: false, fontSize: 32, path: `/trips/trip-drive/map?date=${SAT}` });
  out['text-200-phone'] = await capture('text-200-390', { width: 390, height: 844, fontSize: 32, path: `/trips/trip-drive/map?date=${SAT}` });
  // Reduced motion: transitions and animations left on the map page.
  {
    const page = await open(browser, { motion: 'reduce' });
    await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
    await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
    out.reducedMotion = await page.eval(`(() => { const moving = [...document.querySelectorAll("main *")].filter((el) => { const s = getComputedStyle(el); return (parseFloat(s.transitionDuration) > 0 && s.transitionProperty !== "none") || (s.animationName !== "none" && parseFloat(s.animationDuration) > 0); });
      return { matches: matchMedia("(prefers-reduced-motion: reduce)").matches, transitions: moving.length, examples: [...new Set(moving.map((el) => getComputedStyle(el).transitionProperty + " " + getComputedStyle(el).transitionDuration))].slice(0, 6) }; })()`);
    await page.close();
  }
  return out;
});

// ---------- performance ----------
await run('perf', async () => {
  const out = { note: 'Fixture API answers locally after 150 ms; Clerk blocked; tiles from the real OpenFreeMap network.' };
  const sizes = async (file) => { const data = await readFile(file); return { raw: data.length, gzip: gzipSync(data).length }; };
  const media = resolve('.next/static/media');
  const mediaFiles = (await readdir(media)).filter((name) => /maplibre/.test(name));
  out.bundles = { chunks: Object.fromEntries(await Promise.all(MAP_CHUNKS.map(async (name) => [name, await sizes(join(chunkDir, name))]))),
    media: Object.fromEntries(await Promise.all(mediaFiles.map(async (name) => [name, await sizes(join(media, name))]))) };
  const marks = `(() => { window.__marks = {}; const tick = () => { const m = window.__marks, now = performance.now();
    if (!m.list && document.querySelector('ul[aria-label="Itinerary places"] button, #map-day-heading')) m.list = now;
    if (!m.canvas && window.__qa?.canvasReady()) m.canvas = now;
    if (!m.places && /places shown/.test(document.body?.textContent || '')) m.places = now;
    if (!(m.list && m.canvas)) setTimeout(tick, 20); }; tick(); })();`;
  const profiles = { unthrottled: { cpu: 1, network: null }, 'cpu4x-slow4g': { cpu: 4, network: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 } } };
  for (const [profile, settings] of Object.entries(profiles)) {
    const runs = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await open(browser, { tiles: 'network' });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: marks });
      await page.throttle(settings);
      await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
      await page.waitFor('window.__marks?.list && window.__marks?.canvas', 90_000).catch(() => {});
      const m = await page.eval('window.__marks');
      const js = page.requests.filter((entry) => /\/_next\/static\/chunks\/.+\.js/.test(entry.url));
      runs.push({ listMs: Math.round(m.list), canvasMs: Math.round(m.canvas), domContentLoaded: Math.round(await page.eval('performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd')),
        jsTransferKB: Math.round(js.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) / 1024), mapChunkKB: Math.round(js.filter((entry) => MAP_CHUNKS.some((name) => entry.url.endsWith(name))).reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) / 1024),
        workerKB: Math.round(page.requests.filter((entry) => /maplibre-gl-worker/.test(entry.url)).reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) / 1024),
        tiles: tileRequests(page).length, tileKB: Math.round(tileRequests(page).reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) / 1024) });
      await page.close();
    }
    const median = (key) => runs.map((entry) => entry[key]).sort((a, b) => a - b)[1];
    out[profile] = { runs, median: { listMs: median('listMs'), canvasMs: median('canvasMs') } };
    // Overview, for the core trip load.
    const overview = await open(browser, { tiles: 'network' });
    await overview.send('Page.addScriptToEvaluateOnNewDocument', { source: marks });
    await overview.throttle(settings);
    await overview.goto(`${BASE}/trips/trip-drive`);
    await overview.waitFor('window.__marks?.places', 60_000).catch(() => {});
    await sleep(1500);
    const js = overview.requests.filter((entry) => /\/_next\/static\/chunks\/.+\.js/.test(entry.url));
    out[profile].overview = { placesMs: Math.round(await overview.eval('window.__marks.places')), jsTransferKB: Math.round(js.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0) / 1024), mapChunk: mapLoaded(overview), apiCalls: overview.api.map((entry) => entry.path) };
    await overview.close();
  }
  return out;
});

// ---------- PR screenshots: tall viewports, clipped to the map view ----------
await run('shots', async () => {
  const taken = [];
  const clipShot = async (name, { width, height = 2400, path, viewer, scheme = 'light', fontSize, from = 'h1', to = 'footer[aria-label="Map and place attribution"]', before }) => {
    const page = await open(browser, { width, height, viewer, scheme });
    if (fontSize) await page.send('Page.setFontSizes', { fontSizes: { standard: fontSize, fixed: Math.round(fontSize * 0.8125) } });
    await page.goto(`${BASE}${path}`);
    await ready(page);
    await before?.(page);
    await settle(page);
    const clip = await page.eval(`(() => { const a = document.querySelector(${literal(from)}).getBoundingClientRect(), b = document.querySelector(${literal(to)}).getBoundingClientRect();
      return { x: 0, y: Math.max(0, Math.round(a.top) - 12), width: innerWidth, height: Math.round(b.bottom - a.top) + 24 }; })()`);
    await page.screenshot(shot(`pr-${name}`), { clip });
    taken.push(name);
    await page.close();
  };
  await clipShot('phone-320-day-map', { width: 320, path: `/trips/trip-drive/map?date=${SAT}` });
  await clipShot('phone-390-departures-organizer', { width: 390, path: '/trips/trip-split/map?date=2026-10-10&view=list', to: 'ul[aria-label="Itinerary places"]' });
  await clipShot('phone-390-text-200-summary', { width: 390, fontSize: 32, path: `/trips/trip-drive/map?date=${SAT}&view=list`, from: '#map-day-heading', to: '#map-day-heading ~ div' });
  await clipShot('phone-390-route-line-timeout', { width: 390, path: `/trips/trip-drive/map?date=${SAT}`, from: '[aria-label="Day map extent"]', to: 'button[aria-label="Zoom in"]',
    before: async (page) => {
      page.rules.push((url) => /geometry/.test(url.pathname) ? { status: 500, body: { error: 'Route line unavailable. Try again.' } } : undefined);
      await page.waitFor('__qa.canvasReady()', 30_000);
      await page.eval('__qa.click("button", "Show drive")');
      await page.waitFor('/Retry route line/.test(document.body.textContent)');
    } });
  return { taken };
});

// ---------- box 4: offline, with and without #214's saved brief (named only; needs --upstream) ----------
await run('offline', async () => {
  if (!gate) throw new Error('offline needs --upstream <next start URL>, with --base as the gate in front of it');
  const out = {};
  // One page, so one browser context: the saved brief and its worker stay for every step.
  const page = await open(browser);
  const cutOff = () => ({ fail: 'InternetDisconnected' });
  const goOffline = async () => { page.rules.unshift(cutOff); await gate.down(); await page.offline(true); };
  const goOnline = async () => { page.rules = page.rules.filter((rule) => rule !== cutOff); await gate.up(); await page.offline(false); };
  // Plain DOM only: Chrome's own error page doesn't run the helpers.
  const where = () => page.eval(`({ url: location.href.replace(${literal(BASE)}, ''), title: document.title, h1: (document.querySelector('h1')?.textContent || '').trim(),
    text: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 220) })`).catch((error) => ({ error: error.message }));
  const notice = () => page.eval(`(() => { const card = __qa.find('h2', 'Map needs a connection')?.parentElement; return card && { text: __qa.norm(card.textContent),
    links: [...card.querySelectorAll('a')].map((a) => ({ text: __qa.norm(a.textContent), href: a.getAttribute('href') })), buttons: [...card.querySelectorAll('button')].map((b) => __qa.norm(b.textContent)) }; })()`);
  const mapOffline = async (name, wait) => {
    await goOffline();
    await page.waitFor('__qa.find("h2", "Map needs a connection")', 10_000);
    await page.waitFor(wait, 5000).catch(() => {});
    out[name] = { notice: await notice(), list: await page.eval('[...document.querySelectorAll(\'ul[aria-label="Itinerary places"] button\')].length'), showDrive: await page.eval('__qa.find("button", "Show drive")?.disabled ?? null') };
    await page.screenshot(shot(`offline-${name}`));
  };

  log('offline: nothing saved');
  await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
  await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
  await mapOffline('mapNothingSaved', '/saved on this device/i.test(__qa.find("h2", "Map needs a connection").parentElement.textContent)');
  await goOnline();

  log('offline: save from Plan');
  await page.goto(`${BASE}/trips/trip-drive`);
  await page.waitFor('__qa.find("button", "Save for offline")', 20_000);
  await page.eval('__qa.click("button", "Save for offline")');
  await page.waitFor('document.querySelector("[role=dialog]") && document.querySelectorAll("[role=dialog] input[type=checkbox]:checked").length > 0', 15_000).catch(async (error) => {
    throw new Error(`${error.message}\nPage: ${await page.eval('__qa.norm((document.querySelector("[role=dialog]") ?? document.querySelector("main"))?.textContent).slice(0, 700)')}\nAPI: ${JSON.stringify(page.api.slice(-6))}`);
  });
  out.sheet = await page.eval('[...document.querySelectorAll("[role=dialog] input[type=checkbox]")].map((box) => [__qa.norm(box.closest("label")?.textContent), box.checked])');
  log('offline: saving', JSON.stringify(out.sheet));
  await page.eval('[...document.querySelectorAll("[role=dialog] button")].find((button) => __qa.norm(button.textContent) === "Save for offline").click()');
  await page.waitFor('!document.querySelector("[role=dialog]") && /Saved on this device/.test(document.body.textContent)', 45_000);
  await sleep(800);
  out.saved = await page.eval(`(async () => ({ status: __qa.live().filter((text) => /saved/i.test(text)), alerts: [...document.querySelectorAll('[role=alert]')].map((el) => __qa.norm(el.textContent)).filter(Boolean),
    workers: (await navigator.serviceWorker.getRegistrations()).map((registration) => ({ scope: registration.scope.replace(${literal(BASE)}, ''), active: !!registration.active })),
    caches: await Promise.all((await caches.keys()).map(async (name) => [name, (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname).filter((path) => !path.startsWith('/_next/static/')).slice(0, 12)])) }))()`);

  log('offline: map with the copy saved');
  await page.eval('__qa.click("a", "View trip map")');
  await page.waitFor('location.pathname.endsWith("/map")', 15_000); await ready(page);
  await page.eval(`__qa.select("map-date", "${SAT}")`); await sleep(400);
  await page.waitFor('__qa.canvasReady()', 30_000);
  await mapOffline('mapSaved', '__qa.find("a", "Open saved brief")');
  await page.eval('__qa.click("a", "Open saved brief")');
  await page.waitFor('location.pathname === "/trips/saved" && /Showing saved copy/.test(document.body.textContent)', 20_000).catch(() => {});
  out.openedFromMap = { ...await where(), controlled: await page.eval('!!navigator.serviceWorker?.controller').catch(() => null),
    has: await page.eval('({ saturday: /Sat Jan 9/.test(document.body.innerText), accessPoint: /Spruce Peak lot/.test(document.body.innerText), unknown: /changes since .* are unknown/.test(document.body.innerText) })').catch(() => null) };
  await page.screenshot(shot('offline-opened-from-map'));

  log('offline: entry with the connection already gone');
  for (const [name, path] of [['map', `/trips/trip-drive/map?date=${SAT}`], ['plan', '/trips/trip-drive'], ['start', '/'], ['saved', '/trips/saved']]) {
    await page.goto(`${BASE}${path}`);
    await sleep(name === 'saved' ? 4500 : 1500);   // the saved list waits up to 3 s for an account Clerk can't load offline
    out[`entry_${name}`] = await where();
  }

  log('offline: a loaded Plan tab loses its connection');
  await goOnline();
  await page.goto(`${BASE}/trips/trip-drive`);
  await page.waitFor('__qa.find("a", "View trip map") && __qa.find("a", "Open saved brief")', 20_000);
  await goOffline();
  await page.eval('__qa.click("a", "View trip map")');
  await sleep(5000);
  out.tabIntoMap = { ...await where(), notice: await notice().catch(() => null) };
  await goOnline();
  await page.goto(`${BASE}/trips/trip-drive`);
  await page.waitFor('__qa.find("a", "Open saved brief")', 20_000);
  await goOffline();
  await page.eval('__qa.click("a", "Open saved brief")');
  await page.waitFor('location.pathname === "/trips/saved" && /Showing saved copy/.test(document.body.textContent)', 20_000).catch(() => {});
  out.planOpenSaved = await where();

  log('offline: another account on the same device');
  await goOnline();
  page.viewer = 'user-sam';
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('qa235User', 'user-sam'); } catch {}" });
  await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`);
  await ready(page); await page.waitFor('__qa.canvasReady()', 30_000);
  await mapOffline('mapOtherAccount', '/saved on this device/i.test(__qa.find("h2", "Map needs a connection").parentElement.textContent)');
  await goOnline();
  await page.close();
  return out;
});

// ---------- box 4: from the map into the editors, and a failed edit (named only) ----------
await run('edits', async () => {
  const out = { links: [], land: [] };
  const page = await open(browser);
  const atMap = () => page.waitFor('location.pathname.endsWith("/map") && document.querySelector("#map-day-heading") && document.querySelector(\'ul[aria-label="Itinerary places"] button\')', 20_000);
  const placeRows = () => page.eval('[...document.querySelectorAll(\'ul[aria-label="Itinerary places"] button\')].map((button) => __qa.norm(button.textContent))');
  const editLinks = '[...document.querySelectorAll("main a")].filter((a) => /^(Edit|Add destination)/.test(__qa.norm(a.textContent)))';
  // The day summary's edit links, then a selected stay's and destination's "Edit in trip plan".
  const starts = [[`/trips/trip-drive/map?date=${SAT}`, null], [`/trips/trip-drive/map?date=${SAT}`, 'Stowe Motel'], [`/trips/trip-drive/map?date=${SAT}`, 'Destination']];
  for (const [path, select] of starts) {
    await page.goto(`${BASE}${path}`); await atMap();
    if (select) { await page.eval(`__qa.click('ul[aria-label="Itinerary places"] button', ${literal(select)})`); await sleep(400); }
    const links = await page.eval(`${editLinks}.map((a) => ({ text: __qa.norm(a.textContent), href: a.getAttribute('href') }))`);
    for (const link of links) {
      if (out.links.some((seen) => seen.text === link.text && seen.href === link.href)) continue;
      out.links.push({ ...link, from: select ?? 'day summary' });
      await page.goto(`${BASE}${path}`); await atMap();
      if (select) { await page.eval(`__qa.click('ul[aria-label="Itinerary places"] button', ${literal(select)})`); await sleep(400); }
      const search = await page.eval('location.search');
      await page.eval(`${editLinks}.find((a) => a.getAttribute('href') === ${literal(link.href)}).click()`);
      await page.waitFor(`location.pathname + location.hash === ${literal(link.href)}`, 15_000).catch(() => {});
      await sleep(2500);
      const at = await page.eval(`(() => { const id = decodeURIComponent(location.hash.slice(1)), target = id ? document.getElementById(id) : null, box = target?.getBoundingClientRect();
        return { url: location.pathname + location.hash, target: target ? __qa.describe(target) : null, inView: box ? box.top >= -1 && box.top < innerHeight : null, focus: __qa.describe(document.activeElement), h1: __qa.norm(document.querySelector('main h1, h1')?.textContent) }; })()`);
      await page.eval('history.back()');
      await atMap().catch(() => {}); await sleep(600);
      at.back = { kept: await page.eval('location.search') === search, url: await page.eval('location.pathname + location.search') };
      out.land.push({ link: link.text, from: select ?? 'day summary', ...at });
    }
  }

  log('edits: a stay edit that fails');
  await page.goto(`${BASE}/trips/trip-drive/map?date=${SAT}`); await atMap();
  const rowsBefore = await placeRows();
  const writes = [];
  page.rules.unshift((url, request) => {
    if (request.method === 'GET' || !/^\/api\/v1\/trips\//.test(url.pathname)) return undefined;
    writes.push(`${request.method} ${url.pathname}`);
    return writes.length === 1 ? { fail: 'ConnectionReset' } : { status: 500, body: { error: "Couldn't save the stay. Try again." } };
  });
  await page.eval('__qa.click("main a", "Edit tonight")');
  await page.waitFor('location.pathname.endsWith("/stays") && document.getElementById(decodeURIComponent(location.hash.slice(1)))?.querySelector(\'button[aria-label^="Edit "]\')', 15_000);
  const stay = await page.eval('(() => { const article = document.getElementById(decodeURIComponent(location.hash.slice(1))); return { id: article.id, button: article.querySelector(\'button[aria-label^="Edit "]\').getAttribute("aria-label") }; })()');
  await page.eval(`document.querySelector('button[aria-label=${literal(stay.button)}]').click()`);
  await page.waitFor('document.querySelector("[role=dialog] input[name=name]")', 10_000);
  const original = await page.eval('document.querySelector("[role=dialog] input[name=name]").value');
  await page.eval('(() => { const input = document.querySelector("[role=dialog] input[name=name]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, input.value + " (renamed)"); input.dispatchEvent(new Event("input", { bubbles: true })); })()');
  const attempt = async () => {
    await page.eval('[...document.querySelectorAll("[role=dialog] button")].find((button) => /^Review/.test(__qa.norm(button.textContent))).click()');
    await page.waitFor('document.querySelector("#stay-error") && !document.querySelector("[role=dialog] [aria-busy=true]")', 15_000);
    await sleep(300);
    return page.eval('({ alert: __qa.norm(document.querySelector("#stay-error").textContent), role: document.querySelector("#stay-error").getAttribute("role"), open: !!document.querySelector("[role=dialog]"), name: document.querySelector("[role=dialog] input[name=name]")?.value, focus: __qa.describe(document.activeElement), onPage: /\\(renamed\\)/.test(document.querySelector("main").textContent.replace(document.querySelector("[role=dialog]")?.textContent ?? "", "")) })');
  };
  out.failedStay = { stay, original, network: await attempt(), server: await attempt(), writes };
  await page.eval('[...document.querySelectorAll("[role=dialog] button")].find((button) => __qa.norm(button.textContent) === "Cancel").click()');
  await sleep(600);
  out.failedStay.cancel = await page.eval('__qa.norm(document.querySelector("[role=dialog]")?.textContent).slice(0, 140)');
  await page.eval('[...document.querySelectorAll("[role=dialog] button")].find((button) => __qa.norm(button.textContent) === "Discard changes")?.click()');
  await page.waitFor('!document.querySelector("[role=dialog]")', 10_000).catch(() => {});
  await sleep(1200);
  out.failedStay.closed = await page.eval('({ url: location.pathname + location.hash, focus: __qa.describe(document.activeElement), renamed: /\\(renamed\\)/.test(document.body.textContent) })');
  for (let step = 0; step < 4 && !await page.eval('location.pathname.endsWith("/map")'); step++) { await page.eval('history.back()'); await sleep(1500); }
  await atMap().catch(() => {});
  out.failedStay.backAtMap = { url: await page.eval('location.pathname + location.search'), rowsUnchanged: JSON.stringify(await placeRows()) === JSON.stringify(rowsBefore),
    renamed: await page.eval('/\\(renamed\\)/.test(document.body.textContent)'), errors: await page.eval('[...document.querySelectorAll("[role=alert]")].map((el) => __qa.norm(el.textContent)).filter(Boolean)') };
  await page.close();
  return out;
});

// ---------- box 6: the core trip load before and after maps (named only; needs --compare) ----------
await run('compare', async () => {
  const builds = COMPARE.split(',').filter(Boolean).map((spec) => { const [name, url, dir] = spec.split('='); return { name, url, dir: resolve(dir) }; });
  if (!builds.length) throw new Error('compare needs --compare name=url=dir,...');
  for (const build of builds) {
    const chunks = join(build.dir, 'static/chunks');
    build.mapChunks = [];
    for (const name of await readdir(chunks)) if (name.endsWith('.js') && /MapLibre GL JS|maplibregl/.test(await readFile(join(chunks, name), 'utf8'))) build.mapChunks.push(name);
    build.id = (await readFile(join(build.dir, 'BUILD_ID'), 'utf8')).trim();
  }
  const name = fx['trip-drive'].map.trip.name;
  const marks = `(() => { window.__marks = {}; window.__lcp = 0;
    try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    const tick = () => { const m = window.__marks, now = performance.now();
      if (!m.core && [...document.querySelectorAll('h1')].some((h) => h.textContent.includes(${literal(name)})) && document.querySelector('main a[href*="/days/2027-01-"]')) m.core = now;
      if (!m.places && /places shown/.test(document.body?.textContent || '')) m.places = now;
      if (performance.now() < 90000) setTimeout(tick, 20); }; tick(); })();`;
  const profiles = { unthrottled: { cpu: 1, network: null }, 'cpu4x-slow4g': { cpu: 4, network: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 } } };
  const RUNS = Number(process.env.QA_COMPARE_RUNS ?? 5);
  const { loadavg } = await import('node:os');
  const out = { trip: `/trips/trip-drive (${name})`, runs: RUNS, builds: builds.map(({ name, url, id, mapChunks }) => ({ name, url, id, mapChunks })), load: { start: loadavg().map((v) => Math.round(v)) } };
  const sum = (entries) => Math.round(entries.reduce((total, entry) => total + (entry.bytes ?? 0), 0) / 1024);
  for (const [profile, settings] of Object.entries(profiles)) {
    const runs = Object.fromEntries(builds.map((build) => [build.name, []]));
    // Interleaved, so machine load falls on every build alike.
    for (let attempt = 0; attempt < RUNS; attempt++) for (const build of builds) {
      log(`compare: ${profile} ${build.name} run ${attempt + 1}`);
      const page = await open(browser, { tiles: 'network', base: build.url });
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: marks });
      await page.throttle(settings);
      await page.goto(`${build.url}/trips/trip-drive`);
      const reached = await page.waitFor('window.__marks?.core', Number(process.env.QA_COMPARE_WAIT ?? 90_000)).then(() => true, () => false);
      if (!reached) {
        await page.screenshot(shot(`compare-${build.name}-no-core`));
        log('compare: no core mark', await page.eval('location.href + " | " + __qa.norm(document.querySelector("main")?.textContent ?? document.body.textContent).slice(0, 400)'), JSON.stringify(page.api));
      }
      log('compare: core');
      await sleep(settings.cpu > 1 ? 6000 : 2500);
      const m = await page.eval('({ ...window.__marks, lcp: window.__lcp, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime, dcl: performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd })');
      const own = page.requests.filter((entry) => entry.url.startsWith(build.url) && !/\/api\//.test(entry.url));
      const js = own.filter((entry) => /\/_next\/static\/chunks\/.+\.js/.test(entry.url));
      runs[build.name].push({ coreMs: Math.round(m.core), placesMs: m.places ? Math.round(m.places) : null, lcpMs: Math.round(m.lcp), fcpMs: Math.round(m.fcp), dclMs: Math.round(m.dcl),
        jsKB: sum(js), jsFiles: js.length, appKB: sum(own), requests: page.requests.filter((entry) => !/clerk/.test(entry.url)).length,
        api: page.api.map((entry) => entry.path), mapChunk: js.some((entry) => build.mapChunks.some((chunk) => entry.url.endsWith(chunk))),
        worker: page.requests.some((entry) => /maplibre-gl-worker/.test(entry.url)), tiles: tileRequests(page).length,
        // QA_COMPARE_URLS=1 lists every request, to explain a difference.
        ...process.env.QA_COMPARE_URLS ? { urls: page.requests.filter((entry) => !/clerk/.test(entry.url)).map((entry) => `${entry.type} ${entry.url.replace(build.url, '')} ${entry.bytes ?? '-'}`) } : {} });
      await page.close();
    }
    const median = (list, key) => { const values = list.map((entry) => entry[key]).filter((value) => value != null).sort((a, b) => a - b); return values.length ? values[Math.floor(values.length / 2)] : null; };
    out[profile] = Object.fromEntries(builds.map((build) => [build.name, { median: Object.fromEntries(['coreMs', 'placesMs', 'lcpMs', 'fcpMs', 'dclMs', 'jsKB', 'jsFiles', 'appKB', 'requests'].map((key) => [key, median(runs[build.name], key)])), runs: runs[build.name] }]));
  }
  out.load.end = loadavg().map((v) => Math.round(v));
  return out;
});

await browser.close();
await gate?.down();
await writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Results in ${join(OUT, 'results.json')}`);

/*
 * SWTTR: Saved on this device (#214). See docs/trip-offline-brief.md.
 *
 * Registered with scope /trips/saved, so it only ever sees that page and the
 * requests that page makes. It keeps a copy of the page itself, which is the
 * same for everyone (no account data: the saved briefs live in the page's own
 * IndexedDB), and the build's static files the page loads, so the page opens
 * with no connection. It never stores or answers any other page, any API
 * response or anything signed in.
 */

const SHELL_PATH = "/trips/saved";
const CACHE_PREFIX = "swttr-saved-shell-";
// Online, wait this long for the live page before showing the kept one.
const NETWORK_TIMEOUT_MS = 4000;
// Icons and images the page links to by URL, outside the build's static files.
const PUBLIC_FILE = /^\/(?!api\/)[^?#]*\.(?:png|svg|ico|webp|jpe?g)$/;

const OFFLINE_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved on this device | SWTTR</title><body style="font-family:system-ui,sans-serif;margin:2rem;line-height:1.5">
<h1 style="font-size:1.25rem">You're offline</h1><p>This device hasn't kept the saved trips page yet. Connect, open Trips, then Saved on this device.</p></body></html>`;

/** Build files the page's script, style and preload tags name. */
function taggedFiles(html) {
  return [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)/g)].map((match) => match[1]))];
}

/** Build files and icons the page names: its tags, and the chunk list in its page data. */
function filesIn(html) {
  const found = new Set(taggedFiles(html));
  for (const match of html.matchAll(/(?:\/_next\/|\\?")(static\/(?:chunks|css|media)\/[^"\\?#\s]+)/g)) found.add(`/_next/${match[1]}`);
  for (const match of html.matchAll(/href="(\/(?!_next\/)[^"#]+\.(?:png|svg|ico|webp)(?:\?[^"#]*)?)"/g)) found.add(match[1].replace(/&amp;/g, "&"));
  return [...found];
}

/** Fonts and images a stylesheet loads, resolved against it. */
function filesInCss(css, base) {
  const found = new Set();
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    if (match[1].startsWith("data:")) continue;
    const url = new URL(match[1], new URL(base, self.location.origin));
    if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) found.add(url.pathname);
  }
  return [...found];
}

/** The kept page's cache: the newest that holds the page, which is written last. */
async function currentCache() {
  const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX)).sort().reverse();
  for (const name of names) {
    const cache = await caches.open(name);
    if (await cache.match(SHELL_PATH)) return cache;
  }
  return null;
}

async function keptPage() {
  const cache = await currentCache();
  return cache ? cache.match(SHELL_PATH) : undefined;
}

async function removeCachesExcept(keep) {
  const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX) && name !== keep);
  await Promise.all(names.map((name) => caches.delete(name)));
}

const isPage = (response) => response.ok && response.type === "basic" && (response.headers.get("content-type") || "").includes("text/html");

/**
 * Keeps the current page and every file it needs in a new cache, then drops
 * the old one. A failure part way drops the new cache instead, so the copy
 * that opens offline is always one whole page.
 */
let priming = null;
function prime() {
  priming = priming || (async () => {
    const name = `${CACHE_PREFIX}${Date.now()}`;
    const cache = await caches.open(name);
    try {
      // No cookies: the page is the same for everyone, and must never be anyone's own.
      const page = await fetch(SHELL_PATH, { credentials: "omit", cache: "no-store", redirect: "manual" });
      if (!isPage(page)) throw new Error("the saved trips page didn't load");
      const html = await page.clone().text();
      const files = filesIn(html);
      const keep = async (path) => {
        const response = await fetch(path, { credentials: "omit", cache: "no-cache" });
        // A path picked out of page data that isn't a file is skipped; a dropped connection isn't.
        if (!response.ok) return null;
        await cache.put(path, response.clone());
        return response;
      };
      const styles = [];
      await Promise.all(files.map(async (path) => {
        const response = await keep(path);
        if (response && path.endsWith(".css")) styles.push([path, await response.text()]);
      }));
      const fonts = styles.flatMap(([path, css]) => filesInCss(css, path)).filter((path) => !files.includes(path));
      await Promise.all([...new Set(fonts)].map(keep));
      await cache.put(SHELL_PATH, page);
      await removeCachesExcept(name);
    } catch (error) {
      await caches.delete(name);
      throw error;
    }
  })().finally(() => { priming = null; });
  return priming;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/** Online, the live page (and keep it when its build changed); offline or slow, the kept one. */
async function openPage(event) {
  const kept = await keptPage();
  try {
    const live = await withTimeout(fetch(event.request), kept ? NETWORK_TIMEOUT_MS : 30000);
    if (!isPage(live)) return kept || live;
    event.waitUntil((async () => {
      const cache = await currentCache();
      const files = taggedFiles(await live.clone().text());
      const missing = !cache || (await Promise.all(files.map((path) => cache.match(path, { ignoreSearch: true })))).some((hit) => !hit);
      if (missing) await prime().catch(() => undefined);
    })());
    return live;
  } catch {
    return kept || new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

/** Build files never change under one name, so the kept one serves; new ones join the kept page's cache. */
async function staticFile(request, ignoreSearch) {
  const cache = await currentCache();
  const hit = cache && await cache.match(request, { ignoreSearch });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic" && cache) await cache.put(request, response.clone()).catch(() => undefined);
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(prime().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const port = event.ports && event.ports[0];
  if (!port || !event.data || event.data.type !== "prime") return;
  event.waitUntil(prime().then(
    () => port.postMessage({ ok: true }),
    (error) => port.postMessage({ ok: false, error: String((error && error.message) || error) }),
  ));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Only the page itself: anything else in scope goes to the network as usual.
    if (url.pathname === SHELL_PATH) event.respondWith(openPage(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) event.respondWith(staticFile(request, true));
  else if (PUBLIC_FILE.test(url.pathname)) event.respondWith(staticFile(request, false));
});

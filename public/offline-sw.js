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
// A copy being downloaded: never read, and dropped whether or not it completes.
const STAGING_PREFIX = "swttr-saved-staging-";
// Online, wait this long for the live page before showing the kept one.
const NETWORK_TIMEOUT_MS = 4000;
// Icons and images the page links to by URL, outside the build's static files.
const PUBLIC_FILE = /^\/(?!api\/)[^?#]*\.(?:png|svg|ico|webp|jpe?g)$/;

const OFFLINE_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Saved on this device | SWTTR</title><body style="font-family:system-ui,sans-serif;margin:2rem;line-height:1.5">
<h1 style="font-size:1.25rem">You're offline</h1><p>This device hasn't kept the saved trips page yet. Connect, open Trips, then Saved on this device.</p></body></html>`;

/**
 * Build files the page's script, style and preload tags name. The page can't
 * run or look right without them, so keeping it needs every one.
 */
function taggedFiles(html) {
  return [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)/g)].map((match) => match[1]))];
}

/**
 * Other files the page may load, kept when they download: chunk paths picked
 * out of its page data (some aren't files) and its icons.
 */
function extraFiles(html, tagged) {
  const found = new Set();
  for (const match of html.matchAll(/(?:\/_next\/|\\?")(static\/(?:chunks|css|media)\/[^"\\?#\s]+)/g)) found.add(`/_next/${match[1]}`);
  for (const match of html.matchAll(/href="(\/(?!_next\/)[^"#]+\.(?:png|svg|ico|webp)(?:\?[^"#]*)?)"/g)) found.add(match[1].replace(/&amp;/g, "&"));
  return [...found].filter((path) => !tagged.includes(path));
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
  const names = (await caches.keys()).filter((name) => (name.startsWith(CACHE_PREFIX) || name.startsWith(STAGING_PREFIX)) && name !== keep);
  await Promise.all(names.map((name) => caches.delete(name)));
}

const isPage = (response) => response.ok && response.type === "basic" && (response.headers.get("content-type") || "").includes("text/html");

/**
 * Downloads the current page and the files it needs into a staging cache.
 * Only once every required file arrived does it become the kept copy and the
 * previous one go. Any failure, including a required file answering with an
 * error, rejects and leaves the previous copy as it was, so the save that
 * asked for it reports the failure rather than a copy that can't open.
 */
let priming = null;
function prime() {
  priming = priming || (async () => {
    const stamp = Date.now();
    const stagingName = `${STAGING_PREFIX}${stamp}`;
    const keptName = `${CACHE_PREFIX}${stamp}`;
    const staging = await caches.open(stagingName);
    try {
      // No cookies: the page is the same for everyone, and must never be anyone's own.
      const page = await fetch(SHELL_PATH, { credentials: "omit", cache: "no-store", redirect: "manual" });
      if (!isPage(page)) throw new Error("the saved trips page didn't load");
      const html = await page.clone().text();
      const required = taggedFiles(html);
      const extra = extraFiles(html, required);
      const keep = async (path, needed) => {
        const response = await fetch(path, { credentials: "omit", cache: "no-cache" });
        if (!response.ok) {
          if (needed) throw new Error(`a file the page needs didn't download (${response.status})`);
          return null;
        }
        await staging.put(path, response.clone());
        return response;
      };
      const styles = [];
      await Promise.all([
        ...required.map(async (path) => {
          const response = await keep(path, true);
          if (path.endsWith(".css")) styles.push([path, await response.text()]);
        }),
        ...extra.map((path) => keep(path, false)),
      ]);
      // Fonts and images the stylesheets load: the page still reads without one.
      const listed = new Set([...required, ...extra]);
      const fromStyles = [...new Set(styles.flatMap(([path, css]) => filesInCss(css, path)))].filter((path) => !listed.has(path));
      await Promise.all(fromStyles.map((path) => keep(path, false)));

      // Everything required is here: the staged files become the kept copy, its page last.
      const kept = await caches.open(keptName);
      for (const request of await staging.keys()) await kept.put(request, await staging.match(request));
      await kept.put(SHELL_PATH, page);
      await removeCachesExcept(keptName);
    } catch (error) {
      await caches.delete(keptName);
      throw error;
    } finally {
      await caches.delete(stagingName);
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
    // The browser starts reading `live` as soon as it's returned, so the check
    // reads its own copy, taken before anything else waits.
    const copy = live.clone();
    event.waitUntil((async () => {
      const files = taggedFiles(await copy.text());
      const cache = await currentCache();
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

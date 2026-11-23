/*
 * SWTTR: the way from the start page to Saved on this device offline (#214).
 * See docs/trip-offline-brief.md.
 *
 * Registered with scope / only while this device holds a saved trip brief
 * (src/lib/offline-shell.ts), and unregistered when the last one is removed or
 * on sign-out. It answers navigations to exactly / and /trips, and only when
 * they can't load, with a redirect to /trips/saved, which public/offline-sw.js
 * opens with no connection. It caches nothing and never answers another page,
 * an API request, a file or a write.
 *
 * - Offline (navigator.onLine is false): the redirect, at once.
 * - Online: the navigation goes to the network as it is, and whatever the
 *   server answers is passed back unchanged, redirects and errors included.
 *   Only when no answer arrives at all, as when the browser says it's online
 *   but the connection is down, does it redirect. There's no deadline: a
 *   start page that's slow keeps loading.
 *
 * In Chromium, static routing sends only those two navigations to this
 * worker; every other request goes straight to the network without starting
 * it. Other browsers call the fetch listener for every request in scope, and
 * it returns at once for anything else, which leaves the request to the
 * network as if there were no worker.
 */

const SAVED_PATH = "/trips/saved";
const ENTRY_PATHS = ["/", "/trips"];
// Every mode a fetch event can have, so the last rules leave everything else to the network.
const REQUEST_MODES = ["navigate", "same-origin", "no-cors", "cors"];

/** Whether the worker deals with this request at all: a page load of / or /trips. */
function isEntry(request) {
  if (request.method !== "GET" || request.mode !== "navigate") return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin && ENTRY_PATHS.includes(url.pathname);
}

const toSaved = () => Response.redirect(new URL(SAVED_PATH, self.location.origin).href, 302);

self.addEventListener("install", (event) => {
  if (typeof event.addRoutes === "function") {
    // Rules are tried in order and the first that matches decides.
    const routes = [
      ...ENTRY_PATHS.map((pathname) => ({ condition: { requestMode: "navigate", urlPattern: { pathname } }, source: "fetch-event" })),
      ...REQUEST_MODES.map((requestMode) => ({ condition: { requestMode }, source: "network" })),
    ];
    // A browser that refuses the rules still gets the fetch listener's own check.
    event.waitUntil(Promise.resolve().then(() => event.addRoutes(routes)).catch(() => undefined));
  }
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isEntry(request)) return;
  if (self.navigator.onLine === false) {
    event.respondWith(toSaved());
    return;
  }
  event.respondWith(fetch(request).catch(() => toSaved()));
});

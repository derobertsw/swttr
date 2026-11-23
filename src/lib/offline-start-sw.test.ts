// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * public/offline-start-sw.js (#214) run the way a browser runs it: its
 * install and fetch listeners are called with the events a page would cause,
 * against a fake network and a Cache Storage that records any use.
 */
const ORIGIN = "http://localhost";
const source = readFileSync(path.resolve(__dirname, "../../public/offline-start-sw.js"), "utf8");

type Request_ = { method: string; mode: string; url: string };
const navigation = (url: string): Request_ => ({ method: "GET", mode: "navigate", url: url.startsWith("http") ? url : `${ORIGIN}${url}` });

function worker({ online = true, network = async () => new Response("live page", { status: 200 }) }: {
  online?: boolean; network?: (request: Request_) => Promise<Response>;
} = {}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const cacheUse: string[] = [];
  // Any use of Cache Storage at all is recorded: the worker must keep nothing.
  const caches = new Proxy({}, { get: (_target, name) => { cacheUse.push(String(name)); return () => Promise.resolve(undefined); } });
  const self = {
    location: { origin: ORIGIN },
    navigator: { onLine: online },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
  };
  const fetch = vi.fn(network);
  new Function("self", "caches", "fetch", source)(self, caches, fetch);

  /** What the worker does with a request: its answer, or null when it leaves it to the network. */
  const handle = (request: Request_) => {
    let answer: Promise<Response> | Response | null = null;
    listeners.get("fetch")!({ request, respondWith: (response: Promise<Response> | Response) => { answer = response; } });
    return answer ? Promise.resolve(answer) : null;
  };
  /** Installs the worker; `addRoutes` is Chromium's static routing, missing in other browsers. */
  const install = async (addRoutes?: (rules: unknown) => Promise<void>) => {
    const pending: Promise<unknown>[] = [];
    listeners.get("install")!({ addRoutes, waitUntil: (work: Promise<unknown>) => pending.push(work) });
    await Promise.all(pending);
  };
  return { handle, install, fetch, self, cacheUse };
}

const isRedirectToSaved = (response: Response) =>
  response.status === 302 && response.headers.get("Location") === `${ORIGIN}/trips/saved`;

describe("The start page's redirect worker (#214)", () => {
  it("offline, sends a page load of / or /trips to Saved on this device without trying the network", async () => {
    const sw = worker({ online: false });
    for (const url of ["/", "/trips", "/?utm=bookmark"]) {
      const answer = sw.handle(navigation(url));
      expect(answer, url).not.toBeNull();
      expect(isRedirectToSaved(await answer!), url).toBe(true);
    }
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("online, passes the server's answer back unchanged, whatever it is", async () => {
    const answers = [
      new Response("start page", { status: 200 }),
      new Response(null, { status: 307, headers: { Location: "https://clerk.example.com/v1/client/handshake" } }),
      new Response("server error", { status: 500 }),
    ];
    for (const reply of answers) {
      const sw = worker({ network: async () => reply });
      expect(await sw.handle(navigation("/"))).toBe(reply);
      expect(sw.fetch).toHaveBeenCalledWith(expect.objectContaining({ url: `${ORIGIN}/` }));
    }
  });

  it("when the browser says it's online but nothing loads (a weak signal), redirects once the network fails", async () => {
    const sw = worker({ network: async () => { throw new TypeError("Failed to fetch"); } });
    expect(isRedirectToSaved(await sw.handle(navigation("/trips"))!)).toBe(true);
    expect(sw.fetch).toHaveBeenCalledOnce();
  });

  it("never answers any other page, an API request, a file, a write or another site, online or offline", () => {
    for (const online of [true, false]) {
      const sw = worker({ online });
      for (const request of [
        navigation("/trips/saved"),
        navigation("/trips/saved?trip=trip-1"),
        navigation("/trips/trip-1"),
        navigation("/trips/"),
        navigation("/wardrobe"),
        navigation("/privacy"),
        navigation("https://elsewhere.example.com/"),
        { method: "GET", mode: "cors", url: `${ORIGIN}/` },
        { method: "GET", mode: "cors", url: `${ORIGIN}/trips?_rsc=abc` },
        { method: "GET", mode: "cors", url: `${ORIGIN}/api/v1/trips` },
        { method: "GET", mode: "no-cors", url: `${ORIGIN}/_next/static/chunks/app.js` },
        { method: "POST", mode: "navigate", url: `${ORIGIN}/` },
        { method: "POST", mode: "cors", url: `${ORIGIN}/api/v1/trips/trip-1/days/2027-02-13/checks` },
        { method: "GET", mode: "cors", url: "https://tiles.example.com/1/2/3.png" },
      ]) expect(sw.handle(request), `${request.method} ${request.mode} ${request.url} online=${online}`).toBeNull();
      expect(sw.fetch).not.toHaveBeenCalled();
    }
  });

  it("caches nothing, installing or answering", async () => {
    const sw = worker({ online: false });
    await sw.install(async () => undefined);
    await sw.handle(navigation("/"));
    const online = worker();
    await online.handle(navigation("/trips"));
    expect([...sw.cacheUse, ...online.cacheUse]).toEqual([]);
    expect(source).not.toMatch(/\bcaches\s*[.[]/);
  });

  it("in Chromium, routes only / and /trips page loads to itself and everything else straight to the network", async () => {
    const sw = worker();
    let rules: Array<{ condition: { requestMode: string; urlPattern?: { pathname: string } }; source: string }> = [];
    await sw.install(async (given) => { rules = given as typeof rules; });
    // The browser tries the rules in order and the first that matches decides.
    const routeOf = (mode: string, pathname: string) => rules.find(({ condition }) =>
      condition.requestMode === mode && (!condition.urlPattern || condition.urlPattern.pathname === pathname))?.source;
    expect(routeOf("navigate", "/")).toBe("fetch-event");
    expect(routeOf("navigate", "/trips")).toBe("fetch-event");
    expect(routeOf("navigate", "/trips/saved")).toBe("network");
    expect(routeOf("navigate", "/wardrobe")).toBe("network");
    for (const mode of ["cors", "no-cors", "same-origin"]) {
      expect(routeOf(mode, "/")).toBe("network");
      expect(routeOf(mode, "/api/v1/trips")).toBe("network");
    }
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it("still installs where static routing is missing or refuses the rules", async () => {
    const without = worker();
    await expect(without.install(undefined)).resolves.toBeUndefined();
    expect(without.self.skipWaiting).toHaveBeenCalled();
    const refusing = worker();
    await expect(refusing.install(() => { throw new TypeError("unsupported condition"); })).resolves.toBeUndefined();
    expect(refusing.self.skipWaiting).toHaveBeenCalled();
  });
});

// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * public/offline-sw.js (#214) run against an in-memory Cache Storage and a
 * fake network, the way a browser runs it: its install, message and fetch
 * listeners are called with the events a page would cause.
 */
const ORIGIN = "http://localhost";
const source = readFileSync(path.resolve(__dirname, "../../public/offline-sw.js"), "utf8");

/** A server's answer; `hang` never answers, until the request is aborted. */
type Reply = { status: number; body: string; type?: string; hang?: boolean };
const asResponse = ({ status, body, type = "text/plain" }: Reply) => {
  const response = new Response(body, { status, headers: { "Content-Type": type } });
  // Same-origin responses a worker fetches are "basic"; Node's are "default".
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
};

const PAGE = (chunk: string) => `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/app.css">
<link rel="icon" href="/icon.png?v1">
</head><body><script src="/_next/static/chunks/${chunk}" async></script>
<script>self.__next_f.push([1,"\\"static/chunks/maybe-not-a-file.js\\""])</script></body></html>`;

function worker(network: Map<string, Reply>, { timeScale = 1 / 1000 }: { timeScale?: number } = {}) {
  // A held navigation waits until the test fails it, as a slow or dropped connection would.
  let heldNavigation: Promise<Response> | null = null;
  let dropNavigation: () => void = () => undefined;
  const holdNavigation = () => {
    heldNavigation = new Promise<Response>((_, reject) => { dropNavigation = () => reject(new TypeError("Failed to fetch")); });
    return () => dropNavigation();
  };
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: RequestInfo | URL) => new URL(typeof request === "string" ? request : request instanceof URL ? request.href : request.url, ORIGIN);
  // Holds cache lookups after the next `skip` until released, to order them against the browser reading a response.
  let gate: Promise<void> = Promise.resolve();
  let free = Infinity;
  const hold = (skip: number) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    free = skip;
    gate = held;
    return () => { free = Infinity; gate = Promise.resolve(); release(); };
  };
  const caches = {
    keys: async () => {
      if (free > 0) free -= 1;
      else await gate;
      return [...stores.keys()];
    },
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = () => stores.get(name) ?? new Map<string, Response>();
      return {
        put: async (request: RequestInfo | URL, response: Response) => { store().set(key(request).href, response.clone()); },
        match: async (request: RequestInfo | URL, options: { ignoreSearch?: boolean } = {}) => {
          const wanted = key(request);
          for (const [url, response] of store()) {
            const found = new URL(url);
            if (options.ignoreSearch ? found.pathname === wanted.pathname : url === wanted.href) return response.clone();
          }
          return undefined;
        },
        keys: async () => [...store().keys()].map((url) => new Request(url)),
      };
    },
  };
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const fetch = async (request: RequestInfo | URL, init: RequestInit = {}) => {
    if (heldNavigation && typeof request === "object" && "mode" in request && request.mode === "navigate") return heldNavigation;
    const url = key(request);
    const reply = network.get(url.pathname);
    if (!reply) throw new TypeError("Failed to fetch");
    if (reply.hang) {
      return new Promise<Response>((_, reject) =>
        init.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError"))));
    }
    return asResponse(reply);
  };
  // The worker's timers run a thousand times faster, so its deadlines pass within a test.
  const fastTimeout = (run: () => void, ms = 0) => setTimeout(run, ms * timeScale);
  new Function("self", "caches", "fetch", "setTimeout", "clearTimeout", source)(self, caches, fetch, fastTimeout, clearTimeout);

  /** Sends the page's "keep the latest page" message and resolves with the worker's reply. */
  const prime = async () => {
    const replies: unknown[] = [];
    const pending: Promise<unknown>[] = [];
    listeners.get("message")!({ data: { type: "prime" }, ports: [{ postMessage: (reply: unknown) => replies.push(reply) }], waitUntil: (work: Promise<unknown>) => pending.push(work) });
    await Promise.all(pending);
    return replies[0] as { ok: boolean; error?: string };
  };
  /** What the kept copy answers for a navigation to /trips/saved with the network gone. */
  const openOffline = async () => {
    network.clear();
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { method: "GET", mode: "navigate", url: `${ORIGIN}/trips/saved?trip=trip-1` },
      respondWith: (response: Promise<Response>) => { answer = response; },
      waitUntil: () => undefined,
    });
    return answer!;
  };
  /** The kept copies, newest first. */
  const kept = () => [...stores].filter(([name]) => name.startsWith("swttr-saved-shell-")).sort(([a], [b]) => b.localeCompare(a));
  /** What the worker answers for a build file the page asks for, with the network gone. */
  const staticOffline = async (path: string) => {
    network.clear();
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: new Request(`${ORIGIN}${path}`),
      respondWith: (response: Promise<Response>) => { answer = response; },
      waitUntil: () => undefined,
    });
    return answer!.then((response) => response.status, () => "failed");
  };
  /** A navigation to /trips/saved with the network up: the response, and the work it left running. */
  const openOnline = () => {
    let answer: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    listeners.get("fetch")!({
      request: { method: "GET", mode: "navigate", url: `${ORIGIN}/trips/saved` },
      respondWith: (response: Promise<Response>) => { answer = response; },
      waitUntil: (work: Promise<unknown>) => pending.push(work),
    });
    return { answer: answer!, settled: async () => { await answer; await Promise.all(pending); } };
  };
  return { prime, openOffline, openOnline, staticOffline, hold, holdNavigation, kept, stores };
}

const network = (chunk: string, overrides: Record<string, Reply> = {}) => new Map<string, Reply>(Object.entries({
  "/trips/saved": { status: 200, body: PAGE(chunk), type: "text/html; charset=utf-8" },
  "/_next/static/chunks/app.css": { status: 200, body: "body{font-family:x;src:url(../media/font.woff2)}", type: "text/css" },
  [`/_next/static/chunks/${chunk}`]: { status: 200, body: "console.log(1)", type: "application/javascript" },
  "/_next/static/media/font.woff2": { status: 200, body: "font" },
  "/icon.png": { status: 200, body: "png", type: "image/png" },
  // Picked out of page data, but not a file.
  "/_next/static/chunks/maybe-not-a-file.js": { status: 404, body: "" },
  ...overrides,
}));

describe("The saved trips page's service worker (#214)", () => {
  let net: Map<string, Reply>;
  beforeEach(() => { net = network("v1.js"); });

  it("keeps the page and every file it needs, and opens it with no network", async () => {
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: true });
    const [[, files]] = sw.kept();
    expect([...files.keys()].map((url) => new URL(url).pathname + new URL(url).search).sort()).toEqual([
      "/_next/static/chunks/app.css", "/_next/static/chunks/v1.js", "/_next/static/media/font.woff2", "/icon.png?v1", "/trips/saved",
    ]);
    const page = await sw.openOffline();
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("/_next/static/chunks/v1.js");
  });

  it("skips a chunk name picked out of page data that isn't a file, and a font a stylesheet can do without", async () => {
    const sw = worker(network("v1.js", { "/_next/static/media/font.woff2": { status: 404, body: "" } }));
    expect(await sw.prime()).toEqual({ ok: true });
    expect(sw.kept()).toHaveLength(1);
  });

  it("reports a failure, and keeps the previous copy, when a file the page needs answers with an error", async () => {
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: true });
    const [[previous]] = sw.kept();

    // A new deploy whose script the server can't send.
    net.set("/trips/saved", { status: 200, body: PAGE("v2.js"), type: "text/html" });
    net.set("/_next/static/chunks/v2.js", { status: 503, body: "" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(await sw.prime()).toEqual({ ok: false, error: "a file the page needs didn't download (503)" });

    // The copy that opens offline is still the whole earlier page; nothing half-saved is left.
    expect(sw.kept().map(([name]) => name)).toEqual([previous]);
    expect([...sw.stores.keys()].filter((name) => name.includes("staging"))).toEqual([]);
    expect(await (await sw.openOffline()).text()).toContain("/_next/static/chunks/v1.js");
  });

  it("keeps a new deploy's page found online even when the browser reads the page first", async () => {
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: true });
    net.set("/trips/saved", { status: 200, body: PAGE("v2.js"), type: "text/html" });
    net.set("/_next/static/chunks/v2.js", { status: 200, body: "console.log(2)", type: "application/javascript" });
    await new Promise((resolve) => setTimeout(resolve, 2));

    // Past the lookup for the kept page, the worker's cache lookups wait; meanwhile the browser reads the whole page it was given.
    const release = sw.hold(1);
    const { answer, settled } = sw.openOnline();
    const page = await answer;
    expect(await page.text()).toContain("/_next/static/chunks/v2.js");
    release();
    await settled();

    // Its check still ran on its own copy, saw the new chunk missing, and kept the new page.
    const [[, files]] = sw.kept();
    expect([...files.keys()].map((url) => new URL(url).pathname)).toContain("/_next/static/chunks/v2.js");
  });

  it("keeps the page when an optional file's download fails outright", async () => {
    net.delete("/_next/static/media/font.woff2");
    net.delete("/_next/static/chunks/maybe-not-a-file.js");
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: true });
    expect(sw.kept()).toHaveLength(1);
  });

  it("still keeps a page whose required files all arrived when only an optional file stalls", async () => {
    // A font a stylesheet loads hangs: the deadline cancels it, and the page works without it.
    net.set("/_next/static/media/font.woff2", { status: 200, body: "", hang: true });
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: true });
    const [[, files]] = sw.kept();
    const kept = [...files.keys()].map((url) => new URL(url).pathname);
    expect(kept).toEqual(expect.arrayContaining(["/trips/saved", "/_next/static/chunks/app.css", "/_next/static/chunks/v1.js"]));
    expect(kept).not.toContain("/_next/static/media/font.woff2");
  });

  it("gives up on a download that stalls, keeps the previous copy, and starts afresh next time", async () => {
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: true });
    const [[previous]] = sw.kept();

    net.set("/trips/saved", { status: 200, body: PAGE("v2.js"), type: "text/html" });
    net.set("/_next/static/chunks/v2.js", { status: 200, body: "", hang: true });
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(await sw.prime()).toEqual({ ok: false, error: "the offline page took too long to download" });
    expect(sw.kept().map(([name]) => name)).toEqual([previous]);

    // The stalled attempt is over: the next one downloads again rather than waiting on it.
    net.set("/_next/static/chunks/v2.js", { status: 200, body: "console.log(2)", type: "application/javascript" });
    expect(await sw.prime()).toEqual({ ok: true });
    const [[, files]] = sw.kept();
    expect([...files.keys()].map((url) => new URL(url).pathname)).toContain("/_next/static/chunks/v2.js");
  });

  it("serves the newest kept page when the connection drops after a newer one was kept, and keeps the one before's files", async () => {
    // Slower timers: the navigation's 4 second wait is 400 ms, time enough to keep the new page first.
    const sw = worker(net, { timeScale: 1 / 10 });
    expect(await sw.prime()).toEqual({ ok: true });
    net.set("/trips/saved", { status: 200, body: PAGE("v2.js"), type: "text/html" });
    net.set("/_next/static/chunks/v2.js", { status: 200, body: "console.log(2)", type: "application/javascript" });
    await new Promise((resolve) => setTimeout(resolve, 2));

    // A navigation starts while the old page is kept; meanwhile a save keeps the new one; then the connection drops.
    const drop = sw.holdNavigation();
    const { answer } = sw.openOnline();
    expect(await sw.prime()).toEqual({ ok: true });
    drop();
    expect(await (await answer).text()).toContain("/_next/static/chunks/v2.js");
    // Both copies' files open offline: the new page's, and the old page's for one already open.
    expect(await sw.staticOffline("/_next/static/chunks/v2.js")).toBe(200);
    expect(await sw.staticOffline("/_next/static/chunks/v1.js")).toBe(200);
  });

  it("reports a failure when the connection drops part way", async () => {
    net.delete("/_next/static/chunks/app.css");
    const sw = worker(net);
    expect(await sw.prime()).toEqual({ ok: false, error: "Failed to fetch" });
    expect(sw.kept()).toEqual([]);
  });
});

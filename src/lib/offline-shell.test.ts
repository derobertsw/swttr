// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepStartPageRedirect, prepareOfflineOpening, removeStartPageRedirect } from "@/lib/offline-shell";

const ORIGIN = "http://localhost";
const SAVED_WORKER = ["/offline-sw.js", { scope: "/trips/saved", updateViaCache: "none" }];
const START_WORKER = ["/offline-start-sw.js", { scope: "/", updateViaCache: "none" }];

/**
 * A registration whose worker answers the page's "keep the latest page"
 * message with `reply`. `startFails` makes registering the start page's
 * redirect worker fail.
 */
function registered(reply: { ok: boolean; error?: string }, state: Partial<ServiceWorkerRegistration> = {}, { startFails = false } = {}) {
  const worker = {
    postMessage: (_message: unknown, [port]: MessagePort[]) => {
      port.postMessage(reply);
      port.close();
    },
  };
  const register = vi.fn(async (url: string) => {
    if (url === "/offline-start-sw.js" && startFails) throw new DOMException("Failed to register", "SecurityError");
    return { installing: null, waiting: null, active: worker, ...state };
  });
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  return register;
}

/** A registration with `scope` whose worker runs `script`, and whether it was unregistered. */
function registration(scope: string, script: string | null, slot: "installing" | "waiting" | "active" = "active") {
  const unregister = vi.fn(async () => true);
  const worker = script ? { scriptURL: `${ORIGIN}${script}` } : null;
  return { scope: `${ORIGIN}${scope}`, installing: null, waiting: null, active: null, [slot]: worker, unregister };
}

describe("Preparing the saved trips page to open offline (#214)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registers the worker for /trips/saved only, and is ready once it kept the page", async () => {
    const register = registered({ ok: true });
    expect(await prepareOfflineOpening()).toEqual({ ready: true });
    expect(register).toHaveBeenNthCalledWith(1, ...SAVED_WORKER);
  });

  it("then registers the start page's redirect worker at /, so / and /trips can reach the saved page offline", async () => {
    const register = registered({ ok: true });
    await prepareOfflineOpening();
    expect(register.mock.calls).toEqual([SAVED_WORKER, START_WORKER]);
  });

  it("is still ready when the redirect worker can't be registered: the saved page opens from a bookmark", async () => {
    const register = registered({ ok: true }, {}, { startFails: true });
    expect(await prepareOfflineOpening()).toEqual({ ready: true });
    expect(register).toHaveBeenCalledWith(...START_WORKER);
  });

  it("reports a failure when the worker couldn't keep every file the page needs", async () => {
    const register = registered({ ok: false, error: "a file the page needs didn't download (503)" });
    expect(await prepareOfflineOpening()).toEqual({
      ready: false,
      reason: "Saved, but this device can't open it without a connection yet: a file the page needs didn't download (503). Update the saved copy while you're online to try again.",
    });
    // Nothing would open at /trips/saved offline, so / and /trips aren't sent there.
    expect(register.mock.calls).toEqual([SAVED_WORKER]);
  });

  it("reports a failure when a new worker fails to install", async () => {
    const installing = Object.assign(new EventTarget(), { state: "redundant" });
    registered({ ok: true }, { installing: installing as unknown as ServiceWorker, active: null });
    expect(await prepareOfflineOpening()).toMatchObject({ ready: false, reason: expect.stringContaining("the offline page didn't download completely") });
  });

  it("says when the browser has no service workers", async () => {
    vi.stubGlobal("navigator", {});
    expect(await prepareOfflineOpening()).toMatchObject({ ready: false, reason: expect.stringContaining("This browser can't open saved trips without a connection") });
  });
});

describe("The start page's redirect worker (#214)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registers at scope / with no HTTP cache for its script", async () => {
    const register = vi.fn(async () => ({}));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    await keepStartPageRedirect();
    expect(register.mock.calls).toEqual([START_WORKER]);
  });

  it("unregisters only itself, wherever its worker is in its life, and leaves the saved page's worker", async () => {
    const saved = registration("/trips/saved", "/offline-sw.js");
    const start = registration("/", "/offline-start-sw.js");
    const installing = registration("/", "/offline-start-sw.js", "installing");
    const other = registration("/", "/some-other-sw.js");
    vi.stubGlobal("navigator", { serviceWorker: { getRegistrations: async () => [saved, start, installing, other] } });
    await removeStartPageRedirect();
    expect(start.unregister).toHaveBeenCalledOnce();
    expect(installing.unregister).toHaveBeenCalledOnce();
    expect(saved.unregister).not.toHaveBeenCalled();
    expect(other.unregister).not.toHaveBeenCalled();
  });

  it("never throws, with no service workers or when unregistering fails", async () => {
    vi.stubGlobal("navigator", {});
    await expect(keepStartPageRedirect()).resolves.toBeUndefined();
    await expect(removeStartPageRedirect()).resolves.toBeUndefined();
    vi.stubGlobal("navigator", { serviceWorker: {
      register: async () => { throw new TypeError("Failed to register"); },
      getRegistrations: async () => { throw new DOMException("The operation is insecure.", "SecurityError"); },
    } });
    await expect(keepStartPageRedirect()).resolves.toBeUndefined();
    await expect(removeStartPageRedirect()).resolves.toBeUndefined();
  });
});

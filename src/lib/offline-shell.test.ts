// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOfflineOpening } from "@/lib/offline-shell";

/** A registration whose worker answers the page's "keep the latest page" message with `reply`. */
function registered(reply: { ok: boolean; error?: string }, state: Partial<ServiceWorkerRegistration> = {}) {
  const worker = {
    postMessage: (_message: unknown, [port]: MessagePort[]) => {
      port.postMessage(reply);
      port.close();
    },
  };
  const register = vi.fn(async () => ({ installing: null, waiting: null, active: worker, ...state }));
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  return register;
}

describe("Preparing the saved trips page to open offline (#214)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registers the worker for /trips/saved only, and is ready once it kept the page", async () => {
    const register = registered({ ok: true });
    expect(await prepareOfflineOpening()).toEqual({ ready: true });
    expect(register).toHaveBeenCalledWith("/offline-sw.js", { scope: "/trips/saved", updateViaCache: "none" });
  });

  it("reports a failure when the worker couldn't keep every file the page needs", async () => {
    registered({ ok: false, error: "a file the page needs didn't download (503)" });
    expect(await prepareOfflineOpening()).toEqual({
      ready: false,
      reason: "Saved, but this device can't open it without a connection yet: a file the page needs didn't download (503). Update the saved copy while you're online to try again.",
    });
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

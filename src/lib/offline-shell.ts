/**
 * The service workers that let Saved on this device open with no connection
 * (#214). The first is registered for that one page, so it never handles
 * another page or any API: see public/offline-sw.js. The second, at scope /,
 * only sends the start page and Trips there when they can't load, and only
 * while this device holds a saved brief: see public/offline-start-sw.js and
 * docs/trip-offline-brief.md.
 */

/** The page that lists and shows this device's saved briefs. */
export const SAVED_BRIEFS_PATH = "/trips/saved";
const WORKER_URL = "/offline-sw.js";
const START_WORKER_URL = "/offline-start-sw.js";
const START_SCOPE = "/";
const TIMEOUT_MS = 30_000;

type OfflineOpening = { ready: true } | { ready: false; reason: string };

const UNSUPPORTED = "This browser can't open saved trips without a connection, so open the saved copy here while you're online.";

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/** The registration's worker once it's active; a worker that fails to install rejects. */
function activeWorker(registration: ServiceWorkerRegistration): Promise<{ worker: ServiceWorker; fresh: boolean }> {
  const pending = registration.installing ?? registration.waiting;
  if (!pending) {
    return registration.active
      ? Promise.resolve({ worker: registration.active, fresh: false })
      : Promise.reject(new Error("the offline page didn't install"));
  }
  return new Promise((resolve, reject) => {
    const check = () => {
      if (pending.state === "activated") resolve({ worker: pending, fresh: true });
      else if (pending.state === "redundant") reject(new Error("the offline page didn't download completely"));
    };
    pending.addEventListener("statechange", check);
    check();
  });
}

/** Asks the worker to keep the latest page, and resolves once it has. */
function prime(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean; error?: string }>) => {
      if (event.data?.ok) resolve();
      else reject(new Error(event.data?.error || "the offline page didn't download completely"));
    };
    worker.postMessage({ type: "prime" }, [channel.port2]);
  });
}

/**
 * Makes sure Saved on this device opens without a connection: registers the
 * worker and has it keep the current page and its files. Resolves either way,
 * with why not when it couldn't, since the saved brief itself is still kept.
 */
export async function prepareOfflineOpening(): Promise<OfflineOpening> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || typeof MessageChannel === "undefined") {
    return { ready: false, reason: UNSUPPORTED };
  }
  try {
    const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: SAVED_BRIEFS_PATH, updateViaCache: "none" });
    const { worker, fresh } = await withTimeout(activeWorker(registration), "the offline page took too long to download");
    // A worker that just installed kept the page as it installed.
    if (!fresh) await withTimeout(prime(worker), "the offline page took too long to download");
    // The page opens offline, so the start page and Trips can send people to it.
    await keepStartPageRedirect();
    return { ready: true };
  } catch (error) {
    const why = error instanceof Error && error.message ? error.message : "the offline page didn't download";
    return { ready: false, reason: `Saved, but this device can't open it without a connection yet: ${why}. Update the saved copy while you're online to try again.` };
  }
}

const hasServiceWorkers = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

/**
 * Registers the worker that redirects the start page and Trips to Saved on
 * this device when they can't load. Call it only while this device holds a
 * saved brief. A failure is ignored: Saved on this device still opens from a
 * bookmark or history.
 */
export async function keepStartPageRedirect(): Promise<void> {
  if (!hasServiceWorkers()) return;
  try {
    await navigator.serviceWorker.register(START_WORKER_URL, { scope: START_SCOPE, updateViaCache: "none" });
  } catch {
    // Not registered: offline, the start page shows the browser's own offline page, as before.
  }
}

/** Whether a registration is the start page's redirect worker. */
function isStartPageRedirect(registration: ServiceWorkerRegistration): boolean {
  if (new URL(registration.scope).pathname !== START_SCOPE) return false;
  return [registration.installing, registration.waiting, registration.active]
    .some((worker) => worker && new URL(worker.scriptURL).pathname === START_WORKER_URL);
}

/**
 * Unregisters the start page's redirect worker once this device holds no
 * saved brief: after the last one is removed, on sign-out, or when another
 * account's are cleared. Never throws, so removing briefs never fails because
 * of it.
 */
export async function removeStartPageRedirect(): Promise<void> {
  if (!hasServiceWorkers()) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(isStartPageRedirect).map((registration) => registration.unregister()));
  } catch {
    // Still registered: offline, the start page then opens an empty Saved on this device.
  }
}

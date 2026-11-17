/**
 * The service worker that lets Saved on this device open with no connection
 * (#214). It's registered for that one page, so it never handles another
 * page or any API: see public/offline-sw.js and docs/trip-offline-brief.md.
 */

/** The page that lists and shows this device's saved briefs. */
export const SAVED_BRIEFS_PATH = "/trips/saved";
const WORKER_URL = "/offline-sw.js";
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
    return { ready: true };
  } catch (error) {
    const why = error instanceof Error && error.message ? error.message : "the offline page didn't download";
    return { ready: false, reason: `Saved, but this device can't open it without a connection yet: ${why}. Update the saved copy while you're online to try again.` };
  }
}

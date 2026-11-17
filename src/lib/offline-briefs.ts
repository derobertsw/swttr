/**
 * Trip briefs saved on this device (#214): the browser's IndexedDB holds them
 * for one account at a time, read by the Saved on this device page with no
 * connection. A brief is written in one transaction, only after the whole
 * brief arrived and checked out, so a save that didn't finish never replaces
 * the copy that's there. See docs/trip-offline-brief.md.
 */
import { STORAGE_KEYS } from "@/lib/storage";
import { TripRequestError } from "@/lib/trip-requests";
import type { TripOfflineBrief, TripOfflineBriefResponse } from "@/types/trip-offline-brief";

const DB_NAME = "swttr-offline";
const DB_VERSION = 1;
/** Saved briefs by trip id, each with the account it was saved for. */
const BRIEFS = "briefs";
/** `account`: the account this device's briefs belong to. */
const META = "meta";
const FETCH_TIMEOUT_MS = 20_000;

/** A brief as this device keeps it. */
export interface SavedBrief {
  trip_id: string;
  account_id: string;
  /** When this device stored it. */
  stored_at: string;
  brief: TripOfflineBrief;
}

/** The device's storage refused or failed: nothing was changed. */
class OfflineStorageError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

/**
 * The brief, when it's one this app can show: the version it knows, for a
 * trip, with every day it lists. A truncated or altered copy fails, and is
 * never shown or stored.
 */
export function readOfflineBrief(value: unknown): TripOfflineBrief | null {
  if (!isObject(value) || value.version !== 1 || value.kind !== "swttr.trip-offline-brief") return null;
  const { trip, viewer, covered, days, contents, shared_gear: shared } = value;
  if (!isObject(trip) || !isString(trip.id) || !isString(trip.name) || !isString(trip.dates_label)) return null;
  if (!isObject(viewer) || !isString(viewer.user_id)) return null;
  if (!isObject(covered) || !isStringArray(covered.dates) || !isString(covered.label)) return null;
  if (!isString(value.saved_at) || !Number.isFinite(Date.parse(value.saved_at)) || !isString(value.revision)) return null;
  const dates = covered.dates;
  if (!Array.isArray(days) || days.length !== dates.length) return null;
  if (!days.every((day, i) => isObject(day) && day.date === dates[i] && isString(day.date_label)
    && isStringArray(day.missing) && Array.isArray(day.conditions) && Array.isArray(day.equipment) && Array.isArray(day.day_checks))) return null;
  if (!Array.isArray(shared)) return null;
  if (!isObject(contents) || !isStringArray(contents.included) || !isStringArray(contents.absent) || !isStringArray(contents.omitted)) return null;
  return value as unknown as TripOfflineBrief;
}

function storageMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError") return "This device is out of storage space for saved trips.";
  if (name === "InvalidStateError" || name === "SecurityError") return "This browser isn't letting the app keep data on this device, as in a private window.";
  return "This device's storage didn't respond.";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new OfflineStorageError("This browser can't keep trips on this device."));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new OfflineStorageError(storageMessage(error)));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BRIEFS)) db.createObjectStore(BRIEFS, { keyPath: "trip_id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the database closes this connection rather than block it.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(new OfflineStorageError(storageMessage(request.error)));
    request.onblocked = () => reject(new OfflineStorageError("Close the app's other tabs, then try again."));
  });
}

/**
 * Runs `work` in one transaction and resolves with its result once the
 * transaction has committed. Any failure aborts it, so either every write in
 * it happened or none did.
 */
async function transact<T>(mode: IDBTransactionMode, work: (stores: { briefs: IDBObjectStore; meta: IDBObjectStore }) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([BRIEFS, META], mode);
      } catch (error) {
        reject(new OfflineStorageError(storageMessage(error)));
        return;
      }
      let result: T;
      let failed: unknown = null;
      tx.oncomplete = () => (failed ? reject(failed) : resolve(result));
      tx.onabort = () => reject(failed ?? new OfflineStorageError(storageMessage(tx.error)));
      tx.onerror = () => undefined;
      Promise.resolve(work({ briefs: tx.objectStore(BRIEFS), meta: tx.objectStore(META) })).then(
        (value) => { result = value; },
        (error) => {
          failed = error;
          try { tx.abort(); } catch { /* already finished */ }
        },
      );
    });
  } finally {
    db.close();
  }
}

const requestOf = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function setHint(accountId: string | null) {
  try {
    if (accountId) window.localStorage.setItem(STORAGE_KEYS.OFFLINE_BRIEFS_ACCOUNT, accountId);
    else window.localStorage.removeItem(STORAGE_KEYS.OFFLINE_BRIEFS_ACCOUNT);
  } catch {
    // Storage blocked: the account check then opens IndexedDB itself.
  }
}

/**
 * The account this device's briefs belong to, as a quick check that needs no
 * database: undefined when it can't tell, null when there are none.
 */
export function savedBriefsAccountHint(): string | null | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.OFFLINE_BRIEFS_ACCOUNT);
  } catch {
    return undefined;
  }
}

/**
 * The briefs on this device for its account, newest trip first. A stored copy
 * that no longer reads as a brief is listed in `damaged` and not shown.
 */
export async function readSavedBriefs(): Promise<{ account: string | null; briefs: SavedBrief[]; damaged: string[] }> {
  return transact("readonly", async ({ briefs, meta }) => {
    const [owner, rows] = await Promise.all([
      requestOf(meta.get("account")) as Promise<{ account_id?: unknown } | undefined>,
      requestOf(briefs.getAll()) as Promise<unknown[]>,
    ]);
    const account = isString(owner?.account_id) ? owner.account_id : null;
    const kept: SavedBrief[] = [];
    const damaged: string[] = [];
    for (const row of rows) {
      if (!isObject(row) || row.account_id !== account) continue;
      const brief = readOfflineBrief(row.brief);
      if (brief && brief.trip.id === row.trip_id && isString(row.stored_at)) kept.push({ ...(row as unknown as SavedBrief), brief });
      else if (isString(row.trip_id)) damaged.push(row.trip_id);
    }
    kept.sort((a, b) => a.brief.trip.start_date.localeCompare(b.brief.trip.start_date));
    return { account, briefs: kept, damaged };
  });
}

/** This trip's brief on this device for `accountId`, or null. */
export async function readSavedBrief(tripId: string, accountId: string): Promise<SavedBrief | null> {
  const { account, briefs } = await readSavedBriefs();
  return account === accountId ? briefs.find((saved) => saved.trip_id === tripId) ?? null : null;
}

/**
 * Keeps `brief` for `accountId`, replacing this trip's earlier copy, in one
 * transaction. Briefs another account saved on this device go in the same
 * transaction: a device holds one account's briefs.
 */
export async function storeSavedBrief(accountId: string, brief: TripOfflineBrief): Promise<SavedBrief> {
  if (!readOfflineBrief(brief) || brief.viewer.user_id !== accountId) {
    throw new OfflineStorageError("The brief isn't for the account that's signed in. Nothing was saved.");
  }
  const saved: SavedBrief = { trip_id: brief.trip.id, account_id: accountId, stored_at: new Date().toISOString(), brief };
  await transact("readwrite", async ({ briefs, meta }) => {
    const rows = await requestOf(briefs.getAll()) as unknown[];
    for (const row of rows) {
      if (isObject(row) && row.account_id !== accountId && isString(row.trip_id)) briefs.delete(row.trip_id);
    }
    briefs.put(saved);
    meta.put({ key: "account", account_id: accountId });
  });
  setHint(accountId);
  return saved;
}

/** Removes this device's copy of the trip. The trip itself isn't touched. */
export async function removeSavedBrief(tripId: string): Promise<void> {
  const left = await transact("readwrite", async ({ briefs, meta }) => {
    briefs.delete(tripId);
    const remaining = (await requestOf(briefs.getAllKeys())).filter((key) => key !== tripId).length;
    if (remaining === 0) meta.delete("account");
    return remaining;
  });
  if (left === 0) setHint(null);
}

/** Removes every brief on this device, for signing out or another account. */
export async function clearSavedBriefs(): Promise<void> {
  await transact("readwrite", ({ briefs, meta }) => {
    briefs.clear();
    meta.clear();
  });
  setHint(null);
}

/**
 * Clears this device's briefs when they belong to someone other than the
 * signed-in account (#214): another account, or nobody. Signed out is taken
 * from Clerk only once the server agrees, so a brief is never lost to a
 * session that just hasn't loaded. Resolves whether it cleared them.
 */
export async function reconcileSavedBriefs(userId: string | null, account: string | null | undefined): Promise<boolean> {
  if (!account || account === userId) return false;
  if (userId === null) {
    const response = await fetch("/api/v1/trips", { cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (response?.status !== 401) return false;
  }
  await clearSavedBriefs();
  return true;
}

/** How many briefs this device holds for `accountId`: 0 when it can't tell. */
export async function countSavedBriefs(accountId: string): Promise<number> {
  const hint = savedBriefsAccountHint();
  if (hint === null) return 0;
  try {
    const { account, briefs } = await readSavedBriefs();
    return account === accountId ? briefs.length : 0;
  } catch {
    return 0;
  }
}

/**
 * The brief for `dates` (or the default days), straight from the server, and
 * checked whole before anything uses it. It never comes from a cache.
 */
export async function fetchOfflineBrief(tripId: string, dates?: string[], signal?: AbortSignal): Promise<TripOfflineBriefResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  const timeout = window.setTimeout(abort, FETCH_TIMEOUT_MS);
  const query = dates?.length ? `?dates=${dates.map(encodeURIComponent).join(",")}` : "";
  try {
    let response: Response;
    try {
      response = await fetch(`/api/v1/trips/${encodeURIComponent(tripId)}/brief${query}`, { cache: "no-store", signal: controller.signal });
    } catch {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      throw new Error(controller.signal.aborted ? "The trip took too long to download." : "Check your connection and try again.");
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const reason = isObject(body) && isString(body.error) ? body.error : `Request failed (${response.status})`;
      throw new TripRequestError(reason, response.status, isObject(body) ? body : undefined);
    }
    const brief = isObject(body) ? readOfflineBrief(body.brief) : null;
    if (!brief || !isObject(body) || !Array.isArray(body.trip_days) || !isStringArray(body.default_dates)) {
      throw new Error("The trip didn't download completely.");
    }
    return { ...(body as unknown as TripOfflineBriefResponse), brief };
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

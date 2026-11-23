/**
 * Trip briefs saved on this device (#214): the browser's IndexedDB holds them
 * for one account at a time, read by the Saved on this device page with no
 * connection. A brief is written in one transaction, only after the whole
 * brief arrived and checked out, so a save that didn't finish never replaces
 * the copy that's there. See docs/trip-offline-brief.md.
 */
import { removeStartPageRedirect } from "@/lib/offline-shell";
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

type Check = (value: unknown) => boolean;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const orNull = (check: Check): Check => (value) => value === null || check(value);
const listOf = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
/** An object whose named fields each pass their check. */
const shape = (fields: Record<string, Check>): Check => (value) =>
  isObject(value) && Object.entries(fields).every(([key, check]) => check(value[key]));
const text = orNull(isString);
const isNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);

// Every field the saved brief's page reads, so a damaged copy is caught here, never while rendering.
const isLink = shape({ label: isString, url: isString });
const isPlace = shape({ label: isString, address: text, coordinates: isString, precision_label: isString, attribution: text });
const isKitPart = shape({ label: isString, wear: listOf(shape({ area: isString, items: isStringArray })), carry: isStringArray });
const isKit: Check = (value) => isObject(value) && isString(value.summary) && (
  value.kind === "outfit" ? listOf(isKitPart)(value.parts)
    : value.kind === "checklist" ? isStringArray(value.items)
    : value.kind === "none");
const isDay = shape({
  date: isString, date_label: isString, position_label: isString, activity_label: text, destination: text,
  participation_note: text,
  meet: orNull(shape({ label: isString, time_zone_label: isString })),
  meeting_point: orNull(isPlace),
  notes: text,
  starting_from: orNull(shape({ yours: text, crew: text })),
  getting_there: orNull(shape({ from: text, to: text, summary: isString, detail: text, credit: text, closures: isStringArray, directions: listOf(isLink) })),
  tonight: orNull(shape({
    yours: isString, crew: text, moving: text,
    stay: orNull(shape({ name: isString, dates_label: text, booking_label: isString, times_label: text, place: orNull(isPlace) })),
  })),
  tour_plan: orNull(shape({
    objective: isString, metrics: text, approach_notes: text, access_notes: text, backup_plan: text, return_label: text,
    checkin_notes: text, pickup_notes: text, time_zone_label: text, updated_label: isString, links: listOf(isLink),
  })),
  conditions: listOf(shape({
    category_label: isString, name: isString, region: text, link: isLink, your_review: text,
    reviews: listOf(shape({ who: isString, label: isString, note: text, stale: text })),
  })),
  kit: orNull(isKit),
  equipment: listOf(shape({ name: isString, quantity: isNumber, status_label: isString })),
  day_checks: listOf(shape({ label: isString, status_label: isString })),
  missing: isStringArray,
});
const isBrief = shape({
  trip: shape({ id: isString, name: isString, start_date: isString, end_date: isString, dates_label: isString }),
  viewer: shape({ user_id: isString, member_id: text }),
  covered: shape({ dates: isStringArray, label: isString }),
  saved_at: (value) => isString(value) && Number.isFinite(Date.parse(value)),
  revision: isString,
  days: listOf(isDay),
  shared_gear: listOf(shape({ description: isString, assignee: isString, status_label: text, mine: (value) => typeof value === "boolean" })),
  contents: shape({ included: isStringArray, absent: isStringArray, omitted: isStringArray }),
});

/**
 * The brief, when it's one this app can show: the version it knows, with
 * every field its page reads, one day for each covered date. A truncated or
 * altered copy fails, so it's never stored, and a stored one shows as damaged.
 */
export function readOfflineBrief(value: unknown): TripOfflineBrief | null {
  if (!isObject(value) || value.version !== 1 || value.kind !== "swttr.trip-offline-brief" || !isBrief(value)) return null;
  const brief = value as unknown as TripOfflineBrief;
  return brief.days.length === brief.covered.dates.length && brief.days.every((day, i) => day.date === brief.covered.dates[i]) ? brief : null;
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
export async function storeSavedBrief(accountId: string, brief: TripOfflineBrief, ticket?: number): Promise<SavedBrief> {
  if (!readOfflineBrief(brief) || brief.viewer.user_id !== accountId) {
    throw new OfflineStorageError("The brief isn't for the account that's signed in. Nothing was saved.");
  }
  const saved: SavedBrief = { trip_id: brief.trip.id, account_id: accountId, stored_at: new Date().toISOString(), brief };
  await transact("readwrite", async ({ briefs, meta }) => {
    const [rows, generation] = await Promise.all([
      requestOf(briefs.getAll()) as Promise<unknown[]>,
      requestOf(meta.get("generation")) as Promise<{ value?: unknown } | undefined>,
    ]);
    // A download that finishes after its account signed out or switched isn't
    // written. Checked here, after the last wait and right before the writes:
    // in this tab by the account the guard noted, and in any tab by the
    // generation every clear moves on, which the save took before downloading.
    if ((signedIn !== undefined && signedIn !== accountId) || (ticket !== undefined && generationOf(generation) !== ticket)) {
      throw new OfflineStorageError("You signed out or switched accounts while it downloaded, so nothing was saved.");
    }
    // The hint first, so a sign-out from here on clears this save too, once it commits.
    setHint(accountId);
    for (const row of rows) {
      if (isObject(row) && row.account_id !== accountId && isString(row.trip_id)) briefs.delete(row.trip_id);
    }
    briefs.put(saved);
    meta.put({ key: "account", account_id: accountId });
  });
  return saved;
}

const generationOf = (record: { value?: unknown } | undefined) => typeof record?.value === "number" ? record.value : 0;

/**
 * Where this device's briefs stand before a save downloads: pass it to
 * storeSavedBrief, which refuses the save if a sign-out or account change in
 * any tab cleared the briefs meanwhile.
 */
export async function saveTicket(): Promise<number> {
  return transact("readonly", async ({ meta }) => generationOf(await requestOf(meta.get("generation")) as { value?: unknown } | undefined));
}

/** Removes this device's copy of the trip. The trip itself isn't touched. */
export async function removeSavedBrief(tripId: string): Promise<void> {
  const left = await transact("readwrite", async ({ briefs, meta }) => {
    briefs.delete(tripId);
    const remaining = (await requestOf(briefs.getAllKeys())).filter((key) => key !== tripId).length;
    if (remaining === 0) meta.delete("account");
    return remaining;
  });
  if (left === 0) {
    setHint(null);
    // Nothing left to open offline, so the start page stops sending people there.
    await removeStartPageRedirect();
  }
}

/**
 * Removes every brief on this device, for signing out or another account.
 * With `owner`, only while the briefs are still that account's; resolves
 * whether it removed them.
 */
export async function clearSavedBriefs(owner?: string): Promise<boolean> {
  const cleared = await transact("readwrite", async ({ briefs, meta }) => {
    const [stored, generation] = await Promise.all([
      requestOf(meta.get("account")) as Promise<{ account_id?: unknown } | undefined>,
      requestOf(meta.get("generation")) as Promise<{ value?: unknown } | undefined>,
    ]);
    // Only the owner checked for: a newer account's save that finished first stays.
    if (owner !== undefined && stored?.account_id !== owner) return false;
    briefs.clear();
    meta.delete("account");
    // Saves that took a ticket before this, in any tab, are refused.
    meta.put({ key: "generation", value: generationOf(generation) + 1 });
    return true;
  });
  if (cleared) {
    setHint(null);
    await removeStartPageRedirect();
  }
  return cleared;
}

/**
 * The account Clerk says is signed in, as far as this page knows: undefined
 * before it has loaded. OfflineBriefAccountGuard keeps it, and signing out
 * sets it to null first, so a save still downloading can't be written after.
 */
let signedIn: string | null | undefined;

export function noteSignedInAccount(userId: string | null | undefined) {
  signedIn = userId;
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
    // Someone signed in while the server answered: that 401 is out of date.
    if (signedIn !== undefined && signedIn !== null) return false;
  }
  return clearSavedBriefs(account);
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

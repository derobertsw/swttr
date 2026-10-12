"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import { PreferenceSaveResult, TemperatureSensitivity, UserBodyMetrics } from "@/types/preferences";
import { DEFAULT_ACTIVITY } from "@/data/activities";
import { STORAGE_KEYS } from "@/lib/storage";
import { logWarn } from "@/lib/logger";
import {
  sanitizeBodyMetrics,
  sanitizeOptionalBodyMetrics,
} from "@/lib/biophysics/bodyMetrics";

const VALID_SENSITIVITIES: readonly TemperatureSensitivity[] = ["hot", "neutral", "cold"];

function isTemperatureSensitivity(value: unknown): value is TemperatureSensitivity {
  return (VALID_SENSITIVITIES as readonly unknown[]).includes(value);
}

/** What the guest or one account chose. Anything unset uses the defaults. */
interface StoredPreferences {
  sensitivity?: TemperatureSensitivity;
  defaultActivity?: string;
  heightInches?: number;
  weightLbs?: number;
}

type PreferenceField = keyof StoredPreferences;

/** Every field, in the order an unsaved list keeps them. */
const PREFERENCE_FIELDS: readonly PreferenceField[] = ["sensitivity", "defaultActivity", "heightInches", "weightLbs"];

/** The guest's preferences on this device, or one account's. */
interface OwnerPreferences {
  stored: StoredPreferences;
  /**
   * For an account: the fields whose value here the server hasn't confirmed
   * saving, because the save failed or hasn't finished. They're stored with
   * the values, win over the server's on each sync and are saved again then,
   * until a save of their current value succeeds.
   */
  unsaved: readonly PreferenceField[];
  /**
   * For an account: whether this page has had the server's answer, or failed to.
   * Either way it goes on from here; only a merge counts as synced.
   */
  serverAsked: boolean;
}

const NOTHING_STORED: StoredPreferences = {};

/** The fields of `value` that hold a valid preference, without the rest. */
function validPreferences(value: unknown): StoredPreferences {
  if (typeof value !== "object" || value === null) return {};
  const { sensitivity, defaultActivity, heightInches, weightLbs } = value as Record<string, unknown>;
  const metrics = sanitizeOptionalBodyMetrics({ heightInches, weightLbs } as Partial<UserBodyMetrics>);
  const valid: StoredPreferences = {};
  if (isTemperatureSensitivity(sensitivity)) valid.sensitivity = sensitivity;
  if (typeof defaultActivity === "string" && defaultActivity) valid.defaultActivity = defaultActivity;
  if (metrics.heightInches !== undefined) valid.heightInches = metrics.heightInches;
  if (metrics.weightLbs !== undefined) valid.weightLbs = metrics.weightLbs;
  return valid;
}

const isEmpty = (stored: StoredPreferences) => Object.keys(stored).length === 0;

/** Where `owner`'s preferences are kept: a Clerk user ID, or null for the guest. */
function storageKey(owner: string | null) {
  return `${STORAGE_KEYS.PREFERENCES}:${owner === null ? "guest" : `user:${owner}`}`;
}

// A single store shared by every usePreferences() caller, so a change made in
// one component (e.g. the preferences drawer) reaches all of them.
const owners = new Map<string, OwnerPreferences>();
let serverSyncStartedFor: string | null = null;
let legacyPreferencesMoved = false;
const listeners = new Set<() => void>();

/** What's kept in storage for one owner. */
type StoredRecord = Pick<OwnerPreferences, "stored" | "unsaved">;

/** The fields `record` lists as unsaved that `stored` has a value for. */
function unsavedFields(record: unknown, stored: StoredPreferences): PreferenceField[] {
  const listed = typeof record === "object" && record !== null ? (record as { unsaved?: unknown }).unsaved : undefined;
  if (!Array.isArray(listed)) return [];
  return PREFERENCE_FIELDS.filter((field) => listed.includes(field) && stored[field] !== undefined);
}

function readStored(key: string): StoredRecord {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return { stored: {}, unsaved: [] };
    const record: unknown = JSON.parse(saved);
    const stored = validPreferences(record);
    return { stored, unsaved: unsavedFields(record, stored) };
  } catch {
    // Storage can be unavailable (some private modes), or hold something unreadable.
    return { stored: {}, unsaved: [] };
  }
}

function writeStored(key: string, { stored, unsaved }: StoredRecord) {
  try {
    if (isEmpty(stored)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(unsaved.length ? { ...stored, unsaved } : stored));
  } catch {
    // Without storage, a choice lasts until the page reloads (and on the server, for an account).
  }
}

/**
 * Whether storage holds what this page has for the owner under `key`. When
 * it's blocked or full, writes fail and the page's copy is the only one.
 */
function keptInStorage(key: string) {
  const kept = ownerPreferences(key);
  const persisted = readStored(key);
  return (
    PREFERENCE_FIELDS.every((field) => kept.stored[field] === persisted.stored[field]) &&
    kept.unsaved.join() === persisted.unsaved.join()
  );
}

/**
 * Before the guest and each account kept their own, the device kept one copy
 * for whoever used it. There's no telling whose height and weight it holds,
 * so they're dropped. Its sensitivity and default activity become the guest's.
 */
function moveLegacyPreferences() {
  if (legacyPreferencesMoved) return;
  legacyPreferencesMoved = true;
  try {
    const legacy = validPreferences({
      sensitivity: localStorage.getItem(STORAGE_KEYS.SENSITIVITY),
      defaultActivity: localStorage.getItem(STORAGE_KEYS.DEFAULT_ACTIVITY),
    });
    if (!isEmpty(legacy)) {
      const guestKey = storageKey(null);
      writeStored(guestKey, { stored: { ...legacy, ...readStored(guestKey).stored }, unsaved: [] });
    }
    for (const key of [
      STORAGE_KEYS.SENSITIVITY,
      STORAGE_KEYS.DEFAULT_ACTIVITY,
      STORAGE_KEYS.HEIGHT_INCHES,
      STORAGE_KEYS.WEIGHT_LBS,
    ]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Without storage there's nothing to move.
  }
}

/** The preferences kept under `key`, read from storage the first time they're needed. */
function ownerPreferences(key: string): OwnerPreferences {
  let preferences = owners.get(key);
  if (!preferences) {
    moveLegacyPreferences();
    preferences = { ...readStored(key), serverAsked: false };
    owners.set(key, preferences);
  }
  return preferences;
}

function getServerSnapshot(): OwnerPreferences | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function updateOwner(key: string, patch: Partial<OwnerPreferences>) {
  const next = { ...ownerPreferences(key), ...patch };
  owners.set(key, next);
  if (patch.stored || patch.unsaved) writeStored(key, next);
  listeners.forEach((listener) => listener());
}

/** Makes `fields` the unsaved ones of the account kept under `key`. */
function setUnsaved(key: string, fields: readonly PreferenceField[]) {
  const unsaved = PREFERENCE_FIELDS.filter((field) => fields.includes(field));
  if (unsaved.join() !== ownerPreferences(key).unsaved.join()) updateOwner(key, { unsaved });
}

/** The preferences API's names for the stored fields that are set. */
function toPayload(stored: StoredPreferences): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (stored.sensitivity) payload.temperatureSensitivity = stored.sensitivity;
  if (stored.defaultActivity) payload.defaultActivity = stored.defaultActivity;
  if (stored.heightInches !== undefined) payload.heightInches = stored.heightInches;
  if (stored.weightLbs !== undefined) payload.weightLbs = stored.weightLbs;
  return payload;
}

// Which save of each account field started last. One that finishes after the
// field was saved again doesn't confirm its value, even if it's the same again.
let savesStarted = 0;
const latestSaves = new Map<string, Partial<Record<PreferenceField, number>>>();

/**
 * Saves `values` on the server for the account kept under `key`. They're
 * unsaved until it succeeds; a failed save leaves them for the next sync.
 * Resolves whether the server saved them.
 */
async function savePreferences(key: string, values: StoredPreferences, context: string) {
  const save = ++savesStarted;
  const fields = PREFERENCE_FIELDS.filter((field) => values[field] !== undefined);
  latestSaves.set(key, { ...latestSaves.get(key), ...Object.fromEntries(fields.map((field) => [field, save])) });
  setUnsaved(key, [...ownerPreferences(key).unsaved, ...fields]);
  try {
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toPayload(values)),
    });
    if (!res.ok) {
      logWarn(context, new Error(`Preferences not saved: HTTP ${res.status}`));
      return false;
    }
  } catch (err) {
    logWarn(context, err);
    return false;
  }
  const latest = latestSaves.get(key);
  setUnsaved(key, ownerPreferences(key).unsaved.filter((field) => latest?.[field] !== save));
  return true;
}

/** The fields of `now` that aren't in `then`, or hold another value there. */
function changedSince(then: StoredPreferences, now: StoredPreferences): StoredPreferences {
  return Object.fromEntries(
    Object.entries(now).filter(([field, value]) => then[field as PreferenceField] !== value)
  );
}

/** The fields of `stored` that `keep` accepts. */
function pick(stored: StoredPreferences, keep: (field: PreferenceField) => boolean): StoredPreferences {
  return Object.fromEntries(Object.entries(stored).filter(([field]) => keep(field as PreferenceField)));
}

/**
 * Merges in what the server keeps for `userId`. An account with nothing saved,
 * there or on this device, takes what the guest chose on this device. Either
 * way the guest's copy is gone afterwards, so no later account can take it.
 * A change the server hasn't confirmed saving wins over the server's value.
 * It's saved again, along with anything else the account has on this device
 * that the server lacks, like a guest's values it took.
 *
 * When the server can't answer, the account goes on with what it has on this
 * device, the guest's copy stays, and the next usePreferences() to mount asks
 * again.
 */
async function syncServerPreferences(userId: string) {
  const key = storageKey(userId);
  // What the account had here before asking. A change made while waiting is newer than the server's.
  const before = ownerPreferences(key).stored;
  let synced = false;
  try {
    const res = await fetch("/api/preferences");
    if (!res.ok || serverSyncStartedFor !== userId) return;

    const data = await res.json();
    if (serverSyncStartedFor !== userId) return;
    // An empty response means no DB row exists.
    const saved = validPreferences({
      sensitivity: data.temperatureSensitivity,
      defaultActivity: data.defaultActivity,
      heightInches: data.heightInches,
      weightLbs: data.weightLbs,
    });
    const { stored: own, unsaved } = ownerPreferences(key);
    const changed = changedSince(before, own);
    const pending = pick(own, (field) => unsaved.includes(field));
    const guestKey = storageKey(null);
    const guest = ownerPreferences(guestKey).stored;
    const merged =
      isEmpty(saved) && isEmpty(before)
        ? { ...guest, ...changed }
        : // What the server lacks, or hasn't confirmed saving, stays as this account last chose it here.
          { ...own, ...saved, ...pending, ...changed };
    updateOwner(key, { stored: merged });
    // A change made while waiting is being saved already.
    const toSave = pick({ ...changedSince(saved, merged), ...pending }, (field) => !(field in changed));
    if (!isEmpty(toSave)) void savePreferences(key, toSave, "usePreferences.saveUnsaved");
    updateOwner(guestKey, { stored: {} });
    synced = true;
  } catch (err) {
    logWarn("usePreferences.fetch", err);
  } finally {
    if (serverSyncStartedFor === userId) {
      if (!synced) serverSyncStartedFor = null;
      updateOwner(key, { serverAsked: true });
    }
  }
}

/**
 * Temperature sensitivity, default activity, height and weight, kept apart for
 * the guest and for each account on this device. An account's are also saved
 * on the server, which has the final say once it has saved this device's changes.
 */
export function usePreferences() {
  const { userId, isLoaded } = useAuth();
  // An unresolved identity is not a guest: wait before reading or writing either's preferences.
  const owner = isLoaded ? (userId ?? null) : undefined;
  const key = owner === undefined ? null : storageKey(owner);
  // Reading the new owner's preferences in the render where the account changes
  // means no request goes out with the last owner's body metrics.
  const getSnapshot = useCallback(() => (key ? ownerPreferences(key) : null), [key]);
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const stored = preferences?.stored ?? NOTHING_STORED;
  const bodyMetricsSelection = useMemo(() => {
    const selection: Partial<UserBodyMetrics> = {};
    if (stored.heightInches !== undefined) selection.heightInches = stored.heightInches;
    if (stored.weightLbs !== undefined) selection.weightLbs = stored.weightLbs;
    return selection;
  }, [stored]);
  const bodyMetrics = useMemo(() => sanitizeBodyMetrics(bodyMetricsSelection), [bodyMetricsSelection]);

  useEffect(() => {
    if (owner === undefined) return;
    if (owner === null) {
      serverSyncStartedFor = null;
      return;
    }
    if (serverSyncStartedFor === owner) return;
    serverSyncStartedFor = owner;
    void syncServerPreferences(owner);
  }, [owner]);

  /** Keeps a change for whoever is signed in: on this device, and on the server for an account. */
  const update = useCallback(
    async (change: StoredPreferences, context: string): Promise<PreferenceSaveResult> => {
      if (!key) throw new Error("Preferences are not ready");
      updateOwner(key, { stored: { ...ownerPreferences(key).stored, ...change } });
      if (owner && (await savePreferences(key, change, context))) return "saved";
      // Without the server, the change lasts only if storage has it (marked unsaved, for an account).
      if (!keptInStorage(key)) return "not-saved";
      return owner ? "kept-on-device" : "saved";
    },
    [key, owner]
  );

  const updateSensitivity = useCallback(
    (newSensitivity: TemperatureSensitivity) =>
      update({ sensitivity: newSensitivity }, "usePreferences.updateSensitivity"),
    [update]
  );

  const updateDefaultActivity = useCallback(
    (newActivity: string) => update({ defaultActivity: newActivity }, "usePreferences.updateDefaultActivity"),
    [update]
  );

  const updateBodyMetrics = useCallback(
    (nextMetrics: Partial<UserBodyMetrics>) =>
      update(validPreferences(nextMetrics), "usePreferences.updateBodyMetrics"),
    [update]
  );

  return {
    sensitivity: stored.sensitivity ?? "neutral",
    defaultActivity: stored.defaultActivity ?? DEFAULT_ACTIVITY,
    hasStoredDefaultActivity: stored.defaultActivity !== undefined,
    bodyMetrics,
    bodyMetricsSelection,
    updateSensitivity,
    updateDefaultActivity,
    updateBodyMetrics,
    loading: preferences === null || (owner !== null && !preferences.serverAsked),
  };
}

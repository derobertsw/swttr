"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@clerk/nextjs";
import { TemperatureSensitivity, UserBodyMetrics } from "@/types/preferences";
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

/** The guest's preferences on this device, or one account's. */
interface OwnerPreferences {
  stored: StoredPreferences;
  /** For an account: whether what the server keeps for it has been merged in on this page. */
  serverSynced: boolean;
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

function readStored(key: string): StoredPreferences {
  try {
    const saved = localStorage.getItem(key);
    return saved ? validPreferences(JSON.parse(saved)) : {};
  } catch {
    // Storage can be unavailable (some private modes), or hold something unreadable.
    return {};
  }
}

function writeStored(key: string, stored: StoredPreferences) {
  try {
    if (isEmpty(stored)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Without storage, a choice lasts until the page reloads (and on the server, for an account).
  }
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
      writeStored(guestKey, { ...legacy, ...readStored(guestKey) });
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
    preferences = { stored: readStored(key), serverSynced: false };
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
  if (patch.stored) writeStored(key, next.stored);
  listeners.forEach((listener) => listener());
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

async function savePreferences(payload: Record<string, unknown>, context: string) {
  try {
    await fetch("/api/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    logWarn(context, err);
  }
}

/**
 * Merges in what the server keeps for `userId`. An account with nothing saved,
 * there or on this device, takes what the guest chose on this device and saves
 * it. Either way the guest's copy is gone afterwards, so no later account can
 * take it.
 */
async function syncServerPreferences(userId: string) {
  const key = storageKey(userId);
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
    const own = ownerPreferences(key).stored;
    const guestKey = storageKey(null);
    const guest = ownerPreferences(guestKey).stored;
    if (isEmpty(saved) && isEmpty(own) && !isEmpty(guest)) {
      updateOwner(key, { stored: guest });
      void savePreferences(toPayload(guest), "usePreferences.claimGuest");
    } else {
      // What the server lacks stays as this account last chose it on this device.
      updateOwner(key, { stored: { ...own, ...saved } });
    }
    updateOwner(guestKey, { stored: {} });
  } catch (err) {
    logWarn("usePreferences.fetch", err);
  } finally {
    if (serverSyncStartedFor === userId) updateOwner(key, { serverSynced: true });
  }
}

/**
 * Temperature sensitivity, default activity, height and weight, kept apart for
 * the guest and for each account on this device. An account's are also saved
 * on the server, which has the final say.
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
    async (change: StoredPreferences, context: string) => {
      if (!key) throw new Error("Preferences are not ready");
      updateOwner(key, { stored: { ...ownerPreferences(key).stored, ...change } });
      if (owner) await savePreferences(toPayload(change), context);
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
    loading: preferences === null || (owner !== null && !preferences.serverSynced),
  };
}

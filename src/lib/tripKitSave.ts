/**
 * The latest Save to trip in this tab (#170), kept in sessionStorage. Before
 * a save is sent, its request is kept, so after a reload or a lost response
 * a retry repeats the same save instead of making another trip. Once saved,
 * the outcome is kept, so the same outing shows as saved rather than saving
 * it again. Each entry is tied to the account and the outing it was for.
 */
import { STORAGE_KEYS } from "@/lib/storage";
import type { Outing } from "@/types/outing";
import type { SaveKitRequest } from "@/types/savedKit";

export interface KitSaveOutcome {
  tripId: string;
  tripName: string;
  date: string;
}

interface KeptKitSave {
  owner: string;
  /** The outing, as JSON, so it can be told apart from another. */
  outing: string;
  /** Sent, with no answer yet: retrying it repeats the same save. */
  request?: SaveKitRequest;
  saved?: KitSaveOutcome;
}

const outingKey = (outing: Outing) => JSON.stringify(outing);

/** What's kept for this account's save of this outing, or null. */
export function readKitSave(owner: string, outing: Outing): Pick<KeptKitSave, "request" | "saved"> | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.TRIP_KIT_SAVE) ?? "null") as KeptKitSave | null;
    if (!kept || kept.owner !== owner || kept.outing !== outingKey(outing)) return null;
    return { request: kept.request, saved: kept.saved };
  } catch {
    return null;
  }
}

/** Keeps a save's request or outcome; false when storage isn't available. */
export function keepKitSave(owner: string, outing: Outing, state: Pick<KeptKitSave, "request" | "saved">): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEYS.TRIP_KIT_SAVE, JSON.stringify({ owner, outing: outingKey(outing), ...state }));
    return true;
  } catch {
    return false;
  }
}

export function forgetKitSave(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.TRIP_KIT_SAVE);
  } catch {
    // Nothing kept to forget.
  }
}

/**
 * Centralized localStorage key definitions
 * Single source of truth for all storage keys used throughout the app
 */
export const STORAGE_KEYS = {
  USER_ID: "swttr-user-id",
  SENSITIVITY: "swttr-temperature-sensitivity",
  DEFAULT_ACTIVITY: "swttr-default-activity",
  LAST_ACTIVITY: "swttr-last-activity",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

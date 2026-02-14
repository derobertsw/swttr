/**
 * Centralized localStorage key definitions
 * Single source of truth for all storage keys used throughout the app
 */
export const STORAGE_KEYS = {
  /** @deprecated Legacy key — only used by useMigrateUser for one-time migration. Auth now uses Clerk. */
  USER_ID: "swttr-user-id",
  SENSITIVITY: "swttr-temperature-sensitivity",
  DEFAULT_ACTIVITY: "swttr-default-activity",
  LAST_ACTIVITY: "swttr-last-activity",
  HEIGHT_INCHES: "swttr-height-inches",
  WEIGHT_LBS: "swttr-weight-lbs",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

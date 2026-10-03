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
  /** In sessionStorage: the Gear up form and last outing, for this tab only (src/lib/gearUpDraft.ts). */
  GEAR_UP_DRAFT: "swttr-gear-up",
} as const;

/**
 * Centralized localStorage key definitions
 * Single source of truth for all storage keys used throughout the app
 */
export const STORAGE_KEYS = {
  USER_ID: "swttr-user-id",
  SENSITIVITY: "swttr-temperature-sensitivity",
  DEFAULT_ACTIVITY: "swttr-default-activity",
  BACKPACK: "swttr-backpack",
  ITEM_MAPPINGS: "swttr-item-mappings",
  WARDROBE: "swttr-wardrobe",
  WARDROBE_HIDDEN: "swttr-wardrobe-hidden",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

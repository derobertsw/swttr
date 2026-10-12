export type TemperatureSensitivity = 'hot' | 'neutral' | 'cold';
export type TemperatureUnit = 'F' | 'C';

/**
 * Where a preference change was saved. A guest's is saved once the device
 * stores it. An account's is `kept-on-device` when the server couldn't save it
 * but the device stored it, to save there again on the next sync. `not-saved`:
 * nothing kept it, so it lasts only until the page reloads.
 */
export type PreferenceSaveResult = 'saved' | 'kept-on-device' | 'not-saved';

export interface UserBodyMetrics {
  heightInches: number;
  weightLbs: number;
}

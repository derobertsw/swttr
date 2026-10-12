export type TemperatureSensitivity = 'hot' | 'neutral' | 'cold';
export type TemperatureUnit = 'F' | 'C';

/**
 * Where a preference change was saved. A guest's are kept on the device, so
 * they're always saved. An account's is `kept-on-device` when the server
 * couldn't save it; it's saved there again on the next sync.
 */
export type PreferenceSaveResult = 'saved' | 'kept-on-device';

export interface UserBodyMetrics {
  heightInches: number;
  weightLbs: number;
}

/**
 * An official avalanche forecast center in SWTTR's verified list (#211): see
 * docs/trip-conditions.md#official-forecast-centers.
 */
export interface AvalancheCenter {
  id: string;
  /** The center's name, which becomes the source's name. */
  name: string;
  country: "US" | "CA";
  /** Where the official list places the center, e.g. "Utah". Not its forecast boundary. */
  area: string;
  /** The official forecast page, checked on the list's verification date. */
  url: string;
  /** The official list it comes from, e.g. "avalanche.org U.S. Avalanche Centers". */
  listed_on: string;
}

/**
 * A center Avalanche Canada's published forecast areas put this day's place
 * in today. The organizer confirms it before it becomes a source.
 */
export interface AvalancheCenterSuggestion {
  center_id: string;
  /** The forecast area's name on avalanche.ca, or null for a combined area too long to name. */
  area: string | null;
  /** Who avalanche.ca says forecasts the area, e.g. "Parks Canada". */
  forecaster: string;
}

export interface AvalancheCenterDirectory {
  /** When every link in `centers` was last checked, "YYYY-MM-DD". */
  verified_on: string;
  centers: AvalancheCenter[];
  suggestions: {
    /**
     * "found" with at least one suggestion; "none" when no published area holds
     * the place; "no_location" without coordinates; "unavailable" when
     * Avalanche Canada's areas couldn't be loaded.
     */
    status: "found" | "none" | "no_location" | "unavailable";
    /** The place checked: the day's access point, or its destination's weather location. */
    point: "access_point" | "destination" | null;
    /** When the areas were read from Avalanche Canada; null when they weren't. */
    checked_at: string | null;
    items: AvalancheCenterSuggestion[];
  };
}

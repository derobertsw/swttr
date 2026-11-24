/**
 * Wardrobe coverage (#93): how many scenarios in a fixed grid the wardrobe
 * dresses for, and which items do the work. Computed by
 * GET /api/wardrobe/coverage (src/lib/wardrobe-coverage/).
 */

export type CoverageActivity = 'running' | 'biking' | 'xc_skiing' | 'alpine_skiing' | 'backcountry_skiing';

/** `calm_dry`: 5 mph, no precipitation. `windy_wet`: 15 mph with rain, or snow at 32°F and below. */
export type CoverageWeather = 'calm_dry' | 'windy_wet';

/**
 * - `no_gear`: nothing in the wardrobe is modeled for the activity.
 * - `missing_item`: the engine reports a required item missing (a helmet, or
 *   a clothing requirement it couldn't match).
 * - `incomplete`: the outfit lacks clothing or the wind/rain protection the
 *   conditions require.
 * - `too_cold`: a body part, or the whole body, is under its minimum.
 * - `too_warm`: well over the upper target, more than venting covers.
 */
export type CoverageGapCause = 'no_gear' | 'missing_item' | 'incomplete' | 'too_cold' | 'too_warm';

export interface CoverageScenarioResult {
  id: string;
  activity: CoverageActivity;
  temperature_f: number;
  weather: CoverageWeather;
  /** Comfortable, or only a little warm: the engine's "Likely comfortable"
   * verdict, or "Warmer than recommended" within one target band's width. */
  covered: boolean;
  verdict: 'likely_comfortable' | 'a_little_warm' | 'gap';
  cause?: CoverageGapCause;
  /** What fell short, e.g. "legs too cold" or "no bike helmet". */
  detail?: string;
  /** Wardrobe items worn or packed, as `<item_type>:<id>`. */
  items: string[];
}

export interface CoverageGap {
  activity: CoverageActivity;
  cause: CoverageGapCause;
  /** Plain language, e.g. "No outfit for alpine skiing at -5°F: legs too cold". */
  message: string;
  scenario_ids: string[];
}

export interface CoverageItem {
  /** `<item_type>:<id>`. */
  key: string;
  name: string;
  /** Covered scenarios the item is worn or packed in. */
  covered_scenarios: number;
}

export interface WardrobeCoverage {
  grid_version: string;
  /** The grid in a phrase. */
  grid_description: string;
  scenario_count: number;
  covered_count: number;
  comfortable_count: number;
  /** Covered share of the grid, 0–1. */
  coverage: number;
  efficiency: {
    /** Share of modeled items worn in at least one covered scenario, 0–1. */
    score: number;
    used_items: number;
    /** Included catalog garments with usable thermal data, handwear and headwear. */
    modeled_items: number;
    /** Covered scenarios per modeled item: the issue's coverage / item count. */
    covered_per_item: number;
  };
  by_activity: { activity: CoverageActivity; label: string; covered: number; total: number }[];
  /** Largest first. */
  gaps: CoverageGap[];
  /** The items in the most covered scenarios, most first. */
  workhorses: CoverageItem[];
  /** Modeled items no covered scenario wears. */
  idle_items: CoverageItem[];
  scenarios: CoverageScenarioResult[];
  /** Time the grid took to evaluate, excluding loading the wardrobe. */
  evaluation_ms: number;
  /** True when served from the cache for these wardrobe contents. */
  cached: boolean;
}

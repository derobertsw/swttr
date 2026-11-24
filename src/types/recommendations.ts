import type { EvaluationItem } from './biophysics';

export interface LayerItem extends EvaluationItem {
  name: string;
  rcl?: number;
  isGeneric?: boolean;
  sourceId?: string;
  isRecommended?: boolean;
  brand?: string;
}

export interface LayerSet {
  base: LayerItem[];
  mid?: LayerItem[];
  outer: LayerItem[];
}

export interface Recommendation {
  torso: LayerSet;
  legs: LayerSet;
  hands: LayerSet;
  headNeck: LayerSet;
}

export interface LocationSuggestion {
  /**
   * A geocoder place's numeric ID, 0 for the device's own position, or a
   * resort's namespaced "resort:<resortId>" (#7).
   */
  id: number | string;
  name: string;
  region?: string;
  country: string;
  /** For a resort, its forecast point: where its weather is read. */
  latitude: number;
  longitude: number;
  /** The place's IANA time zone, e.g. "Australia/Sydney". Missing for the device's own location. */
  timeZone?: string;
  /** "resort" for a catalog ski resort; missing for an ordinary place. */
  kind?: "resort";
  source?: "openskidata";
  /** The resort catalog's stable ID (src/data/ski-resorts.json). */
  resortId?: string;
  /** The forecast point's elevation in meters; null when the catalog doesn't know it. */
  elevationM?: number | null;
  /** What the point is: "Top of K-1 Express Gondola", or "Resort reference point". */
  pointLabel?: string;
  pointKind?: "lift" | "reference";
  /** How a search matched it; "typo" is offered as "Did you mean…?". Not kept once picked. */
  match?: "exact" | "prefix" | "token" | "typo";
}

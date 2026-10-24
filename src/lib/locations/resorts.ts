import "server-only";
import catalog from "@/data/ski-resorts.json";
import { buildResortIndex, searchResorts, type ResortIndex, type ResortMatch, type SkiResort } from "./resort-search";

/**
 * The ski resort catalog (#7): an OpenSkiData snapshot normalized by
 * scripts/import-ski-resorts.mjs and served from memory, so typing never calls
 * a map service. Import, IDs, forecast points and licensing:
 * docs/ski-resorts.md.
 */

interface CatalogSource {
  snapshotDate: string;
  attribution: string;
}

/** A resort as /api/geocode returns it. Its coordinates are the forecast point. */
export interface ResortSuggestion {
  /** Namespaced so it never collides with a geocoder ID. */
  id: `resort:${string}`;
  kind: "resort";
  source: "openskidata";
  resortId: string;
  name: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
  timeZone?: string;
  elevationM: number | null;
  pointLabel: string;
  match: ResortMatch;
  attribution: string;
}

const source = catalog.source as CatalogSource | null;
let index: ResortIndex | null = null;

function toSuggestion({ resort, match }: { resort: SkiResort; match: ResortMatch }): ResortSuggestion {
  return {
    id: `resort:${resort.id}`,
    kind: "resort",
    source: "openskidata",
    resortId: resort.id,
    name: resort.name,
    ...(resort.region ? { region: resort.region } : {}),
    country: resort.country,
    latitude: resort.latitude,
    longitude: resort.longitude,
    ...(resort.timeZone ? { timeZone: resort.timeZone } : {}),
    elevationM: resort.elevationM,
    pointLabel: resort.pointLabel,
    match,
    attribution: source?.attribution ?? "",
  };
}

/** Catalog resorts matching a typed query, best first. Empty until a snapshot is imported. */
export function findResorts(query: string, limit: number): ResortSuggestion[] {
  index ??= buildResortIndex(catalog.resorts as SkiResort[]);
  return searchResorts(index, query, limit).map(toSuggestion);
}

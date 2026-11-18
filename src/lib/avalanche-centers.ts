import "server-only";
import { logWarn } from "@/lib/logger";
import type { AvalancheCenter, AvalancheCenterDirectory, AvalancheCenterSuggestion } from "@/types/avalanche-centers";

/**
 * The verified list of official avalanche forecast centers (#211, PR 3): see
 * docs/trip-conditions.md#official-forecast-centers for where each entry comes
 * from and how its link was checked. Re-check every link and update
 * VERIFIED_ON whenever an entry changes.
 */
const VERIFIED_ON = "2026-11-16";

const US_LIST = "avalanche.org U.S. Avalanche Centers";
const us = (id: string, name: string, area: string, url: string, listedOn = US_LIST): AvalancheCenter =>
  ({ id, name, country: "US", area, url, listed_on: listedOn });

const CENTERS: AvalancheCenter[] = [
  us("cnfaic", "Chugach National Forest Avalanche Center", "Alaska", "https://www.cnfaic.org/forecast/"),
  us("caac", "Coastal Alaska Avalanche Center", "Alaska", "https://www.coastalakavalanche.org/forecast/", "avalanche.org National Danger Map"),
  us("hac", "Haines Avalanche Center", "Alaska", "https://alaskasnow.org/haines-forecast/"),
  us("hpac", "Hatcher Pass Avalanche Center", "Alaska", "https://hpavalanche.org/forecast/"),
  us("vac", "Valdez Avalanche Center", "Alaska", "https://alaskasnow.org/valdez-forecast/"),
  us("kpac", "Kachina Peaks Avalanche Center", "Arizona", "https://kachinapeaks.org/Forecast/"),
  us("bac", "Bridgeport Avalanche Center", "California", "https://bridgeportavalanchecenter.org/avalanche-forecast/"),
  us("esac", "Eastern Sierra Avalanche Center", "California", "https://www.esavalanche.org/forecasts/"),
  us("msac", "Mount Shasta Avalanche Center", "California", "https://www.shastaavalanche.org/forecasts/avalanche/mount-shasta"),
  us("sac", "Sierra Avalanche Center", "California", "https://www.sierraavalanchecenter.org/forecasts/avalanche/central-sierra-nevada"),
  us("caic", "Colorado Avalanche Information Center", "Colorado", "https://avalanche.state.co.us/"),
  us("cbac", "Crested Butte Avalanche Center", "Colorado", "https://cbavalanchecenter.org/forecasts/"),
  us("ipac", "Idaho Panhandle Avalanche Center", "Idaho", "https://www.idahopanhandleavalanche.org/forecasts/"),
  us("pac", "Payette Avalanche Center", "Idaho", "https://payetteavalanche.org/forecasts/avalanche"),
  us("snfac", "Sawtooth Avalanche Center", "Idaho", "https://www.sawtoothavalanche.com/forecasts/avalanche"),
  us("fac", "Flathead Avalanche Center", "Montana", "https://www.flatheadavalanche.org/avalanche-forecast/"),
  us("gnfac", "Gallatin National Forest Avalanche Center", "Montana", "https://www.mtavalanche.com/avalanche-forecast"),
  us("wcmac", "West Central Montana Avalanche Center", "Montana", "https://missoulaavalanche.org/forecasts/"),
  us("mwac", "Mount Washington Avalanche Center", "New Hampshire", "https://www.mountwashingtonavalanchecenter.org/forecasts/"),
  us("tac", "Taos Avalanche Center", "New Mexico", "https://taosavalanchecenter.org/forecasts/"),
  us("coac", "Central Oregon Avalanche Center", "Oregon", "https://coavalanche.org/pages/forecasts/"),
  us("uac", "Utah Avalanche Center", "Utah", "https://utahavalanchecenter.org/"),
  us("nwac", "Northwest Avalanche Center", "Washington", "https://nwac.us/forecasts/avalanche"),
  us("btac", "Bridger-Teton Avalanche Center", "Wyoming", "https://bridgertetonavalanchecenter.org/forecasts/"),
  {
    id: "avalanche-canada", name: "Avalanche Canada", country: "CA", area: "Forecast areas on avalanche.ca's map",
    url: "https://avalanche.ca/map", listed_on: "Avalanche Canada forecast map",
  },
  {
    id: "parks-canada", name: "Parks Canada avalanche forecast", country: "CA",
    area: "Banff, Yoho, Kootenay, Jasper, Glacier and Waterton Lakes national parks",
    // Parks Canada's avalanche page sends its bulletin to avalanche.ca's map.
    url: "https://avalanche.ca/map", listed_on: "Parks Canada avalanche information",
  },
  {
    id: "avalanche-quebec", name: "Avalanche Québec", country: "CA", area: "Chic-Chocs, Québec",
    url: "https://avalanchequebec.ca/en/avalanche-bulletin/", listed_on: "Avalanche Canada forecast map",
  },
];

/** Avalanche Canada's documented public forecast API (avalanche.ca/api-docs). */
const AVALANCHE_CANADA_API = "https://avcan-services-api.prod.avalanche.ca/forecasts/en";
const TIMEOUT_MS = 8000;
const CACHE_MS = 30 * 60 * 1000;
/** Longer names are many regions combined for the day, too long to show. */
const LONGEST_AREA_NAME = 60;

type Ring = [number, number][];
interface ForecastArea { id: string; polygons: Ring[][]; name: string; owner: string; forecaster: string }
type Point = { latitude: number; longitude: number };

let cached: { at: number; areas: ForecastArea[] } | null = null;
let loading: Promise<{ at: number; areas: ForecastArea[] }> | null = null;

/** Forgets the forecast areas read from Avalanche Canada; for tests. */
export function clearAvalancheCanadaAreas() { cached = null; loading = null; }

const isRing = (value: unknown): value is Ring => Array.isArray(value) && value.length >= 4
  && value.every((pair) => Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

function polygonsOf(geometry: unknown): Ring[][] | null {
  const { type, coordinates } = (geometry ?? {}) as { type?: unknown; coordinates?: unknown };
  const polygons = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : null;
  if (!Array.isArray(polygons)) return null;
  return polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(isRing)) ? polygons as Ring[][] : null;
}

/**
 * Today's forecast areas with their names and forecasters. Only the
 * boundaries, names and owners are kept: never ratings or bulletin text.
 */
async function readAreas(): Promise<{ at: number; areas: ForecastArea[] }> {
  const get = async (path: string) => {
    const response = await fetch(`${AVALANCHE_CANADA_API}/${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Avalanche Canada ${path} returned ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  const [areas, metadata] = await Promise.all([get("areas"), get("metadata")]);
  const features = (areas as { features?: unknown })?.features;
  if (!Array.isArray(features) || !Array.isArray(metadata)) throw new Error("Avalanche Canada returned an unexpected shape");
  const details = new Map<string, { name: string; owner: string; forecaster: string }>();
  for (const entry of metadata as Array<{ area?: { id?: unknown; name?: unknown }; owner?: { value?: unknown; display?: unknown } }>) {
    const { area, owner } = entry ?? {};
    if (typeof area?.id === "string" && typeof area.name === "string" && typeof owner?.value === "string" && typeof owner.display === "string") {
      details.set(area.id, { name: area.name.trim(), owner: owner.value, forecaster: owner.display.trim() });
    }
  }
  const result: ForecastArea[] = [];
  for (const feature of features as Array<{ id?: unknown; geometry?: unknown }>) {
    const polygons = polygonsOf(feature?.geometry);
    const detail = typeof feature?.id === "string" ? details.get(feature.id) : undefined;
    // An area without its name and forecaster can't be suggested honestly.
    if (polygons && detail) result.push({ id: feature.id as string, polygons, ...detail });
  }
  return { at: Date.now(), areas: result };
}

async function forecastAreas() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  loading ??= readAreas().then((value) => (cached = value)).finally(() => { loading = null; });
  return loading;
}

/** Ray casting on [longitude, latitude] pairs. */
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside a polygon's outer ring and none of its holes. */
const inArea = (point: [number, number], area: ForecastArea) =>
  area.polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole)));

/** The directory entry for an avalanche.ca forecaster; every forecast there is on avalanche.ca's map. */
function centerFor(owner: string): string {
  if (owner === "avalanche-quebec") return "avalanche-quebec";
  if (owner.startsWith("parks-")) return "parks-canada";
  return "avalanche-canada";
}

/**
 * The verified list, plus the centers whose published forecast area holds
 * this day's place today. Only Avalanche Canada publishes its areas for apps,
 * so there are no suggestions for U.S. centers. A suggestion is a lead to
 * confirm on the center's own map: SWTTR never picks the nearest center, and
 * a place outside every area gets no suggestion.
 */
export async function avalancheCenterDirectory(place: (Point & { kind: "access_point" | "destination" }) | null): Promise<AvalancheCenterDirectory> {
  const directory = (suggestions: AvalancheCenterDirectory["suggestions"]): AvalancheCenterDirectory =>
    ({ verified_on: VERIFIED_ON, centers: CENTERS, suggestions });
  if (!place) return directory({ status: "no_location", point: null, checked_at: null, items: [] });
  let areas: Awaited<ReturnType<typeof forecastAreas>>;
  try { areas = await forecastAreas(); }
  catch (error) {
    logWarn("Avalanche Canada forecast areas", error);
    return directory({ status: "unavailable", point: place.kind, checked_at: null, items: [] });
  }
  const point: [number, number] = [place.longitude, place.latitude];
  const items: AvalancheCenterSuggestion[] = areas.areas.filter((area) => inArea(point, area)).map((area) => ({
    center_id: centerFor(area.owner),
    area: area.name.length <= LONGEST_AREA_NAME ? area.name : null,
    forecaster: area.forecaster,
  }));
  return directory({ status: items.length ? "found" : "none", point: place.kind, checked_at: new Date(areas.at).toISOString(), items });
}

import type { SkiResort } from "@/lib/locations/resort-search";

/**
 * Catalog records shaped like scripts/import-ski-resorts.mjs output, for
 * search and route tests. Coordinates, elevations and lift counts are rough
 * stand-ins chosen to exercise ranking; they aren't catalog data and must not
 * be copied into src/data.
 */
function resort(id: string, name: string, place: Pick<SkiResort, "region" | "country" | "countryCode" | "timeZone">, extra: Partial<SkiResort> = {}): SkiResort {
  return {
    id, name, aliases: [], ...place,
    latitude: 45, longitude: 7, elevationM: 2000,
    point: "upper_lift", pointLabel: "Top of the highest mapped lift",
    lifts: 10, sources: [`https://www.openstreetmap.org/way/${id.length}`], wikidata: null,
    ...extra,
  };
}

const VERMONT = { region: "Vermont", country: "United States", countryCode: "US", timeZone: "America/New_York" };
const COLORADO = { region: "Colorado", country: "United States", countryCode: "US", timeZone: "America/Denver" };

const KILLINGTON = resort("killington", "Killington Resort", VERMONT, { latitude: 43.6, longitude: -72.8, elevationM: 1260, pointLabel: "Top of K-1 Express Gondola", lifts: 20 });
const STOWE_RESORT = resort("stowe", "Stowe Mountain Resort", VERMONT, { latitude: 44.53, longitude: -72.78, elevationM: 1110, lifts: 12 });
const MAD_RIVER_GLEN = resort("mad-river-glen", "Mad River Glen", VERMONT, {
  aliases: ["MRG"], latitude: 44.2, longitude: -72.92, elevationM: null, point: "reference", pointLabel: "Resort reference point", lifts: 0,
});
const WHISTLER = resort("whistler-blackcomb", "Whistler Blackcomb", { region: "British Columbia", country: "Canada", countryCode: "CA", timeZone: "America/Vancouver" }, { lifts: 37 });
const CHAMONIX = resort("chamonix-mont-blanc", "Chamonix Mont-Blanc", { region: "Auvergne-Rhône-Alpes", country: "France", countryCode: "FR", timeZone: "Europe/Paris" }, { lifts: 30 });
const ARAPAHOE_BASIN = resort("arapahoe-basin", "Arapahoe Basin", COLORADO, { aliases: ["A Basin", "A-Basin"], lifts: 9 });

export const RESORT_FIXTURES: SkiResort[] = [
  KILLINGTON, STOWE_RESORT, MAD_RIVER_GLEN, WHISTLER, CHAMONIX, ARAPAHOE_BASIN,
  resort("vail", "Vail", COLORADO, { lifts: 31 }),
  resort("ski-apache", "Ski Apache", { region: "New Mexico", country: "United States", countryCode: "US", timeZone: "America/Denver" }, { lifts: 8 }),
  resort("crystal-mountain", "Crystal Mountain", { region: "Washington", country: "United States", countryCode: "US", timeZone: "America/Los_Angeles" }, { lifts: 11 }),
  resort("crystal-mountain-michigan", "Crystal Mountain", { region: "Michigan", country: "United States", countryCode: "US", timeZone: "America/Detroit" }, { lifts: 8 }),
  resort("mt-bachelor", "Mt. Bachelor", { region: "Oregon", country: "United States", countryCode: "US", timeZone: "America/Los_Angeles" }, { lifts: 15 }),
  resort("val-d-isere", "Val d’Isère", { region: "Auvergne-Rhône-Alpes", country: "France", countryCode: "FR", timeZone: "Europe/Paris" }, { lifts: 40 }),
  resort("solden", "Sölden", { region: "Tyrol", country: "Austria", countryCode: "AT", timeZone: "Europe/Vienna" }, { lifts: 31 }),
  resort("steamboat", "Steamboat", COLORADO, { lifts: 18 }),
  resort("st-anton", "St. Anton am Arlberg", { region: "Tyrol", country: "Austria", countryCode: "AT", timeZone: "Europe/Vienna" }, { lifts: 38 }),
  resort("chamois", "Chamois", { region: "Aosta Valley", country: "Italy", countryCode: "IT", timeZone: "Europe/Rome" }, { lifts: 5 }),
];

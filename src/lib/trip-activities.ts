// Activity chips shown when picking what someone is doing on a trip stop or
// day. Stored as freeform strings in trip_stops.activities and trip_days.activity
// so adding new ones requires no DB migration.
export const TRIP_ACTIVITY_OPTIONS = [
  "Alpine",
  "Backcountry",
  "XC",
  "Hike",
  "Run",
  "Bike",
  "Surf",
  "Climb",
  "Rest",
] as const;

export type TripActivity = (typeof TRIP_ACTIVITY_OPTIONS)[number];

// Map the trip chip label to the activity key used by the biophysics
// recommendation engine (src/data/activities.ts / layerRecommendations.json).
// Null entries are sports the engine doesn't support yet — we surface those as
// gaps in the auto-generated packing list rather than guessing.
export const TRIP_ACTIVITY_TO_RECOMMENDATION_KEY: Record<string, string | null> = {
  Alpine: "alpine_skiing",
  Backcountry: "backcountry_skiing",
  XC: "xc_skiing",
  Hike: "hiking_snowshoeing",
  Run: "running",
  Bike: "biking",
  Climb: "hiking_snowshoeing", // closest available — load-bearing, slow uphill
  Surf: null,
  Rest: null,
};

export function tripActivityToRecommendationKey(activity: string | null): string | null {
  if (!activity) return null;
  return TRIP_ACTIVITY_TO_RECOMMENDATION_KEY[activity] ?? null;
}

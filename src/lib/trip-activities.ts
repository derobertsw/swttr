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

type TripActivity = (typeof TRIP_ACTIVITY_OPTIONS)[number];

// Map the trip chip label to the activity key used by the biophysics
// activity identifiers. Individual callers must check their own engine's
// capabilities: Trips uses the static table, which has no Run/Bike/Backcountry
// guidance even though the biophysics routes support those sports.
//
// `satisfies` makes this object a compile error if a TripActivity key is
// missing or misspelled, while still narrowing each value to string | null.
const TRIP_ACTIVITY_TO_RECOMMENDATION_KEY = {
  Alpine: "alpine_skiing",
  Backcountry: "backcountry_skiing",
  XC: "xc_skiing",
  Hike: "hiking_snowshoeing",
  Run: "running",
  Bike: "biking",
  Climb: "hiking_snowshoeing", // closest available — load-bearing, slow uphill
  Surf: null,
  Rest: null,
} satisfies Record<TripActivity, string | null>;

export function tripActivityToRecommendationKey(activity: string | null): string | null {
  if (!activity) return null;
  // hasOwnProperty (not `in`) — `in` would match inherited Object.prototype
  // keys like "toString" and return the wrong recommendation key.
  if (!Object.prototype.hasOwnProperty.call(TRIP_ACTIVITY_TO_RECOMMENDATION_KEY, activity)) {
    return null;
  }
  return TRIP_ACTIVITY_TO_RECOMMENDATION_KEY[activity as TripActivity];
}

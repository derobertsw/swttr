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
  "Travel",
  "Rest",
] as const;

type TripActivity = (typeof TRIP_ACTIVITY_OPTIONS)[number];

/** The trip activity a tour plan belongs to (#210). */
export const TOUR_ACTIVITY: TripActivity = "Backcountry";

// What people read for a stored activity (#334). Storage keeps "Alpine" and
// "Backcountry", so saved days, tour plans and older app versions still match.
const TRIP_ACTIVITY_LABEL: Partial<Record<TripActivity, string>> = {
  Alpine: "Downhill skiing",
  Backcountry: "Backcountry skiing",
};

/** The label for a stored activity; one a person typed reads as typed. */
export function tripActivityLabel(activity: string): string {
  return Object.hasOwn(TRIP_ACTIVITY_LABEL, activity) ? TRIP_ACTIVITY_LABEL[activity as TripActivity]! : activity;
}

// Day types with no clothing to plan (#334): nobody is asked for a kit on them.
const NO_CLOTHING_ACTIVITIES: ReadonlySet<string> = new Set<TripActivity>(["Travel", "Rest"]);

/** False for a Travel or Rest day; an unset activity still has clothing to plan once it's chosen. */
export function tripActivityNeedsClothing(activity: string | null): boolean {
  return !activity || !NO_CLOTHING_ACTIVITIES.has(activity);
}

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
  Travel: null,
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

// The trip chip for each Gear up activity ID, for saving an outing to a trip.
// Climb also maps to hiking_snowshoeing, but a hike is what Gear up plans for.
const RECOMMENDATION_KEY_TO_TRIP_ACTIVITY: Record<string, TripActivity> = {
  alpine_skiing: "Alpine",
  backcountry_skiing: "Backcountry",
  xc_skiing: "XC",
  hiking_snowshoeing: "Hike",
  running: "Run",
  biking: "Bike",
};

/** The trip activity for a Gear up activity ID, or null when trips have none. */
export function tripActivityFromRecommendationKey(activity: string): TripActivity | null {
  return Object.hasOwn(RECOMMENDATION_KEY_TO_TRIP_ACTIVITY, activity)
    ? RECOMMENDATION_KEY_TO_TRIP_ACTIVITY[activity]
    : null;
}

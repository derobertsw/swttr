# Precise trip locations (#208)

Stays now have a confirmed place, separate from any activity's weather location. A destination's parking or meeting point, with a day-only override, follows in the next #208 change and reuses the same picker and location shape. Drive times (#209) and maps (#222) read these places later.

## Provider

Search uses Geoapify Address Autocomplete on the free plan: 3,000 credits a day, commercial use allowed with attribution, and results we may store. Each search costs 1 credit. Maps will use MapLibre with OpenFreeMap tiles, and weather search stays on Open-Meteo. The comparison with Google, Mapbox, Apple, Stadia, LocationIQ and openrouteservice is in the [provider decision](https://github.com/derobertsw/swttr/issues/208#issuecomment-6134840726). The [pilot](https://github.com/derobertsw/swttr/issues/208#issuecomment-6135105504) covered ten endpoint types in Vermont, New York and Massachusetts and passed 9 of 10. The pricing and terms were checked on October 12, 2026. Recheck them before relying on any change, and reassess after launch in #283.

Still open with Geoapify: a written answer on free-plan production limits, and on storing Route Matrix and Routing results. #209 needs that answer. Search results may already be stored.

Only `src/lib/locations/provider.ts` knows the provider. It keeps the key server-side (`GEOAPIFY_API_KEY`, never `NEXT_PUBLIC_`), times out after 6 seconds, and logs counts only, never the query or a place:

```json
{"event":"location_search","provider":"geoapify","outcome":"ok","results":2}
```

`outcome` is `ok`, `http_<status>` (429 means the daily credits are spent), `network_error` or `bad_response`. Search results are ranked as the pilot recommended:

- Results are biased towards the trip's destinations. Anything more than 1,000 km from all of them is dropped, such as Osaka for "Hotel Jay".
- Results are sorted by Geoapify's confidence, then exact places before areas, then distance.
- Duplicate pins are removed, and at most six results are shown.
- A result is **approximate** when it is a town, area, postcode or bare street. Geoapify's result type alone isn't trusted: a named place in a non-area category is exact even when it's typed as a postcode.
- Results with no name or with unusable coordinates (out of range, or 0, 0) are dropped.

## Location shape

`TripLocation` in `src/types/trips.ts` is stored as `trip_stays.location` (jsonb). `public.is_trip_location` checks the same rules in the database as `parseTripLocation` does in `src/lib/trip-location.ts`.

| Field | Meaning |
|---|---|
| `label`, `address` | Name and address as shown, so the place reads without a map |
| `latitude`, `longitude` | Rounded to 6 decimals; 0, 0 and out-of-range values are refused |
| `precision` | `exact`, or `approximate` for a town or area: shown as "Approximate area — choose the exact property for drive times" |
| `time_zone` | IANA zone when Geoapify resolved one, otherwise null |
| `source` | `search` or `manual` (typed coordinates, which carry no provider data) |
| `provider`, `provider_id` | `geoapify` and its place ID, kept as permitted |
| `attribution` | The data source's credit, kept with the place as Geoapify asks |

A stay save that omits `location` keeps the saved place, so an editor opened before this change can't clear it. `null` removes it. A rejected save leaves the saved place unchanged.

## Picker

`LocationPicker` (`src/components/trips/LocationPicker.tsx`) has a role-specific heading, "Where is the stay?", and starts from Search name or address. Choosing a result shows Check this location with its name, address, precision, Open map (OpenStreetMap, new tab) and the credit. Only Use this location hands the place to the editor, and the editor saves it with the stay. Back to results keeps the query and results without searching again.

- Searches start 350 ms after typing stops, from 3 characters. Each new query aborts the last request, so an older answer never replaces newer results or the place being checked.
- The search field is a combobox with an inline list: arrow keys move, Enter checks a place and never submits the form. Status is announced: Searching…, places found, No matches, or search unavailable.
- No matches and Search unavailable are separate messages. Both offer Save location later, which keeps the typed text in the stay's address. Enter coordinates is always available, and a pasted "44.4939, -72.7392" fills both fields.
- Set location on a stay with an address and no place searches that address straight away.
- "Powered by Geoapify" and "© OpenStreetMap contributors" appear wherever results or a saved Geoapify place appear, including for members.

## API

`GET /api/v1/trips/:id/locations?q=` returns `{results: TripLocation[]}`; an empty list means no matches. Only the organizer can search, because only the organizer edits logistics. Members get 403, and other trips get 404. A query must be 3–200 characters. Each person can search 30 times a minute (per server instance; 429, `code: "rate_limited"`). A missing key, provider failure or spent quota returns 503 with `code: "unavailable"` and no provider details.

Stay saves (`POST`/`PATCH /api/v1/trips/:id/stays…`, [trip-stays.md](trip-stays.md)) accept `stay.location`. An invalid place returns 400 with `field: "location"`.

## Deployment

1. Apply `supabase/migrations/025_trip_stay_locations.sql` by hand, after 017. It adds the column and replaces `mutate_trip_lodging` with a version that saves the location. As with the other trip migrations, apply this file on its own rather than pushing the folder. Until it's applied, a stay save with a location returns 503 (`field: "location"`) rather than saving the stay without its place; saves without one work as before.
2. Set `GEOAPIFY_API_KEY` in Vercel. Without it, search says it's unavailable and stays still save with an address or typed coordinates.

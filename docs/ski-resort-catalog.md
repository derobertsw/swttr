# Ski resort catalog (#7)

Alpine search finds the actual resort, forgives typos, and reads the weather at one documented point on the mountain. The resorts come from a pinned OpenSkiData export, normalized into `src/data/ski-resorts.json` and served from the app's own server bundle. A keystroke never calls a map service.

## Source and licence

| | |
|---|---|
| Source | [OpenSkiData](https://www.openskidata.org/) export, published by [OpenSkiMap](https://openskimap.org/) |
| Files | [`ski_areas.geojson`](https://tiles.openskimap.org/geojson/ski_areas.geojson) and [`lifts.geojson`](https://tiles.openskimap.org/geojson/lifts.geojson). The [`ski_areas.csv`](https://tiles.openskimap.org/csv/ski_areas.csv) summary was downloaded too but isn't needed: the GeoJSON has every field it has. |
| Snapshot | Files last modified **November 24, 2026, 00:44 UTC** (HTTP `Last-Modified`), downloaded November 24, 2026. The catalog's `meta.snapshot` is `2026-11-24`. |
| Sizes | `ski_areas.geojson` 21.4 MB, `lifts.geojson` 120 MB, `ski_areas.csv` 3.4 MB. None of them is committed. |
| Licence | [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The data is OpenStreetMap's, enriched by OpenSkiMap and merged with [skimap.org](https://skimap.org/). |
| Attribution | "Ski area and lift data © OpenSkiMap.org contributors and © OpenStreetMap contributors, ODbL; skimap.org" (also in the catalog's `meta.attribution`). |

What ODbL asks of us:

- **The catalog is a derivative database**, so `src/data/ski-resorts.json` is distributed under ODbL 1.0, not the app's own licence. Anyone may reuse it under the same terms. The import script and `scripts/ski-resorts/overrides.json` are how it was made, which ODbL asks us to make available with it; both are in this repository.
- **Search results and forecast-point labels shown in the app are a produced work** and need the attribution above where they're shown, so the picker shows a credit line linking to OpenSkiMap and OpenStreetMap's copyright page whenever a resort is in the results.
- Keep the attribution, source URLs and snapshot date here, and in `meta`, whenever the catalog is re-imported.

## What the catalog keeps

The import keeps a ski area when its activities include downhill, it has a name, and its status is `operating`. Abandoned, disused, proposed and never-opened areas are left out. An area whose status is unknown stays only when it still has an operating lift. The same name mapped twice within 3 km (an OSM area and an old skimap.org point, usually) is kept once, preferring the entry with a lift-top point and more lifts.

Each row uses short keys to keep the file small (about 0.96 MB, 0.25 MB gzipped, 4,806 resorts in the 2026-11-24 snapshot):

| Key | Field |
|---|---|
| `id` | Stable resort ID (below) |
| `n` | Canonical name, as mapped |
| `a` | Curated aliases ("A-Basin") |
| `l` | Towns the area is mapped in. Searched, never shown as the resort's name, so a town can't pass for the resort. |
| `r`, `c` | Region and country, in English |
| `tz` | IANA time zone |
| `lat`, `lon` | Resort reference point, 4 decimals (about 11 m) |
| `p`, `pl` | Forecast point: `[latitude, longitude, elevation m or null]` and its label |
| `lc` | Operating lifts mapped, used to break search ties toward the bigger resort |

### Stable IDs

The export's own `id` is a content hash that changes whenever the area's data does, so it is never used. A resort's ID is one of its upstream identities, most stable first: `wd-Q…` (Wikidata), `skimap-…` (skimap.org) or `osm-w…`/`osm-r…`/`osm-n…` (OpenStreetMap way, relation or node). Several OSM areas can share one skimap.org ID, so an area takes the first of its keys no other area has claimed.

Re-importing keeps IDs: the script reads the current catalog first, and an area keeps its old ID when any of its upstream keys is that ID. A new key is never one that an old, now-missing resort used, so a saved trip can't silently point at a different resort. When an area loses every key it had (an OSM area redrawn as a new way, with no skimap.org or Wikidata link), add `"ids": { "<new key>": "<old ID>" }` to the overrides.

### Forecast points

One point per resort, which is where the weather is read:

1. **A mapped upper lift top** where one can be established: the highest top station of the area's operating lifts in the OpenSkiMap lift export. Private lifts and railways are ignored; a lift top more than 25 km from the resort's reference point, or more than 150 m above the highest mapped run, is rejected as belonging to something else (a sightseeing cable car). The elevation is the lift geometry's own, which OpenSkiMap adds from a terrain model, rounded to the meter. The label names the lift: "Top of K-1 Express Gondola". 4,320 resorts in this snapshot have one.
2. **Otherwise the resort reference point**: the mapped point, or the centroid of the area's largest polygon. Its elevation stays **null**, and the weather request leaves it to the provider's terrain model. The label says "Resort reference point". No summit elevation is invented.

The highest lift top was chosen because that's where the coldest, windiest conditions a skier dresses for are, and because it's a real, mapped place a person can stand. Curated fixes for bad or missing geometry go in `overrides.points`.

### Time zones

A country with a single IANA zone takes it directly (from the runtime's CLDR data). Anywhere else, the import asks Open-Meteo's forecast API with `timezone=auto`, as the app already does for trips (`lookupTimeZone` in `src/lib/trip-tour-plans.ts`), 50 points per request, and caches the answers so a rerun is offline. A resort that hasn't moved keeps its previous zone without a lookup. `overrides.timeZones` corrects one by hand.

## Search

`src/lib/locations/resorts.ts` (server-only). Text is normalized first: case, accents, punctuation and spacing are dropped, and "Mount"/"Saint" become "Mt"/"St". Then, in order:

1. **Exact**: the query is the name, an alias, the name without "Resort"/"Ski Area"/"(Chamonix)", or one part of a combined name ("Flégère" in "Brévent/Flégère").
2. **Prefix** of any of those.
3. **Every word** starts a word of the name, or names the town the area is mapped in ("Chamonix" finds Les Grands Montets).
4. **Typos**, only when nothing above matched: each word may be off by no edits below four characters, one for four to six, two for longer (adjacent swaps count as one). The last word may still be half-typed. These come back with `match: "typo"` so the picker asks "Did you mean …?" instead of choosing for the user.

Ties go to fewer edits, then more lifts, then a name over an alias, then the shorter name, then alphabetical, then ID, so the order is the same every time. Results keep region and country so same-named resorts stay distinguishable. At most eight results come back, in about 10–20 ms on a laptop after the first query builds the index.

### `GET /api/geocode`

| `kind` | Searches | Notes |
|---|---|---|
| (none) | Open-Meteo geocoder | Unchanged general search. |
| `resort` | The catalog only | No upstream call. |
| `all` | Both | Exact and prefix resort matches first, then the geocoder's places, then looser resort matches; at most eight. Deduplicated by source identity, so "Stowe" returns both Stowe Mountain Resort and the town of Stowe. If the geocoder fails, resort matches still come back with `placesUnavailable: true`. |

The response is still `{ results: [...] }`. A resort result has `id: "resort:<resortId>"`, `kind: "resort"`, `source: "openskidata"`, `resortId`, `name`, `region`, `country`, `timeZone`, the forecast point as `latitude`/`longitude`, `elevationM` (null when unknown), `pointLabel`, `pointKind` (`lift` or `reference`) and `match`. Geocoder results are unchanged.

## Picker

`useLocationSearch({ kind })` and `LocationAutocomplete` (#7, PR 2). The search kind comes from `searchKindFor(activity)` in `src/lib/locationSuggestion.ts`:

| Activity | Search | Fallback |
|---|---|---|
| Alpine skiing (`alpine_skiing`, or `Alpine` on trips) | `kind=resort` | **Search all places**, the last option in the list, so the keyboard reaches it. It lasts until the activity changes or the picker is reset. |
| Anything else, or a trip stop with no activity | `kind=all`: places and resorts | — |

Resort search is on (`RESORT_SEARCH_ENABLED` in `src/lib/locationSuggestion.ts`). Setting it to `false` puts every picker back on the general search, with nothing else to undo.

- A resort is labelled "Ski resort · region, country" with a mountain icon; a town with the same name stays a separate option.
- A typo match reads "Did you mean Killington Resort?". It's never chosen for the person: Enter with nothing highlighted does nothing.
- Empty and failed searches say so ("No ski resorts match." / "Couldn't search locations. Try again."), and a live region announces result counts, the "Did you mean" suggestion, no matches and errors. An answer to an older query or an older kind of search is dropped.
- A picked resort shows where its weather is read under the field ("forecast at Top of K-1 Express Gondola, 1,262 m (4,140 ft)"), which also describes the field for screen readers.
- Changing the activity keeps the place already picked, and shows its real kind. A saved town stays a town until the person picks a resort.
- "Use my location" is unchanged and stays labelled as the device's position.

## Saved places

A picked resort keeps its identity everywhere a place is kept:

- **Gear up:** the outing's `place` (`LocationSuggestion`) carries `kind`, `source`, `resortId`, `elevationM`, `pointLabel` and `pointKind`. Drafts, saved kits and the WebMCP action check those fields together (`readResortFields`): a resort whose ID, point or label doesn't add up is refused, not half-kept. Drafts and kits from before #7 have numeric IDs and none of the fields, and still load. How the search matched (`match`) is dropped once a place is picked.
- **Trips:** `trip_stops.resort_id`, `forecast_elevation_m` and `forecast_point_label` (migration `20261124100000_trip_stop_resort_points.sql`). The browser sends only `resort_id`. The API looks it up in the catalog (`withResortPoint` in `src/lib/locations/resort-places.ts`) and saves the catalog's coordinates, elevation and label together, so they can't drift apart; an ID the catalog doesn't know is refused with "Select the resort again". This applies to trip creation (`create_trip_draft`), adding a stop, editing a stop's place, and a day's place (`edit_trip_itinerary` `set_day_place`). Moving a stop to a general place clears its resort fields; a database check enforces that a general place has none and a resort always has a label. A stop already at a place is reused only when it's the same resort (or both are general places).
- Equality compares coordinates **and** the resort point (`isSameLocation`), so a point change counts as a new place even at the same coordinates.

**Not yet carried:** a new trip made from Gear up's **Save to trip** (`save_trip_kits`) saves a resort destination as a general place at the resort's forecast point, without its resort fields. Fixing it means redefining `save_trip_kits`, which is left for a follow-up.

## Forecasts at the point

Every forecast goes through `src/lib/weather/openMeteo.ts`, which validates the location and builds the Open-Meteo request:

| Path | How the point arrives |
|---|---|
| `GET /api/weather` (current, hourly, date range and its retries) | `resort=<resortId>`, or `lat`/`lon` with an optional `elevation` in meters |
| `POST /api/plan-ahead` | `resortId`, or `lat`/`lon` with an optional `elevationM` |
| Trip day weather and packing (`src/lib/trip-forecast.ts`) | The stop's saved `resort_id`, coordinates, `forecast_elevation_m` and label |

- A **resort ID** is looked up in the catalog, and its point and elevation are used whatever coordinates the browser sent. An ID the catalog doesn't know is a 400, so the forecast is never quietly read somewhere else. A trip stop keeps the point it saved.
- The **elevation** goes to Open-Meteo as `elevation=` in meters. Open-Meteo already downscales its forecast to that elevation, so **no lapse-rate correction is added**: one would correct the temperature twice. Wind is never adjusted. With no known elevation (towns, reference points), the parameter is left out and Open-Meteo uses its terrain model.
- Units, times and errors are unchanged: °F and mph internally, the destination's clock and DST handling, the 16-day horizon, partial-hour handling, and 422/500 errors. A failed mountain forecast is an error, never current weather or the town's.
- Every response's `provenance.point` says where the forecast was read: coordinates, the resort's label and ID, the elevation Open-Meteo reports it used (`elevationM`), and whether that was the resort's mapped elevation (`requested`) or the terrain model's (`terrain`). Gear up's result header, the multi-day plan header and the trip day's weather card show "Forecast at Top of K-1 Express Gondola, 1,262 m (4,140 ft)" for a resort. The weather source details show the point and elevation for every place.
- Cache and request keys include the point. Trip forecasts share in-flight requests by coordinates and elevation, and the trip day page refetches when a stop's resort or elevation changes, even at the same coordinates.

OpenSnow was considered and deferred: [`mountain-weather-providers.md`](mountain-weather-providers.md).

## Re-importing

1. Download the two GeoJSON files into a new, empty directory outside the repository, for example `mktemp -d`. Treat them as untrusted data.
2. From any other directory, run:

   ```sh
   node /path/to/swttr/scripts/import-ski-resorts.mjs \
     --areas "$DIR/ski_areas.geojson" --lifts "$DIR/lifts.geojson" \
     --snapshot YYYY-MM-DD --timezones "$DIR/timezones.json"
   ```

   It overwrites `src/data/ski-resorts.json`, keeping IDs from the current file.
3. Check the diff: resorts that disappeared (a saved trip may name them), new typo or ranking surprises (`src/lib/locations/resorts.test.ts`), and the size. Update the snapshot date and counts above.

Never commit the raw exports.

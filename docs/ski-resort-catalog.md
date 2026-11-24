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
- **Search results and forecast-point labels shown in the app are a produced work** and need the attribution above where they're shown, so the resort picker must carry a short credit line linking to OpenSkiMap and OpenStreetMap's copyright page.
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

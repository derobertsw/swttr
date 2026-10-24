# Ski resort catalog (#7)

Alpine search should find the resort itself, survive a misspelling and forecast at a known point on the mountain. This page covers the first step: a local resort catalog, its import and its search. Picker behavior and saved-location compatibility (PR 2) and elevation-aware forecasts (PR 3) follow. **No picker uses resort search yet**, and it stays off until PR 3's weather path is ready.

**The committed catalog is empty.** The export host (`tiles.openskimap.org`) couldn't be reached from the environment this was built in, so `src/data/ski-resorts.json` holds no resorts until someone runs the first import below. Until then `kind=resort` answers no results and `kind=all` answers places only.

| File | What it holds |
|---|---|
| `scripts/import-ski-resorts.mjs` | The import: reads an OpenSkiData export and writes the two files below |
| `src/data/ski-resorts.json` | The catalog the server searches: snapshot metadata, ID redirects, one resort per line |
| `src/data/ski-resort-ids.json` | Upstream identity → resort ID, kept forever so IDs survive imports |
| `src/data/ski-resort-overrides.json` | Curated aliases, names, forecast points, time zones and exclusions |
| `src/lib/locations/resort-search.ts` | Name matching, pure and deterministic |
| `src/lib/locations/resorts.ts` | Loads the catalog server-side and shapes results for `/api/geocode` |

## Source and licensing

The catalog is built from the [OpenSkiData](https://openskidata.org/) GeoJSON export: `ski_areas.geojson` and `lifts.geojson` from `https://tiles.openskimap.org/geojson/`. OpenSkiData merges OpenStreetMap ski areas, lifts and runs with Skimap.org ski areas; its format is the [`openskidata-format`](https://www.npmjs.com/package/openskidata-format) package (version 16 when this was written). The export is a moving "latest" file, so the catalog records the snapshot date and each file's SHA-256, and the same files always import to the same catalog.

Distribution requirements:

- **OpenStreetMap data is under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).** The catalog is a derivative database, and showing its resorts to users is public use. As we read the licence: every place that shows a catalog resort must credit "© OpenStreetMap contributors" (results carry the catalog's `attribution` for this); the catalog itself stays under the ODbL and can't be folded into a database under other terms; and people who see resort results must be offered either the catalog or the method that makes it, which this repository's import script and overrides are. This is our reading, not legal advice; confirm it before the picker ships.
- **Skimap.org's and OpenSkiData's own terms weren't confirmed.** Their pages couldn't be read from the environment this was built in. Read the licence and attribution wording on openskidata.org before committing the first real snapshot, record it here, and adjust `ATTRIBUTION` in the import script if it asks for different credit.
- Search is served from the committed snapshot. Typing never calls OpenSkiData, OpenSkiMap or any other map service.

## Refreshing the catalog

1. Install the pinned time zone library, which isn't a project dependency because it's 70 MB: `npm install --no-save geo-tz@8.1.10`.
2. Run `npm run import-ski-resorts -- --download .cache/openskidata`. It downloads both files, takes the snapshot date from `Last-Modified`, and writes the catalog and ID map. To re-run on files you already have: `npm run import-ski-resorts -- --ski-areas <file> --lifts <file> --snapshot-date YYYY-MM-DD`. The lifts file is read one feature at a time, so its size doesn't matter.
3. Fix anything it stops on. Every override must match exactly one resort; the error lists similar names when one doesn't.
4. Read the report it prints (areas read and excluded by reason, duplicates collapsed, IDs minted and merged, overrides applied, upper-lift and reference points, resorts without a time zone) and skim the catalog diff, one resort per line. Spot-check Stowe, Killington, Vail, Whistler and Chamonix: each should resolve to a mountain point whose label names a lift.
5. Commit `ski-resorts.json` and `ski-resort-ids.json` together. Never edit either by hand; corrections go in the overrides.

## What the import keeps

A ski area is kept when it has downhill skiing, a name, at least one OpenStreetMap or Skimap.org source and a usable shape, and its status isn't abandoned, disused, proposed, planned or under construction. A missing status is kept. A resort also needs a country after overrides.

OpenSkiData sometimes leaves one resort as two areas, typically a Skimap.org point its OpenStreetMap outline didn't absorb. Two areas with the same name (ignoring words like "ski area") in the same country, where one reaches the other's point, become one resort with both identities and the larger lift count.

Region and country come from the area's first OpenSkiData place, so a resort straddling a border is listed under one country.

## Resort IDs

A resort ID is a readable slug such as `killington-resort`, minted once from the name and never reused. On a clash it takes the region (`crystal-mountain-colorado`), then the country code, then a number. Names with no Latin letters get `jp-ski-area`-style IDs. Renaming a resort never changes its ID.

`ski-resort-ids.json` maps every upstream identity the resort has had (`openstreetmap:way/…`, `skimap.org:…`, `wikidata:Q…`) to its ID. The export's own `id` is a content hash that changes with any edit, so it's never used. On each import an area takes the ID its identities pointed to. When upstream merges two resorts, the ID most identities held survives and the other is listed in the catalog's `redirects`, so a saved plan pointing at it can be resolved (PR 3). When one resort splits, the side with more identities keeps the ID and the other gets a new one. IDs in `/api/geocode` results are namespaced as `resort:<id>`, so they never collide with the geocoder's numeric IDs.

## Forecast point

Each resort has one forecast point, and its result says what it is:

- **Upper lift point**, `point: "upper_lift"`: the top of the highest operating, public lift mapped at the resort, labeled "Top of K-1 Express Gondola", or "Top of the highest mapped lift" when the lift has no name. Elevation is the mapped lift geometry's height in meters (from OpenSkiData's elevation model), rounded. A lift top only counts if it lies within the area's outline plus 3 km (25 km of a resort mapped only as a point) and its elevation is between −450 and 5,500 m. Magic carpets never count.
- **Reference point**, `point: "reference"`: the ski area's own mapped point (the centre of its largest outline, or the outline's nearest corner when the centre falls outside it), labeled "Resort reference point", with `elevationM: null`. No elevation is estimated: PR 3 will then let the forecast provider use its own terrain height.

An override can set the point directly, but it has to give the coordinates, elevation (or null), label, kind and a source for them.

The time zone is looked up at the forecast point with geo-tz's comprehensive dataset, which keeps one zone per country (Europe/Zurich, not Europe/Berlin). An override can correct it.

## Overrides

`src/data/ski-resort-overrides.json` lists corrections under `resorts`. Each entry picks a resort by `id`, or by `match` with a `name` (compared ignoring case, accents and words like "ski area") and optionally `countryCode` and `region`, and must have a `note` saying why. It can then set `name`, `aliases`, `region`, `country`, `countryCode`, `timeZone` or `point`, or `exclude: true`. Unknown fields, bad values and entries that match no resort or several stop the import.

```json
{ "match": { "name": "Arapahoe Basin", "countryCode": "US" }, "aliases": ["A Basin", "A-Basin"], "note": "Skiers' usual short name." }
```

Prefer `match` for a first curation and `id` once the resort has one. Many resorts outside the Latin alphabet are mapped under their local name, so an English alias is how they become searchable.

## Search

`searchResorts` compares the query with each resort's name and aliases:

- **Normalized:** case, accents, punctuation and spacing are ignored ("val d'isere" finds Val d'Isère). Apostrophes and hyphens may be typed or left out ("abasin", "a-basin", "A Basin"). "Mt" and "Mount", "Mtn" and "Mountain", "St" and "Saint" are the same word, and the short form still matches as typed ("Ste" finds Steamboat as well as Sainte-Foy). "The", "ski", "skiing", "resort" and "area" are optional, unless they're all the query has ("Ski" still finds Ski Apache).
- **Ranked:** exact name or alias, then names starting with the query, then names containing every word (each word may be the start of a name word). Region and country words may stand in for all but one word ("crystal mountain michigan"), which ranks as a word match.
- **Typos:** only when nothing matched as typed, each word may be a bounded number of edits away: none under four characters, one for four to six and two from seven. A swap of neighbouring letters is one edit. The last word may be unfinished. These results come back with `match: "typo"` and fewest edits first, for a "Did you mean …?" choice. Nothing ever replaces the user's choice by itself.
- **Ties** go to the resort with more lifts, then name, region and ID, so the order never depends on the catalog's order. Queries over 100 characters, or with no letters or digits, find nothing; only the first eight words count.

On a 10,000-resort test catalog a search takes under 2 ms, and up to about 12 ms when it has to look for typos.

The fixtures in `src/test/skiResorts.ts` cover Killngton → Killington, Whisler → Whistler, Chamonx → Chamonix, A Basin, accents, short queries, unrelated text, two Crystal Mountains, and Stowe the town versus Stowe the resort. They're stand-ins for ranking tests, not catalog data.

## `/api/geocode`

| `kind` | Searches | Results |
|---|---|---|
| absent | Open-Meteo places | Unchanged from before #7 |
| `resort` | The catalog only, never the geocoder | Up to 6 resorts |
| `all` | Catalog and Open-Meteo | Exact resort matches, then up to 5 places, then other resort matches and typo suggestions, at most 3 resorts in all |

Any other `kind` answers 400. Queries under two characters answer no results. The response is always `{ results: [...] }`. In `all`, places carry `kind: "place"` and `source: "open-meteo"`; a town and its resort are different results, so "Stowe" lists both, each labeled. If Open-Meteo fails in `all` mode but resorts matched, the response is those resorts with `partial: true`; with no resort matches it fails as before.

A resort result (values illustrative):

```json
{
  "id": "resort:killington-resort", "kind": "resort", "source": "openskidata", "resortId": "killington-resort",
  "name": "Killington Resort", "region": "Vermont", "country": "United States",
  "latitude": 43.6, "longitude": -72.8, "timeZone": "America/New_York",
  "elevationM": 1260, "pointLabel": "Top of K-1 Express Gondola",
  "match": "exact", "attribution": "© OpenStreetMap contributors, Skimap.org (OpenSkiData)"
}
```

`latitude` and `longitude` are the forecast point, not the base area or the nearest town.

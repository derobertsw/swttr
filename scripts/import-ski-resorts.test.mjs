// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addLift, buildCatalog, foldName, readFeatures, serializeCatalog } from "./import-ski-resorts.mjs";

// Synthetic features in OpenSkiData's export format (openskidata-format 16).
// Places and shapes are made up; only their relationships matter here.
const VERMONT = { iso3166_1Alpha2: "US", iso3166_2: "US-VT", localized: { en: { country: "United States", region: "Vermont", locality: null } } };
const COLORADO = { iso3166_1Alpha2: "US", iso3166_2: "US-CO", localized: { en: { country: "United States", region: "Colorado", locality: null } } };

/** A square ski area outline about 2 km across, centred on lon, lat. */
const square = (lon, lat, half = 0.01) => ({
  type: "Polygon",
  coordinates: [[[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]],
});

function area(id, name, extra = {}) {
  const { geometry = square(-72.8, 43.6), places = [VERMONT], ...properties } = extra;
  return {
    type: "Feature", geometry,
    properties: { type: "skiArea", id, name, activities: ["downhill"], status: "operating", sources: [{ type: "openstreetmap", id: `way/${id}` }], wikidataID: null, places, ...properties },
  };
}

let liftNumber = 0;
function lift(areaIds, coordinates, properties = {}) {
  return {
    type: "Feature", geometry: { type: "LineString", coordinates },
    properties: { type: "lift", id: `lift-${++liftNumber}`, name: null, liftType: "chair_lift", status: "operating", access: null, stations: [], skiAreas: areaIds.map((id) => ({ properties: { id } })), ...properties },
  };
}

const NO_OVERRIDES = { resorts: [] };
const NO_IDS = { ids: {}, redirects: {} };
const SOURCE = { snapshotDate: "2026-10-01", files: [] };
const isTimeZone = (zone) => typeof zone === "string" && zone.includes("/");

function build(skiAreas, lifts = [], { overrides = NO_OVERRIDES, ids = NO_IDS, timeZoneAt = () => "America/New_York" } = {}) {
  const liftsByArea = new Map();
  for (const feature of lifts) addLift(liftsByArea, feature);
  return buildCatalog({ skiAreas, liftsByArea, overrides, ids, source: SOURCE, timeZoneAt, isTimeZone });
}

const resortIds = (result) => result.catalog.resorts.map((resort) => resort.id);

describe("readFeatures", () => {
  let directory;
  beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), "ski-resorts-")); });
  afterAll(() => rm(directory, { recursive: true, force: true }));

  const read = async (text, chunkSize) => {
    const path = join(directory, "input.geojson");
    await writeFile(path, text);
    const features = [];
    for await (const feature of readFeatures(path, chunkSize)) features.push(feature);
    return features;
  };

  it("reads each feature whatever the layout, chunking and string content", async () => {
    const features = [
      area("a", "Brace } and \"quote\" [here]"),
      area("b", "Sölden ⛷", { features: [{ nested: true }] }),
    ];
    const pretty = JSON.stringify({ type: "FeatureCollection", name: "x", bbox: [{ a: 1 }], features, after: [{ b: 2 }] }, null, 2);
    expect(await read(pretty, 7)).toEqual(features);
    expect(await read(JSON.stringify({ features, type: "FeatureCollection" }), 3)).toEqual(features);
  });

  it("refuses a file that isn't a whole FeatureCollection", async () => {
    await expect(read("{\"type\":\"FeatureCollection\",\"features\":[{\"a\":1}", 5)).rejects.toThrow(/complete GeoJSON/);
    await expect(read("{\"type\":\"Feature\"}")).rejects.toThrow(/complete GeoJSON/);
  });
});

describe("buildCatalog", () => {
  it("keeps named downhill areas that are running or might be", () => {
    const result = build([
      area("1", "Killington Resort"),
      area("2", "Nordic Only", { activities: ["nordic"] }),
      area("3", "Old Hill", { status: "abandoned" }),
      area("4", "Closed Hill", { status: "disused" }),
      area("5", "Unknown Status", { status: null }),
      area("6", null),
      area("7", "No Source", { sources: [] }),
      area("8", "No Shape", { geometry: null }),
    ]);

    expect(result.catalog.resorts.map((resort) => resort.name)).toEqual(["Killington Resort", "Unknown Status"]);
    expect(result.report.excluded).toEqual({ notDownhill: 1, closed: 2, unnamed: 1, noSource: 1, noGeometry: 1 });
  });

  it("forecasts at the top of the highest operating public lift in the area", () => {
    const result = build([area("1", "Killington Resort")], [
      lift(["1"], [[-72.805, 43.595, 400], [-72.801, 43.604, 1050.4]], { name: "Snowdon Six" }),
      // Drawn top to bottom: the higher end still counts.
      lift(["1"], [[-72.802, 43.607, 1262.6], [-72.79, 43.596, 380]], { name: "K-1 Express Gondola" }),
      lift(["1"], [[-72.8, 43.6, 500], [-72.8, 43.605, 1300]], { name: "Private", access: "private" }),
      lift(["1"], [[-72.8, 43.6, 500], [-72.8, 43.605, 1400]], { name: "Gone", status: "abandoned" }),
      lift(["1"], [[-72.8, 43.6, 500], [-72.8, 43.605, 1500]], { name: "Carpet", liftType: "magic_carpet" }),
      lift(["1"], [[-72.8, 43.6, 500], [-72.4, 43.9, 1600]], { name: "Far away" }),
      lift(["1"], [[-72.8, 43.6, 500], [-72.8, 43.605, 9000]], { name: "Bad elevation" }),
      lift(["1"], [[-72.8, 43.6], [-72.8, 43.605]], { name: "No elevation" }),
    ]);

    expect(result.catalog.resorts[0]).toMatchObject({
      latitude: 43.607, longitude: -72.802, elevationM: 1263,
      point: "upper_lift", pointLabel: "Top of K-1 Express Gondola",
      // Every operating public lift counts towards size, including the carpet.
      lifts: 6,
    });
  });

  it("uses a top station's elevation and names an unnamed lift plainly", () => {
    const station = { type: "Feature", geometry: { type: "Point", coordinates: [-72.8, 43.606, 1180] }, properties: { position: "top" } };
    const result = build([area("1", "Pico")], [lift(["1"], [[-72.8, 43.6, 600], [-72.8, 43.6059, 1100]], { stations: [station] })]);

    expect(result.catalog.resorts[0]).toMatchObject({ latitude: 43.606, elevationM: 1180, pointLabel: "Top of the highest mapped lift" });
  });

  it("falls back to the area's own point without inventing an elevation", () => {
    const result = build([
      area("1", "Mad River Glen", { geometry: { type: "Point", coordinates: [-72.92, 44.2] } }),
      area("2", "Bolton Valley"),
    ]);

    expect(result.catalog.resorts.map(({ name, latitude, longitude, elevationM, point, pointLabel }) => ({ name, latitude, longitude, elevationM, point, pointLabel }))).toEqual([
      { name: "Bolton Valley", latitude: 43.6, longitude: -72.8, elevationM: null, point: "reference", pointLabel: "Resort reference point" },
      { name: "Mad River Glen", latitude: 44.2, longitude: -72.92, elevationM: null, point: "reference", pointLabel: "Resort reference point" },
    ]);
    expect(result.report.points).toEqual({ upper_lift: 0, reference: 2 });
  });

  it("keeps a concave area's point on the area", () => {
    const u = { type: "Polygon", coordinates: [[[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.3, 0.4], [0.3, 0.2], [0.2, 0.2], [0.2, 0.4], [0.1, 0.4], [0.1, 0.1]]] };
    const [resort] = build([area("1", "Horseshoe", { geometry: u })]).catalog.resorts;

    // The centre (0.25, 0.2) is in the gap; one of the inner corners is nearest.
    expect([[0.2, 0.2], [0.3, 0.2]]).toContainEqual([resort.longitude, resort.latitude]);
  });

  it("looks up the time zone at the forecast point, leaving unknown zones empty", () => {
    const asked = [];
    const result = build([area("1", "Killington Resort"), area("2", "Nowhere", { geometry: square(10, 10) })], [], {
      timeZoneAt: (latitude, longitude) => {
        asked.push([latitude, longitude]);
        return latitude > 40 ? "America/New_York" : "Etc";
      },
    });

    expect(asked).toEqual([[43.6, -72.8], [10, 10]]);
    expect(result.catalog.resorts.map((resort) => [resort.name, resort.timeZone])).toEqual([["Killington Resort", "America/New_York"], ["Nowhere", null]]);
    expect(result.report.noTimeZone).toBe(1);
  });

  it("mints readable IDs and tells namesakes apart by region, then country, then number", () => {
    const result = build([
      area("1", "Crystal Mountain", { places: [COLORADO], geometry: square(-105, 38) }),
      area("2", "Crystal Mountain", { places: [COLORADO], geometry: square(-106, 39) }),
      area("3", "Crystal Mountain", { places: [COLORADO], geometry: square(-107, 40) }),
      area("4", "Crystal Mountain", { places: [COLORADO], geometry: square(-108, 41) }),
      area("5", "Val d’Isère"),
    ]);

    expect(resortIds(result)).toEqual(["crystal-mountain", "crystal-mountain-2", "crystal-mountain-colorado", "crystal-mountain-us", "val-disere"]);
  });

  it("keeps each resort's ID across imports, even when renamed", () => {
    const first = build([area("1", "Killington"), area("2", "Pico")]);
    const later = [area("2", "Pico Mountain"), area("1", "Killington Resort"), area("3", "Killington", { geometry: square(-72, 45) })];
    const renamed = build(later, [], { ids: first.ids });

    expect(resortIds(first)).toEqual(["killington", "pico"]);
    expect(renamed.catalog.resorts.map((resort) => [resort.id, resort.name])).toEqual([
      ["killington", "Killington Resort"],
      // A new area never takes an ID used before.
      ["killington-vermont", "Killington"],
      ["pico", "Pico Mountain"],
    ]);
    expect(build(later, [], { ids: renamed.ids }).catalog).toEqual(renamed.catalog);
  });

  it("finds a resort again by any upstream identity it shares", () => {
    const skimap = { type: "skimap.org", id: "123" };
    const first = build([area("1", "Stowe", { sources: [{ type: "openstreetmap", id: "relation/9" }, skimap] })]);
    const moved = build([area("2", "Stowe Mountain Resort", { sources: [{ type: "openstreetmap", id: "way/77" }, skimap], wikidataID: "Q7" })], [], { ids: first.ids });

    expect(resortIds(moved)).toEqual(["stowe"]);
    expect(moved.ids.ids).toMatchObject({ "openstreetmap:relation/9": "stowe", "openstreetmap:way/77": "stowe", "skimap.org:123": "stowe", "wikidata:Q7": "stowe" });
  });

  it("redirects a merged resort's ID to the one most of its identities held", () => {
    const first = build([
      area("1", "Big Resort", { sources: [{ type: "openstreetmap", id: "way/1" }, { type: "skimap.org", id: "1" }] }),
      area("2", "Little Hill", { geometry: square(-72, 44), sources: [{ type: "openstreetmap", id: "way/2" }] }),
    ]);
    const merged = build([
      area("3", "Big Resort", { sources: [{ type: "openstreetmap", id: "way/1" }, { type: "openstreetmap", id: "way/2" }, { type: "skimap.org", id: "1" }] }),
    ], [], { ids: first.ids });

    expect(resortIds(merged)).toEqual(["big-resort"]);
    expect(merged.catalog.redirects).toEqual({ "little-hill": "big-resort" });
    expect(merged.report.merged).toBe(1);
  });

  it("collapses an area OpenSkiData left as two, keeping both identities", () => {
    const result = build([
      area("1", "Jay Peak Resort", { sources: [{ type: "openstreetmap", id: "way/5" }] }),
      area("2", "Jay Peak", { geometry: { type: "Point", coordinates: [-72.801, 43.601] }, sources: [{ type: "skimap.org", id: "55" }] }),
      // Same name far away is a different resort.
      area("3", "Jay Peak", { geometry: square(-100, 45), sources: [{ type: "skimap.org", id: "56" }] }),
    ], [lift(["1"], [[-72.8, 43.6, 600], [-72.8, 43.605, 1100]])]);

    expect(result.catalog.resorts.map((resort) => [resort.id, resort.name, resort.sources])).toEqual([
      ["jay-peak", "Jay Peak", ["https://www.skimap.org/SkiAreas/view/56"]],
      ["jay-peak-resort", "Jay Peak Resort", ["https://www.openstreetmap.org/way/5", "https://www.skimap.org/SkiAreas/view/55"]],
    ]);
    expect(result.report.duplicatesCollapsed).toBe(1);
  });

  it("applies curated aliases, names, points, time zones and exclusions", () => {
    const overrides = {
      resorts: [
        { match: { name: "Arapahoe Basin", countryCode: "US" }, aliases: ["A Basin", "A-Basin", "arapahoe basin"], note: "Short name." },
        { id: "killington", point: { latitude: 43.62, longitude: -72.81, elevationM: 1287, label: "Killington Peak", kind: "upper_lift", source: "https://example.org/survey" }, note: "Gondola top mapped at the base." },
        { id: "pico", name: "Pico Mountain", timeZone: "America/Toronto", note: "Test." },
        { id: "test-hill", exclude: true, note: "Not a ski area." },
      ],
    };
    const result = build([
      area("1", "Arapahoe Basin Ski Area", { places: [COLORADO] }),
      area("2", "Killington"),
      area("3", "Pico"),
      area("4", "Test Hill"),
    ], [], { overrides });

    expect(result.catalog.resorts.map(({ id, name, aliases, timeZone, latitude, elevationM, pointLabel }) => ({ id, name, aliases, timeZone, latitude, elevationM, pointLabel }))).toEqual([
      // The alias equal to the name adds nothing.
      { id: "arapahoe-basin-ski-area", name: "Arapahoe Basin Ski Area", aliases: ["A Basin", "A-Basin", "arapahoe basin"], timeZone: "America/New_York", latitude: 43.6, elevationM: null, pointLabel: "Resort reference point" },
      { id: "killington", name: "Killington", aliases: [], timeZone: "America/New_York", latitude: 43.62, elevationM: 1287, pointLabel: "Killington Peak" },
      { id: "pico", name: "Pico Mountain", aliases: [], timeZone: "America/Toronto", latitude: 43.6, elevationM: null, pointLabel: "Resort reference point" },
    ]);
    expect(result.report.excluded).toEqual({ override: 1 });
  });

  it("stops on an override that doesn't apply cleanly, naming close matches", () => {
    const areas = [area("1", "Crystal Mountain"), area("2", "Crystal Mountain", { places: [COLORADO], geometry: square(-106, 39) })];
    const attempt = (entry) => () => build(areas, [], { overrides: { resorts: [entry] } });

    expect(attempt({ match: { name: "Crystal" }, aliases: ["x"], note: "n" })).toThrow(/matches no resort; similar: crystal-mountain "Crystal Mountain", Colorado; crystal-mountain-vermont/);
    expect(attempt({ match: { name: "Crystal Mountain" }, aliases: ["x"], note: "n" })).toThrow(/matches 2 resorts .*add region or use id/);
    expect(attempt({ id: "nope", note: "n" })).toThrow(/matches no resort/);
    expect(attempt({ id: "crystal-mountain", aliases: ["x"] })).toThrow(/needs a note/);
    expect(attempt({ id: "crystal-mountain", note: "n", colour: "red" })).toThrow(/unknown field "colour"/);
    expect(attempt({ id: "crystal-mountain", note: "n", point: { latitude: 1, longitude: 1, elevationM: 99999, label: "x", kind: "upper_lift", source: "s" } })).toThrow(/elevationM/);
    expect(attempt({ id: "crystal-mountain", note: "n", timeZone: "Nowhere" })).toThrow(/unknown time zone/);
    expect(attempt({ match: { name: "Crystal Mountain", region: "Colorado" }, aliases: ["CM"], note: "n" })).not.toThrow();
  });

  it("produces the same catalog whatever the input order", () => {
    const areas = [area("1", "Crystal Mountain"), area("2", "Crystal Mountain", { places: [COLORADO], geometry: square(-106, 39) }), area("3", "Pico")];
    const lifts = [lift(["1", "3"], [[-72.8, 43.6, 600], [-72.8, 43.605, 1100]], { name: "Shared" }), lift(["1"], [[-72.8, 43.6, 600], [-72.8, 43.605, 1100]], { name: "Twin" })];

    expect(build([...areas].reverse(), [...lifts].reverse())).toEqual(build(areas, lifts));
  });
});

describe("serializeCatalog", () => {
  it("writes one resort per line and reads back the same", () => {
    const { catalog } = build([area("1", "Killington"), area("2", "Pico")]);
    const text = serializeCatalog(catalog);

    expect(JSON.parse(text)).toEqual(catalog);
    expect(text.split("\n").filter((line) => line.startsWith("    {\"id\""))).toHaveLength(2);
    expect(JSON.parse(serializeCatalog({ source: null, redirects: {}, resorts: [] }))).toEqual({ source: null, redirects: {}, resorts: [] });
  });
});

describe("foldName", () => {
  it("drops accents, apostrophes and punctuation", () => {
    expect(foldName("Val d’Isère")).toBe("val disere");
    expect(foldName("Saint-Gervais Mont-Blanc")).toBe("saint gervais mont blanc");
  });
});

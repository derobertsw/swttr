// Builds src/data/ski-resorts.json from an OpenSkiData export (#7). Rules,
// licensing and the refresh checklist: docs/ski-resorts.md.
//
//   npm install --no-save geo-tz@8.1.10
//   npm run import-ski-resorts -- --download .cache/openskidata
//   npm run import-ski-resorts -- --ski-areas <file> --lifts <file> --snapshot-date YYYY-MM-DD
//
// The same export files, overrides and ID map always produce the same catalog.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const EXPORT_URL = "https://tiles.openskimap.org/geojson/";
const EXPORT_FILES = { skiAreas: "ski_areas.geojson", lifts: "lifts.geojson" };
const GEO_TZ_VERSION = "8.1.10";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CATALOG_PATH = join(ROOT, "src/data/ski-resorts.json");
const IDS_PATH = join(ROOT, "src/data/ski-resort-ids.json");
const OVERRIDES_PATH = join(ROOT, "src/data/ski-resort-overrides.json");

const ATTRIBUTION = "© OpenStreetMap contributors, Skimap.org (OpenSkiData)";
/** Ski area statuses meaning it isn't running, or doesn't exist yet. */
const CLOSED = new Set(["abandoned", "disused", "proposed", "planned", "construction"]);
/** Never at the top of a mountain; a stray high one is a mapping error. */
const NOT_UPPER_LIFTS = new Set(["magic_carpet"]);
/** Below the Dead Sea or above the highest lift-served terrain is bad elevation data. */
const ELEVATION_RANGE_M = [-450, 5500];
/** How far a lift top may sit outside its ski area's outline, or from a bare point area. */
const AREA_MARGIN_KM = 3;
const POINT_AREA_RADIUS_KM = 25;
/** Words a resort's name may carry or not ("Arapahoe Basin Ski Area"). */
const GENERIC = new Set(["the", "ski", "skiing", "resort", "area"]);
const SOURCE_URLS = {
  openstreetmap: (id) => `https://www.openstreetmap.org/${id}`,
  "skimap.org": (id) => `https://www.skimap.org/SkiAreas/view/${id}`,
};
const FOLDED = { ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };

/** Lowercase words without accents or punctuation, for matching override names and minting IDs. */
export function foldName(text) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => FOLDED[letter])
    .replace(/['’ʼ`´]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const foldCore = (text) => {
  const words = foldName(text).split(" ").filter(Boolean);
  const core = words.filter((word) => !GENERIC.has(word));
  return (core.length ? core : words).join(" ");
};

const slug = (text) => foldName(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Features of a GeoJSON FeatureCollection, one at a time. The lifts export is
 * too big to read into one string, so this tracks nesting and parses each
 * feature on its own, whatever the file's line layout.
 */
export async function* readFeatures(path, chunkSize = 1 << 22) {
  let depth = 0, inString = false, escaped = false;
  let rootString = "", rootKey = "", inFeatures = false, seenFeatures = false;
  let parts = null;
  for await (const chunk of createReadStream(path, { encoding: "utf8", highWaterMark: chunkSize })) {
    let from = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === "\"") inString = false;
        else if (depth === 1) rootString += c;
      } else if (c === "\"") {
        inString = true;
        if (depth === 1) rootString = "";
      } else if (c === ":" && depth === 1) {
        rootKey = rootString;
      } else if (c === "{" || c === "[") {
        if (inFeatures && depth === 2 && c === "{") { parts = []; from = i; }
        if (depth === 1 && c === "[" && rootKey === "features") inFeatures = seenFeatures = true;
        depth++;
      } else if (c === "}" || c === "]") {
        depth--;
        if (parts && depth === 2) {
          parts.push(chunk.slice(from, i + 1));
          yield JSON.parse(parts.join(""));
          parts = null;
        } else if (depth === 1) {
          inFeatures = false;
        }
      }
    }
    if (parts) parts.push(chunk.slice(from));
  }
  if (depth !== 0 || !seenFeatures) throw new Error(`${path} isn't a complete GeoJSON FeatureCollection.`);
}

function kilometres([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const h = Math.sin((lat2 - lat1) * rad / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

const isCoordinate = (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])
  && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90 && !(c[0] === 0 && c[1] === 0);

const hasElevation = (c) => isCoordinate(c) && Number.isFinite(c[2])
  && c[2] >= ELEVATION_RANGE_M[0] && c[2] <= ELEVATION_RANGE_M[1];

/** A ring's area-weighted centre (planar, fine at ski-area scale) and its size. */
function ringCentre(ring) {
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  return area ? { size: Math.abs(area / 2), centre: [x / (3 * area), y / (3 * area)] } : { size: 0, centre: ring[0] };
}

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A ski area's reference point and the reach its lifts must stay within. A
 * polygon's point is the centre of its largest ring, or the ring's nearest
 * corner when the centre falls outside a concave outline.
 */
function areaShape(geometry) {
  if (geometry?.type === "Point" && isCoordinate(geometry.coordinates)) {
    const point = geometry.coordinates;
    return { reference: point, reaches: (other) => kilometres(point, other) <= POINT_AREA_RADIUS_KM };
  }
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  const rings = polygons.map((polygon) => polygon[0]).filter((ring) => ring?.length >= 4 && ring.every(isCoordinate));
  if (!rings.length) return null;
  const largest = rings.map((ring) => ({ ring, ...ringCentre(ring) })).reduce((a, b) => (b.size > a.size ? b : a));
  const reference = inRing(largest.centre, largest.ring) ? largest.centre
    : largest.ring.reduce((a, b) => (kilometres(b, largest.centre) < kilometres(a, largest.centre) ? b : a));
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      [west, south, east, north] = [Math.min(west, lon), Math.min(south, lat), Math.max(east, lon), Math.max(north, lat)];
    }
  }
  const latMargin = AREA_MARGIN_KM / 111;
  const lonMargin = AREA_MARGIN_KM / (111 * Math.max(0.1, Math.cos(((south + north) / 2) * Math.PI / 180)));
  return {
    reference,
    reaches: ([lon, lat]) => lat >= south - latMargin && lat <= north + latMargin
      && lon >= west - lonMargin && lon <= east + lonMargin,
  };
}

/** Where a lift ends highest: its top station or the higher end of its line. */
function liftTop(lift) {
  const { geometry, properties } = lift;
  if (NOT_UPPER_LIFTS.has(properties.liftType)) return null;
  const lines = geometry?.type === "LineString" ? [geometry.coordinates]
    : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
  const candidates = [
    ...lines.flatMap((line) => (line?.length ? [line[0], line[line.length - 1]] : [])),
    ...(properties.stations ?? []).filter((station) => station?.properties?.position === "top")
      .map((station) => station.geometry?.coordinates),
  ].filter(hasElevation);
  if (!candidates.length) return null;
  const [longitude, latitude, elevation] = candidates.reduce((a, b) => (b[2] > a[2] ? b : a));
  return { coordinate: [longitude, latitude], elevationM: Math.round(elevation), name: properties.name?.trim() || null, id: properties.id };
}

/** Records an operating public lift against each ski area it belongs to. */
export function addLift(liftsByArea, lift) {
  const properties = lift?.properties;
  if (properties?.type !== "lift" || properties.status !== "operating" || properties.access === "private") return;
  const top = liftTop(lift);
  for (const area of properties.skiAreas ?? []) {
    const id = area?.properties?.id;
    if (!id) continue;
    const entry = liftsByArea.get(id) ?? { count: 0, tops: [] };
    entry.count++;
    if (top) entry.tops.push(top);
    liftsByArea.set(id, entry);
  }
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

/** Downhill areas that are running or might be, with a name, a source and a shape. */
function selectAreas(skiAreas, liftsByArea, report) {
  const areas = [];
  for (const feature of skiAreas) {
    const properties = feature?.properties ?? {};
    const name = typeof properties.name === "string" ? properties.name.replace(/\s+/g, " ").trim() : "";
    const sources = (properties.sources ?? []).filter((source) => SOURCE_URLS[source?.type] && source.id);
    const shape = areaShape(feature?.geometry);
    const reason = properties.type !== "skiArea" || !(properties.activities ?? []).includes("downhill") ? "notDownhill"
      : CLOSED.has(properties.status) ? "closed"
        : !name ? "unnamed"
          : !sources.length ? "noSource"
            : !shape ? "noGeometry" : null;
    if (reason) {
      report.excluded[reason] = (report.excluded[reason] ?? 0) + 1;
      continue;
    }
    const place = properties.places?.[0];
    const keys = [
      ...sources.map((source) => `${source.type}:${source.id}`),
      ...(properties.wikidataID ? [`wikidata:${properties.wikidataID}`] : []),
    ].sort();
    const lifts = liftsByArea.get(properties.id) ?? { count: 0, tops: [] };
    areas.push({
      name, keys, shape,
      sources: sources.map((source) => SOURCE_URLS[source.type](source.id)).sort(),
      wikidata: properties.wikidataID ?? null,
      region: place?.localized?.en?.region || null,
      country: place?.localized?.en?.country || "",
      countryCode: place?.iso3166_1Alpha2 || "",
      lifts: lifts.count,
      tops: lifts.tops,
      aliases: [],
    });
  }
  return areas.sort((a, b) => compare(foldName(a.name), foldName(b.name)) || compare(a.countryCode, b.countryCode)
    || compare(a.region ?? "", b.region ?? "") || compare(a.keys[0], b.keys[0]));
}

/**
 * OpenSkiData sometimes leaves one resort as two areas, such as a Skimap.org
 * point its OpenStreetMap outline didn't absorb. Same name and country, and
 * one reaching the other: keep the one with more lifts and both identities.
 */
function collapseDuplicates(areas, report) {
  const kept = [];
  const byName = new Map();
  for (const area of areas) {
    const key = `${area.countryCode}|${foldCore(area.name)}`;
    const namesakes = byName.get(key) ?? [];
    const twin = namesakes.find((other) => other.shape.reaches(area.shape.reference) || area.shape.reaches(other.shape.reference));
    if (!twin) {
      kept.push(area);
      byName.set(key, [...namesakes, area]);
      continue;
    }
    report.duplicatesCollapsed++;
    const [keep, drop] = area.lifts > twin.lifts ? [area, twin] : [twin, area];
    Object.assign(twin, {
      ...keep,
      keys: [...new Set([...keep.keys, ...drop.keys])].sort(),
      sources: [...new Set([...keep.sources, ...drop.sources])].sort(),
      wikidata: keep.wikidata ?? drop.wikidata,
      lifts: keep.lifts + drop.lifts,
      tops: [...keep.tops, ...drop.tops],
    });
  }
  return kept;
}

/**
 * Gives each area the ID its upstream identities (OpenStreetMap, Skimap.org,
 * Wikidata) had before, so saved plans keep pointing at the same resort.
 * When upstream merges two resorts, the ID most of its identities held wins
 * and the other redirects to it. New resorts get a new ID from their name.
 */
function assignIds(areas, previous, report) {
  const ids = { ...previous.ids };
  const redirects = { ...previous.redirects };
  const live = (id) => {
    for (const seen = new Set(); redirects[id] && !seen.has(id); id = redirects[id]) seen.add(id);
    return id;
  };
  const used = new Set([...Object.values(ids), ...Object.keys(redirects)]);

  const claims = areas.map((area, order) => {
    const counts = new Map();
    for (const key of area.keys) if (ids[key]) counts.set(live(ids[key]), (counts.get(live(ids[key])) ?? 0) + 1);
    const ranked = [...counts].sort(([a, m], [b, n]) => n - m || compare(a, b));
    return { area, order, id: ranked[0]?.[0] ?? null, strength: ranked[0]?.[1] ?? 0, others: ranked.slice(1).map(([id]) => id) };
  });
  const winners = new Map();
  for (const claim of claims) {
    if (!claim.id) continue;
    const rival = winners.get(claim.id);
    if (!rival || claim.strength > rival.strength) winners.set(claim.id, claim);
  }
  for (const claim of claims) {
    if (claim.id && winners.get(claim.id) !== claim) claim.id = null;
    for (const other of claim.id ? claim.others : []) {
      if (winners.has(other)) continue;
      redirects[other] = claim.id;
      report.merged++;
    }
  }
  for (const claim of claims) {
    if (claim.id) continue;
    const base = slug(claim.area.name) || `${claim.area.countryCode.toLowerCase() || "xx"}-ski-area`;
    const candidates = [base, claim.area.region && `${base}-${slug(claim.area.region)}`, claim.area.countryCode && `${base}-${claim.area.countryCode.toLowerCase()}`]
      .filter((candidate) => candidate && !candidate.endsWith("-"));
    let id = candidates.find((candidate) => !used.has(candidate));
    for (let n = 2; !id; n++) if (!used.has(`${base}-${n}`)) id = `${base}-${n}`;
    claim.id = id;
    used.add(id);
    report.minted++;
  }
  for (const { area, id } of claims) {
    area.id = id;
    for (const key of area.keys) ids[key] = id;
  }
  const resolved = Object.fromEntries(Object.keys(redirects).map((id) => [id, live(id)]));
  return { ids: sortedObject(ids), redirects: sortedObject(resolved) };
}

const OVERRIDE_KEYS = new Set(["id", "match", "note", "name", "aliases", "region", "country", "countryCode", "timeZone", "point", "exclude"]);
const POINT_KEYS = new Set(["latitude", "longitude", "elevationM", "label", "kind", "source"]);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

/** Problems with one override entry, in words a curator can act on. */
function overrideProblems(entry, isTimeZone) {
  const problems = [];
  for (const key of Object.keys(entry)) if (!OVERRIDE_KEYS.has(key)) problems.push(`unknown field "${key}"`);
  if (!!entry.id === !!entry.match) problems.push("needs exactly one of id or match");
  if (entry.match && !nonEmpty(entry.match.name)) problems.push("match needs a name");
  if (!nonEmpty(entry.note)) problems.push("needs a note saying why");
  for (const key of ["name", "region", "country"]) {
    if (key in entry && !nonEmpty(entry[key])) problems.push(`${key} must be text`);
  }
  if ("countryCode" in entry && !/^[A-Z]{2}$/.test(entry.countryCode)) problems.push("countryCode must be two capital letters");
  if ("aliases" in entry && !(Array.isArray(entry.aliases) && entry.aliases.every(nonEmpty))) problems.push("aliases must be a list of names");
  if ("timeZone" in entry && !isTimeZone(entry.timeZone)) problems.push(`unknown time zone "${entry.timeZone}"`);
  if ("exclude" in entry && entry.exclude !== true) problems.push("exclude must be true");
  if ("point" in entry) {
    const point = entry.point ?? {};
    for (const key of Object.keys(point)) if (!POINT_KEYS.has(key)) problems.push(`unknown point field "${key}"`);
    if (!isCoordinate([point.longitude, point.latitude])) problems.push("point needs a real latitude and longitude");
    if (point.elevationM !== null && !hasElevation([point.longitude, point.latitude, point.elevationM])) problems.push("point elevationM must be meters or null");
    if (!["upper_lift", "reference"].includes(point.kind)) problems.push("point kind must be upper_lift or reference");
    if (!nonEmpty(point.label) || !nonEmpty(point.source)) problems.push("point needs a label and a source");
  }
  return problems;
}

/** Applies src/data/ski-resort-overrides.json. Any entry that doesn't apply cleanly stops the import. */
function applyOverrides(areas, overrides, redirects, isTimeZone, report) {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const errors = [];
  (overrides.resorts ?? []).forEach((entry, n) => {
    const label = `Override ${n + 1} (${entry.id ?? entry.match?.name ?? "?"})`;
    const problems = overrideProblems(entry, isTimeZone);
    if (problems.length) return errors.push(`${label}: ${problems.join("; ")}.`);
    let targets;
    if (entry.id) {
      const id = redirects[entry.id] ?? entry.id;
      targets = byId.has(id) ? [byId.get(id)] : [];
    } else {
      const { name, countryCode, region } = entry.match;
      targets = areas.filter((area) => foldCore(area.name) === foldCore(name)
        && (!countryCode || area.countryCode === countryCode) && (!region || foldName(area.region ?? "") === foldName(region)));
    }
    if (targets.length !== 1) {
      const word = foldCore(entry.match?.name ?? entry.id).split(" ")[0];
      const near = areas.filter((area) => foldName(area.name).includes(word)
        && (!entry.match?.countryCode || area.countryCode === entry.match.countryCode)).slice(0, 5)
        .map((area) => `${area.id} "${area.name}"${area.region ? `, ${area.region}` : ""}`);
      return errors.push(`${label}: ${targets.length ? `matches ${targets.length} resorts (${targets.map((area) => area.id).join(", ")}); add region or use id`
        : `matches no resort${near.length ? `; similar: ${near.join("; ")}` : ""}`}.`);
    }
    const [area] = targets;
    for (const key of ["name", "region", "country", "countryCode", "timeZone", "point", "exclude"]) {
      if (key in entry) area[key] = entry[key];
    }
    if (entry.aliases) area.aliases = [...new Set([...area.aliases, ...entry.aliases])];
    report.overridesApplied++;
  });
  if (errors.length) throw new Error(`Fix src/data/ski-resort-overrides.json:\n${errors.join("\n")}`);
}

/**
 * The forecast point: the top of the highest operating public lift that lies
 * within the area, else the area's own mapped point with no elevation. An
 * elevation is never estimated (#7).
 */
function forecastPoint(area) {
  if (area.point) {
    const { latitude, longitude, elevationM, label, kind } = area.point;
    return { coordinate: [longitude, latitude], elevationM, label, kind };
  }
  const tops = area.tops.filter((top) => area.shape.reaches(top.coordinate))
    .sort((a, b) => b.elevationM - a.elevationM || compare(a.id, b.id));
  if (tops.length) {
    const [top] = tops;
    return { coordinate: top.coordinate, elevationM: top.elevationM, label: top.name ? `Top of ${top.name}` : "Top of the highest mapped lift", kind: "upper_lift" };
  }
  return { coordinate: area.shape.reference, elevationM: null, label: "Resort reference point", kind: "reference" };
}

/**
 * The catalog for one export. Pure, so a test can run it on a few features:
 * `liftsByArea` comes from `addLift`, `timeZoneAt` from geo-tz.
 */
export function buildCatalog({ skiAreas, liftsByArea, overrides, ids, source, timeZoneAt, isTimeZone }) {
  const report = { read: skiAreas.length, excluded: {}, duplicatesCollapsed: 0, minted: 0, merged: 0, overridesApplied: 0, points: { upper_lift: 0, reference: 0 }, noTimeZone: 0 };
  const areas = collapseDuplicates(selectAreas(skiAreas, liftsByArea, report), report);
  const nextIds = assignIds(areas, { ids: ids.ids ?? {}, redirects: ids.redirects ?? {} }, report);
  applyOverrides(areas, overrides, nextIds.redirects, isTimeZone, report);

  const resorts = [];
  for (const area of areas) {
    if (area.exclude || !area.country || !area.countryCode) {
      const reason = area.exclude ? "override" : "noCountry";
      report.excluded[reason] = (report.excluded[reason] ?? 0) + 1;
      continue;
    }
    const point = forecastPoint(area);
    const [longitude, latitude] = point.coordinate.map((value) => round(value, 5));
    const zone = area.timeZone ?? timeZoneAt(latitude, longitude);
    const timeZone = isTimeZone(zone) ? zone : null;
    if (!timeZone) report.noTimeZone++;
    report.points[point.kind]++;
    resorts.push({
      id: area.id,
      name: area.name,
      aliases: area.aliases.filter((alias) => foldName(alias) !== foldName(area.name)),
      region: area.region,
      country: area.country,
      countryCode: area.countryCode,
      timeZone,
      latitude,
      longitude,
      elevationM: point.elevationM === null ? null : Math.round(point.elevationM),
      point: point.kind,
      pointLabel: point.label,
      lifts: area.lifts,
      sources: area.sources,
      wikidata: area.wikidata,
    });
  }
  report.resorts = resorts.length;
  return {
    catalog: {
      source: { name: "OpenSkiData", homepage: "https://openskidata.org/", license: "ODbL-1.0", attribution: ATTRIBUTION, ...source },
      redirects: nextIds.redirects,
      resorts: resorts.sort((a, b) => compare(a.id, b.id)),
    },
    ids: nextIds,
    report,
  };
}

/** Pretty metadata, one resort per line, so a refresh reviews as a readable diff. */
export function serializeCatalog({ source, redirects, resorts }) {
  const lines = resorts.map((resort) => `    ${JSON.stringify(resort)}`);
  return `{\n  "source": ${JSON.stringify(source, null, 2).replace(/\n/g, "\n  ")},\n`
    + `  "redirects": ${JSON.stringify(redirects, null, 2).replace(/\n/g, "\n  ")},\n`
    + `  "resorts": ${lines.length ? `[\n${lines.join(",\n")}\n  ]` : "[]"}\n}\n`;
}

function isTimeZone(value) {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function download(directory) {
  await mkdir(directory, { recursive: true });
  const lastModified = {};
  for (const [key, name] of Object.entries(EXPORT_FILES)) {
    const response = await fetch(EXPORT_URL + name).catch((error) => {
      throw new Error(`Couldn't download ${EXPORT_URL + name}: ${error.cause?.message ?? error.message}`);
    });
    if (!response.ok || !response.body) throw new Error(`${EXPORT_URL + name} answered HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(join(directory, name)));
    lastModified[key] = response.headers.get("last-modified");
  }
  return lastModified;
}

/** geo-tz is too big to install for every build, so the script asks for the pinned version. */
async function loadTimeZones() {
  const installed = await readFile(join(ROOT, "node_modules/geo-tz/package.json"), "utf8").then(JSON.parse, () => null);
  if (installed?.version !== GEO_TZ_VERSION) {
    throw new Error(`Time zones need geo-tz ${GEO_TZ_VERSION}: npm install --no-save geo-tz@${GEO_TZ_VERSION}`);
  }
  const { find } = await import("geo-tz/all");
  return (latitude, longitude) => find(latitude, longitude)[0] ?? null;
}

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

async function main() {
  const { values } = parseArgs({
    options: { download: { type: "string" }, "ski-areas": { type: "string" }, lifts: { type: "string" }, "snapshot-date": { type: "string" } },
  });
  let paths, snapshotDate = values["snapshot-date"];
  if (values.download) {
    const lastModified = await download(values.download);
    paths = { skiAreas: join(values.download, EXPORT_FILES.skiAreas), lifts: join(values.download, EXPORT_FILES.lifts) };
    snapshotDate ??= lastModified.skiAreas && new Date(lastModified.skiAreas).toISOString().slice(0, 10);
  } else {
    paths = { skiAreas: values["ski-areas"], lifts: values.lifts };
  }
  if (!paths.skiAreas || !paths.lifts) throw new Error("Pass --download <dir>, or --ski-areas and --lifts.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate ?? "")) throw new Error("Pass --snapshot-date YYYY-MM-DD: the date the export was produced.");

  const timeZoneAt = await loadTimeZones();
  const skiAreas = [];
  for await (const feature of readFeatures(paths.skiAreas)) skiAreas.push(feature);
  const liftsByArea = new Map();
  for await (const feature of readFeatures(paths.lifts)) addLift(liftsByArea, feature);
  const files = [];
  for (const [key, name] of Object.entries(EXPORT_FILES)) files.push({ name, url: EXPORT_URL + name, sha256: await sha256(paths[key]) });

  const { catalog, ids, report } = buildCatalog({
    skiAreas, liftsByArea,
    overrides: await readJson(OVERRIDES_PATH),
    ids: await readJson(IDS_PATH),
    source: { snapshotDate, files, timeZones: `geo-tz ${GEO_TZ_VERSION} (comprehensive)` },
    timeZoneAt, isTimeZone,
  });
  await writeFile(CATALOG_PATH, serializeCatalog(catalog));
  await writeFile(IDS_PATH, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

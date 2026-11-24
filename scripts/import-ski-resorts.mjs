#!/usr/bin/env node
/**
 * Builds src/data/ski-resorts.json from an OpenSkiData export (#7).
 *
 *   node scripts/import-ski-resorts.mjs \
 *     --areas /path/to/ski_areas.geojson \
 *     --lifts /path/to/lifts.geojson \
 *     --snapshot 2026-11-24 \
 *     [--timezones /path/to/timezone-cache.json] [--out src/data/ski-resorts.json]
 *
 * Download the exports into their own empty directory and pass their paths:
 * the script never fetches them. It only calls Open-Meteo, the app's own
 * forecast provider, to look up time zones it can't tell from the country,
 * and caches the answers in --timezones so a rerun is offline.
 *
 * What it keeps, how IDs stay stable and how forecast points are chosen:
 * docs/ski-resort-catalog.md. Curated fixes live in
 * scripts/ski-resorts/overrides.json and are applied on every run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = {
  areas: "https://tiles.openskimap.org/geojson/ski_areas.geojson",
  lifts: "https://tiles.openskimap.org/geojson/lifts.geojson",
};
/** A lift top farther than this from the resort's reference point belongs to something else. */
const MAX_POINT_KM = 25;
/** A lift that tops out this far above the highest mapped run is sightseeing, not skiing. */
const MAX_ABOVE_RUNS_M = 150;
/** Two entries with the same name this close together are one resort mapped twice. */
const DUPLICATE_KM = 3;
const TZ_BATCH = 50;
const TZ_PAUSE_MS = 6_000;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--") || argv[i + 1] === undefined) throw new Error(`Bad argument near ${key}`);
    args[key.slice(2)] = argv[i + 1];
  }
  for (const required of ["areas", "lifts", "snapshot"]) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.snapshot)) throw new Error("--snapshot must be YYYY-MM-DD");
  return {
    areas: path.resolve(args.areas),
    lifts: path.resolve(args.lifts),
    snapshot: args.snapshot,
    timezones: args.timezones ? path.resolve(args.timezones) : null,
    out: path.resolve(args.out ?? path.join(ROOT, "src/data/ski-resorts.json")),
    overrides: path.resolve(args.overrides ?? path.join(ROOT, "scripts/ski-resorts/overrides.json")),
  };
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const text = (value, max = 200) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null);
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function kilometres(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** [lat, lon] of a Point, or the area-weighted centroid of a (Multi)Polygon's largest outer ring. */
function referencePoint(geometry) {
  if (geometry?.type === "Point") return [geometry.coordinates[1], geometry.coordinates[0]];
  const rings = geometry?.type === "Polygon" ? [geometry.coordinates[0]]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates.map((polygon) => polygon[0]) : [];
  let best = null;
  for (const ring of rings) {
    let area = 0, x = 0, y = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      area += cross; x += (x0 + x1) * cross; y += (y0 + y1) * cross;
    }
    if (area === 0) continue;
    const candidate = { area: Math.abs(area), point: [y / (3 * area), x / (3 * area)] };
    if (!best || candidate.area > best.area) best = candidate;
  }
  return best?.point ?? null;
}

/** Upstream identities, most stable first. The export's own `id` is a content hash and isn't one. */
function upstreamKeys(properties) {
  const keys = [];
  if (text(properties.wikidataID, 20)?.match(/^Q\d+$/)) keys.push(`wd-${properties.wikidataID}`);
  const skimap = (properties.sources ?? []).filter((s) => s.type === "skimap.org" && Number.isInteger(Number(s.id)))
    .map((s) => Number(s.id)).sort((a, b) => a - b);
  for (const id of skimap) keys.push(`skimap-${id}`);
  for (const source of properties.sources ?? []) {
    const match = source.type === "openstreetmap" && String(source.id).match(/^(node|way|relation)\/(\d+)$/);
    if (match) keys.push(`osm-${match[1][0]}${match[2]}`);
  }
  return keys;
}

const operatingLift = (lift) => lift.status === "operating" && lift.access !== "private" && lift.access !== "no"
  && lift.liftType !== "railway";
/** Lift names sometimes list every language: "Big Red Express, Tseqwtsíqwa Q̓ilq̓, ...". */
const liftName = (name) => text(name, 300)?.split(/[,;]/)[0].trim() || null;

/** The highest mapped lift top for each ski area, with the lift it belongs to. */
function liftTops(liftsFile) {
  const tops = new Map();
  const counts = new Map();
  for (const feature of readJson(liftsFile).features) {
    const lift = feature.properties ?? {};
    if (!operatingLift(lift) || feature.geometry?.type !== "LineString") continue;
    const line = feature.geometry.coordinates;
    const ends = [line[0], line[line.length - 1]].filter((c) => c?.length === 3 && c.every(finite));
    if (ends.length !== 2) continue;
    const [low, high] = ends[0][2] <= ends[1][2] ? ends : [ends[1], ends[0]];
    if (high[2] < -100 || high[2] > 7_000 || high[2] < low[2]) continue;
    for (const area of lift.skiAreas ?? []) {
      const id = area?.properties?.id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      const list = tops.get(id) ?? [];
      list.push({ latitude: high[1], longitude: high[0], elevation: high[2], name: liftName(lift.name), liftId: lift.id });
      tops.set(id, list);
    }
  }
  return { tops, counts };
}

/** The highest lift top near the resort and within reach of its runs; null if none qualifies. */
function forecastPoint(properties, reference, candidates) {
  const runsMax = properties.statistics?.runs?.maxElevation;
  const valid = (candidates ?? []).filter((top) =>
    kilometres(reference, [top.latitude, top.longitude]) <= MAX_POINT_KM
    && (!finite(runsMax) || top.elevation <= runsMax + MAX_ABOVE_RUNS_M));
  valid.sort((a, b) => b.elevation - a.elevation || String(a.liftId).localeCompare(String(b.liftId)));
  const top = valid[0];
  if (!top) return null;
  return {
    latitude: round(top.latitude, 4), longitude: round(top.longitude, 4),
    elevation: Math.round(top.elevation),
    label: top.name ? `Top of ${top.name}` : "Highest lift top",
  };
}

const normalizedName = (name) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function lookUpTimeZones(points, cacheFile) {
  const cache = cacheFile && fs.existsSync(cacheFile) ? readJson(cacheFile) : {};
  const key = ([lat, lon]) => `${round(lat, 2)},${round(lon, 2)}`;
  const missing = [...new Set(points.map(key))].filter((k) => !(k in cache));
  for (let i = 0; i < missing.length; i += TZ_BATCH) {
    const batch = missing.slice(i, i + TZ_BATCH);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", batch.map((k) => k.split(",")[0]).join(","));
    url.searchParams.set("longitude", batch.map((k) => k.split(",")[1]).join(","));
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "1");
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Open-Meteo time zone lookup failed: HTTP ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : [data];
    batch.forEach((k, index) => { cache[k] = text(rows[index]?.timezone, 64); });
    if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify(cache));
    console.error(`time zones: ${Math.min(i + TZ_BATCH, missing.length)}/${missing.length}`);
    if (i + TZ_BATCH < missing.length) await new Promise((resolve) => setTimeout(resolve, TZ_PAUSE_MS));
  }
  return (point) => cache[key(point)] ?? null;
}

/** A country with a single IANA zone (France, Switzerland) needs no lookup. */
function countryZone(alpha2) {
  try {
    const zones = new Intl.Locale(`und-${alpha2}`).getTimeZones?.() ?? [];
    return zones.length === 1 ? zones[0] : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const overrides = fs.existsSync(args.overrides) ? readJson(args.overrides) : {};
  const previous = fs.existsSync(args.out) ? readJson(args.out) : { resorts: [] };
  const previousIds = new Set(previous.resorts.map((resort) => resort.id));
  const previousZones = new Map(previous.resorts.filter((r) => r.tz).map((r) => [r.id, r]));
  const excluded = new Set(overrides.exclude ?? []);
  const { tops, counts } = liftTops(args.lifts);

  const candidates = [];
  for (const feature of readJson(args.areas).features) {
    const p = feature.properties ?? {};
    if (p.type !== "skiArea" || !(p.activities ?? []).includes("downhill")) continue;
    const liftCount = counts.get(p.id) ?? 0;
    // Abandoned, disused, proposed and never-opened areas are out; an unknown
    // status stays only when the area still has a working lift.
    if (p.status !== "operating" && !(p.status == null && liftCount > 0)) continue;
    const name = text(p.name);
    const reference = referencePoint(feature.geometry);
    if (!name || !reference || !reference.every(finite)) continue;
    const place = (p.places ?? [])[0];
    const keys = upstreamKeys(p);
    if (!keys.length) continue;
    candidates.push({
      p, name, reference, keys, liftCount,
      region: text(place?.localized?.en?.region) ?? null,
      country: text(place?.localized?.en?.country) ?? null,
      alpha2: text(place?.iso3166_1Alpha2, 2),
      localities: [...new Set((p.places ?? []).map((q) => text(q?.localized?.en?.locality)).filter((l) => l && l !== name))],
      point: forecastPoint(p, reference, tops.get(p.id)),
    });
  }

  // The same resort mapped twice (an OSM area and a skimap.org point): keep the richer one.
  candidates.sort((a, b) => (b.point ? 1 : 0) - (a.point ? 1 : 0) || b.liftCount - a.liftCount || a.p.id.localeCompare(b.p.id));
  const kept = [];
  const byName = new Map();
  for (const candidate of candidates) {
    const key = normalizedName(candidate.name);
    const twins = byName.get(key) ?? [];
    if (twins.some((twin) => kilometres(twin.reference, candidate.reference) <= DUPLICATE_KM)) continue;
    twins.push(candidate);
    byName.set(key, twins);
    kept.push(candidate);
  }

  // Stable IDs: an area keeps the ID it had last import if any of its upstream
  // keys (or a curated mapping in overrides.ids) still points at it; new areas
  // take their most stable unclaimed key.
  const claimed = new Set();
  const idFor = new Map();
  for (const candidate of kept) {
    const known = candidate.keys.map((k) => overrides.ids?.[k] ?? k).find((k) => previousIds.has(k) && !claimed.has(k));
    if (known) { idFor.set(candidate, known); claimed.add(known); }
  }
  for (const candidate of kept) {
    if (idFor.has(candidate)) continue;
    const fresh = candidate.keys.find((k) => !claimed.has(k) && !previousIds.has(k));
    if (!fresh) continue;
    idFor.set(candidate, fresh);
    claimed.add(fresh);
  }

  const resorts = kept.filter((c) => idFor.has(c) && !excluded.has(idFor.get(c)));
  const needLookup = resorts.filter((c) => {
    const id = idFor.get(c);
    if (overrides.timeZones?.[id] || countryZone(c.alpha2)) return false;
    const before = previousZones.get(id);
    return !(before && kilometres([before.lat, before.lon], c.reference) < 1);
  });
  const zoneAt = await lookUpTimeZones(needLookup.map((c) => c.reference), args.timezones);

  const out = resorts.map((c) => {
    const id = idFor.get(c);
    const before = previousZones.get(id);
    const tz = overrides.timeZones?.[id] ?? countryZone(c.alpha2)
      ?? (before && kilometres([before.lat, before.lon], c.reference) < 1 ? before.tz : null) ?? zoneAt(c.reference);
    const curatedPoint = overrides.points?.[id];
    const point = curatedPoint
      ? { latitude: curatedPoint.latitude, longitude: curatedPoint.longitude, elevation: curatedPoint.elevationM ?? null, label: curatedPoint.label }
      : c.point;
    const entry = {
      id, n: overrides.names?.[id] ?? c.name,
      ...(overrides.aliases?.[id]?.length ? { a: overrides.aliases[id] } : {}),
      ...(c.localities.length ? { l: c.localities } : {}),
      ...(c.region ? { r: c.region } : {}),
      ...(c.country ? { c: c.country } : {}),
      ...(tz ? { tz } : {}),
      lat: round(c.reference[0], 4), lon: round(c.reference[1], 4),
      ...(point ? { p: [point.latitude, point.longitude, point.elevation], pl: point.label } : {}),
      ...(c.liftCount ? { lc: c.liftCount } : {}),
    };
    return entry;
  }).sort((a, b) => a.id.localeCompare(b.id));

  const catalog = {
    meta: {
      source: "OpenSkiData (openskimap.org)",
      license: "ODbL-1.0",
      attribution: "Ski area and lift data © OpenSkiMap.org contributors and © OpenStreetMap contributors, ODbL; skimap.org",
      snapshot: args.snapshot,
      urls: [SOURCES.areas, SOURCES.lifts],
      count: out.length,
      liftPoints: out.filter((r) => r.p).length,
    },
    resorts: out,
  };
  fs.writeFileSync(args.out, `${JSON.stringify(catalog).replace(/\},\{"id"/g, '},\n{"id"')}\n`);
  const dropped = kept.length - resorts.length;
  console.error(`wrote ${out.length} resorts (${catalog.meta.liftPoints} with a lift-top point, ${out.filter((r) => !r.tz).length} without a time zone, ${dropped} dropped) to ${path.relative(ROOT, args.out)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import "server-only";
import catalogFile from "@/data/ski-resorts.json";
import { isTimeZone } from "@/lib/timeZones";

/**
 * Ski resort search (#7). The catalog is a normalized OpenSkiData snapshot
 * built by scripts/import-ski-resorts.mjs and served from this bundle, so a
 * keystroke never calls a map service. Source, IDs and forecast points:
 * docs/ski-resort-catalog.md.
 */

/** One catalog row, in the file's compact keys. */
export interface ResortRecord {
  id: string;
  /** Canonical name. */
  n: string;
  /** Curated aliases ("A-Basin"). */
  a?: string[];
  /** Towns the area is mapped in; searched, never shown as the resort's name. */
  l?: string[];
  r?: string;
  c?: string;
  tz?: string;
  /** Resort reference point. */
  lat: number;
  lon: number;
  /** Highest validated lift top: latitude, longitude, elevation in meters (null when unknown). */
  p?: [number, number, number | null];
  pl?: string;
  /** Operating lifts mapped; breaks ties toward the bigger resort. */
  lc?: number;
}

export interface ResortCatalog {
  meta: { snapshot: string; attribution: string; license: string };
  resorts: ResortRecord[];
}

export type ResortMatchKind = "exact" | "prefix" | "token" | "typo";

/** A resort as the location search returns it. */
export interface ResortSuggestion {
  /** Namespaced so it can't collide with a geocoder's numeric ID. */
  id: `resort:${string}`;
  kind: "resort";
  source: "openskidata";
  resortId: string;
  name: string;
  region?: string;
  country: string;
  /** The forecast point: where the weather for this resort is read. */
  latitude: number;
  longitude: number;
  timeZone?: string;
  /** The forecast point's elevation in meters; null when the source doesn't know it. */
  elevationM: number | null;
  pointLabel: string;
  /** "lift": a mapped upper lift top. "reference": the resort's mapped reference point. */
  pointKind: "lift" | "reference";
  match: ResortMatchKind;
}

const REFERENCE_POINT_LABEL = "Resort reference point";
const DEFAULT_LIMIT = 8;

const FOLD: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };

/** Spelled either way on maps and by people: "Mount Snow" and "Mt. Snow". */
const SHORT_FORMS: Record<string, string> = { mount: "mt", saint: "st", sainte: "ste" };

/** Lowercase, no accents or punctuation, single spaces: "Brévent/Flégère" → "brevent flegere". */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => FOLD[c])
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\b(mount|saint|sainte)\b/g, (word) => SHORT_FORMS[word]);
}

const SUFFIXES = [/ mountain resort$/, / ski (resort|area|centre|center|hill|station)$/, / (resort|ski area)$/];

/** The name without its "(Chamonix)" or "Ski Resort" decoration, and each part of "Brévent/Flégère". */
function nameVariants(name: string): string[] {
  const variants = new Set<string>();
  const bare = name.replace(/\([^)]*\)/g, " ");
  let core = normalizeSearchText(bare);
  for (let changed = true; changed;) {
    changed = false;
    for (const suffix of SUFFIXES) {
      const next = core.replace(suffix, "");
      if (next !== core && next) { core = next; changed = true; }
    }
  }
  variants.add(core);
  const parts = bare.split(/\s+-\s+|[,/]/).map(normalizeSearchText).filter((part) => part.length >= 3);
  if (parts.length > 1) for (const part of parts) variants.add(part);
  return [...variants];
}

interface IndexedName { text: string; tokens: string[]; rank: number }
interface IndexedResort { record: ResortRecord; names: IndexedName[]; locality: string[] }

const tokensOf = (value: string) => value.split(" ").filter(Boolean);

function indexCatalog(catalog: ResortCatalog): IndexedResort[] {
  return catalog.resorts.map((record) => {
    const seen = new Set<string>();
    const names: IndexedName[] = [];
    const add = (text: string, rank: number) => {
      if (!text || seen.has(text)) return;
      seen.add(text);
      names.push({ text, tokens: tokensOf(text), rank });
    };
    add(normalizeSearchText(record.n), 0);
    for (const alias of record.a ?? []) add(normalizeSearchText(alias), 1);
    for (const variant of nameVariants(record.n)) add(variant, 2);
    return { record, names, locality: (record.l ?? []).flatMap((town) => tokensOf(normalizeSearchText(town))) };
  });
}

/** Edits a token may be off by: none below four characters, one up to six, two beyond. */
export function typoBudget(length: number): number {
  return length < 4 ? 0 : length <= 6 ? 1 : 2;
}

/** Optimal string alignment distance (Levenshtein plus adjacent swaps), giving up past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, twoBack[j - 2] + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    twoBack = previous;
    previous = current;
  }
  return previous[b.length];
}

/** Fewest edits that make a query token one of the name's tokens (or, while typing, the start of one). */
function tokenEdits(queryToken: string, tokens: string[], isLast: boolean): number {
  const budget = typoBudget(queryToken.length);
  let best = Infinity;
  for (const token of tokens) {
    if (token === queryToken || (isLast && token.startsWith(queryToken))) return 0;
    if (!budget) continue;
    best = Math.min(best, editDistance(queryToken, token, budget));
    if (isLast) {
      for (let length = queryToken.length - 1; length <= queryToken.length + 1; length++) {
        if (length >= 4 && length < token.length) best = Math.min(best, editDistance(queryToken, token.slice(0, length), budget));
      }
    }
  }
  return best <= budget ? best : Infinity;
}

interface Scored { resort: IndexedResort; tier: number; edits: number; nameRank: number }

const TIER_KIND: ResortMatchKind[] = ["exact", "prefix", "token", "typo"];

function score(resort: IndexedResort, query: string, queryTokens: string[]): Scored | null {
  let best: Scored | null = null;
  const consider = (tier: number, edits: number, nameRank: number) => {
    if (!best || tier < best.tier || (tier === best.tier && (edits < best.edits || (edits === best.edits && nameRank < best.nameRank)))) {
      best = { resort, tier, edits, nameRank };
    }
  };
  for (const name of resort.names) {
    if (name.text === query) consider(0, 0, name.rank);
    else if (name.text.startsWith(query)) consider(1, 0, name.rank);
    else if (queryTokens.every((q) => name.tokens.some((t) => t.startsWith(q)))) consider(2, 0, name.rank);
  }
  if (best) return best;
  // The town an area is mapped in, as a whole word, alongside its name: "chamonix grands".
  if (resort.locality.length) {
    const nameTokens = resort.names[0].tokens;
    if (queryTokens.every((q) => nameTokens.some((t) => t.startsWith(q)) || resort.locality.includes(q))) {
      return { resort, tier: 2, edits: 0, nameRank: 3 };
    }
  }
  const fuzzyNames = resort.locality.length
    ? [...resort.names, { text: "", tokens: [...resort.names[0].tokens, ...resort.locality], rank: 3 }]
    : resort.names;
  for (const name of fuzzyNames) {
    let edits = 0;
    for (let i = 0; i < queryTokens.length && edits !== Infinity; i++) {
      edits += tokenEdits(queryTokens[i], name.tokens, i === queryTokens.length - 1);
    }
    if (edits > 0 && edits !== Infinity) consider(3, edits, name.rank);
  }
  return best;
}

const compare = (a: Scored, b: Scored) =>
  a.tier - b.tier || a.edits - b.edits
  || (b.resort.record.lc ?? 0) - (a.resort.record.lc ?? 0) || a.nameRank - b.nameRank
  || a.resort.record.n.length - b.resort.record.n.length
  || a.resort.record.n.localeCompare(b.resort.record.n) || a.resort.record.id.localeCompare(b.resort.record.id);

function toResortSuggestion(record: ResortRecord, match: ResortMatchKind): ResortSuggestion {
  const [latitude, longitude, elevation] = record.p ?? [record.lat, record.lon, null];
  return {
    id: `resort:${record.id}`,
    kind: "resort",
    source: "openskidata",
    resortId: record.id,
    name: record.n,
    ...(record.r ? { region: record.r } : {}),
    country: record.c ?? "",
    latitude,
    longitude,
    ...(isTimeZone(record.tz) ? { timeZone: record.tz } : {}),
    elevationM: elevation,
    pointLabel: record.p ? record.pl ?? "Highest lift top" : REFERENCE_POINT_LABEL,
    pointKind: record.p ? "lift" : "reference",
    match,
  };
}

/** Builds a search over a catalog; the app's own catalog is `searchResorts`. */
export function createResortSearch(catalog: ResortCatalog) {
  let index: IndexedResort[] | null = null;
  let byId: Map<string, ResortRecord> | null = null;
  return {
    /**
     * Exact names and aliases first, then prefixes, then every word matched,
     * then the town an area sits in. Typo corrections only when nothing
     * matched as typed; they come back marked "typo" so the picker can ask
     * "Did you mean…?" instead of choosing for the user.
     */
    search(query: string, limit = DEFAULT_LIMIT): ResortSuggestion[] {
      const normalized = normalizeSearchText(query);
      if (normalized.length < 2) return [];
      index ??= indexCatalog(catalog);
      const queryTokens = tokensOf(normalized);
      const scored = index.map((resort) => score(resort, normalized, queryTokens)).filter((s): s is Scored => s !== null);
      const strong = scored.filter((s) => s.tier < 3);
      return (strong.length ? strong : scored).sort(compare).slice(0, limit)
        .map((s) => toResortSuggestion(s.resort.record, TIER_KIND[s.tier]));
    },
    byId(id: string): ResortRecord | null {
      byId ??= new Map(catalog.resorts.map((record) => [record.id, record]));
      return byId.get(id) ?? null;
    },
  };
}

const appCatalog = createResortSearch(catalogFile as unknown as ResortCatalog);
export const searchResorts = appCatalog.search;

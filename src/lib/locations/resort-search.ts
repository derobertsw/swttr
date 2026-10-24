/**
 * Ski resort name matching (#7). Pure and deterministic for a given catalog:
 * `./resorts.ts` loads the catalog and builds one index per server process.
 *
 * Open-Meteo's geocoder only matches normalized prefixes, so a misspelled
 * resort finds nothing there. This index ranks exact names and aliases, then
 * prefixes, then word matches, and offers bounded typo matches only when
 * nothing else matched. Rules and fixtures: docs/ski-resorts.md.
 */

/** One resort as `scripts/import-ski-resorts.mjs` writes it to src/data/ski-resorts.json. */
export interface SkiResort {
  /** Stable catalog ID, kept across imports by src/data/ski-resort-ids.json. */
  id: string;
  name: string;
  aliases: string[];
  region: string | null;
  country: string;
  countryCode: string;
  timeZone: string | null;
  /** The forecast point. */
  latitude: number;
  longitude: number;
  /** Meters above sea level at the forecast point; null when no mapped lift gives one. */
  elevationM: number | null;
  /** `upper_lift`: top of the highest mapped lift. `reference`: the ski area's own mapped point. */
  point: "upper_lift" | "reference";
  pointLabel: string;
  /** Operating public lifts mapped at the resort; only breaks ties between equal matches. */
  lifts: number;
  sources: string[];
  wikidata: string | null;
}

/** How a resort matched, best first. `typo` is a "Did you mean …?" suggestion, never a silent swap. */
export type ResortMatch = "exact" | "prefix" | "token" | "typo";

interface ResortHit {
  resort: SkiResort;
  match: ResortMatch;
  /** The name or alias that matched. */
  matched: string;
  /** Typo edits needed, summed over words; 0 unless `match` is `typo`. */
  edits: number;
}

const TIER: Record<ResortMatch, number> = { exact: 0, prefix: 1, token: 2, typo: 3 };
const MAX_QUERY_LENGTH = 100;
const MAX_QUERY_WORDS = 8;

/** Letters NFKD doesn't take apart. */
const FOLDED: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };
/** Written either way in resort names: "Mt. Bachelor", "St. Anton". */
const SYNONYMS: Record<string, string> = { mt: "mount", mtn: "mountain", st: "saint", ste: "sainte" };
/** Words people add or leave off ("Killington ski resort"); a match never needs them. */
const GENERIC = new Set(["the", "ski", "skiing", "resort", "area"]);
const APOSTROPHES = /['’ʼ`´]/g;

/** Case, accents, punctuation and spacing removed: "Val d’Isère" → "val d isere". */
export function normalizeName(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => FOLDED[letter])
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function words(text: string): string[] {
  const normalized = normalizeName(text);
  return normalized ? normalized.split(" ").map((word) => SYNONYMS[word] ?? word) : [];
}

const withoutGeneric = (tokens: string[]) => tokens.filter((token) => !GENERIC.has(token));

/**
 * Typo edits allowed in a word of this length: none below four characters,
 * one up to six, two from seven.
 */
export function allowedEdits(length: number): number {
  return length < 4 ? 0 : length <= 6 ? 1 : 2;
}

/**
 * Optimal string alignment distance (a swap of neighbours is one edit) between
 * `word` and the best-matching prefix of `target`, or the whole target when
 * `wholeWord`. Returns Infinity past `max`.
 */
function editDistance(word: string, target: string, max: number, wholeWord: boolean): number {
  if (wholeWord ? Math.abs(word.length - target.length) > max : target.length < word.length - max) return Infinity;
  const columns = Math.min(target.length, wholeWord ? target.length : word.length + max);
  let before = new Int32Array(columns + 1);
  let previous = new Int32Array(columns + 1).map((_, j) => j);
  let current = new Int32Array(columns + 1);
  for (let i = 1; i <= word.length; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= columns; j++) {
      const cost = word[i - 1] === target[j - 1] ? 0 : 1;
      let distance = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && word[i - 1] === target[j - 2] && word[i - 2] === target[j - 1]) {
        distance = Math.min(distance, before[j - 2] + 1);
      }
      current[j] = distance;
      rowMin = Math.min(rowMin, distance);
    }
    if (rowMin > max) return Infinity;
    [before, previous, current] = [previous, current, before];
  }
  // A prefix match may stop anywhere within `max` of the word's own length.
  const best = wholeWord ? previous[columns] : Math.min(...previous.subarray(Math.max(0, word.length - max)));
  return best <= max ? best : Infinity;
}

interface NameForm {
  resort: number;
  label: string;
  tokens: string[];
  core: string[];
}

export interface ResortIndex {
  resorts: SkiResort[];
  forms: NameForm[];
  /** Name word → forms containing it. */
  formsByToken: Map<string, number[]>;
  /** Region and country words → resorts there. */
  resortsByPlace: Map<string, number[]>;
  /** Every name word, sorted, for prefix lookups. */
  tokens: string[];
}

function addTo(map: Map<string, number[]>, key: string, value: number) {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (list[list.length - 1] !== value) list.push(value);
}

export function buildResortIndex(resorts: SkiResort[]): ResortIndex {
  const forms: NameForm[] = [];
  const formsByToken = new Map<string, number[]>();
  const resortsByPlace = new Map<string, number[]>();
  resorts.forEach((resort, index) => {
    const seen = new Set<string>();
    for (const label of [resort.name, ...resort.aliases]) {
      // "Mary's" is typed "marys" or "mary s"; "A-Basin" "abasin" or "a basin".
      for (const variant of [label, label.replace(APOSTROPHES, "").replace(/-/g, "")]) {
        const tokens = words(variant);
        const key = tokens.join(" ");
        if (!tokens.length || seen.has(key)) continue;
        seen.add(key);
        const core = withoutGeneric(tokens);
        const form = forms.push({ resort: index, label, tokens, core: core.length ? core : tokens }) - 1;
        for (const token of new Set(tokens)) addTo(formsByToken, token, form);
      }
    }
    for (const token of new Set(words(`${resort.region ?? ""} ${resort.country}`))) addTo(resortsByPlace, token, index);
  });
  return { resorts, forms, formsByToken, resortsByPlace, tokens: [...formsByToken.keys()].sort() };
}

/** Name words matching a query word, with the typo edits each needs. */
function matchingTokens(index: ResortIndex, word: string, last: boolean, typos: boolean): Map<string, number> {
  const found = new Map<string, number>();
  let low = 0, high = index.tokens.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (index.tokens[middle] < word) low = middle + 1;
    else high = middle;
  }
  for (let i = low; i < index.tokens.length && index.tokens[i].startsWith(word); i++) found.set(index.tokens[i], 0);
  const max = typos ? allowedEdits(word.length) : 0;
  if (max) {
    for (const token of index.tokens) {
      if (found.has(token)) continue;
      // Only the word being typed can be unfinished.
      const edits = editDistance(word, token, max, !last);
      if (edits <= max) found.set(token, edits);
    }
  }
  return found;
}

const startsWithWords = (tokens: string[], prefix: string[]) => tokens.join(" ").startsWith(prefix.join(" "));

/** A query's words as typed and with synonyms applied, and the positions a match needs. */
interface QueryWords {
  typed: string[];
  words: string[];
  required: number[];
}

function queryWords(query: string): QueryWords {
  const typed = normalizeName(query).split(" ").filter(Boolean).slice(0, MAX_QUERY_WORDS);
  const words = typed.map((word) => SYNONYMS[word] ?? word);
  const core = words.flatMap((word, i) => GENERIC.has(word) ? [] : [i]);
  return { typed, words, required: core.length ? core : words.map((_, i) => i) };
}

/** Each resort's best match for the query, with or without typo matches. */
function findHits(index: ResortIndex, query: QueryWords, typos: boolean): ResortHit[] {
  const required = query.required.map((i) => query.words[i]);
  const requiredTyped = query.required.map((i) => query.typed[i]);
  const perWord = query.required.map((i, n) => {
    const forms = new Map<number, number>();
    // "Ste" may be Sainte, or the start of Steamboat.
    for (const word of new Set([query.words[i], query.typed[i]])) {
      for (const [token, edits] of matchingTokens(index, word, n === query.required.length - 1, typos)) {
        for (const form of index.formsByToken.get(token) ?? []) {
          const known = forms.get(form);
          if (known === undefined || edits < known) forms.set(form, edits);
        }
      }
    }
    return { forms, places: new Set(index.resortsByPlace.get(query.words[i]) ?? []) };
  });

  const best = new Map<number, ResortHit>();
  const candidates = new Set(perWord.flatMap(({ forms }) => [...forms.keys()]));
  for (const formIndex of candidates) {
    const form = index.forms[formIndex];
    let edits = 0, nameWords = 0, viaPlace = false, matched = true;
    for (const { forms, places } of perWord) {
      const wordEdits = forms.get(formIndex);
      if (wordEdits !== undefined) {
        edits += wordEdits;
        nameWords++;
      } else if (places.has(form.resort)) {
        viaPlace = true;
      } else {
        matched = false;
        break;
      }
    }
    if (!matched || !nameWords) continue;
    const match: ResortMatch = edits ? "typo"
      : viaPlace ? "token"
        : form.core.join(" ") === required.join(" ") || form.tokens.join(" ") === query.words.join(" ") ? "exact"
          : [required, requiredTyped].some((words) => startsWithWords(form.core, words))
            || [query.words, query.typed].some((words) => startsWithWords(form.tokens, words)) ? "prefix" : "token";
    // A resort's best-matching name wins; on a tie, its own name before an alias.
    const known = best.get(form.resort);
    if (!known || TIER[match] < TIER[known.match] || (match === known.match && edits < known.edits)) {
      best.set(form.resort, { resort: index.resorts[form.resort], match, matched: form.label, edits });
    }
  }
  return [...best.values()];
}

/**
 * Resorts matching a typed query, best first. Every word must match a word of
 * the resort's name or alias, as typed or as its start; region and country
 * words may stand in for all but one ("Crystal Mountain Washington").
 * Typo matches come back only when nothing matched without one. Ties go to
 * the resort with more lifts, then name, region and ID.
 */
export function searchResorts(index: ResortIndex, query: string, limit: number): ResortHit[] {
  if (query.length > MAX_QUERY_LENGTH) return [];
  const words = queryWords(query);
  if (!words.required.length) return [];

  const hits = findHits(index, words, false);
  return (hits.length ? hits : findHits(index, words, true)).sort((a, b) => TIER[a.match] - TIER[b.match] || a.edits - b.edits
    || b.resort.lifts - a.resort.lifts || compare(a.resort.name, b.resort.name)
    || compare(a.resort.region ?? "", b.resort.region ?? "") || compare(a.resort.id, b.resort.id))
    .slice(0, limit);
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

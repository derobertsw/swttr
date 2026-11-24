// @vitest-environment node
import { describe, expect, it } from "vitest";
import catalogFile from "@/data/ski-resorts.json";
import { createResortSearch, normalizeSearchText, searchResorts, typoBudget, type ResortCatalog } from "./resorts";

/** A small catalog whose ranking rules don't move when the real snapshot is re-imported. */
const fixture: ResortCatalog = {
  meta: { snapshot: "2026-11-24", attribution: "test", license: "ODbL-1.0" },
  resorts: [
    { id: "wd-1", n: "Killington Resort", r: "Vermont", c: "United States", tz: "America/New_York", lat: 43.62, lon: -72.8, p: [43.6045, -72.8201, 1262], pl: "Top of K-1 Express Gondola", lc: 21 },
    { id: "wd-2", n: "Stowe Mountain Resort", l: ["Stowe"], r: "Vermont", c: "United States", tz: "America/New_York", lat: 44.53, lon: -72.78, p: [44.5303, -72.7814, 1116], pl: "Top of Gondola Skyride", lc: 12 },
    { id: "wd-3", n: "Arapahoe Basin", a: ["A-Basin", "A Basin"], r: "Colorado", c: "United States", tz: "America/Denver", lat: 39.64, lon: -105.87, p: [39.62, -105.89, 3803], pl: "Top of Lenawee Express", lc: 9 },
    { id: "skimap-799", n: "Brévent/Flégère (Chamonix)", l: ["Chamonix"], r: "Haute-Savoie", c: "France", tz: "Europe/Paris", lat: 45.94, lon: 6.86, p: [45.93, 6.84, 2486], pl: "Top of Floria", lc: 16 },
    { id: "wd-5", n: "Les Grands Montets", l: ["Chamonix"], r: "Haute-Savoie", c: "France", tz: "Europe/Paris", lat: 45.97, lon: 6.97, p: [45.96, 6.98, 3233], pl: "Top of Bochard", lc: 9 },
    // Same name, different states: region tells them apart, size breaks the tie.
    { id: "skimap-10", n: "Snow Valley", r: "California", c: "United States", lat: 34.22, lon: -117.04, lc: 11 },
    { id: "skimap-11", n: "Snow Valley", r: "Ontario", c: "Canada", lat: 44.4, lon: -79.8, lc: 6 },
    { id: "skimap-12", n: "Mt. Snow", r: "Vermont", c: "United States", lat: 42.96, lon: -72.92, lc: 20 },
    { id: "skimap-13", n: "Vail", r: "Colorado", c: "United States", lat: 39.6, lon: -106.35, p: [39.58, -106.39, 3525], pl: "Top of Mountain Top Express", lc: 32 },
    { id: "skimap-14", n: "Vals", r: "Graubünden", c: "Switzerland", lat: 46.6, lon: 9.17, lc: 4 },
  ],
};
const fixtureSearch = createResortSearch(fixture);
const names = (results: { name: string }[]) => results.map((result) => result.name);

describe("normalizeSearchText", () => {
  it("drops case, accents, punctuation and extra spaces", () => {
    expect(normalizeSearchText("  Brévent/Flégère  (Chamonix) ")).toBe("brevent flegere chamonix");
    expect(normalizeSearchText("Whistler's")).toBe("whistlers");
    expect(normalizeSearchText("Øyer Hafjell")).toBe("oyer hafjell");
  });
  it("spells Mount and Saint the short way", () => {
    expect(normalizeSearchText("Mount Snow")).toBe(normalizeSearchText("Mt. Snow"));
    expect(normalizeSearchText("Saint-Gervais")).toBe("st gervais");
  });
});

describe("typoBudget", () => {
  it("allows no edits below four characters, one up to six, two beyond", () => {
    expect([3, 4, 6, 7, 10].map(typoBudget)).toEqual([0, 1, 1, 2, 2]);
  });
});

describe("Resort search ranking (fixture catalog)", () => {
  it("puts an exact core name ahead of a prefix", () => {
    const results = fixtureSearch.search("Vail");
    expect(results[0]).toMatchObject({ name: "Vail", match: "exact" });
    // A strong match hides typo guesses like Vals.
    expect(names(results)).not.toContain("Vals");
  });
  it("matches a name without its Resort suffix exactly", () => {
    expect(fixtureSearch.search("killington")[0]).toMatchObject({ name: "Killington Resort", match: "exact" });
  });
  it("finds aliases", () => {
    expect(fixtureSearch.search("A Basin")[0]).toMatchObject({ name: "Arapahoe Basin", match: "exact" });
    expect(fixtureSearch.search("a-basin")[0]).toMatchObject({ name: "Arapahoe Basin", match: "exact" });
  });
  it("ignores accents and finds each part of a combined name", () => {
    expect(fixtureSearch.search("flegere")[0]).toMatchObject({ name: "Brévent/Flégère (Chamonix)", match: "exact" });
    expect(fixtureSearch.search("Brevent")[0].name).toBe("Brévent/Flégère (Chamonix)");
  });
  it("matches the town an area is mapped in, after names", () => {
    expect(names(fixtureSearch.search("Chamonix"))).toEqual(["Brévent/Flégère (Chamonix)", "Les Grands Montets"]);
    // A whole word only: "Stow" isn't a town.
    expect(names(fixtureSearch.search("Stowe"))).toEqual(["Stowe Mountain Resort"]);
  });
  it("marks typo corrections so the picker can ask", () => {
    expect(fixtureSearch.search("Killngton")[0]).toMatchObject({ name: "Killington Resort", match: "typo" });
    expect(fixtureSearch.search("Chamonx")[0]).toMatchObject({ name: "Brévent/Flégère (Chamonix)", match: "typo" });
  });
  it("corrects a typo while the last word is still being typed", () => {
    expect(fixtureSearch.search("Kilingt")[0]).toMatchObject({ name: "Killington Resort", match: "typo" });
  });
  it("doesn't correct short words", () => {
    expect(fixtureSearch.search("Vsl")).toEqual([]);
    expect(fixtureSearch.search("K")).toEqual([]);
  });
  it("finds nothing for unrelated text", () => {
    expect(fixtureSearch.search("pizza delivery")).toEqual([]);
  });
  it("keeps same-named resorts apart by region, bigger first", () => {
    expect(fixtureSearch.search("Snow Valley").map((r) => [r.name, r.region])).toEqual([
      ["Snow Valley", "California"], ["Snow Valley", "Ontario"],
    ]);
  });
  it("finds Mt. Snow typed as Mount Snow", () => {
    expect(fixtureSearch.search("Mount Snow")[0]).toMatchObject({ name: "Mt. Snow", match: "exact" });
  });
  it("returns the forecast point, its elevation and label", () => {
    expect(fixtureSearch.search("Killington")[0]).toEqual({
      id: "resort:wd-1", kind: "resort", source: "openskidata", resortId: "wd-1",
      name: "Killington Resort", region: "Vermont", country: "United States",
      latitude: 43.6045, longitude: -72.8201, timeZone: "America/New_York",
      elevationM: 1262, pointLabel: "Top of K-1 Express Gondola", pointKind: "lift", match: "exact",
    });
  });
  it("falls back to the reference point without inventing an elevation", () => {
    expect(fixtureSearch.search("Snow Valley")[0]).toMatchObject({
      latitude: 34.22, longitude: -117.04, elevationM: null, pointLabel: "Resort reference point", pointKind: "reference",
    });
  });
  it("breaks ties the same way every time", () => {
    expect(fixtureSearch.search("snow")).toEqual(fixtureSearch.search("snow"));
    expect(names(fixtureSearch.search("snow"))).toEqual(["Snow Valley", "Snow Valley", "Mt. Snow"]);
  });
  it("looks resorts up by ID", () => {
    expect(fixtureSearch.byId("wd-3")?.n).toBe("Arapahoe Basin");
    expect(fixtureSearch.byId("nope")).toBeNull();
  });
});

describe("Resort search on the app's catalog", () => {
  const top = (query: string) => searchResorts(query)[0];

  it.each([
    ["Killngton", "Killington Resort"],
    ["Whisler", "Whistler Blackcomb"],
    ["Stowe", "Stowe Mountain Resort"],
    ["Vail", "Vail"],
    ["A Basin", "Arapahoe Basin"],
    ["Arapahoe", "Arapahoe Basin"],
  ])("%s finds %s", (query, name) => {
    expect(top(query)?.name).toBe(name);
  });

  it("finds Chamonix's areas for a misspelled Chamonix", () => {
    const results = searchResorts("Chamonx");
    expect(results.every((result) => result.match === "typo")).toBe(true);
    expect(results[0].name).toBe("Brévent/Flégère (Chamonix)");
    // Areas mapped in the town count too, not just names that say Chamonix.
    expect(names(results)).toContain("Les Grands Montets");
  });

  it("puts the five check resorts on a mapped lift top with an elevation", () => {
    for (const query of ["Killington", "Stowe", "Vail", "Whistler", "Grands Montets"]) {
      const resort = top(query);
      expect(resort, query).toMatchObject({ pointKind: "lift", elevationM: expect.any(Number) });
      expect(resort.pointLabel, query).toMatch(/^Top of /);
    }
  });

  it("has a time zone for every resort it can", () => {
    const { resorts } = catalogFile as unknown as ResortCatalog;
    const missing = resorts.filter((resort) => !resort.tz);
    expect(missing.length / resorts.length).toBeLessThan(0.01);
  });

  it("has unique IDs and no abandoned areas", () => {
    const { resorts } = catalogFile as unknown as ResortCatalog;
    expect(new Set(resorts.map((resort) => resort.id)).size).toBe(resorts.length);
    expect(resorts.some((resort) => resort.n === "Arapahoe East")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { allowedEdits, buildResortIndex, normalizeName, searchResorts } from "./resort-search";
import { RESORT_FIXTURES } from "@/test/skiResorts";

const index = buildResortIndex(RESORT_FIXTURES);
const search = (query: string, limit = 6) => searchResorts(index, query, limit);
const ids = (query: string) => search(query).map((hit) => hit.resort.id);
const first = (query: string) => search(query)[0];

describe("normalizeName", () => {
  it("ignores case, accents, punctuation and spacing", () => {
    expect(normalizeName("  Val d’Isère ")).toBe("val d isere");
    expect(normalizeName("SÖLDEN")).toBe("solden");
    expect(normalizeName("Chamonix-Mont-Blanc")).toBe("chamonix mont blanc");
    expect(normalizeName("Mt.   Bachelor")).toBe("mt bachelor");
    expect(normalizeName("Ærøskøbing Straße")).toBe("aeroskobing strasse");
  });
});

describe("allowedEdits", () => {
  it("allows no typo below four characters, one up to six and two from seven", () => {
    expect([1, 3, 4, 6, 7, 12].map(allowedEdits)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe("searchResorts", () => {
  it("ranks an exact name first and ignores words like ski and resort", () => {
    expect(first("Vail")).toMatchObject({ match: "exact", resort: { id: "vail" } });
    expect(first("killington ski resort")).toMatchObject({ match: "exact", resort: { id: "killington" } });
    expect(first("Killington")).toMatchObject({ match: "exact", resort: { id: "killington" } });
  });

  it("matches the start of a name as it's typed", () => {
    expect(first("kil")).toMatchObject({ match: "prefix", resort: { id: "killington" } });
    expect(first("Whistler B")).toMatchObject({ match: "prefix", resort: { id: "whistler-blackcomb" } });
  });

  it("matches any word of a name", () => {
    expect(first("blackcomb")).toMatchObject({ match: "token", resort: { id: "whistler-blackcomb" } });
    expect(first("basin arapahoe")).toMatchObject({ match: "token", resort: { id: "arapahoe-basin" } });
  });

  it("matches aliases however they're punctuated", () => {
    for (const query of ["A Basin", "a-basin", "ABasin", "a basin"]) {
      expect(first(query)).toMatchObject({ match: "exact", resort: { id: "arapahoe-basin" } });
    }
    expect(first("a basin")?.matched).toBe("A Basin");
    expect(first("MRG")).toMatchObject({ match: "exact", resort: { id: "mad-river-glen" } });
  });

  it("matches without accents or apostrophes", () => {
    for (const query of ["val d'isere", "Val d Isere", "VAL DISERE", "val d’isère"]) {
      expect(first(query)?.resort.id).toBe("val-d-isere");
    }
    expect(first("solden")).toMatchObject({ match: "exact", resort: { id: "solden" } });
  });

  it("reads Mt and Mount, St and Saint as the same word", () => {
    expect(first("Mount Bachelor")).toMatchObject({ match: "exact", resort: { id: "mt-bachelor" } });
    expect(first("mt bach")).toMatchObject({ match: "prefix", resort: { id: "mt-bachelor" } });
    expect(first("Saint Anton am Arlberg")).toMatchObject({ match: "exact", resort: { id: "st-anton" } });
    expect(first("st anton")).toMatchObject({ match: "prefix", resort: { id: "st-anton" } });
  });

  it("still reads a short word as the start of a name", () => {
    // "Ste" could become Sainte, but someone typing Steamboat sees it.
    expect(first("Ste")).toMatchObject({ match: "prefix", resort: { id: "steamboat" } });
    expect(ids("St")).toEqual(["st-anton", "steamboat", "stowe"]);
  });

  it("suggests the resort for a misspelling, marked as a typo", () => {
    expect(first("Killngton")).toMatchObject({ match: "typo", edits: 1, resort: { id: "killington" } });
    expect(first("Whisler")).toMatchObject({ match: "typo", edits: 1, resort: { id: "whistler-blackcomb" } });
    expect(first("Chamonx")).toMatchObject({ match: "typo", edits: 1, resort: { id: "chamonix-mont-blanc" } });
    // Closer suggestions first: Chamois needs two edits.
    expect(ids("Chamonx")).toEqual(["chamonix-mont-blanc", "chamois"]);
    // Swapped neighbours are one edit.
    expect(first("Whsitler")).toMatchObject({ match: "typo", edits: 1, resort: { id: "whistler-blackcomb" } });
    expect(first("Killngt")).toMatchObject({ match: "typo", resort: { id: "killington" } });
  });

  it("makes no typo suggestion for words under four characters", () => {
    expect(ids("kxl")).toEqual([]);
    expect(ids("vai")).toEqual(["vail"]);
    expect(ids("vli")).toEqual([]);
  });

  it("leaves typo suggestions out when something matched as typed", () => {
    // Chamonix is two edits from Chamois, but Chamois is what was typed.
    expect(search("chamois").map((hit) => [hit.resort.id, hit.match])).toEqual([["chamois", "exact"]]);
  });

  it("finds nothing for unrelated or empty text", () => {
    for (const query of ["pizza delivery", "", "  ", "!!!", "x".repeat(101)]) expect(ids(query)).toEqual([]);
  });

  it("keeps resorts with the same name apart and tells them apart by place", () => {
    expect(search("Crystal Mountain").map((hit) => [hit.resort.id, hit.resort.region])).toEqual([
      ["crystal-mountain", "Washington"],
      ["crystal-mountain-michigan", "Michigan"],
    ]);
    expect(ids("crystal mountain michigan")).toEqual(["crystal-mountain-michigan"]);
    expect(first("crystal mountain michigan")?.match).toBe("token");
  });

  it("needs at least one word of the name, not just the place", () => {
    expect(ids("vermont")).toEqual([]);
    expect(ids("stowe vermont")).toEqual(["stowe"]);
  });

  it("still finds names made of words like ski", () => {
    expect(ids("ski")).toEqual(["ski-apache"]);
    expect(first("Ski Apache")).toMatchObject({ match: "exact", resort: { id: "ski-apache" } });
  });

  it("breaks ties the same way whatever the catalog order, and respects the limit", () => {
    const reversed = buildResortIndex([...RESORT_FIXTURES].reverse());
    expect(searchResorts(reversed, "m", 20)).toEqual(search("m", 20));
    expect(search("m", 20).length).toBeGreaterThan(2);
    expect(search("m", 2)).toHaveLength(2);
  });
});

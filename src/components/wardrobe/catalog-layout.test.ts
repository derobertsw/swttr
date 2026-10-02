import { describe, expect, it } from "vitest";
import { getCatalogHeights } from "./catalog-layout";

describe("getCatalogHeights", () => {
  it("gives the results their own scroller when there's room", () => {
    expect(
      getCatalogHeights({ containerHeight: 600, controlsHeight: 250, filterPanelHeight: null })
    ).toEqual({ filterPanelMaxHeight: null, resultsMaxHeight: 338 });
  });

  it("lets the catalog scroll to the results when the controls leave too little room", () => {
    // 341px catalog on a 375×480 phone with filter chips showing.
    expect(
      getCatalogHeights({ containerHeight: 341, controlsHeight: 260, filterPanelHeight: null })
        .resultsMaxHeight
    ).toBeNull();
  });

  it("caps an open filter panel to the room the other controls leave", () => {
    // 375×667: 519px catalog, 230px of other controls, 326px of filters.
    expect(
      getCatalogHeights({ containerHeight: 519, controlsHeight: 230 + 326, filterPanelHeight: 326 })
    ).toEqual({ filterPanelMaxHeight: 275, resultsMaxHeight: null });
  });

  it("keeps two rows of filters when the other controls nearly fill the catalog", () => {
    expect(
      getCatalogHeights({ containerHeight: 300, controlsHeight: 280 + 200, filterPanelHeight: 200 })
        .filterPanelMaxHeight
    ).toBe(120);
  });

  it("measures against the panel's capped height on later passes", () => {
    // After the cap applies, the panel reports its capped height; the cap holds.
    expect(
      getCatalogHeights({ containerHeight: 519, controlsHeight: 230 + 275, filterPanelHeight: 275 })
        .filterPanelMaxHeight
    ).toBe(275);
  });
});

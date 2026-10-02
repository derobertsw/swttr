// How Browse catalog (WardrobeSearch) splits its fixed height between the
// search controls and the results. All heights are in px.

// Two rows of filter chips. If even this doesn't fit beside the other
// controls, the whole catalog scrolls instead.
const MIN_FILTER_PANEL_HEIGHT = 120;

// The results header and about a row. With less room than this, the results
// list drops its own scroller and the whole catalog scrolls to it.
const MIN_RESULTS_HEIGHT = 120;

// The results list's top margin (mt-3) and its top and bottom border.
const RESULTS_GAP = 12;
const RESULTS_BORDER = 2;

interface CatalogMeasurements {
  containerHeight: number;
  /** Everything above the results, including the open filter panel. */
  controlsHeight: number;
  /** The open filter panel, or null when it's closed. */
  filterPanelHeight: number | null;
}

interface CatalogHeights {
  /** Cap for the open filter panel, or null when it's closed. */
  filterPanelMaxHeight: number | null;
  /** Cap for the results scroller, or null to let the catalog scroll to them. */
  resultsMaxHeight: number | null;
}

export function getCatalogHeights({
  containerHeight,
  controlsHeight,
  filterPanelHeight,
}: CatalogMeasurements): CatalogHeights {
  // On short screens the open filter panel can outgrow the catalog, so it
  // scrolls within the room the other controls leave.
  const filterPanelMaxHeight =
    filterPanelHeight === null
      ? null
      : Math.max(
          MIN_FILTER_PANEL_HEIGHT,
          containerHeight - (controlsHeight - filterPanelHeight) - RESULTS_GAP - RESULTS_BORDER
        );
  const resultsRoom = containerHeight - controlsHeight - RESULTS_GAP;
  return {
    filterPanelMaxHeight,
    resultsMaxHeight: resultsRoom >= MIN_RESULTS_HEIGHT ? resultsRoom : null,
  };
}

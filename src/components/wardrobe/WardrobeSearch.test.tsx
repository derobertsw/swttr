import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AvailableItem } from "@/types/wardrobe";
import { WardrobeSearch } from "./WardrobeSearch";

const items: AvailableItem[] = [
  { id: "g1", type: "garment", brand: "Patagonia", model_name: "Capilene Midweight Crew", category: "base_layer", rcl_clo: 0.31 },
  { id: "g2", type: "garment", brand: "Arc'teryx", model_name: "Atom Hoody", category: "insulated_jacket", rcl_clo: 0.82 },
];

const props = {
  status: "ready" as const,
  onRetry: vi.fn(),
  search: "",
  onSearchChange: vi.fn(),
  filteredItems: items,
  totalMatches: items.length,
  shownMatches: items.length,
  groupedItems: { garment: items },
  catalogStates: {},
  onAddItem: vi.fn(),
  onRemoveItem: vi.fn(),
  onAddSimilar: vi.fn(),
  wardrobeItemIds: new Set<string>(),
  brandFilter: null,
  onBrandFilterChange: vi.fn(),
  searchBodyPartFilter: "all" as const,
  onSearchBodyPartFilterChange: vi.fn(),
  searchLayerFilter: "all" as const,
  onSearchLayerFilterChange: vi.fn(),
  searchSort: "bestMatch" as const,
  onSearchSortChange: vi.fn(),
  onClearFilters: vi.fn(),
  availableBrands: ["Arc'teryx", "Patagonia"],
};

// jsdom has no layout, so stand in for the heights WardrobeSearch measures:
// the catalog (its root), the controls (the root's first child) and the open
// filter panel.
const sizes = { container: 0, controls: 0, filterPanel: 0 };
let resize: () => void = () => {};

const TOGGLE = "[aria-controls='wardrobe-filter-panel']";

function catalogRoot() {
  return document.querySelector(TOGGLE)!.parentElement!.parentElement!;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.querySelector(`:scope > div > ${TOGGLE}`) ? sizes.container : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this.id === "wardrobe-filter-panel") return sizes.filterPanel;
    return this.querySelector(`:scope > ${TOGGLE}`) ? sizes.controls : 0;
  });
  vi.mocked(ResizeObserver).mockImplementation(function (callback: ResizeObserverCallback) {
    resize = () => callback([], {} as ResizeObserver);
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WardrobeSearch layout", () => {
  it("keeps the results in their own scroller when there's room", () => {
    render(<WardrobeSearch {...props} />);
    Object.assign(sizes, { container: 600, controls: 250 });
    act(() => resize());

    expect(catalogRoot().lastElementChild).toHaveStyle({ maxHeight: "338px" });
  });

  it("caps an open filter panel and lets the catalog scroll to the results on a short screen", async () => {
    const user = userEvent.setup();
    render(<WardrobeSearch {...props} />);

    await user.click(screen.getByRole("button", { name: /filters/i }));
    Object.assign(sizes, { container: 519, controls: 230 + 326, filterPanel: 326 });
    act(() => resize());

    expect(document.getElementById("wardrobe-filter-panel")).toHaveStyle({ maxHeight: "275px" });
    expect((catalogRoot().lastElementChild as HTMLElement).style.maxHeight).toBe("");
  });
});

describe("WardrobeSearch catalog rows", () => {
  it("adds an item it doesn't own and offers Remove for one it does", async () => {
    const user = userEvent.setup();
    const onAddItem = vi.fn();
    const onRemoveItem = vi.fn();
    render(
      <WardrobeSearch {...props} wardrobeItemIds={new Set(["g2"])} onAddItem={onAddItem} onRemoveItem={onRemoveItem} />
    );

    await user.click(screen.getByRole("button", { name: "Add Patagonia Capilene Midweight Crew to wardrobe" }));
    expect(onAddItem).toHaveBeenCalledWith(items[0]);

    const owned = screen.getByText("Atom Hoody").closest("li")!;
    expect(within(owned).getByText("In wardrobe")).toBeInTheDocument();
    await user.click(within(owned).getByRole("button", { name: "Remove Arc'teryx Atom Hoody from wardrobe" }));
    expect(onRemoveItem).toHaveBeenCalledWith("g2");
  });

  it("says when an add failed and keeps Add available to try again", () => {
    render(<WardrobeSearch {...props} catalogStates={{ g1: { action: "add", failed: true } }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't add this item. Try again.");
    expect(screen.getByRole("button", { name: /^Add Patagonia/ })).toBeEnabled();
  });

  it("reports a catalog that failed to load instead of showing no items", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<WardrobeSearch {...props} status="error" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the catalog");
    expect(screen.queryByText("Atom Hoody")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("offers a similar custom item when nothing matches", async () => {
    const user = userEvent.setup();
    const onAddSimilar = vi.fn();
    render(
      <WardrobeSearch
        {...props}
        search="obscure shell"
        filteredItems={[]}
        groupedItems={{ garment: [] }}
        totalMatches={0}
        shownMatches={0}
        onAddSimilar={onAddSimilar}
      />
    );

    expect(screen.getByText("No catalog items match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a similar item" }));
    expect(onAddSimilar).toHaveBeenCalled();
  });
});

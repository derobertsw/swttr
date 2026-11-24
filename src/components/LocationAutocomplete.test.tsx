import { describe, expect, it, vi } from "vitest";
import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocationAutocomplete } from "./LocationAutocomplete";
import { pickedPlace } from "@/lib/locationSuggestion";
import type { LocationSearchStatus } from "@/hooks/useLocationSearch";
import type { LocationSuggestion } from "@/types/recommendations";

const KILLINGTON: LocationSuggestion = {
  id: "resort:wd-Q14711916", kind: "resort", source: "openskidata", resortId: "wd-Q14711916",
  name: "Killington Resort", region: "Vermont", country: "United States", latitude: 43.6047, longitude: -72.8187,
  elevationM: 1262, pointLabel: "Top of K-1 Express Gondola", pointKind: "lift", match: "typo",
};
const TOWN: LocationSuggestion = { id: 5236102, name: "Killington", region: "Vermont", country: "United States", latitude: 43.67, longitude: -72.78 };

function Picker({ suggestions = [], status = "results", query = "Killngton", selected = null, canSearchAllPlaces = false, onSelect = vi.fn(), onSearchAllPlaces = vi.fn(), placesUnavailable = false }: {
  suggestions?: LocationSuggestion[]; status?: LocationSearchStatus; query?: string; selected?: LocationSuggestion | null;
  canSearchAllPlaces?: boolean; onSelect?: (s: LocationSuggestion) => void; onSearchAllPlaces?: () => void; placesUnavailable?: boolean;
}) {
  const [show, setShow] = useState(true);
  return (
    <LocationAutocomplete
      id="where" label="Where?" location={selected?.name ?? ""} locationQuery={query} suggestions={suggestions}
      showSuggestions={show} selectedLocation={selected} suggestionRef={createRef<HTMLDivElement>()}
      onLocationInputChange={vi.fn()} onLocationFocus={() => setShow(true)} onSelectLocation={onSelect} onDismiss={() => setShow(false)}
      status={status} canSearchAllPlaces={canSearchAllPlaces} onSearchAllPlaces={onSearchAllPlaces} placesUnavailable={placesUnavailable}
    />
  );
}

describe("LocationAutocomplete with resorts (#7)", () => {
  it("offers a typo match as a question, labelled as a ski resort, with the data credit", () => {
    render(<Picker suggestions={[KILLINGTON]} />);
    const option = screen.getByRole("option");
    expect(option).toHaveTextContent("Did you mean Killington Resort?");
    expect(option).toHaveTextContent("Ski resort · Vermont, United States");
    expect(screen.getByRole("link", { name: "OpenSkiMap" })).toHaveAttribute("href", "https://openskimap.org/");
    expect(screen.getByTestId("where-announcement")).toHaveTextContent("1 result. Did you mean Killington Resort?");
  });

  it("never picks a typo match without the person choosing it", () => {
    const onSelect = vi.fn();
    render(<Picker suggestions={[KILLINGTON]} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(KILLINGTON);
  });

  it("reaches Search all places from the keyboard after the resorts", () => {
    const onSearchAllPlaces = vi.fn();
    const onSelect = vi.fn();
    render(<Picker suggestions={[KILLINGTON]} canSearchAllPlaces onSearchAllPlaces={onSearchAllPlaces} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "where-option-1");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearchAllPlaces).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says when no resort matches and still offers Search all places", () => {
    const onSearchAllPlaces = vi.fn();
    render(<Picker status="empty" canSearchAllPlaces onSearchAllPlaces={onSearchAllPlaces} />);
    expect(screen.getByText("No ski resorts match.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Search all places" }));
    expect(onSearchAllPlaces).toHaveBeenCalledOnce();
    expect(screen.getByTestId("where-announcement")).toHaveTextContent("No ski resorts match. Search all places is available.");
  });

  it("tells a failed search apart from no matches", () => {
    render(<Picker status="error" />);
    expect(screen.getAllByText("Couldn't search locations. Try again.")).toHaveLength(2);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("says nothing matched in the general search, without a resort fallback", () => {
    render(<Picker status="empty" />);
    expect(screen.getAllByText("No places match.")).toHaveLength(2);
    expect(screen.queryByRole("option", { name: "Search all places" })).not.toBeInTheDocument();
  });

  it("keeps a town and a resort with the same name apart", () => {
    render(<Picker suggestions={[{ ...KILLINGTON, match: "exact" }, TOWN]} />);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Killington Resort · Ski resort · Vermont, United States",
      "Killington, Vermont, United States",
    ]);
  });

  it("notes when other places couldn't be searched", () => {
    render(<Picker suggestions={[KILLINGTON]} placesUnavailable />);
    expect(screen.getByText(/Other places couldn.t be searched/)).toBeInTheDocument();
  });

  it("shows where a picked resort's weather is read, and describes the field with it", () => {
    render(<Picker selected={pickedPlace(KILLINGTON)} status="idle" query="" />);
    const point = screen.getByText(/forecast at Top of K-1 Express Gondola, 1,262 m \(4,140 ft\)/);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-describedby", point.id);
  });

  it("closes on Escape when only a message is showing", () => {
    render(<Picker status="empty" />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByText("No places match.")).not.toBeInTheDocument();
  });
});

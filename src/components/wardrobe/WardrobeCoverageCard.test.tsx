import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeTripApi as fakeApi, reply } from "@/test/tripApi";
import type { WardrobeCoverage } from "@/types/wardrobe-coverage";
import { WardrobeCoverageCard } from "./WardrobeCoverageCard";

const coverage: WardrobeCoverage = {
  grid_version: "1",
  grid_description: "5 activities from 70°F to −5°F",
  scenario_count: 34,
  covered_count: 17,
  comfortable_count: 12,
  coverage: 0.5,
  efficiency: { score: 0.75, used_items: 9, modeled_items: 12, covered_per_item: 1.42 },
  by_activity: [],
  gaps: [
    { activity: "biking", cause: "missing_item", message: "Biking at any temperature: no bike helmet", scenario_ids: ["b1", "b2"] },
    { activity: "alpine_skiing", cause: "too_cold", message: "No outfit for alpine skiing at -5°F: legs too cold", scenario_ids: ["a1"] },
    { activity: "running", cause: "too_warm", message: "No outfit for running at 70°F: torso too warm", scenario_ids: ["r1"] },
    { activity: "xc_skiing", cause: "too_cold", message: "No outfit for XC skiing at -5°F: hands too cold", scenario_ids: ["x1"] },
  ],
  workhorses: [
    { key: "garment:g1", name: "Patagonia R1 Hoody", covered_scenarios: 11 },
    { key: "handwear:h1", name: "Hestra Army Leather Heli", covered_scenarios: 1 },
  ],
  idle_items: [],
  scenarios: [],
  evaluation_ms: 120,
  cached: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WardrobeCoverageCard", () => {
  it("shows the scores, the biggest gaps and the items doing the most work", async () => {
    vi.stubGlobal("fetch", fakeApi({ "GET /api/wardrobe/coverage": reply(200, coverage) }));
    render(<WardrobeCoverageCard contentsKey="a" />);

    const section = await screen.findByRole("region", { name: "How far your gear goes" });
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByText("17 of 34 conditions")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("9 of 12 items used")).toBeInTheDocument();
    expect(screen.getByText("Biking at any temperature: no bike helmet")).toBeInTheDocument();
    expect(screen.getByText("No outfit for running at 70°F: torso too warm")).toBeInTheDocument();
    // Three gaps, then a count of the rest.
    expect(screen.queryByText("No outfit for XC skiing at -5°F: hands too cold")).not.toBeInTheDocument();
    expect(screen.getByText("And 1 more gap.")).toBeInTheDocument();
    expect(screen.getByText("Patagonia R1 Hoody")).toBeInTheDocument();
    expect(screen.getByText("11 conditions")).toBeInTheDocument();
    expect(screen.getByText("1 condition")).toBeInTheDocument();
    expect(section).toHaveTextContent("Your gear across 5 activities from 70°F to −5°F.");
  });

  it("shows nothing when signed out", async () => {
    const fetchMock = fakeApi({ "GET /api/wardrobe/coverage": reply(401, { error: "Authentication required" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<WardrobeCoverageCard contentsKey="a" />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("offers a retry when the coverage can't be worked out", async () => {
    let fail = true;
    vi.stubGlobal("fetch", fakeApi({
      "GET /api/wardrobe/coverage": () => (fail ? reply(500, { error: "x" }) : reply(200, coverage)),
    }));
    render(<WardrobeCoverageCard contentsKey="a" />);
    expect(await screen.findByText("Couldn't work out your coverage.")).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("50%")).toBeInTheDocument();
  });

  it("asks again when the wardrobe's contents change", async () => {
    const fetchMock = fakeApi({ "GET /api/wardrobe/coverage": reply(200, coverage) });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<WardrobeCoverageCard contentsKey="a" />);
    await screen.findByText("50%");
    rerender(<WardrobeCoverageCard contentsKey="b" />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

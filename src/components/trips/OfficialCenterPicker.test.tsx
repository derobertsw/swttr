import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayConditions } from "./DayConditions";
import { fakeTripApi, reply, sentBodies, TRIP, tripFull } from "@/test/tripApi";
import type { AvalancheCenter, AvalancheCenterDirectory } from "@/types/avalanche-centers";

const DATE = "2026-10-10";
const sourcesRoute = `/api/v1/trips/${TRIP.id}/days/${DATE}/conditions`;
const centersRoute = `${sourcesRoute}/centers`;
const DAYS = [{ id: "day-1", trip_id: TRIP.id, stop_id: null, date: DATE, activity: "Backcountry" }];
const MWAC: AvalancheCenter = {
  id: "mwac", name: "Mount Washington Avalanche Center", country: "US", area: "New Hampshire",
  url: "https://www.mountwashingtonavalanchecenter.org/forecasts/", listed_on: "avalanche.org U.S. Avalanche Centers",
};
const PARKS: AvalancheCenter = {
  id: "parks-canada", name: "Parks Canada avalanche forecast", country: "CA",
  area: "Banff, Yoho, Kootenay, Jasper, Glacier and Waterton Lakes national parks", url: "https://avalanche.ca/map", listed_on: "Parks Canada avalanche information",
};
const directory = (suggestions: Partial<AvalancheCenterDirectory["suggestions"]> = {}): AvalancheCenterDirectory => ({
  verified_on: "2026-11-16", centers: [MWAC, PARKS],
  suggestions: { status: "found", point: "access_point", checked_at: "2026-11-16T19:05:00Z", items: [{ center_id: "parks-canada", area: "Glacier", forecaster: "Parks Canada" }], ...suggestions },
});
const onSaved = vi.fn().mockResolvedValue(undefined);

async function openEditor() {
  const user = userEvent.setup();
  render(<DayConditions data={tripFull({ days: DAYS })} date={DATE} dateLabel="Sat Oct 10" activity="Backcountry" userId="user-1" onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: "Add source" }));
  return user;
}

describe("Official centers in the source editor", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, ""); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("loads only when asked, and only for an avalanche forecast", async () => {
    const api = fakeTripApi({ [`GET ${centersRoute}`]: reply(200, directory()) });
    vi.stubGlobal("fetch", api);
    const user = await openEditor();
    expect(api).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Type"), "weather");
    expect(screen.queryByRole("button", { name: "Choose an official center" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Type"), "avalanche");
    await user.click(screen.getByRole("button", { name: "Choose an official center" }));
    expect(await screen.findByLabelText("Official center")).toBeInTheDocument();
    expect(api).toHaveBeenCalledOnce();
  });

  it("fills in a suggestion only when the organizer uses it, and saves it only with Save source", async () => {
    const api = fakeTripApi({
      [`GET ${centersRoute}`]: reply(200, directory()),
      [`POST ${sourcesRoute}`]: reply(200, { source_id: "source-1", revision: 1 }),
    });
    vi.stubGlobal("fetch", api);
    const user = await openEditor();
    await user.click(screen.getByRole("button", { name: "Choose an official center" }));
    expect(await screen.findByText("Avalanche Canada's forecast areas put this day's access point in “Glacier” today, forecast by Parks Canada.")).toBeInTheDocument();
    expect(screen.getByText(/Forecast areas change through the season/)).toBeInTheDocument();
    // Nothing is filled in or chosen until the organizer says so.
    expect(screen.getByLabelText("Source name")).toHaveValue("");
    expect(screen.getByLabelText("Official center")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Use Parks Canada avalanche forecast" }));
    expect(screen.getByLabelText("Source name")).toHaveValue("Parks Canada avalanche forecast");
    expect(screen.getByLabelText("Link")).toHaveValue("https://avalanche.ca/map");
    expect(screen.getByText("Filled in Parks Canada avalanche forecast. Check its map covers your route, then save the source.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${sourcesRoute}`)).toEqual([]);
    await user.type(screen.getByLabelText("Area or region (optional)"), "Glacier National Park");
    await user.click(screen.getByRole("button", { name: "Save source" }));
    expect(await screen.findByText("Source added.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${sourcesRoute}`)[0]).toMatchObject({
      action: "add", source: { category: "avalanche", name: "Parks Canada avalanche forecast", region: "Glacier National Park", url: "https://avalanche.ca/map" },
    });
  });

  it("fills in a center chosen from the list, keeping the area the organizer typed", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${centersRoute}`]: reply(200, directory({ status: "none", items: [] })) }));
    const user = await openEditor();
    await user.type(screen.getByLabelText("Area or region (optional)"), "Presidential Range");
    await user.click(screen.getByRole("button", { name: "Choose an official center" }));
    expect(await screen.findByText("Avalanche Canada's forecast areas don't include this day's access point today, so there's no suggestion.")).toBeInTheDocument();
    expect(screen.getByText("SWTTR doesn't suggest U.S. centers. Choose the one whose forecast map covers your route.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Use / })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Official center"), "Mount Washington Avalanche Center · New Hampshire");
    expect(screen.getByLabelText("Source name")).toHaveValue("Mount Washington Avalanche Center");
    expect(screen.getByLabelText("Link")).toHaveValue("https://www.mountwashingtonavalanchecenter.org/forecasts/");
    expect(screen.getByLabelText("Area or region (optional)")).toHaveValue("Presidential Range");
    expect(screen.getByText(/Links checked Nov 16, 2026/)).toBeInTheDocument();
  });

  it.each([
    ["no_location", "Add the day's destination or access point to get a suggestion."],
    ["unavailable", "Suggestions aren't available right now. You can still choose a center from the list."],
  ] as const)("says why there's no suggestion (%s)", async (status, text) => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${centersRoute}`]: reply(200, directory({ status, point: null, checked_at: null, items: [] })) }));
    const user = await openEditor();
    await user.click(screen.getByRole("button", { name: "Choose an official center" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByLabelText("Official center")).toBeInTheDocument();
  });

  it("keeps the typed source when the list can't load, and loads it on a retry", async () => {
    let fail = true;
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${centersRoute}`]: () => fail ? reply(500, { error: "Couldn't load the centers." }) : reply(200, directory()) }));
    const user = await openEditor();
    await user.type(screen.getByLabelText("Source name"), "My own source");
    await user.click(screen.getByRole("button", { name: "Choose an official center" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the centers. You can still enter the source yourself.");
    expect(screen.getByLabelText("Source name")).toHaveValue("My own source");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try loading official centers again" }));
    expect(await screen.findByLabelText("Official center")).toBeInTheDocument();
    expect(screen.getByLabelText("Source name")).toHaveValue("My own source");
  });
});

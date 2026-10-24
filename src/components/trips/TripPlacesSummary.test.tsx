import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tripMapFixture } from "@/test/tripMap";
import { TripPlacesSummary } from "./TripPlacesSummary";
import userEvent from "@testing-library/user-event";

const data = await tripMapFixture();
afterEach(() => vi.unstubAllGlobals());
describe("Overview Places entry", () => {
  it("shows server-projected stays/destinations and coverage, requesting only the data API", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(data)); vi.stubGlobal("fetch", fetcher);
    render(<TripPlacesSummary tripId={data.trip.id} revision={1} />);
    expect(await screen.findByText("5 of 6 places shown")).toBeVisible();
    expect(screen.getByRole("region", { name: "Places" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View trip map" })).toHaveAttribute("href", "/trips/trip-drive/map");
    expect(screen.getByRole("list")).toHaveTextContent("Stay · Stowe Motel");
    expect(screen.getByRole("list")).toHaveTextContent("Destination · Stowe, Vermont");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/trips/trip-drive/map");
  });
  it("offers an honest empty state and map entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...data, places: [], counts: { mapped: 0, total: 0 } })));
    render(<TripPlacesSummary tripId={data.trip.id} revision={1} />);
    expect(await screen.findByText("0 of 0 places shown")).toBeVisible();
    expect(screen.getByText("Add a destination to see it on the map.")).toBeVisible();
  });
  it("keeps map entry usable after data failure and retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(Response.json(data)));
    render(<TripPlacesSummary tripId={data.trip.id} revision={1} />);
    expect(await screen.findByText("Places unavailable. The trip's days are still available.")).toBeVisible();
    expect(screen.getByRole("link", { name: "View trip map" })).toBeVisible();
    await act(async () => userEvent.click(screen.getByRole("button", { name: "Retry places" })));
    expect(await screen.findByText("5 of 6 places shown")).toBeVisible();
  });
});

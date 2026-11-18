import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { fakeTripApi, reply, sentBodies, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import TripMapPage from "./page";

vi.mock("@/hooks/useUserId", () => ({ useUserId: () => "user-1" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/components/trips/TripMapView", () => ({ TripMapView: () => null }));

const params = Promise.resolve({ id: TRIP.id });
const day = { id: "day-1", trip_id: TRIP.id, date: "2026-10-10", stop_id: STOWE_STOP.id, activity: null };

async function open(search: string) {
  window.history.replaceState(null, "", `/trips/trip-1/map${search}`);
  const fetchMock = fakeTripApi({
    "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP], days: [day] })),
    // The places themselves don't decide the back link.
    "GET /api/v1/trips/trip-1/map": () => new Promise(() => {}),
  });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => { render(<TripMapPage params={params} />); });
  expect(screen.getByRole("heading", { name: "Trip map" })).toBeInTheDocument();
  await waitFor(() => expect(sentBodies(fetchMock, "GET /api/v1/trips/trip-1/map")).toHaveLength(1));
}

describe("Trip map loading (#235)", () => {
  it("asks for the places alongside the trip, not after it, and only once when the trip arrives", async () => {
    window.history.replaceState(null, "", "/trips/trip-1/map");
    let finishTrip!: () => void;
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": () => new Promise((resolve) => { finishTrip = () => resolve(reply(200, tripFull({ stops: [STOWE_STOP], days: [day] }))); }),
      "GET /api/v1/trips/trip-1/map": () => new Promise(() => {}),
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<TripMapPage params={params} />); });
    // On slow connections the list waited for two round trips in a row.
    await waitFor(() => expect(sentBodies(fetchMock, "GET /api/v1/trips/trip-1/map")).toHaveLength(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading trip places…");
    await act(async () => finishTrip());
    await waitFor(() => expect(screen.getByRole("link", { name: "Back to Plan" })).toBeInTheDocument());
    // The trip's first arrival isn't a change to refresh for.
    expect(sentBodies(fetchMock, "GET /api/v1/trips/trip-1/map")).toHaveLength(1);
  });
});

describe("Trip map back link (#234)", () => {
  it("returns to the day it was opened from, at Getting there where View day map was (#235)", async () => {
    await open("?date=2026-10-10&from=day");
    expect(screen.getByRole("link", { name: "Back to day" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10#getting-there-2026-10-10");
  });

  it("returns to Plan when that day is no longer on the trip", async () => {
    await open("?date=2026-10-12&from=day");
    expect(screen.getByRole("link", { name: "Back to Plan" })).toHaveAttribute("href", "/trips/trip-1");
    expect(screen.queryByRole("link", { name: "Back to day" })).not.toBeInTheDocument();
  });

  it("returns to Plan when the map was opened there, even with a date chosen", async () => {
    await open("?date=2026-10-10");
    expect(screen.getByRole("link", { name: "Back to Plan" })).toHaveAttribute("href", "/trips/trip-1");
  });
});

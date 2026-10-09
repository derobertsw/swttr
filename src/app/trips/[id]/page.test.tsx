import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { fakeTripApi, reply, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import TripOverviewPage from "./page";
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => "user-1" }));
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const params = Promise.resolve({ id: TRIP.id });
const day = { id: "day-1", trip_id: TRIP.id, date: "2026-10-10", stop_id: STOWE_STOP.id, activity: null };

describe("Saved trip next step", () => {
  beforeEach(() => vi.clearAllMocks());
  it("leads an older draft without stops to its destination editor", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ days: [day] })) })); await act(async () => { render(<TripOverviewPage params={params} />); });
    expect(await screen.findByRole("link", { name: "Add first destination" })).toHaveAttribute("href", "/trips/trip-1/stops");
    expect(screen.getByRole("status")).toHaveTextContent("Saved trip");
  });
  it("opens a solo draft's unplanned day and leaves optional crew and gear available", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP], days: [day] })) })); await act(async () => { render(<TripOverviewPage params={params} />); });
    expect(await screen.findByRole("link", { name: "Plan this day" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
    expect(screen.getByRole("link", { name: "Add or edit destinations" })).toHaveAttribute("href", "/trips/trip-1/stops");
    expect(screen.getByRole("link", { name: "Edit trip" })).toHaveAttribute("href", "/trips/trip-1/settings");
    expect(screen.getByRole("link", { name: "Group gear" })).toHaveAttribute("href", "/trips/trip-1/gear");
    expect(screen.getByRole("link", { name: "My pack list" })).toHaveAttribute("href", "/trips/trip-1/pack");
  });
  it("announces a trip that fails to load", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(500, { error: "Trip unavailable" }) })); await act(async () => { render(<TripOverviewPage params={params} />); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Trip unavailable");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { fakeTripApi, reply, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import TripPlanPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => "user-1" }));
// The places summary has its own tests.
vi.mock("@/components/trips/TripPlacesSummary", () => ({ TripPlacesSummary: () => null }));
const params = Promise.resolve({ id: TRIP.id });
const day = { id: "day-1", trip_id: TRIP.id, date: "2026-10-10", stop_id: STOWE_STOP.id, activity: null };

async function open(hash = "") {
  window.history.replaceState(null, "", `/trips/${TRIP.id}${hash}`);
  await act(async () => { render(<TripPlanPage params={params} />); });
}

describe("Plan's own page (#330)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the destinations with their editor, and leaves stays and crew to their sections", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP], days: [day] })) }));
    await open();
    const destinations = await screen.findByRole("region", { name: "Destinations" });
    expect(destinations).toHaveTextContent("Stowe, Vermont");
    expect(screen.getByRole("link", { name: "Add or edit destinations" })).toHaveAttribute("href", "/trips/trip-1/stops");
    expect(screen.queryByRole("heading", { name: "Stays" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Day checklist" })).not.toBeInTheDocument();
  });

  it("says when an older draft has no destinations yet", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ days: [day] })) }));
    await open();
    expect(await screen.findByText("No destinations yet.")).toBeInTheDocument();
  });

  it("announces a trip that fails to load", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(500, { error: "Trip unavailable" }) }));
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent("Trip unavailable");
  });

  it.each(["#stay-stay-1", "#trip-stays-heading"])("opens an older link to a stay (%s) in Stays", async (hash) => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) }));
    await open(hash);
    expect(replace).toHaveBeenCalledWith(`/trips/trip-1/stays${hash}`);
  });

  it("stays on Plan without a stay in the link", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) }));
    await open("#unrelated");
    expect(replace).not.toHaveBeenCalled();
  });
});

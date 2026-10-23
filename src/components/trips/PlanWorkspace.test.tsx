import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { fakeTripApi, reply, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay, TripStop } from "@/types/trips";
import { PlanWorkspace } from "./PlanWorkspace";

let pathname = "/trips/trip-1";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => "user-1" }));

const KILLINGTON: TripStop = { ...STOWE_STOP, id: "stop-killington", position: 1, name: "Killington, Vermont" };
const day = (date: string, overrides: Partial<TripDay> = {}): TripDay =>
  ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id: STOWE_STOP.id, activity: "Alpine", ...overrides }) as TripDay;
const DAYS = [day("2026-10-10"), day("2026-10-11", { activity: null }), day("2026-10-12", { stop_id: KILLINGTON.id })];

async function open(path: string, trip = tripFull({ stops: [STOWE_STOP, KILLINGTON], days: DAYS })) {
  pathname = path;
  vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, trip) }));
  await act(async () => {
    render(<PlanWorkspace tripId={TRIP.id}><p>Selected page</p></PlanWorkspace>);
  });
  await screen.findByRole("heading", { name: "Days" });
}

describe("Plan workspace (#330)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists every day in order, grouped by destination, beside Plan's own page", async () => {
    await open("/trips/trip-1");
    const days = screen.getByRole("navigation", { name: "Days" });
    const links = within(days).getAllByRole("link", { name: /Oct/ });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/trips/trip-1/days/2026-10-10",
      "/trips/trip-1/days/2026-10-11",
      "/trips/trip-1/days/2026-10-12",
    ]);
    expect(links[1]).toHaveTextContent("Activity not set");
    expect(within(days).getByText("Stowe, Vermont")).toBeInTheDocument();
    expect(within(days).getByText("Killington, Vermont")).toBeInTheDocument();
    expect(links.some((link) => link.hasAttribute("aria-current"))).toBe(false);
    expect(screen.getByText("Selected page")).toBeInTheDocument();
    // The date strip is for a day.
    expect(screen.queryByRole("navigation", { name: "Choose a day" })).not.toBeInTheDocument();
  });

  it("leads with the next unplanned day", async () => {
    await open("/trips/trip-1");
    // The first day has an activity but no kit of yours yet.
    expect(screen.getByText("Plan your kit for your next unplanned day.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan this day" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
  });

  it("sends an older draft without destinations to the destination editor", async () => {
    await open("/trips/trip-1", tripFull({ days: [day("2026-10-10", { stop_id: null })] }));
    expect(screen.getByRole("link", { name: "Add first destination" })).toHaveAttribute("href", "/trips/trip-1/stops");
  });

  it("names a day without its own destination after the base", async () => {
    await open("/trips/trip-1", tripFull({ stops: [STOWE_STOP], days: [day("2026-10-10", { stop_id: null })] }));
    expect(within(screen.getByRole("navigation", { name: "Days" })).getByText("Stowe, Vermont · base")).toBeInTheDocument();
  });

  it("marks the selected day in the list and in a date strip with All days", async () => {
    await open("/trips/trip-1/days/2026-10-10");
    const days = screen.getByRole("navigation", { name: "Days" });
    expect(within(days).getByRole("link", { current: "page" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
    // Its own day isn't the next step.
    expect(screen.queryByRole("link", { name: "Plan this day" })).not.toBeInTheDocument();

    const strip = screen.getByRole("navigation", { name: "Choose a day" });
    expect(within(strip).getByRole("link", { name: "All days" })).toHaveAttribute("href", "/trips/trip-1");
    const selected = within(strip).getByRole("link", { current: "page" });
    expect(selected).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
    expect(selected).toHaveTextContent(/Sat\s*10\s*October/);
    expect(within(strip).getAllByRole("link", { name: /October/ })).toHaveLength(3);
  });

  it("says when the trip has no days", async () => {
    await open("/trips/trip-1", tripFull({ stops: [STOWE_STOP] }));
    expect(screen.getByText("No days configured.")).toBeInTheDocument();
  });
});

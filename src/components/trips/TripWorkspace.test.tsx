import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { fakeTripApi, reply, TRIP, tripFull } from "@/test/tripApi";
import { usePublishTripSummary, useTrip } from "@/hooks/useTrip";
import { TripProvider } from "./TripProvider";
import { TripWorkspace } from "./TripWorkspace";

let pathname = "/trips/trip-1";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "user-1", sessionId: "session-1", isLoaded: true }) }));
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

/** A page that reads the full trip, like Plan, Stays or Crew. */
function TripPage() {
  useTrip(TRIP.id);
  return null;
}

/** A page with its own endpoint, like Packing, that names the trip. */
function PackPage() {
  usePublishTripSummary({ id: TRIP.id, name: "Whistler from the pack list", start_date: TRIP.start_date, end_date: TRIP.end_date });
  return null;
}

function workspace(page = <TripPage />) {
  return <TripProvider tripId={TRIP.id}><TripWorkspace tripId={TRIP.id}>{page}</TripWorkspace></TripProvider>;
}

async function open(path: string, page?: React.ReactElement) {
  pathname = path;
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(workspace(page)); });
  return view;
}

function tab(name: string) {
  return within(screen.getByRole("navigation", { name: "Trip sections" })).getByRole("link", { name });
}

describe("Trip workspace (#330)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) }));
  });

  it("reaches Plan, Stays, Crew and Packing from any trip page", async () => {
    await open("/trips/trip-1/days/2026-10-10");
    const nav = screen.getByRole("navigation", { name: "Trip sections" });
    expect(within(nav).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Plan", "/trips/trip-1"],
      ["Stays", "/trips/trip-1/stays"],
      ["Crew", "/trips/trip-1/manage"],
      ["Packing", "/trips/trip-1/pack"],
    ]);
  });

  it.each([
    ["/trips/trip-1", "Plan", "page"],
    ["/trips/trip-1/days/2026-10-10", "Plan", "true"],
    ["/trips/trip-1/map", "Plan", "true"],
    ["/trips/trip-1/stops", "Plan", "true"],
    ["/trips/trip-1/settings", "Plan", "true"],
    ["/trips/trip-1/stays", "Stays", "page"],
    ["/trips/trip-1/manage", "Crew", "page"],
    ["/trips/trip-1/rollcall", "Crew", "true"],
    ["/trips/trip-1/pack", "Packing", "page"],
    ["/trips/trip-1/gear", "Packing", "true"],
  ])("keeps %s in its section, %s", async (path, section, current) => {
    await open(path);
    expect(tab(section)).toHaveAttribute("aria-current", current);
    const others = ["Plan", "Stays", "Crew", "Packing"].filter((name) => name !== section);
    for (const name of others) expect(tab(name)).not.toHaveAttribute("aria-current");
  });

  it("returns Plan to the day it last showed, and Plan's own page from inside Plan", async () => {
    const view = await open("/trips/trip-1/days/2026-10-11");
    expect(tab("Plan")).toHaveAttribute("href", "/trips/trip-1");
    pathname = "/trips/trip-1/stays";
    view.rerender(workspace());
    expect(tab("Plan")).toHaveAttribute("href", "/trips/trip-1/days/2026-10-11");
    pathname = "/trips/trip-1/map";
    view.rerender(workspace());
    expect(tab("Plan")).toHaveAttribute("href", "/trips/trip-1");
    pathname = "/trips/trip-1/pack";
    view.rerender(workspace());
    expect(tab("Plan")).toHaveAttribute("href", "/trips/trip-1/days/2026-10-11");
  });

  it("titles Plan's own page with the trip and names it on every other page", async () => {
    const view = await open("/trips/trip-1");
    expect(await screen.findByRole("heading", { level: 1, name: TRIP.name })).toBeInTheDocument();
    expect(screen.getByText("Oct 10 – Oct 12 · 3 days")).toBeInTheDocument();
    // A new trip opens on Plan, which confirms it's saved.
    expect(screen.getByRole("status")).toHaveTextContent("Saved trip");
    expect(screen.getByRole("link", { name: "All trips" })).toHaveAttribute("href", "/trips");
    expect(screen.getByRole("link", { name: "Edit trip" })).toHaveAttribute("href", "/trips/trip-1/settings");

    pathname = "/trips/trip-1/manage";
    view.rerender(workspace());
    expect(screen.getByText(TRIP.name)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: TRIP.name })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved trip")).not.toBeInTheDocument();
  });

  it("doesn't offer Edit trip on the trip's settings", async () => {
    await open("/trips/trip-1/settings");
    await screen.findByText(TRIP.name);
    expect(screen.queryByRole("link", { name: "Edit trip" })).not.toBeInTheDocument();
  });

  it("names the trip from Packing's own data without loading the whole trip", async () => {
    const fetchMock = fakeTripApi({});
    vi.stubGlobal("fetch", fetchMock);
    await open("/trips/trip-1/pack", <PackPage />);
    expect(screen.getByText("Whistler from the pack list")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Trip sections" })).toHaveAttribute("data-trip-sections");
  });

  it.each([403, 404])("stops naming the trip once a full-trip read loses access (%i)", async (status) => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(status, { error: "No access" }) }));
    // Packing named the trip, then a page that reads the whole trip lost access.
    await open("/trips/trip-1/manage", <><PackPage /><TripPage /></>);
    expect(screen.queryByText("Whistler from the pack list")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit trip" })).not.toBeInTheDocument();
  });
});

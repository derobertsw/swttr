import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { fakeTripApi, reply, TRIP } from "@/test/tripApi";
import type { TripSummary } from "@/types/trips";
import TripsHomePage from "./page";

vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const trip: TripSummary = { ...TRIP, member_count: 1, stop_count: 1, status: "live" };
const section = (label: string) => screen.getByText(label, { selector: "p" }).closest("section")!;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Trips list status", () => {
  it("uses the API status for grouping and badges, and keeps past trips accessible", async () => {
    const api = fakeTripApi({ "GET /api/v1/trips": reply(200, { trips: [
      { ...trip, status: "past" },
      { ...trip, id: "future", name: "Future trip", status: "planning" },
    ] }) });
    vi.stubGlobal("fetch", api);
    render(<TripsHomePage />);
    await screen.findByText(trip.name);
    expect(within(section("Past")).getByRole("link", { name: /Whistler/ })).toHaveAttribute("href", `/trips/${trip.id}`);
    expect(within(section("Past")).getByText("Past", { selector: "span" })).toBeInTheDocument();
    expect(within(section("Upcoming")).queryByText(trip.name)).not.toBeInTheDocument();
    expect(within(section("Upcoming")).getByText("Planning")).toBeInTheDocument();
  });

  it.each(["focus", "visibilitychange"])("moves a trip to Past after returning via %s", async (event) => {
    let current = trip;
    const api = fakeTripApi({ "GET /api/v1/trips": () => reply(200, { trips: [current] }) });
    vi.stubGlobal("fetch", api);
    render(<TripsHomePage />);
    await screen.findByText("Live");
    expect(within(section("Upcoming")).getByText(trip.name)).toBeInTheDocument();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(api).toHaveBeenCalledTimes(1);

    current = { ...trip, status: "past" };
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    if (event === "focus") fireEvent.focus(window);
    else fireEvent(document, new Event("visibilitychange"));
    await screen.findByText("Past", { selector: "p" });
    expect(within(section("Past")).getByText(trip.name)).toBeInTheDocument();
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "failure"])("ignores an older response's %s after a newer load finishes", async (result) => {
    let finish!: (response: Response) => void;
    let fail!: (error: Error) => void;
    const api = fakeTripApi({ "GET /api/v1/trips": reply(200, { trips: [{ ...trip, status: "past" }] }) });
    api.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    vi.stubGlobal("fetch", api);
    render(<TripsHomePage />);
    const signal = api.mock.calls[0][1]?.signal;
    fireEvent.focus(window);
    await screen.findByText("Past", { selector: "p" });
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      if (result === "success") finish(Response.json({ trips: [trip] }));
      else fail(new Error("Old request failed"));
    });
    expect(within(section("Past")).getByText(trip.name)).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows load errors and clears them when a return to the page succeeds", async () => {
    const api = fakeTripApi({ "GET /api/v1/trips": reply(200, { trips: [{ ...trip, status: "past" }] }) });
    api.mockRejectedValueOnce(new Error("Offline"));
    vi.stubGlobal("fetch", api);
    render(<TripsHomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    fireEvent.focus(window);
    await screen.findByText(trip.name);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the current list visible when a background refresh fails", async () => {
    const api = fakeTripApi({ "GET /api/v1/trips": reply(200, { trips: [trip] }) });
    vi.stubGlobal("fetch", api);
    render(<TripsHomePage />);
    await screen.findByText(trip.name);
    api.mockRejectedValueOnce(new Error("Offline"));
    fireEvent.focus(window);
    expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByText(trip.name)).toBeInTheDocument();
  });

  it("aborts pending requests and removes refresh listeners on unmount", async () => {
    const api = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", api);
    const { unmount } = render(<TripsHomePage />);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));
    expect(api).toHaveBeenCalledTimes(1);
  });
});

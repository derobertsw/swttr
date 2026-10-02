import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import {
  ORGANIZER,
  STOWE_PLACE,
  STOWE_STOP,
  TRIP,
  fakeTripApi,
  reply,
  tripFull,
} from "@/test/tripApi";
import type { TripDay, TripMemberDayKit } from "@/types/trips";
import DayDetailPage from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// These tests cover the page, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const DAY: TripDay = {
  id: "day-1",
  trip_id: TRIP.id,
  stop_id: STOWE_STOP.id,
  date: "2026-10-10",
  activity: null,
};

const TRIP_ROUTE = reply(200, tripFull({ stops: [STOWE_STOP], days: [DAY] }));
const NO_FORECAST = reply(500, { error: "Failed to fetch weather data" });

/** The page suspends until its params resolve, so rendering is awaited. */
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <DayDetailPage params={Promise.resolve({ id: TRIP.id, date: DAY.date })} />
      </Suspense>
    );
  });
}

describe("Trip day page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the day's forecast", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": TRIP_ROUTE,
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": reply(200, {
          forecast: { status: "partial", availableHours: 2, expectedHours: 16, message: "Partial forecast: 2 of 16 daytime hours available." },
          weather: { tempF: 46, wind: 12, precip: 0.2 },
        }),
      })
    );
    await renderPage();

    expect(await screen.findByText("46°F · 12 mph")).toBeInTheDocument();
  });

  it("offers retry after a forecast failure rather than loading forever", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({ "GET /api/v1/trips/trip-1": TRIP_ROUTE, "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST })
    );
    await renderPage();

    expect(await screen.findByText("Couldn't load the forecast. Retry weather or plan your kit manually.")).toBeInTheDocument();
    expect(screen.queryByText("Loading forecast…")).not.toBeInTheDocument();
  });

  it("puts the activity back when it can't be saved", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": TRIP_ROUTE,
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
        "PATCH /api/v1/trips/trip-1/days/2026-10-10": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "Hike" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the activity", {
        description: "Database unavailable",
      })
    );
    expect(screen.getByText("Tap a chip to set this day's activity.")).toBeInTheDocument();
  });

  it("finishes saving one activity before taking another, so a failed one goes back to it", async () => {
    let activity: string | null = null;
    let saves = 0;
    let finishFirstSave = () => {};
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": () =>
          reply(200, tripFull({ stops: [STOWE_STOP], days: [{ ...DAY, activity }] })),
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
        "PATCH /api/v1/trips/trip-1/days/2026-10-10": (body) => {
          saves += 1;
          if (saves > 1) return reply(500, { error: "Database unavailable" });
          // Hold the first save open until the test finishes it.
          return new Promise((resolve) => {
            finishFirstSave = () => {
              activity = (body as { activity: string }).activity;
              resolve(reply(200, { day: { ...DAY, activity } }));
            };
          });
        },
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "Hike" }));
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();

    await act(async () => finishFirstSave());
    await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the activity", {
        description: "Database unavailable",
      })
    );
    expect(screen.getByRole("button", { name: "Hike" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Run" })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts a kit back when a change can't be saved", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": TRIP_ROUTE,
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
        "PUT /api/v1/trips/trip-1/days/2026-10-10/kits/member-you": reply(500, {
          error: "Database unavailable",
        }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "shell" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the kit change", {
        description: "Database unavailable",
      })
    );
    expect(screen.getByText("no kit set")).toBeInTheDocument();
  });

  it("finishes saving one kit change before taking another, so a failed one keeps the saved kit", async () => {
    let savedItems: string[] = [];
    let saves = 0;
    let finishFirstSave = () => {};
    let holdNextReload = false;
    let finishReload: (() => void) | null = null;
    const savedKit = (): TripMemberDayKit => ({
      id: "kit-you",
      trip_day_id: DAY.id,
      trip_member_id: ORGANIZER.id,
      effort: "steady",
      items: savedItems,
      note: null,
      state: "ok",
      updated_at: "2026-09-28T00:00:00Z",
    });
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": () => {
          const trip = reply(
            200,
            tripFull({
              stops: [STOWE_STOP],
              days: [DAY],
              kits: savedItems.length > 0 ? [savedKit()] : [],
            })
          );
          if (!holdNextReload) return trip;
          // Hold the reload after the first save open until the test finishes it.
          holdNextReload = false;
          return new Promise((resolve) => {
            finishReload = () => resolve(trip);
          });
        },
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
        "PUT /api/v1/trips/trip-1/days/2026-10-10/kits/member-you": (body) => {
          saves += 1;
          if (saves > 1) return reply(500, { error: "Database unavailable" });
          // Hold the first save open until the test finishes it.
          return new Promise((resolve) => {
            finishFirstSave = () => {
              savedItems = (body as { items: string[] }).items;
              holdNextReload = true;
              resolve(reply(200, { kit: savedKit() }));
            };
          });
        },
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "shell" }));
    expect(screen.getByRole("button", { name: "gloves" })).toBeDisabled();

    await act(async () => finishFirstSave());
    await waitFor(() => expect(finishReload).not.toBeNull());
    // Saved, but the trip is still reloading.
    expect(screen.getByRole("button", { name: "gloves" })).toBeDisabled();

    await act(async () => finishReload?.());
    await waitFor(() => expect(screen.getByRole("button", { name: "gloves" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "gloves" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the kit change", {
        description: "Database unavailable",
      })
    );
    // Only the failed gloves change is undone. The saved shell stays.
    expect(screen.getByText("1 layers picked")).toBeInTheDocument();
  });

  it("keeps the new place in the editor when it can't be saved", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": TRIP_ROUTE,
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
        "GET /api/geocode": reply(200, { results: [STOWE_PLACE] }),
        "PATCH /api/v1/trips/trip-1/stops/stop-stowe": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "Change" }));
    const search = screen.getByRole("combobox");
    await user.type(search, "Stowe");
    await user.click(await screen.findByRole("option", { name: /Stowe/ }));
    await user.click(screen.getByRole("button", { name: "Save location" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't save the location", {
        description: "Database unavailable",
      })
    );
    expect(search).toHaveValue("Stowe, Vermont, United States");
    expect(screen.getByRole("button", { name: "Save location" })).toBeEnabled();
  });

  it("retries a failed forecast and replaces the error with weather", async () => {
    let attempt = 0;
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": TRIP_ROUTE,
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": () => {
        attempt += 1;
        return attempt === 1 ? NO_FORECAST : reply(200, {
          forecast: { status: "available", availableHours: 16, expectedHours: 16, message: "Full daytime forecast." },
          weather: { tempF: 50, wind: 4, precip: 0 },
        });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Retry weather" }));
    expect(await screen.findByText("50°F · 4 mph")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load the forecast/)).not.toBeInTheDocument();
    expect(attempt).toBe(2);
  });

  it.each([
    { forecast: { status: "unavailable", availableHours: 0, expectedHours: 16, message: "Forecast unavailable for this day." }, weather: null },
    { hourly: [] },
    { forecast: { status: "available" }, weather: { tempF: null, wind: 0, precip: 0 } },
  ])("resolves unavailable or invalid data to a terminal state", async (body) => {
    vi.stubGlobal("fetch", fakeTripApi({
      "GET /api/v1/trips/trip-1": TRIP_ROUTE,
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": reply(200, body),
    }));
    await renderPage();
    expect(await screen.findByRole("button", { name: "Retry weather" })).toBeInTheDocument();
    expect(screen.queryByText("Loading forecast…")).not.toBeInTheDocument();
    expect(screen.queryByText(/0°F/)).not.toBeInTheDocument();
  });

  it("loads weather for a location at zero latitude and longitude", async () => {
    vi.stubGlobal("fetch", fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [{ ...STOWE_STOP, latitude: 0, longitude: 0 }], days: [DAY] })),
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
    }));
    await renderPage();
    expect(await screen.findByRole("button", { name: "Retry weather" })).toBeInTheDocument();
    expect(screen.queryByText("This stop has no coordinates yet.")).not.toBeInTheDocument();
  });


  it("times out a stalled forecast to a retryable error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const tripFetch = fakeTripApi({ "GET /api/v1/trips/trip-1": TRIP_ROUTE });
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/weather")) return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });
      return tripFetch(url, init);
    }));
    await renderPage();
    expect(screen.getByText("Loading forecast…")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(screen.getByRole("button", { name: "Retry weather" })).toBeInTheDocument();
    expect(screen.queryByText("Loading forecast…")).not.toBeInTheDocument();
  });

});

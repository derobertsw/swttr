import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import {
  ORGANIZER,
  SAM,
  STOWE_PLACE,
  STOWE_STOP,
  TRIP,
  fakeTripApi,
  reply,
  tripFull,
} from "@/test/tripApi";
import type { TripDay, TripMember, TripMemberDayKit } from "@/types/trips";
import { savedOutfit } from "@/test/savedKit";
import DayDetailPage from "./page";
import { TemperatureUnitProvider } from "@/components/TemperatureUnitProvider";
import { STORAGE_KEYS } from "@/lib/storage";

const mockAuth = vi.hoisted(() => ({ userId: "user-1" as string | null }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: mockAuth.userId, isLoaded: true }) }));

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
async function renderPage(date = DAY.date, celsius = false) {
  if (celsius) window.localStorage.setItem(`${STORAGE_KEYS.TEMPERATURE_UNIT}:user:user-1`, "C");
  await act(async () => {
    const page = (
      <Suspense fallback={null}>
        <DayDetailPage params={Promise.resolve({ id: TRIP.id, date })} />
      </Suspense>
    );
    render(celsius ? <TemperatureUnitProvider>{page}</TemperatureUnitProvider> : page);
  });
}

describe("Trip day page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockAuth.userId = "user-1";
    window.localStorage.removeItem(`${STORAGE_KEYS.TEMPERATURE_UNIT}:user:user-1`);
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

  it("shows trip weather in the saved Celsius preference", async () => {
    const api = fakeTripApi({
      "GET /api/v1/trips/trip-1": TRIP_ROUTE,
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": reply(200, {
        forecast: { status: "available", availableHours: 16, expectedHours: 16, message: "Full daytime forecast." },
        weather: { tempF: 32, wind: 12, precip: 0.2 },
      }),
    });
    vi.stubGlobal("fetch", api);
    await renderPage(DAY.date, true);
    expect(await screen.findByText("0°C · 12 mph")).toBeInTheDocument();
    expect(screen.queryByText(/32°F/)).not.toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "Shell" }));

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

    await user.click(await screen.findByRole("button", { name: "Shell" }));
    expect(screen.getByRole("button", { name: "Gloves" })).toBeDisabled();

    await act(async () => finishFirstSave());
    await waitFor(() => expect(finishReload).not.toBeNull());
    // Saved, but the trip is still reloading.
    expect(screen.getByRole("button", { name: "Gloves" })).toBeDisabled();

    await act(async () => finishReload?.());
    await waitFor(() => expect(screen.getByRole("button", { name: "Gloves" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Gloves" }));

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
    { forecast: { status: "unavailable", reason: "no_daytime_hours", availableHours: 0, expectedHours: 16, message: "Forecast unavailable for this day." }, weather: null },
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

  it.each(["past", "outside_forecast"])("doesn't offer retry when the date is %s", async (reason) => {
    vi.stubGlobal("fetch", fakeTripApi({
      "GET /api/v1/trips/trip-1": TRIP_ROUTE,
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": reply(200, {
        forecast: { status: "unavailable", reason, availableHours: 0, expectedHours: 16, message: "Forecast not available for this date. Plan manually or check later." },
        weather: null,
      }),
    }));
    await renderPage();
    expect(await screen.findByText(/Forecast not available for this date/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry weather" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shell" })).toBeInTheDocument();
  });

  it("offers retry for partial forecasts", async () => {
    vi.stubGlobal("fetch", fakeTripApi({
      "GET /api/v1/trips/trip-1": TRIP_ROUTE,
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": reply(200, {
        forecast: { status: "partial", availableHours: 8, expectedHours: 16, message: "Partial daytime forecast." },
        weather: { tempF: 50, wind: 4, precip: 0 },
      }),
    }));
    await renderPage();
    expect(await screen.findByRole("button", { name: "Retry weather" })).toBeInTheDocument();
  });

  it("creates a missing day so its activity, location and kit controls can be used", async () => {
    let created = false;
    let finishCreate = () => {};
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ days: created ? [DAY] : [] })),
      "POST /api/v1/trips/trip-1/days/2026-10-10": () => new Promise((resolve) => {
        finishCreate = () => { created = true; resolve(reply(200, { day: DAY })); };
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Create day plan" }));
    expect(screen.getByRole("button", { name: "Creating day plan…" })).toBeDisabled();
    expect(created).toBe(false);
    await act(async () => finishCreate());
    expect(await screen.findByRole("button", { name: "Hike" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set location" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shell" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Create day plan" })).not.toBeInTheDocument();
  });

  it("keeps the missing day recovery available after a failed create", async () => {
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      "POST /api/v1/trips/trip-1/days/2026-10-10": reply(500, { error: "Database unavailable" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Create day plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByRole("button", { name: "Create day plan" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Create day plan" }));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Hike" })).not.toBeInTheDocument();
  });

  it("doesn't offer to create a day outside the trip dates", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) }));
    await renderPage("2026-10-13");
    expect(await screen.findByText(/This date is outside the trip/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create day plan" })).not.toBeInTheDocument();
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

  describe("My kit and crew kits", () => {
    const ANA: TripMember = { ...ORGANIZER, id: "member-ana", user_id: "user-2", display_name: "Ana", role: "member" };
    const kit = (member: TripMember, extra: Partial<TripMemberDayKit> = {}): TripMemberDayKit => ({
      id: `kit-${member.id}`, trip_day_id: DAY.id, trip_member_id: member.id, effort: "steady", items: [], note: null,
      state: "ok", updated_at: "2026-10-06T20:01:02Z", outfit: null, outfit_saved_at: null, ...extra,
    });
    const crewTrip = (kits: TripMemberDayKit[]) => fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP], days: [DAY], members: [ORGANIZER, ANA, SAM], kits })),
      "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
    });

    it("leads with my saved outfit, as saved, with the outing and forecast it was for", async () => {
      vi.stubGlobal("fetch", crewTrip([kit(ORGANIZER, { outfit: savedOutfit({ edited: true }), outfit_saved_at: "2026-10-06T20:01:02Z" })]));
      await renderPage();

      const myKit = await screen.findByRole("region", { name: "My kit" });
      expect(within(myKit).getByRole("heading", { name: "My kit" })).toBeInTheDocument();
      expect(within(myKit).getByText("Personalized")).toBeInTheDocument();
      expect(within(myKit).getByText(/from Gear up, with your changes\. It stays as saved when the forecast changes\./)).toBeInTheDocument();
      expect(within(myKit).getByText(/Forecast for Sat, Oct 10, 9:00 AM EDT/)).toBeInTheDocument();
      expect(within(myKit).getByText("Merino crew")).toBeInTheDocument();
      // Suggested items stay distinct from gear the person owns.
      expect(within(myKit).getByText("Fleece").parentElement).toHaveTextContent("Not in your wardrobe");
      expect(within(myKit).getByText(/In the comfort range/)).toBeInTheDocument();
      expect(within(myKit).queryByRole("button", { name: /Change/ })).not.toBeInTheDocument();
      expect(within(myKit).getByRole("link", { name: "get layers in Gear up" })).toHaveAttribute("href", "/");
    });

    it("says when general guidance or another place was saved", async () => {
      const general = savedOutfit({
        advice: { kind: "general", reason: "unsupported" },
        outing: { ...savedOutfit().outing, activity: "hiking_snowshoeing", place: { ...savedOutfit().outing.place, latitude: 45.0 } },
      });
      vi.stubGlobal("fetch", crewTrip([kit(ORGANIZER, { outfit: general })]));
      await renderPage();
      const myKit = await screen.findByRole("region", { name: "My kit" });
      expect(within(myKit).getByText("General guide")).toBeInTheDocument();
      expect(within(myKit).getByText(/Hiking \/ Snowshoeing has no personalized model yet/)).toBeInTheDocument();
      expect(within(myKit).getByText("Saved for Stowe, Vermont, United States, not this day's stop (Stowe, Vermont).")).toBeInTheDocument();
    });

    it("offers Gear up and my checklist when I have no saved outfit", async () => {
      vi.stubGlobal("fetch", crewTrip([]));
      await renderPage();
      expect(await screen.findByRole("heading", { name: "My kit" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Get layers in Gear up" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("group", { name: "Effort for You" })).toBeInTheDocument();
    });

    it("lets the organizer change a guest's kit but only see another member's", async () => {
      vi.stubGlobal("fetch", crewTrip([kit(ANA, { items: ["shell"], state: "warn" })]));
      await renderPage();
      await screen.findByText("Crew kits");
      expect(screen.getByRole("group", { name: "Effort for Sam" })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Effort for Ana" })).not.toBeInTheDocument();
      expect(screen.getByText("Steady · Shell")).toBeInTheDocument();
      expect(screen.getByText("Needs help")).toBeInTheDocument();
    });

    it("shows a member only their own kit to change", async () => {
      mockAuth.userId = "user-2";
      vi.stubGlobal("fetch", crewTrip([kit(ORGANIZER, { outfit: savedOutfit() })]));
      await renderPage();
      expect(await screen.findByRole("group", { name: "Effort for Ana" })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Effort for You" })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Effort for Sam" })).not.toBeInTheDocument();
      expect(screen.getByText("Outfit saved · Personalized · 6 items")).toBeInTheDocument();
    });
  });
});

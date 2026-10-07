import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import {
  ORGANIZER,
  SAM,
  STOWE_STOP,
  TRIP,
  fakeTripApi,
  reply,
  sentBodies,
  tripFull,
} from "@/test/tripApi";
import { previewItinerary } from "@/lib/trip-itinerary";
import { planDayKits } from "@/lib/trip-saved-kits";
import type { TripDay, TripFull, TripItineraryRequest, TripMember, TripMemberDayKit } from "@/types/trips";
import { savedOutfit, savedPlan } from "@/test/savedKit";
import DayDetailPage from "./page";
import { TemperatureUnitProvider } from "@/components/TemperatureUnitProvider";
import { STORAGE_KEYS } from "@/lib/storage";

const mockAuth = vi.hoisted(() => ({ userId: "user-1" as string | null }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: mockAuth.userId, isLoaded: true }) }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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

  describe("changing the day's location", () => {
    const JAY_PLACE = { id: 2, name: "Jay", region: "Vermont", country: "United States", latitude: 44.94, longitude: -72.5 };
    const ITINERARY = "POST /api/v1/trips/trip-1/itinerary";
    // Saturday at Stowe and Sunday on the base, also Stowe.
    const SUNDAY: TripDay = { ...DAY, id: "day-2", date: "2026-10-11", stop_id: null };

    /** Picks Jay in the location editor and opens the review. */
    async function chooseJay(full: TripFull, save: () => ReturnType<typeof reply>, button = "Change") {
      const fetchMock = fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, full),
        "GET /api/v1/trips/trip-1/days/2026-10-10/weather": NO_FORECAST,
        "GET /api/geocode": reply(200, { results: [JAY_PLACE] }),
        [ITINERARY]: (body) => {
          const { preview, ...request } = body as Record<string, unknown>;
          return preview ? reply(200, previewItinerary(full, request as unknown as TripItineraryRequest)) : save();
        },
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByRole("button", { name: button }));
      const search = screen.getByRole("combobox");
      await user.type(search, "Jay");
      await user.click(await screen.findByRole("option", { name: /Jay/ }));
      await user.click(screen.getByRole("button", { name: "Choose days" }));
      return { user, fetchMock, search, dialog: await screen.findByRole("dialog", { name: "Change location" }) };
    }

    it("asks whether it's only this day or every day at its stop, with the dates, before saving", async () => {
      const { user, fetchMock, dialog } = await chooseJay(tripFull({ stops: [STOWE_STOP], days: [DAY, SUNDAY] }), () => reply(200, { ok: true }));
      const onlyToday = await within(dialog).findByRole("radio", { name: /Only Sat Oct 10/ });
      const everyDay = within(dialog).getByRole("radio", { name: /Every day at Stowe, Vermont \(2 days\)/ });
      expect(onlyToday).not.toBeChecked();
      expect(everyDay).not.toBeChecked();
      expect(within(dialog).getByRole("button", { name: "Save location" })).toBeDisabled();

      await user.click(everyDay);
      expect(within(dialog).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Sat Oct 10Stowe, Vermont · No activity → Jay, Vermont · No activity",
        "Sun Oct 11Stowe, Vermont (base) · No activity → Jay, Vermont (base) · No activity",
      ]);
      await user.click(onlyToday);
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);
      await user.click(within(dialog).getByRole("button", { name: "Save location" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(sentBodies(fetchMock, ITINERARY).at(-1)).toEqual({
        action: "set_day_place", date: "2026-10-10", place: { name: "Jay, Vermont", latitude: 44.94, longitude: -72.5 },
        scope: "day", expected: { stop_id: STOWE_STOP.id, stop: { name: STOWE_STOP.name, latitude: 44.47, longitude: -72.69 }, dates: ["2026-10-10"] },
      });
      // The trip reloads after the save.
      expect(sentBodies(fetchMock, "GET /api/v1/trips/trip-1")).toHaveLength(2);
    });

    it("offers one choice when the stop serves only this day", async () => {
      const { dialog } = await chooseJay(tripFull({ stops: [STOWE_STOP], days: [DAY] }), () => reply(200, { ok: true }));
      expect(await within(dialog).findByText("Only Sat Oct 10")).toBeInTheDocument();
      expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Save location" })).toBeEnabled();
    });

    it("offers the place for every day when the trip has no stops", async () => {
      const { dialog } = await chooseJay(tripFull({ days: [{ ...DAY, stop_id: null }, SUNDAY] }), () => reply(200, { ok: true }), "Set location");
      expect(await within(dialog).findByText("Every day (2 days)")).toBeInTheDocument();
      expect(within(dialog).getByText("Jay, Vermont becomes the trip's base.")).toBeInTheDocument();
      expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    });

    it("keeps the new place in the editor when it can't be saved", async () => {
      const { user, dialog, search } = await chooseJay(tripFull({ stops: [STOWE_STOP], days: [DAY] }), () => reply(500, { error: "Couldn't save the change. Nothing was changed; try again." }));
      await user.click(await within(dialog).findByRole("button", { name: "Save location" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nothing was changed");
      await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(search).toHaveValue("Jay, Vermont, United States");
      expect(screen.getByRole("button", { name: "Choose days" })).toHaveFocus();
    });
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

  it("explains a date the trip no longer includes and links back to its days", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) }));
    await renderPage("2026-10-13");
    expect(await screen.findByText("This trip no longer includes this date. It now runs Oct 10 – Oct 12.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the trip's days" })).toHaveAttribute("href", "/trips/trip-1");
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

    // Before the saved outing's day at Stowe.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-10-07T12:00:00Z") });
      sessionStorage.clear();
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
      expect(within(myKit).getByRole("button", { name: "Update in Gear up" })).toBeInTheDocument();
    });

    it("updates my kit in Gear up: asks again for its outing, then saving picks this trip", async () => {
      vi.stubGlobal("fetch", crewTrip([kit(ORGANIZER, { outfit: savedOutfit() })]));
      await renderPage();
      const myKit = await screen.findByRole("region", { name: "My kit" });
      expect(within(myKit).getByText(/Saving them to this day shows what changes before anything is replaced\./)).toBeInTheDocument();
      await userEvent.click(within(myKit).getByRole("button", { name: "Update in Gear up" }));

      expect(push).toHaveBeenCalledExactlyOnceWith("/?resume=update&trip=trip-1");
      const draft = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.GEAR_UP_DRAFT)!)["user-1"];
      expect(draft).toMatchObject({ lastOuting: savedOutfit().outing, activity: "alpine_skiing", date: "2026-10-10", time: "09:00", inputMode: "later" });
    });

    it("doesn't offer an update once the day has passed at the destination", async () => {
      vi.setSystemTime(Date.parse("2026-10-11T12:00:00Z"));
      vi.stubGlobal("fetch", crewTrip([kit(ORGANIZER, { outfit: savedOutfit() })]));
      await renderPage();
      const myKit = await screen.findByRole("region", { name: "My kit" });
      expect(within(myKit).queryByRole("button", { name: "Update in Gear up" })).not.toBeInTheDocument();
    });

    it("shows a saved plan day as the plan showed it, and updates the whole plan", async () => {
      const [saturday] = planDayKits(savedPlan());
      vi.stubGlobal("fetch", crewTrip([
        kit(ORGANIZER, { outfit: saturday.kit, outfit_saved_at: "2026-10-06T20:01:02Z" }),
        kit(ANA, { outfit: saturday.kit }),
      ]));
      await renderPage();

      const myKit = await screen.findByRole("region", { name: "My kit" });
      expect(within(myKit).getByText("General guide")).toBeInTheDocument();
      expect(within(myKit).getByText("Backcountry Skiing")).toBeInTheDocument();
      expect(within(myKit).getByText("Day 1 of a 3-day plan")).toBeInTheDocument();
      expect(within(myKit).getByText("Layers for 9am to 9pm, local time.")).toBeInTheDocument();
      expect(within(myKit).getByText(/from a 3-day plan in Gear up\. It stays as saved when the forecast changes\./)).toBeInTheDocument();
      expect(within(myKit).getByText("General guide for each day's conditions: multi-day plans aren't personalized yet.")).toBeInTheDocument();
      const day = within(myKit).getByRole("article", { name: "Sat, Oct 10" });
      expect(within(day).getByText("Upper body").nextElementSibling).toHaveTextContent("Merino crew, Fleece, Ski shell");
      expect(within(day).getByText("Warm gloves and head insulation")).toBeInTheDocument();
      expect(within(day).getByText("Ski shell", { selector: "span" })).toBeInTheDocument();
      expect(screen.getByText("Outfit saved · General guide · 6 items")).toBeInTheDocument();

      expect(within(myKit).getByText(/Saving it to this trip shows what changes on each day/)).toBeInTheDocument();
      await userEvent.click(within(myKit).getByRole("button", { name: "Update in Gear up" }));
      const draft = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.GEAR_UP_DRAFT)!)["user-1"];
      expect(draft).toMatchObject({ lastOuting: savedPlan().outing, durationDays: 3 });
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

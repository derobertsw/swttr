import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOCATION_TIMEOUT_MS } from "@/hooks/useDeviceLocation";
import Home from "./page";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// Mock Clerk components — default to a signed-in user
const SIGNED_IN = { userId: "test-user-id" as string | null, isLoaded: true, isSignedIn: true };
const mockUseAuth = vi.fn(() => SIGNED_IN);
vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button">UserButton</div>,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuth(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

type MockResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
const respond = (status: number, body: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

const STOWE = {
  id: 1,
  name: "Stowe",
  region: "Vermont",
  country: "United States",
  latitude: 44.47,
  longitude: -72.69,
};

/** Searches for Stowe in the place field labeled `field`, and picks it. */
async function chooseStowe(user: ReturnType<typeof userEvent.setup>, field: RegExp = /location/i) {
  await user.type(screen.getByRole("combobox", { name: field }), "Stowe");
  await user.click(await screen.findByRole("option", { name: /Stowe/ }));
}

/**
 * Geolocation that answers only when the test says so, like a permission
 * prompt nobody has answered yet. `answer` and `fail` reply to the latest request.
 */
function mockGeolocation() {
  const requests: { success: PositionCallback; error: PositionErrorCallback }[] = [];
  const getCurrentPosition = vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
    requests.push({ success, error });
  });
  Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, writable: true });
  return {
    getCurrentPosition,
    answer: (latitude: number, longitude: number) =>
      act(async () => requests.at(-1)?.success({ coords: { latitude, longitude } } as GeolocationPosition)),
    /** Codes: 1 denied, 2 unavailable, 3 timed out. */
    fail: (code: number) => act(async () => requests.at(-1)?.error({ code } as GeolocationPositionError)),
  };
}

/** Lets a held response arrive, and whatever it triggers finish. */
async function answer(finish: () => void) {
  await act(async () => {
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("Home Page", () => {
  let originalGeolocation: Geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(SIGNED_IN);
    originalGeolocation = navigator.geolocation;
    localStorageMock.getItem.mockReturnValue(null);
    // Reset search params
    mockSearchParams.delete("mode");
    mockSearchParams.delete("gearUp");
    mockSearchParams.delete("geoDenied");

    // Default mock for item mappings and preferences APIs
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/wardrobe/items")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mappings: [] }),
        });
      }
      if (url.includes("/api/preferences")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ temperatureSensitivity: "neutral" }),
        });
      }
      // Default response for other endpoints
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      writable: true,
    });
  });

  describe("initial rendering", () => {
    it("should render activity selector carousel", async () => {
      render(<Home />);
      expect(await screen.findByRole("region")).toHaveAttribute(
        "aria-roledescription",
        "carousel"
      );
    });

    it("should render Gear Up button", () => {
      render(<Home />);
      expect(screen.getByRole("button", { name: /gear up/i })).toBeInTheDocument();
    });

    it("should NOT render weather sliders initially", () => {
      render(<Home />);
      expect(screen.queryByText(/temperature:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/wind speed:/i)).not.toBeInTheDocument();
    });
  });

  describe("choosing where", () => {
    const placeField = () => screen.getByRole("combobox", { name: /where are you/i });
    const gearUpButton = () => screen.getByRole("button", { name: /gear up/i });
    const useMyLocationButton = () => screen.getByRole("button", { name: "Use my location" });

    /** Geocoding finds Stowe; weather requests get `weather`. Returns the weather requests made. */
    function mockOutingApis(
      weather: () => MockResponse | Promise<MockResponse> = () => respond(200, { temperature: 32, windSpeed: 15 })
    ) {
      const weatherRequests: string[] = [];
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/geocode")) return Promise.resolve(respond(200, { results: [STOWE] }));
        if (url.includes("/api/weather")) {
          weatherRequests.push(url);
          return Promise.resolve(weather());
        }
        if (url.includes("/api/wardrobe/items")) return Promise.resolve(respond(200, { mappings: [] }));
        if (url.includes("/api/preferences")) {
          return Promise.resolve(respond(200, { temperatureSensitivity: "neutral" }));
        }
        return Promise.resolve(respond(200, {}));
      });
      return weatherRequests;
    }

    it("shows the place search from the start, and asks for a place instead of locating", async () => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      expect(placeField()).toBeEnabled();
      await user.click(gearUpButton());

      expect(placeField()).toHaveFocus();
      expect(placeField()).toBeInvalid();
      expect(placeField()).toHaveAccessibleDescription("Search for a place, or use your location.");
      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(weatherRequests).toEqual([]);
    });

    it("gets current conditions at a place picked by hand", async () => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis(() => respond(200, { temperature: 30, windSpeed: 7, isForecast: false }));
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user, /where are you/i);
      await user.click(gearUpButton());

      expect(await screen.findByText("Current conditions")).toBeInTheDocument();
      expect(screen.getByText("Stowe, Vermont, United States")).toBeInTheDocument();
      expect(screen.getByText(/wind 7 mph/i)).toBeInTheDocument();
      expect(weatherRequests).toEqual(["/api/weather?lat=44.47&lon=-72.69"]);
      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    });

    it("gets current conditions at the device's location once Use my location finds it", async () => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());
      expect(screen.getByText("Finding your location…")).toBeInTheDocument();
      expect(gearUpButton()).toBeDisabled();

      await geolocation.answer(40.7128, -74.006);
      expect(placeField()).toHaveValue("Your location");
      await user.click(gearUpButton());

      expect(await screen.findByText("Current conditions")).toBeInTheDocument();
      expect(screen.getByText("Your location")).toBeInTheDocument();
      expect(screen.getByText(/wind 15 mph/i)).toBeInTheDocument();
      expect(weatherRequests).toEqual(["/api/weather?lat=40.7128&lon=-74.006"]);
      expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    it("says why when the weather for the device's location fails, and keeps the place", async () => {
      const { toast } = await import("sonner");
      const geolocation = mockGeolocation();
      mockOutingApis(() => respond(502, { error: "Bad gateway" }));
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());
      await geolocation.answer(40.7128, -74.006);
      await user.click(gearUpButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not get weather for this location."));
      expect(placeField()).toHaveValue("Your location");
      expect(gearUpButton()).toBeEnabled();
    });

    it.each([
      {
        failure: "is denied",
        code: 1,
        message: "Location access is off for this site. Search for a place, or allow location access and try again.",
      },
      { failure: "times out", code: 3, message: "Finding your location took too long. Try again, or search for a place." },
      { failure: "is unavailable", code: 2, message: "Your location isn't available. Try again, or search for a place." },
    ])("says so when the location $failure, and the search still works from the keyboard", async ({ code, message }) => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());
      await geolocation.fail(code);

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(placeField()).toHaveValue("");
      await user.type(placeField(), "Stowe");
      await screen.findByRole("option", { name: /Stowe/ });
      await user.keyboard("{ArrowDown}{Enter}");
      expect(placeField()).toHaveValue("Stowe, Vermont, United States");
      expect(screen.queryByText(message)).not.toBeInTheDocument();

      await user.click(gearUpButton());
      expect(await screen.findByText("Current conditions")).toBeInTheDocument();
      expect(weatherRequests).toEqual(["/api/weather?lat=44.47&lon=-72.69"]);
    });

    it("says the location isn't available when the browser can't share it", async () => {
      Object.defineProperty(navigator, "geolocation", { value: undefined, writable: true });
      mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());

      expect(
        await screen.findByText("Your location isn't available. Try again, or search for a place.")
      ).toBeInTheDocument();
      expect(placeField()).toBeEnabled();
    });

    it("stops waiting for a location nobody answers for", async () => {
      // Like a permission prompt left open, which the Geolocation API's own timeout doesn't cover.
      mockGeolocation();
      mockOutingApis();
      render(<Home />);
      await screen.findByRole("region");

      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        fireEvent.click(useMyLocationButton());
        await act(() => vi.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS - 1));
        expect(screen.getByText("Finding your location…")).toBeInTheDocument();

        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(
          screen.getByText("Finding your location took too long. Try again, or search for a place.")
        ).toBeInTheDocument();
        expect(gearUpButton()).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps a place picked while the location is still being found", async () => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());
      await chooseStowe(user, /where are you/i);
      expect(screen.queryByText("Finding your location…")).not.toBeInTheDocument();

      // The device's location arrives late.
      await geolocation.answer(40.7128, -74.006);
      expect(placeField()).toHaveValue("Stowe, Vermont, United States");

      await user.click(gearUpButton());
      expect(await screen.findByText("Current conditions")).toBeInTheDocument();
      expect(weatherRequests).toEqual(["/api/weather?lat=44.47&lon=-72.69"]);
    });

    it("stops finding the location on Cancel, and ignores it if it arrives later", async () => {
      const geolocation = mockGeolocation();
      mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Finding your location…")).not.toBeInTheDocument();
      expect(useMyLocationButton()).toHaveFocus();
      expect(gearUpButton()).toBeEnabled();

      await geolocation.answer(40.7128, -74.006);
      expect(placeField()).toHaveValue("");
    });

    it("asks for the location again only from Use my location", async () => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(useMyLocationButton());
      await geolocation.fail(1);
      await user.click(gearUpButton());

      expect(placeField()).toHaveFocus();
      expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);

      await user.click(useMyLocationButton());
      await geolocation.answer(40.7128, -74.006);

      expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
      expect(placeField()).toHaveValue("Your location");
      expect(placeField()).toBeValid();
      expect(weatherRequests).toEqual([]);
    });

    it("opens on the place search from the iOS shell's Gear Up link, without locating", async () => {
      mockSearchParams.set("gearUp", "1");
      const geolocation = mockGeolocation();
      mockOutingApis();
      render(<Home />);

      expect(await screen.findByRole("combobox", { name: /where are you/i })).toBeEnabled();
      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    });

    it("asks for a place when the iOS shell's Gear Up action has none", async () => {
      const geolocation = mockGeolocation();
      const weatherRequests = mockOutingApis();
      render(<Home />);
      await screen.findByRole("region");

      act(() => {
        window.dispatchEvent(new CustomEvent("gearUp"));
      });

      expect(placeField()).toBeInvalid();
      expect(placeField()).toHaveFocus();
      expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
      expect(weatherRequests).toEqual([]);
    });

    it("drops a request still running when the iOS shell's Plan tab switches to the plan", async () => {
      let finishWeather: (() => void) | undefined;
      mockOutingApis(
        () =>
          new Promise((resolve) => {
            finishWeather = () => resolve(respond(200, { temperature: 30, windSpeed: 7, isForecast: false }));
          })
      );
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user, /where are you/i);
      await user.click(gearUpButton());
      expect(finishWeather).toBeDefined();
      act(() => {
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
      });
      await answer(finishWeather!);

      expect(screen.queryByText("Current conditions")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Build layer plan" })).toBeEnabled();
    });
  });

  describe("results without personalized layers", () => {
    const RUNNING_RECOMMENDATION = {
      ireq: { target_range: [0.4, 0.8] },
      recommendation: {
        garments: [
          { id: "tights", name: "Running tights", category: "base_layer", rcl: 0.3, covers_torso: false, covers_legs: true },
        ],
        ensemble_properties: {
          total_clo: 0.3,
          regional_clo: { torso: 0, arms: 0, legs: 0.3 },
          evap_potential: 0.5,
          permeability_index: 0.4,
        },
        score: 80,
        component_scores: {},
      },
      warnings: [],
      guidance: [],
    };

    /** Located at 32°F with 15 mph wind; recommendation requests get the given response. */
    function mockOuting(recommendationResponse: (url: string) => MockResponse) {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: vi.fn((success) => {
            success({ coords: { latitude: 44.47, longitude: -72.69 } });
          }),
        },
        writable: true,
      });
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/api/weather")) {
          return Promise.resolve(respond(200, { temperature: 32, windSpeed: 15 }));
        }
        if (url.includes("/api/v1/recommendations/")) {
          return Promise.resolve(recommendationResponse(url));
        }
        if (url.includes("/api/wardrobe/items")) {
          return Promise.resolve(respond(200, { mappings: [] }));
        }
        if (url.includes("/api/preferences")) {
          return Promise.resolve(respond(200, { temperatureSensitivity: "neutral" }));
        }
        return Promise.resolve(respond(200, {}));
      });
    }

    /** Uses the device's location, which mockOuting gives at once, and presses Gear Up. */
    async function gearUpHere(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "Use my location" }));
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: /where are you/i })).toHaveValue("Your location")
      );
      await user.click(screen.getByRole("button", { name: /gear up/i }));
    }

    async function switchActivity(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
      await user.click(screen.getByRole("button", { name: from }));
      await user.click(await screen.findByRole("button", { name: to }));
    }

    it("keeps a guest's outing and asks them to sign in after switching Alpine to Running", async () => {
      mockUseAuth.mockReturnValue({ userId: null, isLoaded: true, isSignedIn: false });
      mockOuting(() => respond(401, { error: "Authentication required" }));

      const user = userEvent.setup();
      render(<Home />);
      await gearUpHere(user);

      // Alpine has static layers, shown as general guidance.
      expect(await screen.findByRole("heading", { name: "General guidance" })).toBeInTheDocument();

      await switchActivity(user, "Alpine", "Running");

      const notice = await screen.findByRole("region", { name: "Sign in for Running layers" });
      expect(within(notice).getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
      expect(screen.getByText(/wind 15 mph/i)).toBeInTheDocument();
      expect(screen.getByText("Current conditions")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Running" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Change weather location, date, or time" })).toBeInTheDocument();
    });

    it("retries a failed request for the same outing", async () => {
      let runningRequests = 0;
      mockOuting((url) => {
        if (!url.endsWith("/running")) return respond(500, { error: "Unavailable" });
        runningRequests += 1;
        return runningRequests === 1
          ? respond(500, { error: "Unavailable" })
          : respond(200, RUNNING_RECOMMENDATION);
      });

      const user = userEvent.setup();
      render(<Home />);
      await gearUpHere(user);
      expect(await screen.findByText(/personalized layers couldn't load/i)).toBeInTheDocument();

      await switchActivity(user, "Alpine", "Running");
      const notice = await screen.findByRole("region", { name: "Couldn't load Running layers" });

      await user.click(within(notice).getByRole("button", { name: "Try again" }));

      expect((await screen.findAllByText("Running tights")).length).toBeGreaterThan(0);
      expect(screen.queryByRole("region", { name: "Couldn't load Running layers" })).not.toBeInTheDocument();
      expect(screen.getByText(/wind 15 mph/i)).toBeInTheDocument();
      expect(runningRequests).toBe(2);
    });
  });

  describe("Plan ahead mode via URL param", () => {
    it("should show plan ahead form when mode=planAhead in URL", () => {
      mockSearchParams.set("mode", "planAhead");
      render(<Home />);

      expect(screen.getByPlaceholderText(/search for a city/i)).toBeInTheDocument();
    });

    it("should show date picker in plan ahead mode", () => {
      mockSearchParams.set("mode", "planAhead");
      render(<Home />);

      expect(screen.getByRole("button", { name: /pick start date/i })).toBeInTheDocument();
    });

    it("should show time input in plan ahead mode", () => {
      mockSearchParams.set("mode", "planAhead");
      render(<Home />);

      expect(screen.getByDisplayValue("12:00")).toBeInTheDocument();
    });
  });

  describe("submitting a plan", () => {
    /** The start date chooseStartDate picks, a week after the pinned today. */
    const START_DATE = "2026-10-08";
    const PLAN = {
      startDate: START_DATE,
      endDate: "2026-10-10",
      durationDays: 3,
      dayStartHour: 6,
      dayEndHour: 21,
      days: [],
    };
    /** /api/weather's forecast for noon in Stowe on the start date. */
    const NOON_FORECAST = {
      temperature: 28,
      windSpeed: 12,
      isForecast: true,
      forecastTime: `${START_DATE}T12:00-04:00`,
      timeZone: "America/New_York",
    };

    /**
     * Plan-ahead requests succeed (the noon forecast: 28°F, wind 12 mph) unless `weather` or
     * `recommendations` say otherwise. Returns the requests made, and a geolocation spy that
     * only Go Now uses.
     */
    function mockPlanAheadApis({ weather, recommendations, planAhead }: {
      weather?: () => Promise<MockResponse>;
      recommendations?: (url: string) => Promise<MockResponse>;
      planAhead?: () => Promise<MockResponse>;
    } = {}) {
      const requests = { weather: [] as string[], planAhead: [] as unknown[] };
      const getCurrentPosition = vi.fn();
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition },
        writable: true,
      });
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes("/api/geocode")) {
          return Promise.resolve(respond(200, { results: [STOWE] }));
        }
        if (url.includes("/api/weather")) {
          requests.weather.push(url);
          return weather?.() ?? Promise.resolve(respond(200, NOON_FORECAST));
        }
        if (url.includes("/api/v1/recommendations/") && recommendations) {
          return recommendations(url);
        }
        if (url.includes("/api/plan-ahead")) {
          requests.planAhead.push(JSON.parse(String(init?.body)));
          if (planAhead) return planAhead();
          return Promise.resolve(respond(200, {
            plan: PLAN,
            baseline: { recommendation: null, effectiveTemperature: 28, maxWindSpeed: 12 },
          }));
        }
        if (url.includes("/api/wardrobe/items")) {
          return Promise.resolve(respond(200, { mappings: [] }));
        }
        if (url.includes("/api/preferences")) {
          return Promise.resolve(respond(200, { temperatureSensitivity: "neutral" }));
        }
        return Promise.resolve(respond(200, {}));
      });
      return { requests, getCurrentPosition };
    }

    async function chooseStartDate(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: /pick start date/i }));
      await user.click(screen.getByRole("button", { name: /October 8th/ }));
    }

    beforeEach(() => {
      mockSearchParams.set("mode", "planAhead");
      // Today is Thursday, October 1, 2026, in New York.
      vi.setSystemTime(new Date("2026-10-01T16:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it("gets layers for a one-day plan from the forecast for its start time", async () => {
      const { requests, getCurrentPosition } = mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "See my layers" }));

      expect(await screen.findByText("Forecast · Thu, Oct 8, 12:00 PM EDT")).toBeInTheDocument();
      expect(screen.getByText("Stowe, Vermont, United States")).toBeInTheDocument();
      expect(screen.getByText(/wind 12 mph/i)).toBeInTheDocument();
      expect(requests.weather).toEqual([`/api/weather?lat=44.47&lon=-72.69&datetime=${START_DATE}T12:00`]);
      expect(requests.planAhead).toEqual([]);
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("reads the start time on the place's clock, wherever the device is", async () => {
      // The device is in Tokyo, where it's already October 2.
      vi.stubEnv("TZ", "Asia/Tokyo");
      const { requests } = mockPlanAheadApis({
        weather: () =>
          Promise.resolve(respond(200, { ...NOON_FORECAST, forecastTime: `${START_DATE}T07:00-04:00` })),
      });
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "07:30" } });
      await user.click(screen.getByRole("button", { name: "See my layers" }));

      expect(await screen.findByText("Forecast · Thu, Oct 8, 7:00 AM EDT")).toBeInTheDocument();
      expect(requests.weather).toEqual([`/api/weather?lat=44.47&lon=-72.69&datetime=${START_DATE}T07:30`]);
    });

    it.each([
      {
        failure: "a date the forecast doesn't cover",
        response: respond(422, { error: "The forecast for this place covers Oct 1 to Oct 16. Pick a date in that range." }),
        message: "The forecast for this place covers Oct 1 to Oct 16. Pick a date in that range.",
      },
      {
        failure: "a forecast service failure",
        response: respond(500, { error: "Failed to fetch weather data" }),
        message: "Couldn't get the forecast for this place. Try again.",
      },
    ])("explains $failure and keeps the plan, without using current weather", async ({ response, message }) => {
      const { toast } = await import("sonner");
      const { requests, getCurrentPosition } = mockPlanAheadApis({ weather: () => Promise.resolve(response) });
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "See my layers" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
      expect(await screen.findByRole("button", { name: "See my layers" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).toBeInTheDocument();
      expect(screen.getByLabelText("Start time")).toHaveValue("12:00");
      expect(screen.queryByText(/wind/i)).not.toBeInTheDocument();
      expect(requests.weather).toEqual([`/api/weather?lat=44.47&lon=-72.69&datetime=${START_DATE}T12:00`]);
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("changes the place and time from the results, keeping the drawer open when that fails", async () => {
      const { toast } = await import("sonner");
      const weatherResponses = [
        respond(200, NOON_FORECAST),
        respond(422, { error: "The forecast for this place covers Oct 1 to Oct 16. Pick a date in that range." }),
        respond(200, { ...NOON_FORECAST, windSpeed: 20, forecastTime: "2026-10-02T09:00-04:00" }),
      ];
      const { requests } = mockPlanAheadApis({ weather: () => Promise.resolve(weatherResponses.shift()!) });
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "See my layers" }));
      await user.click(await screen.findByRole("button", { name: "Change weather location, date, or time" }));

      // The drawer's drag handling reads CSS transforms, which jsdom lacks, so
      // it's driven with plain click events instead of pointer events.
      const drawer = await screen.findByRole("dialog", { name: "Update Weather" });
      fireEvent.change(within(drawer).getByRole("combobox", { name: "Location" }), { target: { value: "Stowe" } });
      fireEvent.click(await within(drawer).findByRole("option", { name: /Stowe/ }));
      fireEvent.click(within(drawer).getByRole("button", { name: "Pick date & time" }));
      fireEvent.click(within(drawer).getByRole("button", { name: "Tomorrow" }));
      fireEvent.change(within(drawer).getByLabelText("Time"), { target: { value: "09:15" } });
      fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("The forecast for this place covers Oct 1 to Oct 16. Pick a date in that range.")
      );
      expect(drawer).toHaveAttribute("data-state", "open");
      expect(within(drawer).getByLabelText("Time")).toHaveValue("09:15");
      expect(screen.getByText("Forecast · Thu, Oct 8, 12:00 PM EDT")).toBeInTheDocument();

      fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));

      expect(await screen.findByText("Forecast · Fri, Oct 2, 9:00 AM EDT")).toBeInTheDocument();
      expect(screen.getByText(/wind 20 mph/i)).toBeInTheDocument();
      // jsdom never finishes the closing animation, so the closed drawer stays in the page.
      await waitFor(() => expect(drawer).toHaveAttribute("data-state", "closed"));
      expect(requests.weather.slice(1)).toEqual([
        "/api/weather?lat=44.47&lon=-72.69&datetime=2026-10-02T09:15",
        "/api/weather?lat=44.47&lon=-72.69&datetime=2026-10-02T09:15",
      ]);
    });

    it("builds a multi-day plan with Build layer plan", async () => {
      const { requests, getCurrentPosition } = mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      expect(await screen.findByRole("heading", { name: "Multi-Day Layer Plan" })).toBeInTheDocument();
      expect(requests.planAhead).toEqual([
        expect.objectContaining({
          lat: 44.47,
          lon: -72.69,
          startDate: START_DATE,
          durationDays: 3,
          startHour: 12,
        }),
      ]);
      expect(requests.weather).toEqual([]);
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("builds a multi-day plan for a signed-out visitor", async () => {
      // /api/plan-ahead is public (see src/proxy.test.ts), so a guest gets the same plan.
      mockUseAuth.mockReturnValue({ userId: null, isLoaded: true, isSignedIn: false });
      const { toast } = await import("sonner");
      const { requests } = mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      expect(await screen.findByRole("heading", { name: "Multi-Day Layer Plan" })).toBeInTheDocument();
      expect(requests.planAhead).toEqual([
        expect.objectContaining({ lat: 44.47, lon: -72.69, startDate: START_DATE, durationDays: 3 }),
      ]);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("shows why the forecast can't cover the dates on the start date, until it's changed", async () => {
      const { toast } = await import("sonner");
      const rangeError = "The forecast for this place covers Oct 1 to Oct 16. A 7-day plan can start from Oct 1 to Oct 10.";
      const responses = [
        respond(422, { error: rangeError, field: "startDate" }),
        respond(200, { plan: PLAN, baseline: { recommendation: null, effectiveTemperature: 28, maxWindSpeed: 12 } }),
      ];
      const { requests } = mockPlanAheadApis({ planAhead: () => Promise.resolve(responses.shift()!) });
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "7d" }));
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      const dateButton = await screen.findByRole("button", { name: "Oct 8, 2026" });
      await waitFor(() => expect(dateButton).toHaveFocus());
      expect(dateButton).toBeInvalid();
      expect(dateButton).toHaveAccessibleDescription(rangeError);
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Build layer plan" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByText("7 days")).toBeInTheDocument();

      // Another place's forecast may cover the dates, so the error goes with the place.
      const place = screen.getByRole("combobox", { name: /location/i });
      await user.clear(place);
      expect(screen.queryByText(rangeError)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).toBeValid();
      // Picking the same place again brings it back, since its forecast hasn't changed.
      await chooseStowe(user);
      expect(screen.getByText(rangeError)).toBeInTheDocument();

      // A shorter plan fits, so the error goes.
      await user.click(screen.getByRole("button", { name: "5d" }));
      expect(screen.queryByText(rangeError)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      expect(await screen.findByRole("heading", { name: "Multi-Day Layer Plan" })).toBeInTheDocument();
      expect(requests.planAhead).toEqual([
        expect.objectContaining({ startDate: START_DATE, durationDays: 7 }),
        expect.objectContaining({ startDate: START_DATE, durationDays: 5 }),
      ]);
    });

    it.each([
      {
        failure: "a window with no daytime forecast",
        response: respond(422, { error: "The forecast has no daytime hours (6am to 9pm) for this plan. Pick an earlier start time or another date." }),
        message: "The forecast has no daytime hours (6am to 9pm) for this plan. Pick an earlier start time or another date.",
      },
      {
        failure: "a forecast service failure",
        response: respond(502, { error: "Failed to fetch weather data" }),
        message: "Couldn't get the forecast for this place. Try again.",
      },
    ])("explains $failure for a multi-day plan and keeps every input", async ({ response, message }) => {
      const { toast } = await import("sonner");
      mockPlanAheadApis({ planAhead: () => Promise.resolve(response) });
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
      expect(await screen.findByRole("button", { name: "Build layer plan" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).not.toHaveAccessibleDescription();
      expect(screen.getByLabelText("Start time")).toHaveValue("12:00");
      expect(screen.getByText("3 days")).toBeInTheDocument();
    });

    it("shows inline errors, focuses the first field to fix, and keeps what was entered", async () => {
      const { requests } = mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      const location = screen.getByRole("combobox", { name: /location/i });
      expect(location).toHaveFocus();
      expect(location).toBeInvalid();
      expect(location).toHaveAccessibleDescription("Search for a place, then choose it from the list.");
      expect(screen.getByText("Choose a start date.")).toBeInTheDocument();

      await chooseStowe(user);
      expect(location).toBeValid();
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      const dateButton = screen.getByRole("button", { name: /pick start date/i });
      expect(dateButton).toHaveFocus();
      expect(dateButton).toHaveAccessibleDescription("Choose a start date.");

      await chooseStartDate(user);
      const time = screen.getByLabelText("Start time");
      await user.clear(time);
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));

      expect(time).toHaveFocus();
      expect(time).toHaveAccessibleDescription("Enter a start time.");
      expect(screen.queryByText("Choose a start date.")).not.toBeInTheDocument();
      expect(location).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: /multi day/i })).toBeInTheDocument();
      expect(screen.getByText("3 days")).toBeInTheDocument();
      expect(requests.planAhead).toEqual([]);
    });

    it("names the request while it loads and ignores repeat submissions", async () => {
      let finishWeather = () => {};
      const { requests } = mockPlanAheadApis({
        weather: () =>
          new Promise((resolve) => {
            finishWeather = () => resolve(respond(200, NOON_FORECAST));
          }),
      });
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "See my layers" }));

      const pending = await screen.findByRole("button", { name: "Getting your layers…" });
      expect(pending).toBeDisabled();
      expect(screen.getByRole("button", { name: /go now/i })).toBeDisabled();

      await user.click(pending);
      // The iOS shell's Gear Up action submits the same plan.
      act(() => {
        window.dispatchEvent(new CustomEvent("gearUp"));
      });
      expect(requests.weather).toHaveLength(1);

      finishWeather();
      expect(await screen.findByText(/wind 12 mph/i)).toBeInTheDocument();
      expect(requests.weather).toHaveLength(1);
    });

    it("doesn't label a Go Now request as building the plan, and lets it be cancelled", async () => {
      // Geolocation never answers, so Go Now stays in flight.
      const { getCurrentPosition } = mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /go now/i }));

      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Finding your location…")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Build layer plan" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Building layer plan…" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Finding your location…")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Build layer plan" })).toBeEnabled();
      expect(screen.getByRole("button", { name: /go now/i })).toHaveFocus();
    });

    it("gets current conditions at the device's location with Go Now", async () => {
      const { requests } = mockPlanAheadApis({
        weather: () => Promise.resolve(respond(200, { temperature: 30, windSpeed: 7, isForecast: false })),
      });
      const geolocation = mockGeolocation();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /go now/i }));
      await geolocation.answer(40.7128, -74.006);

      expect(await screen.findByText("Current conditions")).toBeInTheDocument();
      expect(screen.getByText("Your location")).toBeInTheDocument();
      expect(requests.weather).toEqual(["/api/weather?lat=40.7128&lon=-74.006"]);
    });

    it("says why Go Now couldn't find the location, and keeps the plan", async () => {
      const { requests } = mockPlanAheadApis();
      const geolocation = mockGeolocation();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "07:30" } });
      await user.click(screen.getByRole("button", { name: /go now/i }));
      await geolocation.fail(1);

      expect(
        screen.getByText("Location access is off for this site. Search for a place, or allow location access and try again.")
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).toBeInTheDocument();
      expect(screen.getByLabelText("Start time")).toHaveValue("07:30");
      expect(screen.getByRole("button", { name: "See my layers" })).toBeEnabled();
      expect(requests.weather).toEqual([]);
    });

    it("stops Go Now when a place is picked for the plan, and ignores a location that arrives later", async () => {
      const { requests } = mockPlanAheadApis();
      const geolocation = mockGeolocation();
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /go now/i }));
      await chooseStowe(user);

      expect(screen.queryByText("Finding your location…")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Build layer plan" })).toBeEnabled();

      await geolocation.answer(40.7128, -74.006);

      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.queryByText("Current conditions")).not.toBeInTheDocument();
      expect(requests.weather).toEqual([]);
    });

    it("keeps the submit action in the iOS shell, which hides the web tab bar", async () => {
      const userAgent = vi
        .spyOn(window.navigator, "userAgent", "get")
        .mockReturnValue("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 SWTTRNativeTabs");
      try {
        const { requests } = mockPlanAheadApis();
        const user = userEvent.setup();
        render(<Home />);

        await user.click(screen.getByRole("button", { name: /single day/i }));
        await chooseStowe(user);
        fireEvent.change(screen.getByLabelText("Start date"), { target: { value: START_DATE } });
        await user.click(screen.getByRole("button", { name: "See my layers" }));

        expect(await screen.findByText(/wind 12 mph/i)).toBeInTheDocument();
        expect(requests.weather).toHaveLength(1);
      } finally {
        userAgent.mockRestore();
      }
    });

    /** Gets a one-day plan's layers for Stowe on the start date at 07:30. */
    async function seeOneDayLayers(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "07:30" } });
      await user.click(screen.getByRole("button", { name: "See my layers" }));
      expect(await screen.findByText(/wind 12 mph/i)).toBeInTheDocument();
    }

    it("goes Back from a one-day plan's layers to the plan, keeping what was entered", async () => {
      const { requests } = mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await seeOneDayLayers(user);
      await user.click(screen.getByRole("button", { name: "Back" }));

      expect(screen.queryByText(/wind 12 mph/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Gear Up" })).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).toBeInTheDocument();
      expect(screen.getByLabelText("Start time")).toHaveValue("07:30");

      await user.click(screen.getByRole("button", { name: "See my layers" }));

      expect(await screen.findByText(/wind 12 mph/i)).toBeInTheDocument();
      expect(requests.weather).toEqual([
        `/api/weather?lat=44.47&lon=-72.69&datetime=${START_DATE}T07:30`,
        `/api/weather?lat=44.47&lon=-72.69&datetime=${START_DATE}T07:30`,
      ]);
    });

    it("plans another trip from a multi-day plan, starting from the last one", async () => {
      mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "Increase duration" }));
      await user.click(screen.getByRole("button", { name: "Build layer plan" }));
      await user.click(await screen.findByRole("button", { name: "Plan Another Trip" }));

      expect(screen.queryByRole("heading", { name: "Multi-Day Layer Plan" })).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).toBeInTheDocument();
      expect(screen.getByText("4 days")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Build layer plan" })).toBeEnabled();
    });

    it("returns to the plan when the iOS shell's Plan tab is tapped again", async () => {
      mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await seeOneDayLayers(user);
      act(() => {
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
      });

      expect(screen.queryByText(/wind 12 mph/i)).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "Oct 8, 2026" })).toBeInTheDocument();
      expect(screen.getByLabelText("Start time")).toHaveValue("07:30");
    });

    it("starts over in Now mode from the logo, until the iOS shell's Plan tab is tapped again", async () => {
      mockPlanAheadApis();
      const user = userEvent.setup();
      render(<Home />);

      await seeOneDayLayers(user);
      await user.click(screen.getByRole("link", { name: "SWTTR" }));

      expect(screen.getByRole("button", { name: "Gear Up" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /where are you/i })).toHaveValue("");

      act(() => {
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
      });

      expect(screen.queryByRole("button", { name: "Gear Up" })).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("");
      expect(screen.getByRole("button", { name: /pick start date/i })).toBeInTheDocument();
    });

    it.each([
      {
        way: "Back",
        leave: (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Back" })),
        form: "See my layers",
      },
      {
        way: "the logo",
        leave: (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("link", { name: "SWTTR" })),
        form: "Gear Up",
      },
    ])("drops a layers refresh still running when $way leaves the results", async ({ leave, form }) => {
      let finishRefresh: (() => void) | undefined;
      mockPlanAheadApis({
        recommendations: (url) =>
          url.endsWith("/running")
            ? new Promise((resolve) => {
                finishRefresh = () => resolve(respond(500, { error: "Unavailable" }));
              })
            : Promise.resolve(respond(500, { error: "Unavailable" })),
      });
      const user = userEvent.setup();
      render(<Home />);

      await seeOneDayLayers(user);
      await user.click(screen.getByRole("button", { name: "Alpine" }));
      await user.click(await screen.findByRole("button", { name: "Running" }));
      expect(finishRefresh).toBeDefined();
      await leave(user);
      await answer(finishRefresh!);

      expect(screen.queryByText(/wind 12 mph/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: form })).toBeEnabled();
    });

    it("drops a weather change still running when the iOS shell's Plan tab is tapped", async () => {
      let finishChange: (() => void) | undefined;
      const weatherResponses = [
        () => Promise.resolve(respond(200, NOON_FORECAST)),
        () =>
          new Promise<MockResponse>((resolve) => {
            finishChange = () => resolve(respond(200, { temperature: 30, windSpeed: 20, isForecast: false }));
          }),
      ];
      mockPlanAheadApis({ weather: () => weatherResponses.shift()!() });
      const user = userEvent.setup();
      render(<Home />);

      await seeOneDayLayers(user);
      await user.click(screen.getByRole("button", { name: "Change weather location, date, or time" }));
      // Plain click events, as in the drawer test above: jsdom lacks the CSS transforms its drag handling reads.
      const drawer = await screen.findByRole("dialog", { name: "Update Weather" });
      fireEvent.change(within(drawer).getByRole("combobox", { name: "Location" }), { target: { value: "Stowe" } });
      fireEvent.click(await within(drawer).findByRole("option", { name: /Stowe/ }));
      fireEvent.click(within(drawer).getByRole("button", { name: "Apply Weather" }));
      expect(finishChange).toBeDefined();
      act(() => {
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
      });
      await answer(finishChange!);

      expect(screen.queryByText(/wind 20 mph/i)).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /location/i })).toHaveValue("Stowe, Vermont, United States");
      expect(screen.getByRole("button", { name: "See my layers" })).toBeEnabled();
    });

    it("keeps a request made from the plan form when the iOS shell's Plan tab is tapped", async () => {
      let finishWeather = () => {};
      mockPlanAheadApis({
        weather: () =>
          new Promise((resolve) => {
            finishWeather = () => resolve(respond(200, NOON_FORECAST));
          }),
      });
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /single day/i }));
      await chooseStowe(user);
      await chooseStartDate(user);
      await user.click(screen.getByRole("button", { name: "See my layers" }));
      act(() => {
        window.dispatchEvent(new CustomEvent("navigatePlanAhead"));
      });

      expect(screen.getByRole("button", { name: "Getting your layers…" })).toBeDisabled();
      await answer(finishWeather);
      expect(await screen.findByText(/wind 12 mph/i)).toBeInTheDocument();
    });
  });
});

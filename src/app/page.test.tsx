import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  describe("Gear Up button - weather fetch success", () => {
    it("should show results when weather fetch succeeds", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success({ coords: { latitude: 40.7128, longitude: -74.006 } });
        }),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

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
        if (url.includes("/api/weather")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ temperature: 32, windSpeed: 15 }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByText(/wind 15 mph/i)).toBeInTheDocument();
      });
    });
  });

  describe("Gear Up button - weather fetch failure", () => {
    it("should show location input when geolocation is not supported", async () => {
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search for a city/i)).toBeInTheDocument();
      });
    });

    it("should show error toast when weather fetch fails", async () => {
      const { toast } = await import("sonner");

      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Could not get current weather. Please enter your location manually."
        );
      });
    });

    it("should show location input when geolocation permission denied", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({ code: 1, PERMISSION_DENIED: 1 });
        }),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search for a city/i)).toBeInTheDocument();
      });
    });

    it("should show location input when geoDenied query is set", async () => {
      mockSearchParams.set("gearUp", "1");
      mockSearchParams.set("geoDenied", "1");

      render(<Home />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search for a city/i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/temperature:/i)).not.toBeInTheDocument();
    });

    it("should show location input when API returns error", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success({ coords: { latitude: 40.7128, longitude: -74.006 } });
        }),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

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
        if (url.includes("/api/weather")) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search for a city/i)).toBeInTheDocument();
      });
    });
  });

  describe("manual location mode", () => {
    it("should retry current-location fetch when Gear Up is clicked again", async () => {
      const { toast } = await import("sonner");

      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<Home />);

      // First click shows location input fallback
      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search for a city/i)).toBeInTheDocument();
      });

      // Second click without selecting location should prompt user
      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Could not get current weather. Please enter your location manually."
        );
      });
    });
  });

  describe("results without personalized layers", () => {
    type MockResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
    const respond = (status: number, body: unknown): MockResponse => ({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });

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

    async function switchActivity(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
      await user.click(screen.getByRole("button", { name: from }));
      await user.click(await screen.findByRole("button", { name: to }));
    }

    it("keeps a guest's outing and asks them to sign in after switching Alpine to Running", async () => {
      mockUseAuth.mockReturnValue({ userId: null, isLoaded: true, isSignedIn: false });
      mockOuting(() => respond(401, { error: "Authentication required" }));

      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: /gear up/i }));

      // Alpine has static layers, shown as general guidance.
      expect(await screen.findByRole("heading", { name: "General guidance" })).toBeInTheDocument();

      await switchActivity(user, "Alpine", "Running");

      const notice = await screen.findByRole("region", { name: "Sign in for Running layers" });
      expect(within(notice).getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
      expect(screen.getByText(/wind 15 mph/i)).toBeInTheDocument();
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
      await user.click(screen.getByRole("button", { name: /gear up/i }));
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
});

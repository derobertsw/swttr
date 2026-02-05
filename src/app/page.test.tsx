import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

// Mock Clerk components
vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button">UserButton</div>,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    originalGeolocation = navigator.geolocation;
    localStorageMock.getItem.mockReturnValue("test-user-id");
    // Reset search params
    mockSearchParams.delete("mode");

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
    it("should render activity selector carousel", () => {
      render(<Home />);
      expect(screen.getByRole("region")).toHaveAttribute(
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
    it("should show sliders when geolocation is not supported", async () => {
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByText(/temperature:/i)).toBeInTheDocument();
        expect(screen.getByText(/wind speed:/i)).toBeInTheDocument();
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
          "Could not get current weather. Please set manually."
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

    it("should show sliders when API returns error", async () => {
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
        expect(screen.getByText(/temperature:/i)).toBeInTheDocument();
      });
    });
  });

  describe("manual slider mode", () => {
    it("should show results when Gear Up clicked with sliders visible", async () => {
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<Home />);

      // First click shows sliders
      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByText(/temperature:/i)).toBeInTheDocument();
      });

      // Second click uses slider values — shows results with weather display
      await user.click(screen.getByRole("button", { name: /gear up/i }));

      await waitFor(() => {
        expect(screen.getByText(/°F/)).toBeInTheDocument();
      });
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

      expect(screen.getByRole("button", { name: /pick a date/i })).toBeInTheDocument();
    });

    it("should show time input in plan ahead mode", () => {
      mockSearchParams.set("mode", "planAhead");
      render(<Home />);

      expect(screen.getByDisplayValue("12:00")).toBeInTheDocument();
    });
  });
});

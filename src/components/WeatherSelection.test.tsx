import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WeatherSelection from "./WeatherSelection";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("WeatherSelection", () => {
  const defaultProps = {
    temperature: 50,
    windspeed: 10,
    onTemperatureChange: vi.fn(),
    onWindspeedChange: vi.fn(),
    onPlanAhead: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render temperature label with value", () => {
      render(<WeatherSelection {...defaultProps} />);
      expect(screen.getByText("Temperature: 50°F")).toBeInTheDocument();
    });

    it("should render wind speed label with value", () => {
      render(<WeatherSelection {...defaultProps} />);
      expect(screen.getByText("Wind Speed: 10 mph")).toBeInTheDocument();
    });

    it("should render Current Weather button", () => {
      render(<WeatherSelection {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /current weather/i })
      ).toBeInTheDocument();
    });

    it("should render Plan Ahead button", () => {
      render(<WeatherSelection {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /plan ahead/i })
      ).toBeInTheDocument();
    });

    it("should render temperature slider", () => {
      render(<WeatherSelection {...defaultProps} />);
      const sliders = screen.getAllByRole("slider");
      expect(sliders.length).toBeGreaterThanOrEqual(1);
    });

    it("should render wind speed slider", () => {
      render(<WeatherSelection {...defaultProps} />);
      const sliders = screen.getAllByRole("slider");
      expect(sliders.length).toBe(2);
    });
  });

  describe("temperature display", () => {
    it("should display different temperature values", () => {
      const { rerender } = render(<WeatherSelection {...defaultProps} />);
      expect(screen.getByText("Temperature: 50°F")).toBeInTheDocument();

      rerender(<WeatherSelection {...defaultProps} temperature={-10} />);
      expect(screen.getByText("Temperature: -10°F")).toBeInTheDocument();

      rerender(<WeatherSelection {...defaultProps} temperature={100} />);
      expect(screen.getByText("Temperature: 100°F")).toBeInTheDocument();
    });
  });

  describe("wind speed display", () => {
    it("should display different wind speed values", () => {
      const { rerender } = render(<WeatherSelection {...defaultProps} />);
      expect(screen.getByText("Wind Speed: 10 mph")).toBeInTheDocument();

      rerender(<WeatherSelection {...defaultProps} windspeed={0} />);
      expect(screen.getByText("Wind Speed: 0 mph")).toBeInTheDocument();

      rerender(<WeatherSelection {...defaultProps} windspeed={50} />);
      expect(screen.getByText("Wind Speed: 50 mph")).toBeInTheDocument();
    });
  });

  describe("Plan Ahead button", () => {
    it("should call onPlanAhead when clicked", async () => {
      const user = userEvent.setup();
      const mockOnPlanAhead = vi.fn();
      render(<WeatherSelection {...defaultProps} onPlanAhead={mockOnPlanAhead} />);

      await user.click(screen.getByRole("button", { name: /plan ahead/i }));

      expect(mockOnPlanAhead).toHaveBeenCalledTimes(1);
    });
  });

  describe("Current Weather button", () => {
    let originalGeolocation: Geolocation;

    beforeEach(() => {
      originalGeolocation = navigator.geolocation;
    });

    afterEach(() => {
      Object.defineProperty(navigator, "geolocation", {
        value: originalGeolocation,
        writable: true,
      });
    });

    it("should show error toast when geolocation is not supported", async () => {
      const { toast } = await import("sonner");
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
      });

      const user = userEvent.setup();
      render(<WeatherSelection {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /current weather/i }));

      expect(toast.error).toHaveBeenCalledWith(
        "Geolocation is not supported by your browser"
      );
    });

    it("should show Loading... text when fetching weather", async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn(),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

      const user = userEvent.setup();
      render(<WeatherSelection {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /current weather/i }));

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should call callbacks with weather data on successful fetch", async () => {
      const mockOnTemperatureChange = vi.fn();
      const mockOnWindspeedChange = vi.fn();

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ temperature: 32, windSpeed: 15 }),
      });

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success({ coords: { latitude: 40.7128, longitude: -74.006 } });
        }),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

      const user = userEvent.setup();
      render(
        <WeatherSelection
          {...defaultProps}
          onTemperatureChange={mockOnTemperatureChange}
          onWindspeedChange={mockOnWindspeedChange}
        />
      );

      await user.click(screen.getByRole("button", { name: /current weather/i }));

      await waitFor(() => {
        expect(mockOnTemperatureChange).toHaveBeenCalledWith(32);
        expect(mockOnWindspeedChange).toHaveBeenCalledWith(15);
      });
    });

    it("should show error toast on permission denied", async () => {
      const { toast } = await import("sonner");
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
      render(<WeatherSelection {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /current weather/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Location access denied. Please enable location access."
        );
      });
    });

    it("should show generic error toast on other geolocation errors", async () => {
      const { toast } = await import("sonner");
      const mockGeolocation = {
        getCurrentPosition: vi.fn((_success, error) => {
          error({ code: 2 });
        }),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

      const user = userEvent.setup();
      render(<WeatherSelection {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /current weather/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Unable to get your location");
      });
    });

    it("should show error toast on fetch failure", async () => {
      const { toast } = await import("sonner");

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const mockGeolocation = {
        getCurrentPosition: vi.fn((success) => {
          success({ coords: { latitude: 40.7128, longitude: -74.006 } });
        }),
      };
      Object.defineProperty(navigator, "geolocation", {
        value: mockGeolocation,
        writable: true,
      });

      const user = userEvent.setup();
      render(<WeatherSelection {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /current weather/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to fetch weather data");
      });
    });
  });
});

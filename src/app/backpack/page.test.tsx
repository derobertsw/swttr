import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Backpack from "./page";

// Mock Clerk components
vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button">UserButton</div>,
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

describe("Backpack Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue("test-user-id");

    // Default mock for API calls
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/backpack")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        });
      }
      if (url.includes("/api/preferences")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ temperatureSensitivity: "neutral" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe("rendering", () => {
    it("should render the page title", () => {
      render(<Backpack />);
      expect(screen.getByRole("heading", { name: /backpack/i })).toBeInTheDocument();
    });

    it("should render activity selector", () => {
      render(<Backpack />);
      // Activity selector is a combobox with Backcountry Skiing as default
      expect(screen.getByText("Backcountry Skiing")).toBeInTheDocument();
    });

    it("should render temperature range label", () => {
      render(<Backpack />);
      // May have multiple matches due to sidebar, just check at least one exists
      const labels = screen.getAllByText(/temperature range/i);
      expect(labels.length).toBeGreaterThan(0);
    });

    it("should render temperature slider with two thumbs", () => {
      render(<Backpack />);
      const sliders = screen.getAllByRole("slider");
      expect(sliders.length).toBe(2); // Range slider has two thumbs
    });

    it("should show default temperature range", () => {
      render(<Backpack />);
      expect(screen.getByText(/0°F to 5°F/i)).toBeInTheDocument();
    });

    it("should render min and max temperature labels", () => {
      render(<Backpack />);
      expect(screen.getByText("-20°F")).toBeInTheDocument();
      expect(screen.getByText("40+°F")).toBeInTheDocument();
    });

    it("should render backpack editor", () => {
      render(<Backpack />);
      expect(screen.getByPlaceholderText(/add item/i)).toBeInTheDocument();
    });
  });

  describe("activity selection", () => {
    it("should show Backcountry Skiing as default", () => {
      render(<Backpack />);
      expect(screen.getByText("Backcountry Skiing")).toBeInTheDocument();
    });

    it("should have activity selector as combobox", () => {
      render(<Backpack />);
      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes.length).toBeGreaterThan(0);
    });
  });

  describe("card content", () => {
    it("should render Items to Bring card title", () => {
      render(<Backpack />);
      expect(screen.getByText("Items to Bring")).toBeInTheDocument();
    });

    it("should render card description", () => {
      render(<Backpack />);
      expect(screen.getByText(/select an activity and temperature range/i)).toBeInTheDocument();
    });
  });
});

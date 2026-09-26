import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileTabBar } from "./AppNavigation";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("AppNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe("rendering", () => {
    it("renders Trips and Wardrobe tabs", () => {
      render(<MobileTabBar />);
      expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips");
      expect(screen.getByRole("link", { name: "Wardrobe" })).toHaveAttribute("href", "/wardrobe");
    });

    it("does not render a Plan tab", () => {
      render(<MobileTabBar />);
      expect(screen.queryAllByText("Plan")).toHaveLength(0);
    });

    it("does not render a Gear Up button", () => {
      render(<MobileTabBar />);
      expect(screen.queryByRole("button", { name: /gear up/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /start recommendation/i })).toBeNull();
    });

    it("leaves navigation to the native tab bar inside the iOS shell", () => {
      const userAgent = vi
        .spyOn(window.navigator, "userAgent", "get")
        .mockReturnValue("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 SWTTRNativeTabs");
      try {
        render(<MobileTabBar />);
        expect(screen.queryByRole("navigation")).toBeNull();
        expect(screen.queryByRole("link", { name: "Trips" })).toBeNull();
      } finally {
        userAgent.mockRestore();
      }
    });
  });

  describe("Trips tab active state", () => {
    it("marks Trips active on /trips", () => {
      mockPathname = "/trips";
      render(<MobileTabBar />);
      expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Wardrobe" })).not.toHaveAttribute("aria-current");
    });

    it("marks Trips active on nested trip routes", () => {
      mockPathname = "/trips/abc-123";
      render(<MobileTabBar />);
      expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("aria-current", "page");
    });

    it("marks Wardrobe active on /wardrobe", () => {
      mockPathname = "/wardrobe";
      render(<MobileTabBar />);
      expect(screen.getByRole("link", { name: "Wardrobe" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Trips" })).not.toHaveAttribute("aria-current");
    });
  });
});

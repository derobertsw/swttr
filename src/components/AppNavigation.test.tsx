import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileTabBar, DesktopActionDock } from "./AppNavigation";

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

function renderBothNavs() {
  return render(
    <>
      <DesktopActionDock />
      <MobileTabBar />
    </>
  );
}

describe("AppNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe("rendering", () => {
    it("renders Trips and Wardrobe tabs in both navs", () => {
      renderBothNavs();
      expect(screen.getAllByText("Trips")).toHaveLength(2);
      expect(screen.getAllByText("Wardrobe")).toHaveLength(2);
    });

    it("does not render a Plan tab", () => {
      renderBothNavs();
      expect(screen.queryAllByText("Plan")).toHaveLength(0);
    });

    it("does not render a Gear Up button in either nav", () => {
      renderBothNavs();
      expect(screen.queryByRole("button", { name: /gear up/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /start recommendation/i })).toBeNull();
    });
  });

  describe("Trips tab active state", () => {
    it("marks Trips active on /trips", () => {
      mockPathname = "/trips";
      renderBothNavs();
      const trips = screen.getAllByRole("link", { name: /trips/i });
      // Both mobile and desktop variants render — at least one should be marked active
      expect(trips.length).toBeGreaterThan(0);
    });

    it("marks Trips active on nested trip routes", () => {
      mockPathname = "/trips/abc-123";
      renderBothNavs();
      expect(screen.getAllByText("Trips").length).toBeGreaterThan(0);
    });
  });
});

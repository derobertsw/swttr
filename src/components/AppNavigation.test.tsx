import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MobileTabBar, isNavItemActive } from "./AppNavigation";
import { AppSidebar } from "./AppSidebar";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    sensitivity: "neutral",
    defaultActivity: "running",
    bodyMetricsSelection: {},
    updateSensitivity: vi.fn(),
    updateDefaultActivity: vi.fn(),
    updateBodyMetrics: vi.fn(),
  }),
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
    it("renders Gear up, Trips and Wardrobe tabs in that order", () => {
      render(<MobileTabBar />);
      const nav = screen.getByRole("navigation", { name: "Primary" });
      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Gear up", "Trips", "Wardrobe"]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/trips", "/wardrobe"]);
    });

    it("does not render a Plan tab", () => {
      render(<MobileTabBar />);
      expect(screen.queryAllByText("Plan")).toHaveLength(0);
    });

    // Navigating to Gear up must not submit a recommendation.
    it("makes Gear up a link, not a submit button", () => {
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

  describe("active tab", () => {
    it.each([
      ["/", "Gear up"],
      ["/trips", "Trips"],
      ["/trips/abc-123", "Trips"],
      ["/trips/abc-123/days/2026-01-02", "Trips"],
      ["/trips/new", "Trips"],
      ["/wardrobe", "Wardrobe"],
    ])("marks only %s's tab, %s, as the current page", (pathname, label) => {
      mockPathname = pathname;
      render(<MobileTabBar />);
      const current = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");
      expect(current.map((link) => link.textContent)).toEqual([label]);
    });

    it("marks no tab on pages outside the three destinations", () => {
      mockPathname = "/faq";
      render(<MobileTabBar />);
      for (const link of screen.getAllByRole("link")) {
        expect(link).not.toHaveAttribute("aria-current");
      }
    });
  });

  describe("isNavItemActive", () => {
    it("matches Gear up only at the root", () => {
      expect(isNavItemActive("/", "/")).toBe(true);
      expect(isNavItemActive("/", "/trips")).toBe(false);
    });

    it("does not treat a shared prefix as a nested route", () => {
      expect(isNavItemActive("/trips", "/tripsheet")).toBe(false);
      expect(isNavItemActive("/wardrobe", "/wardrobe/items")).toBe(true);
    });
  });

  describe("desktop sidebar", () => {
    const renderSidebar = () =>
      render(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      );

    it("lists Gear up, Trips and Wardrobe in its primary navigation", () => {
      renderSidebar();
      const nav = screen.getByRole("navigation", { name: "Primary" });
      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Gear up", "Trips", "Wardrobe"]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/trips", "/wardrobe"]);
    });

    it("keeps Settings, FAQ and Feedback in a separate secondary navigation", () => {
      renderSidebar();
      const secondary = screen.getByRole("navigation", { name: "Settings and help" });
      expect(within(secondary).getByRole("button", { name: "Settings" })).toBeInTheDocument();
      expect(within(secondary).getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/faq");
      expect(within(secondary).getByRole("link", { name: "Feedback" })).toBeInTheDocument();
      expect(screen.queryByText("Preferences")).toBeNull();
    });

    it("highlights Trips on nested trip routes", () => {
      mockPathname = "/trips/abc-123/pack";
      renderSidebar();
      const nav = screen.getByRole("navigation", { name: "Primary" });
      expect(within(nav).getByRole("link", { name: "Trips" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Gear up" })).not.toHaveAttribute("aria-current");
    });

    it("does not use the wordmark as a page heading", () => {
      renderSidebar();
      expect(screen.queryByRole("heading")).toBeNull();
    });
  });
});

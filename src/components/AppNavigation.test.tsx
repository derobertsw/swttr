import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTabBar, DesktopActionDock } from "./AppNavigation";

// ── Mocks ────────────────────────────────────────────────────────────
let mockPathname = "/";
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ── Helpers ──────────────────────────────────────────────────────────
/** Renders both nav bars together, same as PageLayout does. */
function renderBothNavs() {
  return render(
    <>
      <DesktopActionDock />
      <MobileTabBar />
    </>
  );
}

function getMobileGearUp() {
  return screen.getByRole("button", { name: /gear up/i });
}

function getDesktopGearUp() {
  return screen.getByRole("button", { name: /start recommendation/i });
}

// ── Tests ────────────────────────────────────────────────────────────
describe("AppNavigation — desktop ↔ mobile state", () => {
  let originalGeolocation: Geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
    localStorageMock.getItem.mockReturnValue(null);
    originalGeolocation = navigator.geolocation;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      writable: true,
      configurable: true,
    });
  });

  // ── Both bars rendered simultaneously ────────────────────────────
  describe("simultaneous rendering", () => {
    it("renders both mobile and desktop Gear Up buttons", () => {
      renderBothNavs();
      expect(getMobileGearUp()).toBeInTheDocument();
      expect(getDesktopGearUp()).toBeInTheDocument();
    });

    it("renders Plan and Wardrobe tabs in both navs", () => {
      renderBothNavs();
      expect(screen.getAllByText("Plan")).toHaveLength(2);
      expect(screen.getAllByText("Wardrobe")).toHaveLength(2);
    });
  });

  // ── Loading state syncs via gearUpLoading event ──────────────────
  describe("loading state synchronisation", () => {
    it("gearUpLoading event disables both Gear Up buttons", () => {
      renderBothNavs();
      expect(getMobileGearUp()).not.toBeDisabled();
      expect(getDesktopGearUp()).not.toBeDisabled();

      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: true }));
      });

      expect(getMobileGearUp()).toBeDisabled();
      expect(getDesktopGearUp()).toBeDisabled();
    });

    it("gearUpLoading false re-enables both buttons", () => {
      renderBothNavs();

      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: true }));
      });
      expect(getMobileGearUp()).toBeDisabled();
      expect(getDesktopGearUp()).toBeDisabled();

      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: false }));
      });
      expect(getMobileGearUp()).not.toBeDisabled();
      expect(getDesktopGearUp()).not.toBeDisabled();
    });
  });

  // ── Activity change syncs via activityChange event ───────────────
  describe("activity change synchronisation", () => {
    it("activityChange event updates both navs without crashing", () => {
      renderBothNavs();

      act(() => {
        window.dispatchEvent(
          new CustomEvent("activityChange", { detail: { value: "xc_skiing" } })
        );
      });

      // Both buttons still present after the icon swap
      expect(getMobileGearUp()).toBeInTheDocument();
      expect(getDesktopGearUp()).toBeInTheDocument();
    });

    it("multiple rapid activity changes leave both navs in sync", () => {
      renderBothNavs();

      act(() => {
        window.dispatchEvent(
          new CustomEvent("activityChange", { detail: { value: "running" } })
        );
        window.dispatchEvent(
          new CustomEvent("activityChange", { detail: { value: "alpine_skiing" } })
        );
        window.dispatchEvent(
          new CustomEvent("activityChange", { detail: { value: "biking" } })
        );
      });

      expect(getMobileGearUp()).toBeInTheDocument();
      expect(getDesktopGearUp()).toBeInTheDocument();
    });
  });

  // ── Gear Up click parity ─────────────────────────────────────────
  describe("Gear Up click parity", () => {
    it("mobile button dispatches gearUp event on home page", async () => {
      const spy = vi.fn();
      window.addEventListener("gearUp", spy);

      renderBothNavs();
      await userEvent.setup().click(getMobileGearUp());

      expect(spy).toHaveBeenCalledTimes(1);
      window.removeEventListener("gearUp", spy);
    });

    it("desktop button dispatches gearUp event on home page", async () => {
      const spy = vi.fn();
      window.addEventListener("gearUp", spy);

      renderBothNavs();
      await userEvent.setup().click(getDesktopGearUp());

      expect(spy).toHaveBeenCalledTimes(1);
      window.removeEventListener("gearUp", spy);
    });

    it("both navigate to geoDenied when off home page without geolocation", async () => {
      mockPathname = "/wardrobe";
      Object.defineProperty(navigator, "geolocation", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const user = userEvent.setup();
      renderBothNavs();

      await user.click(getMobileGearUp());
      expect(mockPush).toHaveBeenCalledWith("/?gearUp=1&geoDenied=1");

      mockPush.mockClear();

      await user.click(getDesktopGearUp());
      expect(mockPush).toHaveBeenCalledWith("/?gearUp=1&geoDenied=1");
    });
  });

  // ── Plan tab parity ──────────────────────────────────────────────
  describe("Plan tab parity", () => {
    it("both Plan tabs dispatch navigatePlanAhead on home page", async () => {
      const spy = vi.fn();
      window.addEventListener("navigatePlanAhead", spy);

      const user = userEvent.setup();
      renderBothNavs();

      const planLinks = screen.getAllByText("Plan");
      await user.click(planLinks[0]);
      await user.click(planLinks[1]);

      expect(spy).toHaveBeenCalledTimes(2);
      // Already on home — should NOT router.push
      expect(mockPush).not.toHaveBeenCalled();

      window.removeEventListener("navigatePlanAhead", spy);
    });

    it("Plan tab navigates when not on home page", async () => {
      mockPathname = "/wardrobe";
      const spy = vi.fn();
      window.addEventListener("navigatePlanAhead", spy);

      const user = userEvent.setup();
      renderBothNavs();

      const planLinks = screen.getAllByText("Plan");
      await user.click(planLinks[0]);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/?mode=planAhead");

      window.removeEventListener("navigatePlanAhead", spy);
    });
  });

  // ── Interleaved events (simulating viewport switch mid-action) ───
  describe("viewport switch mid-action", () => {
    it("desktop Gear Up click then gearUpLoading syncs mobile state", async () => {
      const user = userEvent.setup();
      renderBothNavs();

      // Click desktop Gear Up on home page — dispatches gearUp event
      await user.click(getDesktopGearUp());

      // useGearUp broadcasts loading (SUBMIT_START) — both navs pick it up
      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: true }));
      });

      // User shrinks viewport: mobile FAB should also show loading
      expect(getMobileGearUp()).toBeDisabled();
      expect(getDesktopGearUp()).toBeDisabled();

      // Loading completes (SUBMIT_SUCCESS)
      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: false }));
      });

      expect(getMobileGearUp()).not.toBeDisabled();
      expect(getDesktopGearUp()).not.toBeDisabled();
    });

    it("activity changed then loading fired — both navs stay consistent", async () => {
      renderBothNavs();

      act(() => {
        window.dispatchEvent(
          new CustomEvent("activityChange", { detail: { value: "backcountry_skiing" } })
        );
      });

      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: true }));
      });

      // Both buttons disabled with the new activity icon
      expect(getMobileGearUp()).toBeDisabled();
      expect(getDesktopGearUp()).toBeDisabled();

      act(() => {
        window.dispatchEvent(new CustomEvent("gearUpLoading", { detail: false }));
      });

      expect(getMobileGearUp()).not.toBeDisabled();
      expect(getDesktopGearUp()).not.toBeDisabled();
    });
  });
});

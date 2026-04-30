import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileTabBar, DesktopActionDock } from "./AppNavigation";

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
    it("renders Plan and Wardrobe tabs in both navs", () => {
      renderBothNavs();
      expect(screen.getAllByText("Plan")).toHaveLength(2);
      expect(screen.getAllByText("Wardrobe")).toHaveLength(2);
    });

    it("does not render a Gear Up button in either nav", () => {
      renderBothNavs();
      expect(screen.queryByRole("button", { name: /gear up/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /start recommendation/i })).toBeNull();
    });
  });

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
});

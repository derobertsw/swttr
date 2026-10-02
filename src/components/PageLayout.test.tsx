import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PageLayout from "./PageLayout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/abc-123",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  UserButton: Object.assign(() => <div data-testid="user-button" />, {
    MenuItems: () => null,
    Link: () => null,
    Action: () => null,
  }),
}));

vi.mock("@/hooks/useMigrateUser", () => ({ useMigrateUser: () => {} }));

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

const NATIVE_USER_AGENT = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 SWTTRNativeTabs";

const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;
let mediaListeners: Array<() => void> = [];

// Width-driven hooks read innerWidth and re-read it when a media query fires.
function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

function resizeTo(width: number) {
  setWidth(width);
  act(() => mediaListeners.forEach((listener) => listener()));
}

const sidebarState = () =>
  document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") ?? null;

const renderLayout = () =>
  render(
    <PageLayout>
      <h1>Trip</h1>
    </PageLayout>
  );

describe("PageLayout", () => {
  beforeEach(() => {
    mediaListeners = [];
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, listener: () => void) => mediaListeners.push(listener),
      removeEventListener: (_: string, listener: () => void) => {
        mediaListeners = mediaListeners.filter((item) => item !== listener);
      },
    }));
    setWidth(1280);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    setWidth(originalInnerWidth);
  });

  it("starts with a skip link to a single main landmark", () => {
    renderLayout();
    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(document.body.querySelector("a, button")).toBe(skipLink);
  });

  it("leaves the page's own h1 as its only top-level heading", () => {
    renderLayout();
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual([
      "Trip",
    ]);
  });

  it("expands the sidebar from 1024px and shows icons only from 768px to 1023px", () => {
    renderLayout();
    expect(sidebarState()).toBe("expanded");

    resizeTo(1023);
    expect(sidebarState()).toBe("collapsed");

    resizeTo(1024);
    expect(sidebarState()).toBe("expanded");
  });

  it("keeps a manual toggle until the window crosses 1024px", async () => {
    setWidth(900);
    const user = userEvent.setup();
    renderLayout();
    expect(sidebarState()).toBe("collapsed");

    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(sidebarState()).toBe("expanded");

    resizeTo(1000);
    expect(sidebarState()).toBe("expanded");

    resizeTo(1280);
    expect(sidebarState()).toBe("expanded");
    resizeTo(900);
    expect(sidebarState()).toBe("collapsed");
  });

  it("shows one primary navigation: the sidebar on desktop and the tab bar on phones", () => {
    renderLayout();
    // jsdom applies no media queries, so both render; CSS hides one per width.
    const navs = screen.getAllByRole("navigation", { name: "Primary" });
    expect(navs).toHaveLength(2);
    expect(navs.filter((nav) => nav.className.includes("md:hidden"))).toHaveLength(1);
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveClass("hidden", "md:block");
  });

  it("drops the web sidebar and tab bar in the native shell but keeps the menu", () => {
    const userAgent = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(NATIVE_USER_AGENT);
    try {
      renderLayout();
      expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
      expect(document.querySelector('[data-slot="sidebar"]')).toBeNull();
      expect(screen.getByRole("button", { name: "Open menu" })).not.toHaveClass("md:hidden");
    } finally {
      userAgent.mockRestore();
    }
  });
});

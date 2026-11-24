import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { AppSidebar } from "./AppSidebar";
import { TemperatureUnitProvider } from "./TemperatureUnitProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);
const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const chrome = () => (
  <TemperatureUnitProvider>
    <SidebarProvider>
      <AppSidebar />
      <Header />
    </SidebarProvider>
  </TemperatureUnitProvider>
);

// jsdom applies no media queries, so the header's avatar and the sidebar's both
// render; CSS shows one of them at a time.
const avatar = () => within(screen.getByRole("banner")).getByRole("button", { name: "Open user menu" });
const sidebarAccount = () => document.querySelector<HTMLElement>("[data-account-control]")!;
const sidebarAvatar = () => within(sidebarAccount()).getByRole("button", { name: "Open user menu" });
const sidebarSettings = () =>
  within(screen.getByRole("navigation", { name: "Settings and help" })).getByRole("button", {
    name: "Settings",
  });

async function closeDrawer() {
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("Header settings entry points", () => {
  // jsdom applies Vaul's exit animation but never ends it, so a closed drawer
  // would stay mounted and never hand focus back. Vaul's drag handling also
  // reads CSS transforms, which jsdom lacks, so clicks inside the drawer are
  // plain click events.
  let noAnimation: HTMLStyleElement;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetFakeClerk();
    navigation.pathname = "/";
    noAnimation = document.createElement("style");
    noAnimation.textContent = "[data-vaul-drawer] { animation-name: none !important; }";
    document.head.appendChild(noAnimation);
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    noAnimation.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([true, false])("opens Settings from the Mac menu event, signed in: %s", async (signedIn) => {
    fakeClerkState.signedIn = signedIn;
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 SWTTRNativeMac/1");
    render(chrome());
    const opener = signedIn ? avatar() : screen.getByRole("button", { name: "Open menu" });
    opener.focus();
    act(() => window.dispatchEvent(new Event("openPreferences")));
    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    act(() => window.dispatchEvent(new Event("openPreferences")));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));
    await closeDrawer();
    expect(opener).toHaveFocus();
    act(() => window.dispatchEvent(new Event("openPreferences")));
    await screen.findByRole("dialog", { name: "Settings" });
  });

  it.each(["Mozilla/5.0", "Mozilla/5.0 SWTTRNativeTabs"])("ignores the Mac menu event outside the Mac shell: %s", (agent) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(agent);
    render(chrome());
    act(() => window.dispatchEvent(new Event("openPreferences")));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["menu", "avatar"])("closes the %s overlay before native Settings takes focus", async (entry) => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("SWTTRNativeMac/1");
    const user = userEvent.setup();
    render(chrome());
    const opener = entry === "menu" ? screen.getByRole("button", { name: "Open menu" }) : avatar();
    await user.click(opener);
    act(() => {
      window.dispatchEvent(new Event("openPreferences"));
      window.dispatchEvent(new Event("openPreferences"));
    });
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Menu" })).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(drawer).toHaveFocus());
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));
    await closeDrawer();
    expect(opener).toHaveFocus();
  });

  it("opens one Settings drawer from the avatar and returns focus to it on Escape", async () => {
    const user = userEvent.setup();
    render(chrome());

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));

    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(drawer).toHaveFocus());

    await user.keyboard("{Escape}");
    await closeDrawer();
    expect(avatar()).toHaveFocus();
  });

  it("works from the keyboard and returns focus to the avatar on Done", async () => {
    const user = userEvent.setup();
    render(chrome());

    avatar().focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveFocus());
    await user.keyboard("{Enter}");

    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));
    await closeDrawer();
    expect(avatar()).toHaveFocus();
  });

  it("returns focus to the menu button when the account signs out while Settings is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(chrome());

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    const drawer = await screen.findByRole("dialog", { name: "Settings" });

    fakeClerkState.signedIn = false;
    rerender(chrome());
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));

    await closeDrawer();
    // Signed out, the header's Sign in is inside the menu.
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("hides the whole header on desktop web, where the sidebar has the account (#267)", () => {
    render(chrome());
    expect(screen.getByRole("banner")).toHaveClass("md:hidden");
  });

  it("keeps the header at every width in the native shell", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 SWTTRNativeMac/1");
    render(<TemperatureUnitProvider><Header /></TemperatureUnitProvider>);
    expect(screen.getByRole("banner")).not.toHaveClass("md:hidden");
    expect(avatar()).toBeInTheDocument();
  });

  it("hands focus to the sidebar's account control when the header was hidden while its menu was open", async () => {
    fakeClerkState.signedIn = false;
    const user = userEvent.setup();
    render(chrome());
    const menuButton = screen.getByRole("button", { name: "Open menu" });
    await user.click(menuButton);
    await screen.findByRole("navigation", { name: "Menu" });

    // The window widened past md: the header, and its menu button, are hidden.
    // (jsdom has no checkVisibility, so only this button reports one.)
    menuButton.checkVisibility = () => false;
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument());
    await waitFor(() => expect(within(sidebarAccount()).getByRole("link", { name: "Sign in" })).toHaveFocus());
  });

  it("leaves the avatar out of the mobile menu and lists Settings first", async () => {
    const user = userEvent.setup();
    render(chrome());

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(within(menu).queryByRole("button", { name: "Open user menu" })).not.toBeInTheDocument();
    expect(within(menu).queryByText("Account")).not.toBeInTheDocument();
    expect(Array.from(menu.children, (item) => item.textContent)).toEqual(["Settings", "FAQ", "Feedback", "Share"]);
  });

  it("lists Sign in and then Settings in the mobile menu for guests", async () => {
    fakeClerkState.signedIn = false;
    const user = userEvent.setup();
    render(chrome());

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(Array.from(menu.children, (item) => item.textContent)).toEqual([
      "Sign in",
      "Settings",
      "FAQ",
      "Feedback",
      "Share",
    ]);
  });

  it.each(["/sign-in", "/sign-up/verify-email-address"])("leaves Sign in out of the header and menu on %s", async (pathname) => {
    navigation.pathname = pathname;
    fakeClerkState.signedIn = false;
    const user = userEvent.setup();
    render(chrome());
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(Array.from(menu.children, (item) => item.textContent)).toEqual(["Settings", "FAQ", "Feedback", "Share"]);
  });

  it("keeps Settings in the mobile menu", async () => {
    const user = userEvent.setup();
    render(chrome());

    const menuButton = screen.getByRole("button", { name: "Open menu" });
    await user.click(menuButton);
    await user.click(within(screen.getByRole("navigation", { name: "Menu" })).getByRole("button", { name: "Settings" }));

    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));
    await closeDrawer();
    expect(menuButton).toHaveFocus();
  });

  it("keeps the sidebar's Settings for guests", async () => {
    fakeClerkState.signedIn = false;
    const user = userEvent.setup();
    render(chrome());
    expect(screen.queryByRole("button", { name: "Open user menu" })).not.toBeInTheDocument();

    await user.click(sidebarSettings());

    await screen.findByRole("dialog", { name: "Settings" });
    await user.keyboard("{Escape}");
    await closeDrawer();
    expect(sidebarSettings()).toHaveFocus();
  });

  it("shows a change made from the avatar when Settings reopens from the sidebar or the menu", async () => {
    const user = userEvent.setup();
    render(chrome());

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    let drawer = await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(within(drawer).getByRole("radio", { name: "Run Cold" }));
    fireEvent.click(within(drawer).getByRole("radio", { name: "Celsius (°C)" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));
    await closeDrawer();

    // Saved to the account, as before.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/preferences",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ temperatureSensitivity: "cold" }) })
    );

    await user.click(sidebarSettings());
    drawer = await screen.findByRole("dialog", { name: "Settings" });
    expect(within(drawer).getByRole("radio", { name: "Run Cold" })).toBeChecked();
    expect(within(drawer).getByRole("radio", { name: "Celsius (°C)" })).toBeChecked();
    await user.keyboard("{Escape}");
    await closeDrawer();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(within(screen.getByRole("navigation", { name: "Menu" })).getByRole("button", { name: "Settings" }));
    drawer = await screen.findByRole("dialog", { name: "Settings" });
    expect(within(drawer).getByRole("radio", { name: "Run Cold" })).toBeChecked();
    expect(within(drawer).getByRole("radio", { name: "Celsius (°C)" })).toBeChecked();
  });
});

describe("Header wordmark (#337)", () => {
  beforeEach(() => {
    resetFakeClerk();
    navigation.pathname = "/";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // In rem, the wordmark doubled with 200% text and pushed the menu button
  // past a phone's edge (docs/qa/337-group-planning). jsdom doesn't lay out,
  // so this pins the pixel sizes.
  it.each([["compact", "text-[32px]"], ["default", "text-[40px]"]] as const)("keeps the %s wordmark its own size when text is enlarged", (variant, size) => {
    render(
      <TemperatureUnitProvider>
        <SidebarProvider>
          <Header variant={variant} />
        </SidebarProvider>
      </TemperatureUnitProvider>
    );
    expect(screen.getByText("SWTTR")).toHaveClass(size);
  });
});

describe("Sidebar account control (#267)", () => {
  let noAnimation: HTMLStyleElement;

  beforeEach(() => {
    resetFakeClerk();
    navigation.pathname = "/";
    noAnimation = document.createElement("style");
    noAnimation.textContent = "[data-vaul-drawer] { animation-name: none !important; }";
    document.head.appendChild(noAnimation);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    noAnimation.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sits below Settings and help, after the primary destinations", () => {
    render(chrome());
    const help = screen.getByRole("navigation", { name: "Settings and help" });
    expect(help.compareDocumentPosition(sidebarAccount()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sidebarAccount().closest('[data-slot="sidebar"]')).not.toBeNull();
  });

  it("opens the same account menu as the header's avatar", async () => {
    const user = userEvent.setup();
    render(chrome());

    await user.click(sidebarAvatar());

    const items = within(screen.getByRole("menu", { name: "User menu" })).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Settings", "Manage account", "FAQ", "Share", "Sign out"]);
  });

  it("opens one Settings drawer from the menu and returns focus to the avatar", async () => {
    const user = userEvent.setup();
    render(chrome());

    sidebarAvatar().focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveFocus());
    await user.keyboard("{Enter}");

    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(drawer).toHaveFocus());

    await user.keyboard("{Escape}");
    await closeDrawer();
    expect(sidebarAvatar()).toHaveFocus();
  });

  it("still returns focus to the sidebar's Settings item when that opened the drawer", async () => {
    const user = userEvent.setup();
    render(chrome());

    await user.click(sidebarSettings());
    const drawer = await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));
    await closeDrawer();
    expect(sidebarSettings()).toHaveFocus();
  });

  it("returns focus to Sign in when the account signs out while Settings is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(chrome());

    await user.click(sidebarAvatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    const drawer = await screen.findByRole("dialog", { name: "Settings" });

    fakeClerkState.signedIn = false;
    rerender(chrome());
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));

    await closeDrawer();
    expect(within(sidebarAccount()).getByRole("link", { name: "Sign in" })).toHaveFocus();
  });

  it("offers guests a Sign in link with an icon", () => {
    fakeClerkState.signedIn = false;
    render(chrome());
    const link = within(sidebarAccount()).getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/sign-in");
    expect(link.querySelector("svg")).not.toBeNull();
    expect(within(sidebarAccount()).queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["/sign-in", "/sign-up/verify-email-address"])("leaves Sign in out on %s", (pathname) => {
    navigation.pathname = pathname;
    fakeClerkState.signedIn = false;
    render(chrome());
    expect(within(sidebarAccount()).queryByRole("link")).not.toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { AppSidebar } from "./AppSidebar";
import { TemperatureUnitProvider } from "./TemperatureUnitProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const chrome = () => (
  <TemperatureUnitProvider>
    <SidebarProvider>
      <AppSidebar />
      <Header />
    </SidebarProvider>
  </TemperatureUnitProvider>
);

const avatar = () => screen.getByRole("button", { name: "Open user menu" });
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

  it("returns focus to Sign In when the account signs out while Settings is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(chrome());

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    const drawer = await screen.findByRole("dialog", { name: "Settings" });

    fakeClerkState.signedIn = false;
    rerender(chrome());
    fireEvent.click(within(drawer).getByRole("button", { name: "Done" }));

    await closeDrawer();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveFocus();
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

  it("lists Sign In and then Settings in the mobile menu for guests", async () => {
    fakeClerkState.signedIn = false;
    const user = userEvent.setup();
    render(chrome());

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(Array.from(menu.children, (item) => item.textContent)).toEqual([
      "Sign In",
      "Settings",
      "FAQ",
      "Feedback",
      "Share",
    ]);
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

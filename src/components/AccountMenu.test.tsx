import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "./AccountMenu";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";
import { clearSavedBriefs, readSavedBriefs, storeSavedBrief } from "@/lib/offline-briefs";
import { offlineBrief, resetDeviceStorage } from "@/test/offlineBrief";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);
vi.mock("@/lib/offline-briefs", async (original) => {
  const actual = await original<typeof import("@/lib/offline-briefs")>();
  return { ...actual, clearSavedBriefs: vi.fn(actual.clearSavedBriefs) };
});

const avatar = () => screen.getByRole("button", { name: "Open user menu" });

describe("AccountMenu", () => {
  beforeEach(() => {
    resetFakeClerk();
    resetDeviceStorage();
  });

  it("puts Settings first and Sign out last", async () => {
    const user = userEvent.setup();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    await user.click(avatar());

    const items = within(screen.getByRole("menu", { name: "User menu" })).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Settings",
      "Manage account",
      "FAQ",
      "Share",
      "Sign out",
    ]);
  });

  describe("in the sidebar (#267)", () => {
    const name = () => document.querySelector<HTMLElement>("[data-account-name]")!;
    const sidebarMenu = () => render(<AccountMenu placement="sidebar" onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    it("shows the account's name beside the avatar, or Account without one", () => {
      fakeClerkState.fullName = "Ada Lovelace";
      const { unmount } = sidebarMenu();
      expect(name()).toHaveTextContent("Ada Lovelace");
      unmount();

      fakeClerkState.fullName = null;
      sidebarMenu();
      expect(name()).toHaveTextContent("Account");
    });

    it("leaves the avatar as the one control, with its own name", () => {
      sidebarMenu();
      expect(screen.getAllByRole("button")).toEqual([avatar()]);
      expect(name()).toHaveAttribute("aria-hidden", "true");
    });

    it("opens the menu from a click on the name, and doesn't reopen it when that press closed it", async () => {
      const user = userEvent.setup();
      sidebarMenu();

      await user.click(name());
      expect(screen.getByRole("menu", { name: "User menu" })).toBeInTheDocument();

      // Clerk closes its menu on the press outside it; the click follows.
      await user.pointer({ keys: "[MouseLeft>]", target: name() });
      await user.click(avatar());
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      await user.pointer({ keys: "[/MouseLeft]", target: name() });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("has no name beside the header's avatar", () => {
      render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);
      expect(document.querySelector("[data-account-name]")).toBeNull();
    });
  });

  it("opens Settings once the menu has closed and the avatar has focus back", async () => {
    const user = userEvent.setup();
    const seen: { menuOpen: boolean; avatarFocused: boolean }[] = [];
    const onOpenSettings = vi.fn(() => {
      seen.push({
        menuOpen: screen.queryByRole("menu") !== null,
        avatarFocused: document.activeElement === avatar(),
      });
    });
    render(<AccountMenu onOpenSettings={onOpenSettings} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));

    await waitFor(() => expect(onOpenSettings).toHaveBeenCalledTimes(1));
    expect(seen).toEqual([{ menuOpen: false, avatarFocused: true }]);
  });

  it("still opens Settings when focus doesn't come back to the avatar", async () => {
    fakeClerkState.returnFocus = false;
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    render(<AccountMenu onOpenSettings={onOpenSettings} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(onOpenSettings).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenSettings).toHaveBeenCalledTimes(1));
  });

  it("doesn't open Settings after it has unmounted", async () => {
    fakeClerkState.returnFocus = false;
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();
    const { unmount } = render(<AccountMenu onOpenSettings={onOpenSettings} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));
    unmount();

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("shares from the menu", async () => {
    const user = userEvent.setup();
    const onShare = vi.fn();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={onShare} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Share" }));

    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it("offers one Sign out, its own, which warns before removing saved trips; Clerk's is hidden (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    const signOut = vi.fn(async () => {});
    fakeClerkState.signOut = signOut;
    const user = userEvent.setup();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    await user.click(avatar());
    const menu = screen.getByRole("menu", { name: "User menu" });
    expect(within(menu).getAllByRole("menuitem", { name: "Sign out" })).toHaveLength(1);
    // Clerk keeps its own, hidden, so nothing can sign out without the warning.
    const both = within(menu).getAllByText("Sign out");
    expect(both).toHaveLength(2);
    expect(both.filter((item) => item.style.display === "none")).toHaveLength(1);
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("dialog", { name: "Sign out and remove saved trips?" })).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect((await readSavedBriefs()).briefs).toHaveLength(1);
  });

  it("signs out at once when no trips are saved on this device", async () => {
    const signOut = vi.fn(async () => {});
    fakeClerkState.signOut = signOut;
    const user = userEvent.setup();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("warns that signing out removes the trips saved on this device, and removes them (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    const signOut = vi.fn(async () => {});
    fakeClerkState.signOut = signOut;
    const user = userEvent.setup();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out and remove saved trips?" });
    expect(dialog).toHaveTextContent("Signing out removes the trip brief saved on this device for offline use.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
    expect((await readSavedBriefs()).briefs).toHaveLength(1);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sign out and remove" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("stays signed in, and says why, when the saved trips can't be removed (#214)", async () => {
    await storeSavedBrief("user_1", offlineBrief());
    vi.mocked(clearSavedBriefs).mockRejectedValueOnce(new Error("blocked"));
    const signOut = vi.fn(async () => {});
    fakeClerkState.signOut = signOut;
    const user = userEvent.setup();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out and remove saved trips?" });
    await user.click(within(dialog).getByRole("button", { name: "Sign out and remove" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't remove the trips saved on this device, so you're still signed in.");
    expect(signOut).not.toHaveBeenCalled();
    expect((await readSavedBriefs()).briefs).toHaveLength(1);
    // Trying again works once the device lets it.
    await user.click(within(dialog).getByRole("button", { name: "Sign out and remove" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect((await readSavedBriefs()).briefs).toEqual([]);
  });

  it("still signs out where the browser won't keep trips at all, since none can be saved there", async () => {
    vi.mocked(clearSavedBriefs).mockRejectedValueOnce(new Error("This browser can't keep trips on this device."));
    const signOut = vi.fn(async () => {});
    fakeClerkState.signOut = signOut;
    const user = userEvent.setup();
    render(<AccountMenu onOpenSettings={vi.fn()} onShare={vi.fn()} />);

    await user.click(avatar());
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

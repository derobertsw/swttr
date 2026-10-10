import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "./AccountMenu";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);

const avatar = () => screen.getByRole("button", { name: "Open user menu" });

describe("AccountMenu", () => {
  beforeEach(resetFakeClerk);

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
});

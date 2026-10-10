import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useReturnFocus } from "./useReturnFocus";

function DetailsDialog() {
  const [open, setOpen] = useState(false);
  const [showOpener, setShowOpener] = useState(true);
  const focus = useReturnFocus();

  return (
    <>
      <button type="button" id="fallback">
        Fallback
      </button>
      {showOpener && (
        <button
          type="button"
          onClick={() => {
            focus.remember(() => document.getElementById("fallback"));
            setOpen(true);
          }}
        >
          Show details
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onCloseAutoFocus={focus.restore}>
          <DialogTitle>Details</DialogTitle>
          <DialogDescription>About this item.</DialogDescription>
          <button
            type="button"
            onClick={() => {
              setShowOpener(false);
              setOpen(false);
            }}
          >
            Delete
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("useReturnFocus", () => {
  it("returns focus to the control that opened the dialog", async () => {
    const user = userEvent.setup();
    render(<DetailsDialog />);

    const opener = screen.getByRole("button", { name: "Show details" });
    await user.click(opener);
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus to a tapped control, not one that kept focus", async () => {
    const user = userEvent.setup();
    render(<DetailsDialog />);
    screen.getByRole("button", { name: "Fallback" }).focus();

    // A tap on iOS doesn't focus the button it activates.
    const opener = screen.getByRole("button", { name: "Show details" });
    fireEvent.click(opener);
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("falls back when the opener is gone", async () => {
    const user = userEvent.setup();
    render(<DetailsDialog />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Show details" })).not.toBeInTheDocument();
  });

  it("falls back when the opener is hidden", async () => {
    const user = userEvent.setup();
    render(<DetailsDialog />);

    const opener = screen.getByRole("button", { name: "Show details" });
    await user.click(opener);
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument();
    // A narrower window hides it; jsdom has no layout, so say so directly.
    opener.checkVisibility = () => false;
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
  });

  it("leaves a dialog opened by its trigger to Radix", async () => {
    function TriggeredDialog() {
      const focus = useReturnFocus();
      return (
        <Dialog>
          <DialogTrigger>Show details</DialogTrigger>
          <DialogContent onCloseAutoFocus={focus.restore}>
            <DialogTitle>Details</DialogTitle>
            <DialogDescription>About this item.</DialogDescription>
          </DialogContent>
        </Dialog>
      );
    }
    const user = userEvent.setup();
    render(<TriggeredDialog />);

    const trigger = screen.getByRole("button", { name: "Show details" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  describe("in a drawer", () => {
    // jsdom applies Vaul's exit animation but never ends it, so a closed drawer
    // would stay mounted and never hand focus back. Without the animation,
    // Radix unmounts it at once.
    let noAnimation: HTMLStyleElement;
    beforeEach(() => {
      noAnimation = document.createElement("style");
      noAnimation.textContent = "[data-vaul-drawer] { animation-name: none !important; }";
      document.head.appendChild(noAnimation);
    });
    afterEach(() => noAnimation.remove());

    it("returns focus to a tapped control that opened it from code", async () => {
      function SettingsDrawer() {
        const [open, setOpen] = useState(false);
        const focus = useReturnFocus();
        return (
          <>
            <button
              type="button"
              onClick={() => {
                focus.remember(() => null);
                setOpen(true);
              }}
            >
              Settings
            </button>
            <Drawer open={open} onOpenChange={setOpen}>
              <DrawerContent onCloseAutoFocus={focus.restore}>
                <DrawerTitle>Settings</DrawerTitle>
                <DrawerDescription>Changes save automatically.</DrawerDescription>
              </DrawerContent>
            </Drawer>
          </>
        );
      }
      const user = userEvent.setup();
      render(<SettingsDrawer />);

      const opener = screen.getByRole("button", { name: "Settings" });
      fireEvent.click(opener);
      const drawer = await screen.findByRole("dialog", { name: "Settings" });
      await waitFor(() => expect(drawer).toHaveFocus());
      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });
  });
});

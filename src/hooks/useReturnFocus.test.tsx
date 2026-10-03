import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

  it("falls back when a tap left nothing focused", async () => {
    const user = userEvent.setup();
    render(<DetailsDialog />);

    // A tap on iOS doesn't focus the button it activates.
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(await screen.findByRole("dialog", { name: "Details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
  });

  it("falls back when the opener is gone", async () => {
    const user = userEvent.setup();
    render(<DetailsDialog />);

    await user.click(screen.getByRole("button", { name: "Show details" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Fallback" })).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Show details" })).not.toBeInTheDocument();
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
});

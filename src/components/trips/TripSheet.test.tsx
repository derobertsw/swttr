import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripSheet, TripSheetDescription, TripSheetTitle } from "./TripSheet";

function Sheet({
  busy = false,
  onClose = () => {},
  focusCancel = false,
}: {
  busy?: boolean;
  onClose?: () => void;
  focusCancel?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <TripSheet
      open
      onClose={onClose}
      busy={busy}
      onOpenAutoFocus={
        focusCancel
          ? (event) => {
              event.preventDefault();
              cancelRef.current?.focus();
            }
          : undefined
      }
      header={<TripSheetTitle>Remove Sam from trip</TripSheetTitle>}
      footer={
        <>
          <button type="button">Remove Sam</button>
          <button ref={cancelRef} type="button">
            Cancel
          </button>
        </>
      }
    >
      <TripSheetDescription>Removing Sam deletes their kits.</TripSheetDescription>
    </TripSheet>
  );
}

// jsdom never finishes a drawer's close animation, so focus returning to the
// opener is checked in a browser; these cover how the drawer opens and when
// it agrees to close.
describe("TripSheet on a phone", () => {
  const desktopWidth = window.innerWidth;

  beforeEach(() => {
    window.innerWidth = 375;
  });

  afterEach(() => {
    window.innerWidth = desktopWidth;
  });

  it("opens as a drawer and focuses it, so no field raises the keyboard", async () => {
    render(<Sheet />);

    const drawer = await screen.findByRole("dialog", { name: "Remove Sam from trip" });
    expect(drawer).toHaveAttribute("data-vaul-drawer");
    expect(drawer).toHaveAccessibleDescription("Removing Sam deletes their kits.");
    await waitFor(() => expect(drawer).toHaveFocus());
  });

  it("lets the sheet choose where focus starts", async () => {
    render(<Sheet focusCancel />);

    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("closes on Escape and the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Sheet onClose={onClose} />);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    // By keyboard: Vaul's pointerup reads a CSS transform jsdom doesn't compute.
    screen.getByRole("button", { name: "Close" }).focus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("can't be closed while busy", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Sheet busy onClose={onClose} />);
    const drawer = await screen.findByRole("dialog");
    await waitFor(() => expect(drawer).toHaveFocus());

    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await user.keyboard("{Escape}");
    fireEvent.pointerDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
    expect(drawer).toHaveAttribute("data-state", "open");
  });
});

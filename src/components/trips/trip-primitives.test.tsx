import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { InviteLinkButton, TripError } from "./trip-primitives";
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("copies a link explicitly, without reporting delivery", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(<InviteLinkButton token="synthetic-invite" recipientName="Sam" />);
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(write).toHaveBeenCalledWith(`${window.location.origin}/trips/invite/synthetic-invite`);
  expect(toast.success).toHaveBeenCalledExactlyOnceWith("Invite link copied");
});

it("leaves share cancellation quiet without falling back to copy", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText");
  const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  vi.stubGlobal("navigator", { share, clipboard: navigator.clipboard });
  render(<InviteLinkButton token="synthetic-invite" recipientName="Sam" />);
  await user.click(screen.getByRole("button", { name: "Share link" }));
  expect(share).toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

it("offers Retry with a trip error only when the page asks for it (#337)", async () => {
  const retry = vi.fn();
  const { rerender } = render(<TripError>Couldn&apos;t load the trip. Try again.</TripError>);
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the trip. Try again.");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  rerender(<TripError onRetry={retry}>Couldn&apos;t load the trip. Try again.</TripError>);
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();
});

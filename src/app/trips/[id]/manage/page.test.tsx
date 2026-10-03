import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ORGANIZER, SAM, TRIP, fakeTripApi, reply, tripFull } from "@/test/tripApi";
import type { TripMember } from "@/types/trips";
import ManageCrewPage from "./page";

const ALEX: TripMember = {
  ...SAM,
  id: "member-alex",
  display_name: "Alex",
  status: "guest",
  invite_token: null,
};

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// These tests cover the page, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** The page suspends until its params resolve, so rendering is awaited. */
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ManageCrewPage params={Promise.resolve({ id: TRIP.id })} />
      </Suspense>
    );
  });
}

describe("Manage crew page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the name when someone can't be added", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull()),
        "POST /api/v1/trips/trip-1/members": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    const nameInput = await screen.findByPlaceholderText("Display name");
    await user.type(nameInput, "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add Sam", {
        description: "Database unavailable",
      })
    );
    expect(nameInput).toHaveValue("Sam");
  });

  it("keeps the dialog open when someone can't be removed", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM] })),
        "DELETE /api/v1/trips/trip-1/members/member-sam": reply(403, { error: "Organizer only" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "Remove Sam" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Sam from trip" });
    // Removal deletes the member row, and their kits with it.
    expect(within(dialog).getByText("delete their kits for this trip")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove Sam" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't remove Sam", {
        description: "Organizer only",
      })
    );
    expect(screen.getByRole("dialog", { name: "Remove Sam from trip" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove Sam" })).toBeEnabled();
  });

  describe("the remove dialog", () => {
    it("takes focus, keeps it, and hides the page behind it", async () => {
      vi.stubGlobal(
        "fetch",
        fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM] })) })
      );
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByRole("button", { name: "Remove Sam" }));
      const dialog = await screen.findByRole("dialog", { name: "Remove Sam from trip" });

      // Cancel first, so Enter can't remove anyone by accident.
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
      expect(dialog).toHaveAccessibleDescription(/Removing Sam will:/);
      expect(screen.queryByRole("link", { name: "Trip" })).not.toBeInTheDocument();

      await user.tab();
      expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
      await user.tab();
      expect(within(dialog).getByRole("button", { name: "Remove Sam" })).toHaveFocus();
    });

    it("returns focus to the member's Remove button when it closes", async () => {
      vi.stubGlobal(
        "fetch",
        fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM] })) })
      );
      const user = userEvent.setup();
      await renderPage();
      const opener = await screen.findByRole("button", { name: "Remove Sam" });

      await user.click(opener);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();

      // After tabbing around inside it, too.
      await user.click(opener);
      const dialog = await screen.findByRole("dialog");
      await user.tab();
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();

      // A tap focuses nothing, so the opener is found by its id.
      opener.blur();
      fireEvent.click(opener);
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });

    it("doesn't hand focus back to a field a tap left it in", async () => {
      vi.stubGlobal(
        "fetch",
        fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM] })) })
      );
      const user = userEvent.setup();
      await renderPage();
      const opener = await screen.findByRole("button", { name: "Remove Sam" });

      // On iOS, tapping a button leaves focus in the field being typed in.
      screen.getByPlaceholderText("Display name").focus();
      fireEvent.click(opener);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(opener).toHaveFocus();
    });

    it("can't be closed while the removal is saving", async () => {
      let finishRemove = () => {};
      vi.stubGlobal(
        "fetch",
        fakeTripApi({
          "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM] })),
          // Hold the removal open until the test finishes it.
          "DELETE /api/v1/trips/trip-1/members/member-sam": () =>
            new Promise((resolve) => {
              finishRemove = () => resolve(reply(500, { error: "Database unavailable" }));
            }),
        })
      );
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByRole("button", { name: "Remove Sam" }));
      const dialog = await screen.findByRole("dialog");
      const confirm = within(dialog).getByRole("button", { name: "Remove Sam" });
      await user.click(confirm);

      expect(within(dialog).getByRole("button", { name: "Close" })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(confirm).toHaveFocus();
      await user.keyboard("{Escape}");
      fireEvent.pointerDown(document.body);
      expect(screen.getByRole("dialog")).toBe(dialog);

      await act(async () => finishRemove());
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't remove Sam", {
          description: "Database unavailable",
        })
      );
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("moves focus to the next member once someone is removed", async () => {
      let members = [ORGANIZER, SAM, ALEX];
      vi.stubGlobal(
        "fetch",
        fakeTripApi({
          "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ members })),
          "DELETE /api/v1/trips/trip-1/members/member-sam": () => {
            members = [ORGANIZER, ALEX];
            return reply(204, {});
          },
        })
      );
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByRole("button", { name: "Remove Sam" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove Sam" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Sam")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Remove Alex" })).toHaveFocus();
    });

    it("moves focus to the heading once the last removable member is removed", async () => {
      let members = [ORGANIZER, SAM];
      vi.stubGlobal(
        "fetch",
        fakeTripApi({
          "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ members })),
          "DELETE /api/v1/trips/trip-1/members/member-sam": () => {
            members = [ORGANIZER];
            return reply(204, {});
          },
        })
      );
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByRole("button", { name: "Remove Sam" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove Sam" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByText("Sam")).not.toBeInTheDocument());
      expect(screen.getByRole("heading", { name: "Manage crew" })).toHaveFocus();
    });
  });
});

import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ORGANIZER, SAM, TRIP, fakeTripApi, reply, tripFull } from "@/test/tripApi";
import ManageCrewPage from "./page";

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
});

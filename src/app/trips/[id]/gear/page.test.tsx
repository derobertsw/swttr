import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ORGANIZER, SAM, TRIP, fakeTripApi, reply, sentBodies, tripFull } from "@/test/tripApi";
import type { TripGroupGear } from "@/types/trips";
import GroupGearPage from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// These tests cover the page, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const TENT: TripGroupGear = {
  id: "gear-tent",
  trip_id: TRIP.id,
  description: "Tent",
  assignee_member_id: null,
  sort_order: 0,
  created_at: "2026-09-28T00:00:00Z",
};

/** The page suspends until its params resolve, so rendering is awaited. */
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <GroupGearPage params={Promise.resolve({ id: TRIP.id })} />
      </Suspense>
    );
  });
}

describe("Group gear page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds an item once it's saved, then clears the form", async () => {
    let gear: TripGroupGear[] = [];
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ members: [ORGANIZER, SAM], gear })),
      "POST /api/v1/trips/trip-1/gear": () => {
        gear = [{ ...TENT, description: "Stove", assignee_member_id: SAM.id }];
        return reply(201, { gear: gear[0] });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();

    const item = await screen.findByPlaceholderText("Tent, stove, first aid…");
    await user.type(item, "Stove");
    await user.selectOptions(screen.getByRole("combobox", { name: "Who's bringing it" }), "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Stove")).toBeInTheDocument();
    expect(item).toHaveValue("");
    expect(sentBodies(fetchMock, "POST /api/v1/trips/trip-1/gear")).toEqual([
      { description: "Stove", assignee_member_id: SAM.id },
    ]);
  });

  it("keeps the new item and who's bringing it when it can't be added", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM] })),
        "POST /api/v1/trips/trip-1/gear": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    const item = await screen.findByPlaceholderText("Tent, stove, first aid…");
    await user.type(item, "Stove");
    await user.selectOptions(screen.getByRole("combobox", { name: "Who's bringing it" }), "Sam");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't add Stove", {
        description: "Database unavailable",
      })
    );
    expect(item).toHaveValue("Stove");
    expect(screen.getByRole("combobox", { name: "Who's bringing it" })).toHaveValue(SAM.id);
    expect(screen.getByText("No group gear yet.")).toBeInTheDocument();
  });

  it("says so when a new assignee can't be saved", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ members: [ORGANIZER, SAM], gear: [TENT] })),
        "PATCH /api/v1/trips/trip-1/gear/gear-tent": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    const assignee = await screen.findByRole("combobox", { name: "Who's bringing Tent" });
    await user.selectOptions(assignee, "Sam");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't change who's bringing Tent", {
        description: "Database unavailable",
      })
    );
    expect(assignee).toHaveValue("");
    expect(assignee).toBeEnabled();
  });

  it("keeps an item listed when removing it fails", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ gear: [TENT] })),
        "DELETE /api/v1/trips/trip-1/gear/gear-tent": reply(500, { error: "Database unavailable" }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "Remove Tent" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't remove Tent", {
        description: "Database unavailable",
      })
    );
    expect(screen.getByText("Tent")).toBeInTheDocument();
  });
});

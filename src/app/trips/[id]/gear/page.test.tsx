import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ORGANIZER, SAM, TRIP, fakeTripApi, reply, sentBodies, tripFull } from "@/test/tripApi";
import { buildSharedTouringTemplate, sharedTouringGearId } from "@/lib/trip-shared-touring";
import type { SharedTouringTemplate } from "@/types/trip-packing";
import type { TripGroupGear } from "@/types/trips";
import GroupGearPage from "./page";

vi.mock("@/hooks/useUserId", () => ({ useUserId: () => "user-1" }));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// These tests cover the page, not the app chrome around it.
const TENT: TripGroupGear = {
  revision: "a171593c-5c29-4c09-96c4-c27e65b641e8",
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
      { id: expect.any(String), description: "Stove", assignee_member_id: SAM.id },
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

  it("keeps a saved addition blocked after a failed reload, then recovers by reading without adding again", async () => {
    let reads = 0;
    let created = false;
    const api = fakeTripApi({
      "GET /api/v1/trips/trip-1": () => {
        reads += 1;
        if (reads === 2 || reads === 3) return reply(503, { error: "Read failed" });
        return reply(200, tripFull({ gear: created ? [{ ...TENT, description: "Stove" }] : [] }));
      },
      "POST /api/v1/trips/trip-1/gear": () => { created = true; return reply(201, { gear: { ...TENT, description: "Stove" } }); },
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    await renderPage();
    const input = await screen.findByPlaceholderText("Tent, stove, first aid…");
    await user.type(input, "Stove");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/Stove was saved, but the latest list couldn't be loaded/)).toBeInTheDocument();
    expect(input).toHaveValue("Stove");
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload added item" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload added item" }));
    expect(await screen.findByText("Stove")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(input).toBeEnabled();
    expect(sentBodies(api, "POST /api/v1/trips/trip-1/gear")).toHaveLength(1);
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
    expect(assignee).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload shared gear" }));
    await waitFor(() => expect(assignee).toBeEnabled());
  });

  it("saves one row at a time, so another row's save can't re-enable it", async () => {
    const stove: TripGroupGear = { ...TENT, id: "gear-stove", description: "Stove", sort_order: 1 };
    let finishSave = () => {};
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(
          200,
          tripFull({ members: [ORGANIZER, SAM], gear: [TENT, stove] })
        ),
        // Hold the save open until the test finishes it.
        "PATCH /api/v1/trips/trip-1/gear/gear-tent": () =>
          new Promise((resolve) => {
            finishSave = () =>
              resolve(reply(200, { gear: { ...TENT, assignee_member_id: SAM.id } }));
          }),
      })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Who's bringing Tent" }),
      "Sam"
    );

    expect(screen.getByRole("combobox", { name: "Who's bringing Stove" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Stove" })).toBeDisabled();

    await act(async () => finishSave());
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Who's bringing Stove" })).toBeEnabled()
    );
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

  describe("Shared touring items (#212)", () => {
    const BOTHY: TripGroupGear = { ...TENT, id: "gear-bothy", description: "Bothy bag", revision: "c171593c-5c29-4c09-96c4-c27e65b641e8" };
    const fromTemplate = (templateId: string, description: string, sort_order: number): TripGroupGear =>
      ({ ...TENT, id: sharedTouringGearId(TRIP.id, templateId), description, sort_order });
    /** A trip with a Backcountry day, its shared gear `gear()` as it stands at each read. */
    function touringTrip(gear: () => TripGroupGear[], routes: Parameters<typeof fakeTripApi>[0] = {}) {
      return fakeTripApi({
        "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ members: [ORGANIZER, SAM], gear: gear() })),
        "GET /api/v1/trips/trip-1/gear/touring": () => reply(200, {
          dates: ["2026-10-10", "2026-10-11"], template: buildSharedTouringTemplate(TRIP.id, gear()),
        } satisfies SharedTouringTemplate),
        ...routes,
      });
    }

    it("previews the template as shared gear stands, and adds the chosen items unassigned", async () => {
      let gear = [BOTHY];
      const api = touringTrip(() => gear, {
        "POST /api/v1/trips/trip-1/gear/touring": () => {
          gear = [BOTHY, fromTemplate("first_aid", "First aid kit", 1), fromTemplate("repair_kit", "Repair kit", 2)];
          return reply(201, { added: ["First aid kit", "Repair kit"] });
        },
      });
      vi.stubGlobal("fetch", api);
      const user = userEvent.setup();
      await renderPage();

      const section = (await screen.findByRole("heading", { name: "Shared touring items" })).closest("section")!;
      expect(section).toHaveTextContent("Group items for the Backcountry days: Sat Oct 10, Sun Oct 11.");
      const open = within(section).getByRole("button", { name: "Add shared touring items" });
      await user.click(open);
      const dialog = await screen.findByRole("dialog", { name: "Shared touring items" });
      expect(dialog).toHaveTextContent("Added items start unassigned");
      const inGear = within(dialog).getByRole("heading", { name: "Already in shared gear" }).closest("section")!;
      expect(inGear).toHaveTextContent("Group shelter · in shared gear as Bothy bag");
      const suggested = within(dialog).getByRole("group", { name: "Suggested additions" });
      expect(within(suggested).getByRole("checkbox", { name: "First aid kit" })).toBeChecked();
      expect(within(suggested).getByRole("checkbox", { name: "Repair kit" })).toBeChecked();
      expect(within(dialog).queryByRole("checkbox", { name: "Group shelter" })).not.toBeInTheDocument();
      expect(dialog).toHaveTextContent("Shared items don't replace anyone's own rescue gear");

      await user.click(within(dialog).getByRole("button", { name: "Add selected items" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sentBodies(api, "POST /api/v1/trips/trip-1/gear/touring")).toEqual([{ ids: ["first_aid", "repair_kit"] }]);
      expect(within(section).getByRole("status")).toHaveTextContent("Added 2 items to shared gear. Choose who's bringing each one.");
      expect(screen.getByRole("combobox", { name: "Who's bringing First aid kit" })).toHaveValue("");
      expect(screen.getByRole("combobox", { name: "Who's bringing Repair kit" })).toHaveValue("");
      await waitFor(() => expect(open).toHaveFocus());

      // Opening it again reads shared gear again: everything is there now.
      await user.click(open);
      const again = await screen.findByRole("dialog", { name: "Shared touring items" });
      expect(again).toHaveTextContent("Everything on this list is in shared gear.");
      expect(within(again).queryByRole("button", { name: "Add selected items" })).not.toBeInTheDocument();
    });

    it("keeps the preview open after a failure, with what was added moved out of the selection", async () => {
      let gear: TripGroupGear[] = [];
      let posts = 0;
      const api = touringTrip(() => gear, {
        "POST /api/v1/trips/trip-1/gear/touring": () => {
          posts += 1;
          if (posts === 1) {
            gear = [fromTemplate("first_aid", "First aid kit", 0)];
            return reply(500, { error: "Couldn't save shared gear. Reload to check whether it saved, then try again.", added: ["First aid kit"] });
          }
          gear = [...gear, fromTemplate("repair_kit", "Repair kit", 1), fromTemplate("group_shelter", "Group shelter", 2)];
          return reply(201, { added: ["Repair kit", "Group shelter"] });
        },
      });
      vi.stubGlobal("fetch", api);
      const user = userEvent.setup();
      await renderPage();

      await user.click(await screen.findByRole("button", { name: "Add shared touring items" }));
      const dialog = await screen.findByRole("dialog", { name: "Shared touring items" });
      await user.click(within(dialog).getByRole("button", { name: "Add selected items" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Added First aid kit, but couldn't add the rest: Couldn't save shared gear. Reload to check whether it saved, then try again.");
      // The list behind the open preview shows what was added, and the preview no longer offers it.
      expect(await screen.findByRole("combobox", { name: "Who's bringing First aid kit", hidden: true })).toBeInTheDocument();
      await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Already in shared gear" }).closest("section")).toHaveTextContent("First aid kit"));
      expect(within(dialog).queryByRole("checkbox", { name: "First aid kit" })).not.toBeInTheDocument();
      expect(within(dialog).getByRole("checkbox", { name: "Repair kit" })).toBeChecked();

      await user.click(within(dialog).getByRole("button", { name: "Add selected items" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sentBodies(api, "POST /api/v1/trips/trip-1/gear/touring")).toEqual([
        { ids: ["first_aid", "repair_kit", "group_shelter"] }, { ids: ["repair_kit", "group_shelter"] },
      ]);
    });

    it("says so, and opens nothing, when the preview can't be loaded", async () => {
      let reads = 0;
      vi.stubGlobal("fetch", touringTrip(() => [], {
        "GET /api/v1/trips/trip-1/gear/touring": () => {
          reads += 1;
          return reads === 1 ? reply(200, { dates: ["2026-10-10"], template: buildSharedTouringTemplate(TRIP.id, []) })
            : reply(503, { error: "Database unavailable" });
        },
      }));
      const user = userEvent.setup();
      await renderPage();
      await user.click(await screen.findByRole("button", { name: "Add shared touring items" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't load shared touring items", { description: "Database unavailable" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("isn't offered on a trip without Backcountry days", async () => {
      vi.stubGlobal("fetch", touringTrip(() => [], {
        "GET /api/v1/trips/trip-1/gear/touring": reply(200, { dates: [], template: buildSharedTouringTemplate(TRIP.id, []) }),
      }));
      await renderPage();
      await screen.findByText("No group gear yet.");
      await act(async () => {});
      expect(screen.queryByRole("heading", { name: "Shared touring items" })).not.toBeInTheDocument();
    });

    it("isn't offered to a crew member, and isn't read for them", async () => {
      const member = { ...ORGANIZER, id: "member-me", role: "member" as const };
      const api = fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(200, tripFull({ trip: { ...TRIP, owner_user_id: "user-9" }, members: [member] })),
      });
      vi.stubGlobal("fetch", api);
      await renderPage();
      await screen.findByText("No group gear yet.");
      expect(screen.queryByRole("heading", { name: "Shared touring items" })).not.toBeInTheDocument();
      expect(api.mock.calls.some(([url]) => String(url).includes("/gear/touring"))).toBe(false);
    });
  });
});

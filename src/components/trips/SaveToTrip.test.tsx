import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEYS } from "@/lib/storage";
import { savedOutfit, savedPlan } from "@/test/savedKit";
import { fakeTripApi, reply, sentBodies, TRIP } from "@/test/tripApi";
import type { SaveKitOptions, SaveKitRequest } from "@/types/savedKit";
import type { TripMemberDayKit } from "@/types/trips";
import { SaveToTrip } from "./SaveToTrip";

const mockAuth = vi.hoisted(() => ({ userId: "user-1" as string | null, isLoaded: true }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mockAuth }));

const OPTIONS: SaveKitOptions = {
  dates: ["2026-10-10"],
  start_date: "2026-10-10",
  end_date: "2026-10-10",
  suggested_name: "Stowe trip",
  destination: "Stowe, Vermont",
  trips: [
    { id: TRIP.id, name: "Whistler", start_date: "2026-10-09", end_date: "2026-10-12", member_count: 3, day_number: 2 },
    { id: "trip-2", name: "Spring break", start_date: "2027-03-01", end_date: "2027-03-05", member_count: 1, day_number: null },
  ],
};
const KIT: TripMemberDayKit = {
  id: "kit-1", trip_day_id: "day-1", trip_member_id: "member-you", effort: "steady", items: ["shell", "gloves"],
  note: null, state: "ok", updated_at: "2026-10-06T20:01:02.123456+00:00", outfit: null, outfit_saved_at: null,
};
const SAVED = { status: "saved", trip: TRIP, created: false, kits: [{ ...KIT, outfit: savedOutfit(), date: "2026-10-10" }] };
const CONFLICT = { error: "You already have a kit for that day.", status: "conflict", trip: TRIP, conflicts: [{ date: "2026-10-10", kit: KIT, changes: null }] };

function setup(routes: Parameters<typeof fakeTripApi>[0]) {
  const fetchMock = fakeTripApi({ "POST /api/v1/trips/kits/options": reply(200, OPTIONS), ...routes });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openSheet(outfit = savedOutfit()) {
  const user = userEvent.setup();
  const view = render(<SaveToTrip outfit={outfit} />);
  await user.click(screen.getByRole("button", { name: "Save to trip" }));
  return { user, view, dialog: await screen.findByRole("dialog") };
}

describe("Save to trip", () => {
  beforeEach(() => {
    mockAuth.userId = "user-1";
    mockAuth.isLoaded = true;
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has nothing to offer without layers", () => {
    render(<SaveToTrip outfit={null} />);
    expect(screen.queryByRole("button", { name: "Save to trip" })).not.toBeInTheDocument();
  });

  it("sends a guest to sign in and back to this outing, to save it", async () => {
    mockAuth.userId = null;
    const fetchMock = setup({});
    const { dialog } = await openSheet();
    expect(within(dialog).getByRole("link", { name: "Sign in to save" }))
      .toHaveAttribute("href", "/sign-in?redirect_url=%2F%3Fresume%3Dsave");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves to a trip the person picks from those that include the date, then links to the day", async () => {
    const fetchMock = setup({ "POST /api/v1/trips/kits": reply(200, SAVED) });
    const { user, dialog } = await openSheet();

    // What's being saved, and only the trips with Saturday on them.
    expect(within(dialog).getByText("Alpine Skiing · Moderate effort")).toBeInTheDocument();
    expect(within(dialog).getByText("Personalized")).toBeInTheDocument();
    const whistler = await within(dialog).findByRole("radio", { name: /Whistler/ });
    expect(within(dialog).getByText("Day 2 · Fri, Oct 9 – Mon, Oct 12 · 3 people")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: /Spring break/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 of your trips doesn't include Sat, Oct 10.")).toBeInTheDocument();

    // An existing trip is picked on purpose.
    const save = within(dialog).getByRole("button", { name: "Save kit" });
    expect(save).toBeDisabled();
    await user.click(whistler);
    await user.click(save);

    expect(await within(dialog).findByText("Whistler")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open trip day" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
    const [sent] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(sent).toEqual({ save_id: expect.any(String), target: { trip_id: TRIP.id }, outfit: savedOutfit() });
  });

  it("makes a new trip with an editable suggested name when none include the date", async () => {
    const fetchMock = setup({
      "POST /api/v1/trips/kits/options": reply(200, { ...OPTIONS, trips: [OPTIONS.trips[1]] }),
      "POST /api/v1/trips/kits": reply(201, { ...SAVED, created: true }),
    });
    const { user, dialog } = await openSheet();
    expect(await within(dialog).findByRole("radio", { name: /New trip/ })).toBeChecked();
    expect(within(dialog).getByText("Sat, Oct 10 at Stowe, Vermont")).toBeInTheDocument();
    const name = within(dialog).getByRole("textbox", { name: "Trip name" });
    expect(name).toHaveValue("Stowe trip");
    await user.clear(name);
    await user.type(name, "Stowe Saturday");
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    await within(dialog).findByRole("link", { name: "Open trip day" });
    const [sent] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(sent.target).toEqual({ new_trip: { id: expect.any(String), name: "Stowe Saturday" } });
  });

  it("asks before replacing a kit, and replaces the version shown with the same save", async () => {
    let attempts = 0;
    const fetchMock = setup({
      "POST /api/v1/trips/kits": () => (++attempts === 1 ? reply(409, CONFLICT) : reply(200, SAVED)),
    });
    const { user, dialog } = await openSheet();
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));

    expect(await within(dialog).findByText("Replace your kit for Sat, Oct 10?")).toBeInTheDocument();
    expect(within(dialog).getByText("Whistler already has your kit for this day. Nothing changes unless you replace it.")).toBeInTheDocument();
    expect(within(dialog).getByText("shell, gloves")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Replace kit" }));
    await within(dialog).findByRole("link", { name: "Open trip day" });

    const [first, second] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(second).toEqual({ ...first, replace: { "2026-10-10": KIT.updated_at } });
  });

  it("names the ski tour phase each change is in", async () => {
    const changes = [
      { phase: "climb", add: [], remove: [] },
      { phase: "descent", add: [{ bodyPart: "hands", layerType: "outer", name: "Mittens" }], remove: [] },
    ];
    setup({ "POST /api/v1/trips/kits": reply(409, { ...CONFLICT, conflicts: [{ ...CONFLICT.conflicts[0], kit: { ...KIT, items: [], outfit: savedOutfit() }, changes }] }) });
    const { user, dialog } = await openSheet();
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    expect(await within(dialog).findByText("Descent adds:")).toBeInTheDocument();
    expect(within(dialog).getByText("Mittens (hands)")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Climb/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/The layers are the same/)).not.toBeInTheDocument();
  });

  it("keeps the saved kit when asked to", async () => {
    setup({ "POST /api/v1/trips/kits": reply(409, CONFLICT) });
    const { user, dialog } = await openSheet();
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    await user.click(await within(dialog).findByRole("button", { name: "Keep saved kit" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sessionStorage.getItem(STORAGE_KEYS.TRIP_KIT_SAVE)).toBeNull();
  });

  it("retries a failed save with the same identity, and after a reload too", async () => {
    let attempts = 0;
    const fetchMock = setup({
      "POST /api/v1/trips/kits": () => (++attempts < 3 ? reply(500, { error: "Database unavailable" }) : reply(200, SAVED)),
    });
    const { user, view, dialog } = await openSheet();
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't save: Database unavailable");
    await user.click(within(dialog).getByRole("button", { name: "Retry save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't save: Database unavailable");

    // A reload: the kept request is offered again, not a new save.
    view.unmount();
    const reopened = await openSheet();
    expect(await within(reopened.dialog).findByRole("alert")).toHaveTextContent("An earlier save may not have finished");
    await user.click(within(reopened.dialog).getByRole("button", { name: "Retry save" }));
    await within(reopened.dialog).findByRole("link", { name: "Open trip day" });

    const sent = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((body) => JSON.stringify(body))).size).toBe(1);
  });

  it("shows the outing as saved after a reload, rather than saving it again", async () => {
    const fetchMock = setup({ "POST /api/v1/trips/kits": reply(200, SAVED) });
    const { user, view, dialog } = await openSheet();
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    await within(dialog).findByRole("link", { name: "Open trip day" });
    view.unmount();

    const reopened = await openSheet();
    expect(within(reopened.dialog).getByRole("link", { name: "Open trip day" })).toBeInTheDocument();
    // Another account in the tab doesn't see it.
    reopened.view.unmount();
    mockAuth.userId = "user-2";
    const other = await openSheet();
    expect(await within(other.dialog).findByRole("radio", { name: /Whistler/ })).toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/v1/trips/kits")).toHaveLength(1);
  });

  it("chooses again after a save that can't be repeated", async () => {
    setup({ "POST /api/v1/trips/kits": reply(404, { error: "Trip not found. It may have been deleted, or you're no longer on it." }) });
    const { user, dialog } = await openSheet();
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Trip not found.");
    expect(within(dialog).queryByRole("button", { name: "Retry save" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Choose again" }));
    expect(await within(dialog).findByRole("radio", { name: /Whistler/ })).toBeInTheDocument();
  });

  it("labels general guidance and edited layers before saving", async () => {
    setup({});
    const { dialog } = await openSheet(savedOutfit({
      outing: { ...savedOutfit().outing, activity: "hiking_snowshoeing" },
      advice: { kind: "general", reason: "unsupported" },
      edited: true,
    }));
    expect(within(dialog).getByText("General guide")).toBeInTheDocument();
    expect(within(dialog).getByText("General guide for the temperature: Hiking / Snowshoeing has no personalized model yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("Includes your changes to the layers.")).toBeInTheDocument();
  });

  it("lets the trips be loaded again after a failure", async () => {
    let attempts = 0;
    setup({ "POST /api/v1/trips/kits/options": () => (++attempts === 1 ? reply(500, { error: "Database unavailable" }) : reply(200, OPTIONS)) });
    const { user, dialog } = await openSheet();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't load your trips: Database unavailable");
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByRole("radio", { name: /Whistler/ })).toBeInTheDocument();
  });

  it("saves the outfit as it is when saved, including a comfort check that finished after opening", async () => {
    const fetchMock = setup({ "POST /api/v1/trips/kits": reply(200, SAVED) });
    const checking = savedOutfit({ phases: [{ ...savedOutfit().phases[0], decision: null }] });
    const user = userEvent.setup();
    const { rerender } = render(<SaveToTrip outfit={checking} defaultOpen />);
    const dialog = await screen.findByRole("dialog");
    rerender(<SaveToTrip outfit={savedOutfit()} defaultOpen />);
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    await within(dialog).findByRole("link", { name: "Open trip day" });
    const [sent] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(sent.outfit?.phases[0].decision).toEqual(savedOutfit().phases[0].decision);
    expect(sentBodies(fetchMock, "POST /api/v1/trips/kits/options")).toHaveLength(1);
  });

  it("opens by itself after signing in to save", async () => {
    setup({});
    render(<SaveToTrip outfit={savedOutfit()} defaultOpen />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("picks the trip whose kit is being updated, when it includes the date", async () => {
    setup({});
    const user = userEvent.setup();
    const { unmount } = render(<SaveToTrip outfit={savedOutfit()} defaultTripId={TRIP.id} />);
    await user.click(screen.getByRole("button", { name: "Save to trip" }));
    expect(await within(await screen.findByRole("dialog")).findByRole("radio", { name: /Whistler/ })).toBeChecked();
    unmount();

    // A trip that doesn't include the date isn't picked.
    render(<SaveToTrip outfit={savedOutfit()} defaultTripId="trip-2" />);
    await user.click(screen.getByRole("button", { name: "Save to trip" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("radio", { name: /Whistler/ })).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save kit" })).toBeDisabled();
  });
});

describe("Save a multi-day plan to a trip", () => {
  const PLAN_OPTIONS: SaveKitOptions = {
    ...OPTIONS,
    dates: ["2026-10-10", "2026-10-11"],
    start_date: "2026-10-10",
    end_date: "2026-10-12",
    trips: [
      { ...OPTIONS.trips[0], day_number: 2 },
      { id: "trip-3", name: "Saturday only", start_date: "2026-10-10", end_date: "2026-10-10", member_count: 1, day_number: null },
    ],
  };
  const SAVED_PLAN = {
    status: "saved", trip: TRIP, created: false,
    kits: [{ ...KIT, date: "2026-10-10" }, { ...KIT, id: "kit-2", date: "2026-10-11" }],
  };

  beforeEach(() => {
    mockAuth.userId = "user-1";
    mockAuth.isLoaded = true;
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openPlan(routes: Parameters<typeof fakeTripApi>[0] = {}) {
    const fetchMock = fakeTripApi({ "POST /api/v1/trips/kits/options": reply(200, PLAN_OPTIONS), ...routes });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SaveToTrip plan={savedPlan()} />);
    await user.click(screen.getByRole("button", { name: "Save to trip" }));
    return { fetchMock, user, dialog: await screen.findByRole("dialog") };
  }

  it("saves a kit for each day with layers, naming the days left out, to a trip with all of them", async () => {
    const { fetchMock, user, dialog } = await openPlan({ "POST /api/v1/trips/kits": reply(200, SAVED_PLAN) });
    expect(within(dialog).getByText("Backcountry Skiing · Hard effort")).toBeInTheDocument();
    expect(within(dialog).getByText("General guide")).toBeInTheDocument();
    expect(within(dialog).getByText("General guide for each day's conditions: multi-day plans aren't personalized yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("A kit for each of 2 days, with that day's forecast.")).toBeInTheDocument();
    expect(await within(dialog).findByText("Mon, Oct 12 has no layers in this plan, so it isn't saved.")).toBeInTheDocument();
    expect(within(dialog).getByText("Stowe, Vermont, United States · Sat, Oct 10 – Sun, Oct 11")).toBeInTheDocument();
    expect(within(dialog).getByText("Days 2–3 · Fri, Oct 9 – Mon, Oct 12 · 3 people")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: /Saturday only/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("1 of your trips doesn't include all of Sat, Oct 10 – Sun, Oct 11.")).toBeInTheDocument();
    expect(within(dialog).getByText("Sat, Oct 10 – Mon, Oct 12 at Stowe, Vermont")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    expect(await within(dialog).findByText(/Your kits for Sat, Oct 10 – Sun, Oct 11 are saved as shown/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open trip" })).toHaveAttribute("href", "/trips/trip-1");
    const [sent] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(sent).toEqual({ save_id: expect.any(String), target: { trip_id: TRIP.id }, plan: savedPlan() });
    expect(sentBodies(fetchMock, "POST /api/v1/trips/kits/options")).toEqual([{ plan: savedPlan() }]);
  });

  it("asks once about every day that already has a kit, with each day's changes", async () => {
    let attempts = 0;
    const conflicts = [
      { date: "2026-10-10", kit: KIT, changes: null },
      { date: "2026-10-11", kit: { ...KIT, items: [], outfit: savedOutfit() }, changes: [{ phase: "outing", add: [], remove: [{ bodyPart: "hands", layerType: "outer", name: "Insulated gloves" }] }] },
    ];
    const { fetchMock, user, dialog } = await openPlan({
      "POST /api/v1/trips/kits": () => (++attempts === 1 ? reply(409, { ...CONFLICT, conflicts }) : reply(200, SAVED_PLAN)),
    });
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));

    expect(await within(dialog).findByText("Replace your kits for 2 days?")).toBeInTheDocument();
    expect(within(dialog).getByText("Whistler already has your kits for these days. Nothing is saved unless you replace them.")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Sat, Oct 10" })).toBeInTheDocument();
    expect(within(dialog).getByText("Replacing it swaps the checklist for these layers.")).toBeInTheDocument();
    expect(within(dialog).getByText("Insulated gloves (hands)")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/These layers are for 25°F – 31°F, wind up to 12 mph · forecast for Sun, Oct 11/)).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Replace kits" }));
    await within(dialog).findByRole("link", { name: "Open trip" });

    const [first, second] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(second).toEqual({ ...first, replace: { "2026-10-10": KIT.updated_at, "2026-10-11": KIT.updated_at } });
  });

  it("keeps the days already confirmed when a kit changes before replacing", async () => {
    let attempts = 0;
    const conflicts = [
      { date: "2026-10-10", kit: KIT, changes: null },
      { date: "2026-10-11", kit: { ...KIT, id: "kit-2" }, changes: null },
    ];
    // Sunday's kit changed after the question was asked.
    const newer = { ...KIT, id: "kit-2", updated_at: "2026-10-07T08:00:00.5+00:00" };
    const { fetchMock, user, dialog } = await openPlan({
      "POST /api/v1/trips/kits": () => (++attempts === 1
        ? reply(409, { ...CONFLICT, conflicts })
        : attempts === 2 ? reply(409, { ...CONFLICT, conflicts: [{ date: "2026-10-11", kit: newer, changes: null }] }) : reply(200, SAVED_PLAN)),
    });
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    await user.click(await within(dialog).findByRole("button", { name: "Replace kits" }));
    await user.click(await within(dialog).findByRole("button", { name: "Replace kit" }));
    await within(dialog).findByRole("link", { name: "Open trip" });

    const [, second, third] = sentBodies(fetchMock, "POST /api/v1/trips/kits") as SaveKitRequest[];
    expect(second.replace).toEqual({ "2026-10-10": KIT.updated_at, "2026-10-11": KIT.updated_at });
    expect(third.replace).toEqual({ "2026-10-10": KIT.updated_at, "2026-10-11": newer.updated_at });
  });

  it("names the daypart a plan day's change is in", async () => {
    const changes = [
      { phase: "outing", add: [], remove: [] },
      { phase: "evening", add: [{ bodyPart: "hands", layerType: "outer", name: "Warm mittens" }], remove: [] },
    ];
    const { user, dialog } = await openPlan({
      "POST /api/v1/trips/kits": reply(409, { ...CONFLICT, conflicts: [{ date: "2026-10-10", kit: { ...KIT, items: [], outfit: savedOutfit() }, changes }] }),
    });
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    expect(await within(dialog).findByText("Evening adds:")).toBeInTheDocument();
    expect(within(dialog).queryByText(/The layers are the same/)).not.toBeInTheDocument();
  });

  it("keeps every saved kit when asked to", async () => {
    const { user, dialog } = await openPlan({
      "POST /api/v1/trips/kits": reply(409, { ...CONFLICT, conflicts: [CONFLICT.conflicts[0], { ...CONFLICT.conflicts[0], date: "2026-10-11" }] }),
    });
    await user.click(await within(dialog).findByRole("radio", { name: /Whistler/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save kit" }));
    await user.click(await within(dialog).findByRole("button", { name: "Keep saved kits" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

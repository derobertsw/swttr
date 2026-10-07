import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEYS } from "@/lib/storage";
import { savedOutfit } from "@/test/savedKit";
import { fakeTripApi, reply, sentBodies, TRIP } from "@/test/tripApi";
import type { SaveKitOptions, SaveKitRequest } from "@/types/savedKit";
import type { TripMemberDayKit } from "@/types/trips";
import { SaveToTrip } from "./SaveToTrip";

const mockAuth = vi.hoisted(() => ({ userId: "user-1" as string | null, isLoaded: true }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mockAuth }));

const OPTIONS: SaveKitOptions = {
  date: "2026-10-10",
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
    expect(sent.outfit.phases[0].decision).toEqual(savedOutfit().phases[0].decision);
    expect(sentBodies(fetchMock, "POST /api/v1/trips/kits/options")).toHaveLength(1);
  });

  it("opens by itself after signing in to save", async () => {
    setup({});
    render(<SaveToTrip outfit={savedOutfit()} defaultOpen />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

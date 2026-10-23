import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { fakeTripApi, reply, sentBodies, TRIP } from "@/test/tripApi";
import { buildPackingListFromDays } from "@/lib/packingList";
import { buildTouringEquipment } from "@/lib/touring-equipment";
import type { TripGroupGear } from "@/types/trips";
import type { TripDayCoverage } from "@/types/trip-coverage";
import type { PackingCheckChange, PackingChecks, PackingItem, TripPackResponse } from "@/types/trip-packing";
import PackListPage from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const PACK = "GET /api/v1/trips/trip-1/pack";
const CHANGE = "POST /api/v1/trips/trip-1/pack";

const entry = (date: string, overrides: Partial<TripDayCoverage> = {}): TripDayCoverage => ({
  date, activity: "Alpine", stopName: "Stowe", advice: "unavailable", action: "retry_weather",
  message: "Couldn't load the forecast. Retry weather or plan your kit manually.",
  forecast: { status: "error", availableHours: 0, expectedHours: 16, message: "Couldn't load the forecast. Retry weather or plan your kit manually." },
  ...overrides,
});
const saved = (date: string, overrides: Partial<TripDayCoverage> = {}) => entry(date, {
  advice: "saved", action: "review_day", message: "Packed from your saved outfit.",
  forecast: { status: "not_requested", availableHours: 0, expectedHours: 0, reason: "not_needed", message: "Not needed." }, ...overrides,
});
const SHELL: PackingItem = {
  key: "item:g-3", name: "Ski shell", bodyPart: "torso", layerType: "outer", ownership: "owned", quantity: 1,
  days: [{ date: "2026-10-10", uses: ["wear"] }, { date: "2026-10-11", uses: ["wear", "carry"] }],
};
const FLEECE: PackingItem = { ...SHELL, key: "item:g-2", name: "Fleece", layerType: "mid", ownership: "suggested", days: [{ date: "2026-10-10", uses: ["wear"] }] };
const GAITER: PackingItem = { ...SHELL, key: "general:headNeck:base:neck gaiter", name: "Neck gaiter", bodyPart: "headNeck", layerType: "base", ownership: "general" };
const SNACKS: PackingItem = { ...SHELL, key: "carry:snacks", name: "Snacks", bodyPart: null, layerType: null, ownership: "general", days: [{ date: "2026-10-10", uses: ["carry"] }] };
const LAMP = { id: "0b4b6a7e-9c1d-4f53-a8b2-2f6c1d9e7a10", name: "Headlamp", quantity: 1 };

const pack = (coverage: TripDayCoverage[], overrides: Partial<TripPackResponse> = {}): TripPackResponse => ({
  trip: TRIP, totalDays: coverage.length, coverage, items: [], removed: [], kitVersions: {}, checklists: [], manual: [], checks: {}, editable: true,
  suggestions: buildPackingListFromDays([], new Map(), []), suggestedDays: coverage.filter((day) => day.advice === "available").length,
  skipped: [], groupGear: [], equipment: { dates: [], items: [], template: [], editable: true }, ...overrides,
});
async function renderPage() {
  await act(async () => { render(<Suspense fallback={null}><PackListPage params={Promise.resolve({ id: TRIP.id })} /></Suspense>); });
}

describe("Trip packing coverage", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("puts unresolved days above packing and links to recovery without asking for existing inputs", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([entry("2026-10-10")])) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Days to review" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry weather for 2026-10-10" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
    expect(screen.getByText(/No saved outfits yet/)).toBeInTheDocument();
    expect(screen.queryByText(/assign activities and a base location/)).not.toBeInTheDocument();
  });

  it("shows partial forecasts, checklists, rest days, suggested days and approximations separately", async () => {
    const partial = { status: "partial" as const, availableHours: 8, expectedHours: 16, message: "Partial forecast: 8 of 16 daytime hours available." };
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([
      entry("2026-10-10", { advice: "available", message: "No outfit saved. General suggestions for this day are below.", forecast: partial, action: "review_day" }),
      entry("2026-10-11", { advice: "manual", message: "Older checklist saved.", action: "plan_manually" }),
      entry("2026-10-12", { advice: "rest", activity: "Rest", message: "Rest day; review personal items manually.", action: "plan_manually" }),
      entry("2026-10-13", { advice: "available", activity: "Climb", approximation: "Climb uses general hiking guidance.", action: "review_day" }),
      saved("2026-10-14"),
    ])) }));
    await renderPage();
    expect(await screen.findByText(/From your saved outfits for 1 of 5 days/)).toBeInTheDocument();
    expect(screen.getByText(partial.message)).toBeInTheDocument();
    expect(screen.getByText("Older checklist saved.")).toBeInTheDocument();
    expect(screen.getByText("Rest day; review personal items manually.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan this day for 2026-10-10" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review checklist for 2026-10-11" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan kit manually for 2026-10-12" })).toBeInTheDocument();
    expect(screen.getByText("Climb uses general hiking guidance.")).toBeInTheDocument();
    // A saved day that still fits isn't one to review.
    expect(screen.queryByRole("link", { name: /2026-10-14/ })).not.toBeInTheDocument();
  });

  it("lists a saved outfit that no longer fits its day, with why", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([
      saved("2026-10-10", { message: "Your saved outfit doesn't match this day's plan now.", notes: ["Planned for Alpine Skiing, not this day's activity (XC)."] }),
    ])) }));
    await renderPage();
    expect(await screen.findByText("Planned for Alpine Skiing, not this day's activity (XC).")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review saved outfit for 2026-10-10" })).toBeInTheDocument();
    expect(screen.queryByText("Not needed.")).not.toBeInTheDocument();
  });

  it.each(["unsupported", "unavailable"] as const)("asks to plan a kit for %s days without a saved kit", async (advice) => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([entry("2026-10-10", { advice, action: "plan_manually" })])) }));
    await renderPage();
    expect(await screen.findByRole("link", { name: "Plan kit manually for 2026-10-10" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Review checklist/ })).not.toBeInTheDocument();
  });

  it("retains the last list when refreshing fails and announces the failure", async () => {
    let attempt = 0;
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: () => ++attempt === 1
      ? reply(200, pack([entry("2026-10-10")])) : reply(500, { error: "Database unavailable" }) }));
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "Days to review" });
    await user.click(screen.getByRole("button", { name: "Refresh pack list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByRole("link", { name: "Retry weather for 2026-10-10" })).toBeInTheDocument();
  });
});

describe("Packing from saved outfits", () => {
  beforeEach(() => { vi.mocked(toast.error).mockClear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("lists each item once by body area, with its days, how it's used and whose it is", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-10"), saved("2026-10-11")], { items: [FLEECE, SHELL, GAITER, SNACKS] })) }));
    await renderPage();
    const torso = await screen.findByRole("region", { name: "Upper body" });
    expect(within(torso).getByText("Ski shell")).toBeInTheDocument();
    expect(within(torso).getByText("Outer · Worn Sat Oct 10, Sun Oct 11 · Carried Sun Oct 11")).toBeInTheDocument();
    expect(within(torso).getByText("Your gear")).toBeInTheDocument();
    expect(within(torso).getByText("Not in your wardrobe")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Head & neck" })).getByText("General item")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Carry" })).getByText("Snacks")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("shows what changed until the person acknowledges it", async () => {
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10")], {
        items: [{ ...SHELL, change: { kind: "replaced", replaces: ["Rain shell"] } }, { ...FLEECE, change: { kind: "added" } }],
        removed: [{ key: "item:h-1", name: "Insulated gloves", dates: ["2026-10-10"] }],
        kitVersions: { "kit-1": "2026-10-10T01:00:00+00:00" },
      })),
      [CHANGE]: reply(200, { manual: [], quantities: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    const changes = await screen.findByRole("region", { name: "Your saved outfits changed" });
    expect(changes).toHaveTextContent("1 new, 1 replaced, 1 no longer in your outfits");
    expect(within(changes).getByText(/Insulated gloves/)).toHaveTextContent("Insulated gloves · was for Sat Oct 10");
    expect(screen.getByText("Replaces Rain shell")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();

    await user.click(within(changes).getByRole("button", { name: "Got it" }));
    expect(sentBodies(fetchMock, CHANGE)).toEqual([{ op: "acknowledge", kits: { "kit-1": "2026-10-10T01:00:00+00:00" } }]);
    expect(screen.queryByRole("region", { name: "Your saved outfits changed" })).not.toBeInTheDocument();
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "From your saved outfits" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Changes marked as seen");
  });

  it("reloads the list when the outfits changed again before acknowledging", async () => {
    let loads = 0;
    const fetchMock = fakeTripApi({
      [PACK]: () => reply(200, pack([saved("2026-10-10")], { items: [{ ...SHELL, change: { kind: "added" } }], kitVersions: { "kit-1": `v${++loads}` } })),
      [CHANGE]: reply(409, { error: "Your saved outfits changed. Here's your list now.", code: "kits_changed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Got it" }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't mark the changes as seen", { description: "Your saved outfits changed. Here's your list now." });
    expect(loads).toBe(2);
    expect(screen.getByRole("region", { name: "Your saved outfits changed" })).toBeInTheDocument();
  });

  it("saves a quantity, and puts it back when the save fails", async () => {
    let fail = false;
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10")], { items: [SHELL] })),
      [CHANGE]: () => fail ? reply(500, { error: "Couldn't save the change. Try again." }) : reply(200, { manual: [], quantities: { "item:g-3": 2 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    const stepper = await screen.findByRole("group", { name: "How many Ski shell" });
    expect(within(stepper).getByRole("button", { name: "One fewer Ski shell" })).toHaveAttribute("aria-disabled", "true");
    await user.click(within(stepper).getByRole("button", { name: "One more Ski shell" }));
    expect(sentBodies(fetchMock, CHANGE)).toEqual([{ op: "quantity", key: "item:g-3", quantity: 2 }]);
    expect(stepper).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("Ski shell: 2");

    fail = true;
    await user.click(within(stepper).getByRole("button", { name: "One more Ski shell" }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't change how many Ski shell", { description: "Couldn't save the change. Try again." });
    expect(stepper).toHaveTextContent("2");
    expect(within(stepper).getByRole("button", { name: "One more Ski shell" })).toHaveFocus();
  });

  it("keeps both quantities when an earlier save answers after a later one", async () => {
    let releaseFirst = () => {};
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10")], { items: [SHELL, FLEECE] })),
      [CHANGE]: (body) => (body as { key: string }).key === SHELL.key
        // The shell's save answers last, with a snapshot from before the fleece's.
        ? new Promise((resolve) => { releaseFirst = () => resolve(reply(200, { manual: [], quantities: { [SHELL.key]: 2 } })); })
        : reply(200, { manual: [], quantities: { [SHELL.key]: 2, [FLEECE.key]: 2 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "One more Ski shell" }));
    await user.click(screen.getByRole("button", { name: "One more Fleece" }));
    expect(screen.getByRole("group", { name: "How many Fleece" })).toHaveTextContent("2");
    // The shell is still saving, so its buttons ignore taps.
    expect(screen.getByRole("button", { name: "One more Ski shell" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => { releaseFirst(); });
    expect(screen.getByRole("group", { name: "How many Ski shell" })).toHaveTextContent("2");
    expect(screen.getByRole("group", { name: "How many Fleece" })).toHaveTextContent("2");
  });

  it("reads the list again when a quantity saved while it was being read", async () => {
    let releaseRead = () => {};
    let reads = 0;
    const fetchMock = fakeTripApi({
      [PACK]: () => {
        reads += 1;
        if (reads === 2) {
          // Read before the save below, answered after it.
          return new Promise((resolve) => { releaseRead = () => resolve(reply(200, pack([saved("2026-10-10")], { items: [SHELL] }))); });
        }
        return reply(200, pack([saved("2026-10-10")], { items: [{ ...SHELL, quantity: reads === 1 ? 1 : 2 }] }));
      },
      [CHANGE]: reply(200, { manual: [], quantities: { [SHELL.key]: 2 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Refresh pack list" }));
    await user.click(screen.getByRole("button", { name: "One more Ski shell" }));
    expect(screen.getByRole("group", { name: "How many Ski shell" })).toHaveTextContent("2");
    await act(async () => { releaseRead(); });
    expect(reads).toBe(3);
    expect(screen.getByRole("group", { name: "How many Ski shell" })).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "One more Ski shell" }));
    expect(sentBodies(fetchMock, CHANGE).at(-1)).toEqual({ op: "quantity", key: SHELL.key, quantity: 3 });
  });

  it("waits for a change still saving before reading the list again", async () => {
    let releaseSave = () => {};
    let releaseRead = () => {};
    let reads = 0;
    const fetchMock = fakeTripApi({
      [PACK]: () => {
        reads += 1;
        if (reads === 2) return new Promise((resolve) => { releaseRead = () => resolve(reply(200, pack([saved("2026-10-10")], { items: [SHELL] }))); });
        return reply(200, pack([saved("2026-10-10")], { items: [{ ...SHELL, quantity: reads === 1 ? 1 : 2 }] }));
      },
      [CHANGE]: () => new Promise((resolve) => { releaseSave = () => resolve(reply(200, { manual: [], quantities: { [SHELL.key]: 2 } })); }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Refresh pack list" }));
    await user.click(screen.getByRole("button", { name: "One more Ski shell" }));
    // The list read answers while the save is still out: it isn't shown.
    await act(async () => { releaseRead(); });
    expect(screen.getByRole("group", { name: "How many Ski shell" })).toHaveTextContent("2");
    expect(reads).toBe(2);
    await act(async () => { releaseSave(); });
    expect(reads).toBe(3);
    expect(screen.getByRole("group", { name: "How many Ski shell" })).toHaveTextContent("2");
  });

  it.each([false, true])("waits for personal saves after accepting shared gear, then reports only a real read failure (%s)", async (failRead) => {
    let releaseSave = () => {};
    let reads = 0;
    let gear: TripGroupGear = { id: "stove", trip_id: TRIP.id, description: "Stove", assignee_member_id: "member-you", sort_order: 0, created_at: TRIP.created_at, revision: "pending" };
    const fetchMock = fakeTripApi({
      [PACK]: () => {
        reads += 1;
        if (reads === 3 && failRead) return reply(503, { error: "Packing read failed" });
        return reply(200, pack([saved("2026-10-10")], { items: [{ ...SHELL, quantity: reads > 2 ? 2 : 1 }], groupGear: [gear] }));
      },
      [CHANGE]: () => new Promise((resolve) => { releaseSave = () => resolve(reply(200, { manual: [], quantities: { [SHELL.key]: 2 } })); }),
      "PATCH /api/v1/trips/trip-1/gear/stove": () => {
        gear = { ...gear, revision: "accepted", accepted_at: TRIP.created_at, accepted_by: "user-1" };
        return reply(200, { gear });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "One more Ski shell" }));
    await user.click(screen.getByRole("button", { name: "Accept Stove" }));
    await waitFor(() => expect(reads).toBe(2));
    const shared = screen.getByRole("region", { name: "Group gear (yours)" });
    expect(within(shared).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(shared).getByRole("button", { name: "Accept Stove" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => releaseSave());
    if (failRead) {
      expect(await within(shared).findByRole("alert")).toHaveTextContent("Saved, but the latest list couldn't be loaded");
      await user.click(within(shared).getByRole("button", { name: "Reload shared gear" }));
    }
    expect(await within(shared).findByRole("button", { name: "Mark packed Stove" })).not.toHaveAttribute("aria-disabled");
    expect(within(shared).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "How many Ski shell" })).toHaveTextContent("2");
  });

  it("adds an item by hand once across a retry, and removes it", async () => {
    let attempt = 0;
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10")])),
      [CHANGE]: (body) => {
        const change = body as { op: string; id: string; name?: string };
        if (change.op === "add_item") {
          return ++attempt === 1 ? reply(500, { error: "Couldn't save the change. Try again." })
            : reply(200, { manual: [{ id: change.id, name: change.name, quantity: 1 }], quantities: {} });
        }
        return reply(200, { manual: [], quantities: {} });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    const field = await screen.findByLabelText("Add an item");
    await user.type(field, "Headlamp{Enter}");
    expect(await screen.findByText("Couldn't add Headlamp: Couldn't save the change. Try again.")).toBeInTheDocument();
    expect(field).toHaveValue("Headlamp");
    expect(field).toHaveAttribute("aria-invalid", "true");

    await user.click(screen.getByRole("button", { name: "Add" }));
    const [first, second] = sentBodies(fetchMock, CHANGE) as Array<{ id: string }>;
    expect(second).toEqual({ op: "add_item", id: first.id, name: "Headlamp", quantity: 1 });
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Added Headlamp");

    await user.click(screen.getByRole("button", { name: "Remove Headlamp" }));
    expect(sentBodies(fetchMock, CHANGE).at(-1)).toEqual({ op: "remove_item", id: first.id });
    expect(screen.queryByText("Headlamp")).not.toBeInTheDocument();
  });

  it("asks for a name before adding", async () => {
    const fetchMock = fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-10")])) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Add" }));
    expect(screen.getByText("Name the item to add.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add an item")).toHaveFocus();
    expect(sentBodies(fetchMock, CHANGE)).toEqual([]);
  });

  it("reloads after a change to an item removed in another session", async () => {
    let loads = 0;
    const fetchMock = fakeTripApi({
      [PACK]: () => reply(200, pack([saved("2026-10-10")], { manual: ++loads === 1 ? [LAMP] : [] })),
      [CHANGE]: reply(404, { error: "That item was removed in another session. Reload your list." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "One more Headlamp" }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't change how many Headlamp", { description: "That item was removed in another session. Reload your list." });
    expect(loads).toBe(2);
    expect(screen.queryByText("Headlamp")).not.toBeInTheDocument();
  });

  it("shows the person's choices read-only when they can't be changed", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-10")], {
      items: [{ ...SHELL, quantity: 2, change: { kind: "added" } }], manual: [{ ...LAMP, quantity: 3 }], editable: false,
    })) }));
    await renderPage();
    expect(await screen.findByText("×2")).toBeInTheDocument();
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /How many/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add an item")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Got it" })).not.toBeInTheDocument();
    expect(screen.getByText(/can't be changed right now/)).toBeInTheDocument();
  });

  it("keeps older checklists, suggestions and group gear apart from the list", async () => {
    const day = {
      date: "2026-10-11", label: "Sun", changesFromPreviousDay: null, dayparts: [], carryItems: ["Spare gloves"],
      baseline: { minTemp: 20, maxTemp: 30, maxWindSpeed: 5, maxPrecipProbability: 0, effectiveTemperature: 20, recommendation: {
        torso: { base: [{ name: "Midweight base layer" }], outer: [] }, legs: { base: [], outer: [] }, hands: { base: [], outer: [] }, headNeck: { base: [], outer: [] },
      } },
    };
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-10")], {
      items: [SHELL],
      checklists: [{ date: "2026-10-12", items: ["shell", "gloves"] }],
      suggestions: buildPackingListFromDays([day], new Map(), []), suggestedDays: 1,
      groupGear: [{ id: "stove", trip_id: TRIP.id, description: "Stove", assignee_member_id: "member-you", sort_order: 0, created_at: TRIP.created_at }],
    })) }));
    await renderPage();
    const checklists = await screen.findByRole("region", { name: "Older day checklists" });
    expect(checklists).toHaveTextContent("Mon Oct 12 · Shell, Gloves");
    expect(within(checklists).getByRole("link", { name: "Open Mon Oct 12" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-12");
    const suggestions = screen.getByRole("region", { name: "Suggestions, not in your outfits" });
    expect(suggestions).toHaveTextContent("General guidance for 1 day without a saved outfit");
    expect(within(suggestions).getByText("Midweight base layer")).toBeInTheDocument();
    expect(within(suggestions).getByText("Spare gloves")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Group gear (yours)" })).getByText("Stove")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "From your saved outfits" })).queryByText("Midweight base layer")).not.toBeInTheDocument();
  });
});


describe("Private persistent packing checks", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const version = "3e045e88-53ca-4686-912a-e88c3f95461c";
  const checked = (quantity = 1): PackingChecks => ({ [SHELL.key]: { packed: true, quantity, version } });
  const choices = (checks: PackingChecks) => ({ manual: [], quantities: {}, checks });

  it("saves with Space and shows only confirmed state while saving, then survives a second page session", async () => {
    let release!: () => void;
    let checks: PackingChecks = {};
    const fetchMock = fakeTripApi({
      [PACK]: () => reply(200, pack([saved("2026-10-10")], { items: [SHELL], checks })),
      [CHANGE]: (body) => new Promise((resolve) => { release = () => {
        const change = body as PackingCheckChange;
        checks = { [change.key]: { packed: change.packed, quantity: change.quantity, version: change.mutation } };
        resolve(reply(200, choices(checks)));
      }; }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    const checkbox = await screen.findByRole("checkbox", { name: "Packed Ski shell" });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAttribute("aria-busy", "true");
    expect(checkbox).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Saving packing check");
    await act(async () => release());
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Ski shell: packed, saved");
    expect(sentBodies(fetchMock, CHANGE)[0]).toMatchObject({ op: "set_packed", key: SHELL.key, expected: null, quantity: 1, kits: {}, packed: true });
    // A new mount reads the account's server state, without client storage.
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    await renderPage();
    expect(await screen.findByRole("checkbox", { name: "Packed Ski shell" })).toBeChecked();
  });

  it("keeps the last confirmed state on failure and retries the identical mutation", async () => {
    let attempt = 0;
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10")], { items: [SHELL], checks: checked() })),
      [CHANGE]: (body) => ++attempt === 1 ? reply(500, { error: "Connection lost" })
        : reply(200, choices({ [SHELL.key]: { packed: false, quantity: 1, version: (body as PackingCheckChange).mutation } })),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    const checkbox = await screen.findByRole("checkbox", { name: "Packed Ski shell" });
    await user.click(checkbox);
    expect(await screen.findByRole("alert")).toHaveTextContent("wasn't confirmed");
    expect(checkbox).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Retry packing check for Ski shell" }));
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(sentBodies(fetchMock, CHANGE)).toEqual([sentBodies(fetchMock, CHANGE)[0], sentBodies(fetchMock, CHANGE)[0]]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reloads a same-item conflict and asks the person to review before another edit", async () => {
    let loads = 0;
    const fetchMock = fakeTripApi({
      [PACK]: () => reply(200, pack([saved("2026-10-10")], { items: [SHELL], checks: ++loads > 1 ? checked() : {} })),
      [CHANGE]: reply(409, { error: "This item changed in another session. Review its saved state and try again.", code: "packing_changed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Packed Ski shell" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Packed Ski shell" })).toBeChecked());
    expect(screen.getByRole("alert")).toHaveTextContent("another session");
    await user.click(screen.getByRole("button", { name: "Review saved list" }));
    expect(sentBodies(fetchMock, CHANGE)).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains both checks when different-item responses arrive out of order", async () => {
    let release!: () => void;
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10")], { items: [SHELL, FLEECE] })),
      [CHANGE]: (body) => {
        const change = body as PackingCheckChange;
        const result = reply(200, choices({ [change.key]: { packed: true, quantity: 1, version: change.mutation } }));
        return change.key === SHELL.key ? new Promise((resolve) => { release = () => resolve(result); }) : result;
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("checkbox", { name: "Packed Ski shell" }));
    await user.click(screen.getByRole("checkbox", { name: "Packed Fleece" }));
    expect(screen.getByRole("checkbox", { name: "Packed Fleece" })).toBeChecked();
    await act(async () => release());
    expect(screen.getAllByRole("checkbox").every((input) => (input as HTMLInputElement).checked)).toBe(true);
  });

  it("preserves checks for exact identities through removal and return, and leaves replacements unchecked", async () => {
    let loads = 0;
    const replacement = { ...SHELL, key: "item:new-shell", name: "A very long renamed replacement Ski shell for a winter weekend with the crew" };
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: () => reply(200, pack([saved("2026-10-10")], {
      checks: checked(), items: ++loads === 1 ? [FLEECE, { ...SHELL, name: "Renamed shell" }]
        : loads === 2 ? [replacement, FLEECE] : [SHELL, FLEECE],
    })) }));
    const user = userEvent.setup();
    await renderPage();
    expect(await screen.findByRole("checkbox", { name: "Packed Renamed shell" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Refresh pack list" }));
    expect(await screen.findByRole("checkbox", { name: `Packed ${replacement.name}` })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Refresh pack list" }));
    expect(await screen.findByRole("checkbox", { name: "Packed Ski shell" })).toBeChecked();
  });

  it("checks personal additions separately from assigned group gear, and hides all checks without persistence", async () => {
    let editable = true;
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: () => reply(200, pack([entry("2026-10-10")], {
      items: [SHELL], manual: [LAMP], groupGear: [{ id: "stove", trip_id: TRIP.id, description: "Crew stove", assignee_member_id: "member-you", sort_order: 0, created_at: TRIP.created_at }], editable,
      checks: { [`manual:${LAMP.id}`]: { packed: true, quantity: 1, version } },
    })) }));
    const user = userEvent.setup();
    await renderPage();
    expect(await screen.findByRole("checkbox", { name: "Packed Headlamp" })).toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    const gear = screen.getByRole("region", { name: "Group gear (yours)" });
    expect(within(gear).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Days to review" }).compareDocumentPosition(screen.getByRole("heading", { name: "From your saved outfits" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    editable = false;
    await user.click(screen.getByRole("button", { name: "Refresh pack list" }));
    expect(await screen.findByText(/Packing checks can't be loaded/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("Touring equipment", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const version = "fd037a5d-b4d4-4b2e-8d6a-624ca9c8503b";
  const touring = (saved: Parameters<typeof buildTouringEquipment>[0]["saved"] = {}, editable = true) =>
    buildTouringEquipment({ dates: ["2026-10-11"], saved, names: [], editable });
  const choices = (equipment: Record<string, { status: "added" | "removed"; quantity: number }>, checks: PackingChecks = {}) =>
    ({ manual: [], quantities: {}, checks, equipment });

  it("isn't shown for a trip without Backcountry days or equipment", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-10")])) }));
    await renderPage();
    await screen.findByRole("heading", { name: "From your saved outfits" });
    expect(screen.queryByRole("heading", { name: "Touring equipment" })).not.toBeInTheDocument();
  });

  it("lists equipment for the Backcountry days and checks it like any item", async () => {
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-10"), saved("2026-10-11")], { equipment: touring({ transceiver: { status: "added", quantity: 1 } }) })),
      [CHANGE]: (body) => reply(200, choices({ transceiver: { status: "added", quantity: 1 } },
        { "equipment:transceiver": { packed: true, quantity: 1, version: (body as PackingCheckChange).mutation } })),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    const section = (await screen.findByRole("heading", { name: "Touring equipment" })).closest("section")!;
    expect(within(section).getByText("For your Backcountry days: Sun Oct 11.")).toBeInTheDocument();
    await user.click(within(section).getByText("What it's for"));
    expect(within(section).getByText(/find someone buried in an avalanche/)).toBeVisible();
    const checkbox = within(section).getByRole("checkbox", { name: "Packed Avalanche transceiver" });
    await user.click(checkbox);
    expect(sentBodies(fetchMock, CHANGE)[0]).toMatchObject({ op: "set_packed", key: "equipment:transceiver", quantity: 1, packed: true, expected: null });
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it("adds the selected template items, keeping the selection when a save fails", async () => {
    let attempt = 0;
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-11")], { equipment: touring() })),
      [CHANGE]: (body) => ++attempt === 1 ? reply(500, { error: "Couldn't save the change. Try again." })
        : reply(200, choices(Object.fromEntries((body as { ids: string[] }).ids.map((id) => [id, { status: "added" as const, quantity: 1 }])))),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    expect(await screen.findByText(/Add the touring equipment you're bringing/)).toBeInTheDocument();
    const open = screen.getByRole("button", { name: "Add touring equipment" });
    await user.click(open);
    const dialog = await screen.findByRole("dialog", { name: "Touring equipment" });
    // The suggested additions start selected; optional items don't.
    for (const name of ["Avalanche transceiver", "Avalanche probe", "Avalanche shovel", "Climbing skins"]) {
      expect(within(dialog).getByRole("checkbox", { name })).toBeChecked();
    }
    expect(within(dialog).getByRole("checkbox", { name: "Helmet" })).not.toBeChecked();
    expect(within(dialog).getByRole("group", { name: "Optional" })).toBeInTheDocument();
    expect(within(dialog).getByText(/not a complete safety assessment/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Climbing skins" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Helmet" }));

    await user.click(within(dialog).getByRole("button", { name: "Add selected items" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't add the items: Couldn't save the change. Try again.");
    expect(within(dialog).getByRole("checkbox", { name: "Helmet" })).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Add selected items" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sentBodies(fetchMock, CHANGE).at(-1)).toEqual({ op: "add_equipment", ids: ["transceiver", "probe", "shovel", "helmet"] });
    const section = screen.getByRole("heading", { name: "Touring equipment" }).closest("section")!;
    expect(within(section).getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "Packed Avalanche transceiver", "Packed Avalanche probe", "Packed Avalanche shovel", "Packed Helmet",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("Added 4 items to your touring equipment");
    await waitFor(() => expect(screen.getByRole("button", { name: "Add more touring equipment" })).toHaveFocus());
  });

  it("asks for a selection before adding", async () => {
    const fetchMock = fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-11")], { equipment: touring() })) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Add touring equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Touring equipment" });
    for (const name of ["Avalanche transceiver", "Avalanche probe", "Avalanche shovel", "Climbing skins"]) {
      await user.click(within(dialog).getByRole("checkbox", { name }));
    }
    await user.click(within(dialog).getByRole("button", { name: "Add selected items" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Select at least one item to add.");
    expect(sentBodies(fetchMock, CHANGE)).toEqual([]);
  });

  it("removes an item, which the template then offers again under You removed", async () => {
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-11")], { equipment: touring({ transceiver: { status: "added", quantity: 1 }, probe: { status: "added", quantity: 1 } }),
        checks: { "equipment:transceiver": { packed: true, quantity: 1, version } } })),
      [CHANGE]: reply(200, choices({ transceiver: { status: "removed", quantity: 1 }, probe: { status: "added", quantity: 1 } })),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Remove Avalanche transceiver from your list" }));
    expect(sentBodies(fetchMock, CHANGE)).toEqual([{ op: "remove_equipment", id: "transceiver" }]);
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Packed Avalanche transceiver" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Touring equipment" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Removed Avalanche transceiver from your list");

    await user.click(screen.getByRole("button", { name: "Add more touring equipment" }));
    const dialog = await screen.findByRole("dialog", { name: "Touring equipment" });
    const removed = within(dialog).getByRole("group", { name: "You removed" });
    expect(within(removed).getByRole("checkbox", { name: "Avalanche transceiver" })).not.toBeChecked();
    expect(within(dialog).getByText("Avalanche probe").closest("section")).toHaveTextContent("Already in your list");
  });

  it("keeps both removals when an earlier one answers last", async () => {
    let releaseFirst!: () => void;
    const fetchMock = fakeTripApi({
      [PACK]: reply(200, pack([saved("2026-10-11")], { equipment: touring({ transceiver: { status: "added", quantity: 1 }, probe: { status: "added", quantity: 1 } }) })),
      [CHANGE]: (body) => (body as { id: string }).id === "transceiver"
        // Saved first, so its row still has the probe; it answers last.
        ? new Promise((resolve) => { releaseFirst = () => resolve(reply(200, choices({ transceiver: { status: "removed", quantity: 1 }, probe: { status: "added", quantity: 1 } }))); })
        : reply(200, choices({ transceiver: { status: "removed", quantity: 1 }, probe: { status: "removed", quantity: 1 } })),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Remove Avalanche transceiver from your list" }));
    await user.click(screen.getByRole("button", { name: "Remove Avalanche probe from your list" }));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Packed Avalanche probe" })).not.toBeInTheDocument());
    await act(async () => releaseFirst());
    expect(screen.queryByRole("checkbox", { name: "Packed Avalanche transceiver" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Packed Avalanche probe" })).not.toBeInTheDocument();
  });

  it("offers no equipment changes before they can be saved", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [PACK]: reply(200, pack([saved("2026-10-11")], { equipment: touring({}, false) })) }));
    await renderPage();
    expect(await screen.findByText(/Touring equipment can't be changed right now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /touring equipment/ })).not.toBeInTheDocument();
  });
});

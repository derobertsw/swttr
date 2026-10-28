import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildDayChecklists } from "@/lib/trip-checklist";
import { checklistTrip, gear, kit, source } from "@/test/dayChecklist";
import { savedOutfit } from "@/test/savedKit";
import { ALEX, BLAIR, PINE, SAT, SUN } from "@/test/splitStays";
import { fakeTripApi, reply, TRIP } from "@/test/tripApi";
import DayChecklistPage from "./page";

const ROUTE = `GET /api/v1/trips/${TRIP.id}/checklist`;
// Blair is signed in on Saturday.
const checklist = buildDayChecklists(checklistTrip({
  kits: [kit(ALEX.id, SAT, { outfit: savedOutfit() })],
  gear: [gear("Stove", BLAIR.id)],
  conditions: [source("avalanche", SAT, [{ user: "user-blair" }])],
}), "user-blair", Date.parse(`${SAT}T12:00:00Z`));

async function renderPage() {
  await act(async () => {
    render(<Suspense fallback={null}><DayChecklistPage params={Promise.resolve({ id: TRIP.id })} /></Suspense>);
  });
}

// These tests cover the page, not the app chrome around it.
describe("Day checklist page (#336)", () => {
  beforeEach(() => { window.history.replaceState({}, "", `/trips/${TRIP.id}/rollcall`); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("opens on today's day and lists who's taking part, with no Ready or Missing verdict", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: reply(200, checklist) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Sat Oct 10", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sat Oct 10" })).toHaveAttribute("aria-pressed", "true");
    const names = (title: string) => within(screen.getByRole("region", { name: title })).getAllByRole("listitem")
      .filter((item) => item.parentElement?.closest("li") === null).map((item) => item.querySelector("p")?.textContent);
    expect(names("Taking part (4)")).toEqual(["Alex", "Blair (you)", "Dana", "Eli"]);
    expect(names("There, not taking part (1)")).toEqual(["Casey"]);
    expect(names("Invitation pending (1)")).toEqual(["Fran"]);
    expect(screen.queryByText(/\bReady\b|\bMissing\b|\bOK\b/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Your packing list" })).toHaveLength(1);
  });

  it("links each fact to the exact person, day and task", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: reply(200, checklist) }));
    await renderPage();
    const base = `/trips/${TRIP.id}`;
    expect(await screen.findByRole("link", { name: "Alex's clothing for Sat Oct 10: Outfit saved" })).toHaveAttribute("href", `${base}/days/${SAT}#kit-${ALEX.id}`);
    expect(screen.getByRole("link", { name: "Blair's clothing for Sat Oct 10: Not started" })).toHaveAttribute("href", `${base}/days/${SAT}#kit-${BLAIR.id}`);
    expect(screen.getByRole("link", { name: "Blair's stay the night of Sat Oct 10: Pine rental" })).toHaveAttribute("href", `${base}/stays#stay-${PINE.id}`);
    expect(screen.getByRole("link", { name: "Stove" })).toHaveAttribute("href", `${base}/gear#shared-Stove`);
    expect(screen.getByText("· Awaiting acceptance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Blair's source reviews for Sat Oct 10: 1 of 1 source reviewed · latest Thu Oct 8" }))
      .toHaveAttribute("href", `${base}/days/${SAT}#conditions-heading`);
    expect(screen.getByRole("link", { name: "Alex's source reviews for Sat Oct 10: No sources reviewed yet" })).toBeInTheDocument();
  });

  it("changes day without reloading, and names who isn't on the trip that day", async () => {
    const api = fakeTripApi({ [ROUTE]: reply(200, checklist) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Fri Oct 9" }));
    expect(screen.getByRole("heading", { name: "Fri Oct 9", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Not on the trip this day: Casey")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /There, not taking part/ })).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("opens the day a link names", async () => {
    window.history.replaceState({}, "", `/trips/${TRIP.id}/rollcall?date=${SUN}`);
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: reply(200, checklist) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Sun Oct 11", level: 2 })).toBeInTheDocument();
  });

  it("says when the checklist couldn't load and tries again", async () => {
    let fail = true;
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: () => fail ? reply(500, { error: "Couldn't load the day checklist. Try again." }) : reply(200, checklist) }));
    const user = userEvent.setup();
    await renderPage();
    expect(await screen.findByText("Couldn't load the day checklist. Try again.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Sat Oct 10", level: 2 })).toBeInTheDocument();
  });

  it("reads the checklist again on coming back to the tab, keeping the chosen day, and ignores an older answer that arrives late", async () => {
    const later = buildDayChecklists(checklistTrip({ kits: [kit(BLAIR.id, SAT, { outfit: savedOutfit() })] }), "user-blair", Date.parse(`${SAT}T12:00:00Z`));
    const answers: Array<(value: ReturnType<typeof reply>) => void> = [];
    let calls = 0;
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: () => ++calls === 1 ? reply(200, checklist) : new Promise((resolve) => answers.push(resolve)) }));
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("button", { name: "Sun Oct 11" }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(answers).toHaveLength(2);
    await act(async () => answers[1](reply(200, later)));
    await act(async () => answers[0](reply(200, checklist)));
    expect(screen.getByRole("button", { name: "Sun Oct 11" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Sat Oct 10" }));
    expect(screen.getByRole("link", { name: "Blair's clothing for Sat Oct 10: Outfit saved" })).toBeInTheDocument();
  });

  it.each([401, 403, 404])("clears the crew's details once a refresh says access is gone (%i)", async (status) => {
    let calls = 0;
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: () => ++calls === 1 ? reply(200, checklist) : reply(status, { error: "Not found" }) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Sat Oct 10", level: 2 })).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sat Oct 10", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText("Blair (you)")).not.toBeInTheDocument();
  });

  it("keeps the last checklist when a refresh fails for another reason", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", fakeTripApi({ [ROUTE]: () => ++calls === 1 ? reply(200, checklist) : reply(500, { error: "Couldn't load the day checklist. Try again." }) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Sat Oct 10", level: 2 })).toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(await screen.findByText("Couldn't load the day checklist. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sat Oct 10", level: 2 })).toBeInTheDocument();
  });
});

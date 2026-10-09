import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { fakeTripApi, reply, sentBodies, STOWE_PLACE, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import { previewItinerary } from "@/lib/trip-itinerary";
import type { TripDay, TripFull, TripItineraryRequest } from "@/types/trips";
import TripStopsPage from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const params = Promise.resolve({ id: TRIP.id });
const second = { ...STOWE_STOP, id: "stop-2", position: 1, name: "Burlington" };

describe("Destinations after creation", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("adds a later stop without changing day assignments", async () => {
    const fetchMock = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP] })), "GET /api/geocode": reply(200, { results: [STOWE_PLACE] }), "POST /api/v1/trips/trip-1/stops": reply(201, { stop: second }) }); vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); await act(async () => { render(<TripStopsPage params={params} />); });
    await user.type(await screen.findByRole("combobox", { name: "Destination" }), "Stowe"); await user.click(await within(await screen.findByRole("listbox")).findByRole("option", { name: /Stowe/ })); await user.click(screen.getByRole("button", { name: "Add stop" }));
    expect(await screen.findByText("Burlington", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/Adding a stop keeps your daily plan unchanged/)).toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/v1/trips/trip-1/stops")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });
  it("previews exact affected dates and retains them after a failed assignment", async () => {
    let attempts = 0;
    const fetchMock = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP, second] })), "PATCH /api/v1/trips/trip-1/stops/stop-2": () => ++attempts === 1 ? reply(500, { error: "Assignment failed" }) : reply(200, { stop: second }) }); vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); await act(async () => { render(<TripStopsPage params={params} />); });
    await screen.findByText("Burlington", { selector: "p" }); await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Edit stop Burlington" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Sunday, October 11/ })).toBeEnabled());
    expect(within(dialog).getByText("No day assignments will change.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Sunday, October 11, 2026/ }));
    expect(within(dialog).getByText(/These days will use Burlington: 2026-10-11. Other days stay unchanged./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save stop" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(within(dialog).getByRole("button", { name: /Sunday, October 11/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(dialog).getByRole("button", { name: "Save stop" })); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Edit" })[1]).toHaveFocus();
    expect(sentBodies(fetchMock, "PATCH /api/v1/trips/trip-1/stops/stop-2")).toEqual([{ activities: [], day_dates: ["2026-10-11"] }, { activities: [], day_dates: ["2026-10-11"] }]);
  });
  it("shows saved assignments on opening and after assigning an additional day", async () => {
    let days = ["2026-10-10", "2026-10-11", "2026-10-12"].map((date) => ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id: date === "2026-10-11" ? second.id : STOWE_STOP.id, activity: null }));
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ stops: [STOWE_STOP, second], days })),
      "PATCH /api/v1/trips/trip-1/stops/stop-2": () => {
        days = days.map((day) => day.date === "2026-10-10" ? { ...day, stop_id: second.id } : day);
        return reply(200, { stop: second });
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await act(async () => { render(<TripStopsPage params={params} />); });
    await screen.findByText("Burlington", { selector: "p" });
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    let dialog = screen.getByRole("dialog", { name: "Edit stop Burlington" });
    await within(dialog).findByText(/Already assigned to Burlington: 2026-10-11/);
    expect(within(dialog).getByRole("button", { name: /Sunday, October 11/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /Sunday, October 11/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /Saturday, October 10/ })).toHaveAttribute("aria-pressed", "false");
    await user.click(within(dialog).getByRole("button", { name: /Saturday, October 10/ }));
    expect(within(dialog).getByText(/These days will use Burlington: 2026-10-10. Other days stay unchanged./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save stop" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    dialog = screen.getByRole("dialog", { name: "Edit stop Burlington" });
    await within(dialog).findByText(/Already assigned to Burlington: 2026-10-10, 2026-10-11/);
    expect(within(dialog).getByRole("button", { name: /Saturday, October 10/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: /Monday, October 12/ })).toHaveAttribute("aria-pressed", "false");
    expect(sentBodies(fetchMock, "PATCH /api/v1/trips/trip-1/stops/stop-2")).toEqual([{ activities: [], day_dates: ["2026-10-10"] }]);
  });
  it("blocks saving while assignments cannot be loaded and allows retry", async () => {
    let loads = 0;
    const fetchMock = fakeTripApi({ "GET /api/v1/trips/trip-1": () => ++loads === 2 ? reply(500, { error: "Unavailable" }) : reply(200, tripFull({ stops: [STOWE_STOP, second] })) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await act(async () => { render(<TripStopsPage params={params} />); });
    await screen.findByText("Burlington", { selector: "p" });
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Edit stop Burlington" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't load saved day assignments: Unavailable");
    expect(within(dialog).getByRole("button", { name: "Save stop" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /Sunday, October 11/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Retry loading days" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save stop" })).toBeEnabled());
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });
  it("locks date and activity selections to the submitted snapshot while saving", async () => {
    let finish = () => {};
    const fetchMock = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP, second] })),
      "PATCH /api/v1/trips/trip-1/stops/stop-2": () => new Promise((resolve) => { finish = () => resolve(reply(500, { error: "Unavailable" })); }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await act(async () => { render(<TripStopsPage params={params} />); });
    await screen.findByText("Burlington", { selector: "p" });
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    const dialog = screen.getByRole("dialog", { name: "Edit stop Burlington" });
    const sunday = within(dialog).getByRole("button", { name: /Sunday, October 11/ });
    const monday = within(dialog).getByRole("button", { name: /Monday, October 12/ });
    const alpine = within(dialog).getByRole("button", { name: "Alpine" });
    const hike = within(dialog).getByRole("button", { name: "Hike" });
    await waitFor(() => expect(sunday).toBeEnabled());
    await user.click(sunday); await user.click(alpine);
    await user.click(within(dialog).getByRole("button", { name: "Save stop" }));
    expect(sunday).toBeDisabled(); expect(monday).toBeDisabled();
    expect(alpine).toBeDisabled(); expect(hike).toBeDisabled();
    await user.click(monday); await user.click(hike);
    await act(async () => finish());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(sunday).toBeEnabled(); expect(alpine).toBeEnabled();
    expect(sunday).toHaveAttribute("aria-pressed", "true");
    expect(monday).toHaveAttribute("aria-pressed", "false");
    expect(alpine).toHaveAttribute("aria-pressed", "true");
    expect(hike).toHaveAttribute("aria-pressed", "false");
    expect(sentBodies(fetchMock, "PATCH /api/v1/trips/trip-1/stops/stop-2")).toEqual([{ activities: ["Alpine"], day_dates: ["2026-10-11"] }]);
  });

});

// Saturday on the base (Stowe) hiking, Sunday at Burlington, Monday at Jay Peak.
const jay = { ...STOWE_STOP, id: "stop-3", position: 2, name: "Jay Peak" };
const itineraryDays = (): TripDay[] => [
  { id: "day-10", trip_id: TRIP.id, date: "2026-10-10", stop_id: null, activity: "Hike" },
  { id: "day-11", trip_id: TRIP.id, date: "2026-10-11", stop_id: second.id, activity: null },
  { id: "day-12", trip_id: TRIP.id, date: "2026-10-12", stop_id: jay.id, activity: null },
];
const ITINERARY = "POST /api/v1/trips/trip-1/itinerary";

/** The stops page on a trip the fake API previews with the server's own rules; `save` answers each save. */
async function openItinerary(save: (body: Record<string, unknown>, full: TripFull) => ReturnType<typeof reply> | TripFull) {
  let full = tripFull({ stops: [STOWE_STOP, second, jay], days: itineraryDays() });
  const fetchMock = fakeTripApi({
    "GET /api/v1/trips/trip-1": () => reply(200, full),
    [ITINERARY]: (body) => {
      const { preview, ...request } = body as Record<string, unknown>;
      if (preview) return reply(200, previewItinerary(full, request as unknown as TripItineraryRequest));
      const result = save(request, full);
      if ("trip" in result) { full = result; return reply(200, { ok: true }); }
      return result;
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  await act(async () => { render(<TripStopsPage params={params} />); });
  await screen.findByText("Jay Peak", { selector: "p" });
  return { user, fetchMock, current: () => full };
}
const stopRows = () => screen.getAllByRole("button", { name: /^Edit$/ }).map((edit) => edit.closest("div.flex-wrap")?.querySelector("p")?.textContent);

describe("Changing the itinerary from Destinations", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("removes a stop only after choosing where its days go", async () => {
    const { user, fetchMock } = await openItinerary((_, full) => ({
      ...full, stops: full.stops.filter((stop) => stop.id !== second.id),
      days: full.days.map((day) => day.stop_id === second.id ? { ...day, stop_id: jay.id } : day),
    }));
    await user.click(screen.getByRole("button", { name: "Remove Burlington" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Burlington" });
    const toJay = await within(dialog).findByRole("radio", { name: "Jay Peak" });
    expect(within(dialog).getByRole("radio", { name: "Stowe, Vermont" })).not.toBeChecked();
    expect(toJay).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Remove stop" })).toBeDisabled();

    await user.click(toJay);
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("Sun Oct 11Burlington · No activity → Jay Peak · No activity");
    expect(within(dialog).getByText("2 other days keep their destination and activity.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove stop" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(stopRows()).toEqual(["Stowe, Vermont", "Jay Peak"]);
    expect(screen.getByText("Burlington removed.")).toBeInTheDocument();
    expect(sentBodies(fetchMock, ITINERARY).at(-1)).toEqual({ action: "remove_stop", stop_id: second.id, reassign_to: jay.id, expected: ["2026-10-11"] });
    // The days reload with the stops.
    expect(screen.getByRole("checkbox", { name: /Oct 11.*Jay Peak/ })).toBeInTheDocument();
  });

  it("keeps the review and the choice after a failed save, and shows the current review after a conflict", async () => {
    let saves = 0;
    const { user, fetchMock, current } = await openItinerary((_, full) => {
      saves += 1;
      if (saves === 1) return reply(500, { error: "Couldn't save the change. Nothing was changed; try again." });
      if (saves === 2) {
        // Meanwhile someone moved Monday to Burlington too.
        const changed = { ...full, days: full.days.map((day) => day.date === "2026-10-12" ? { ...day, stop_id: second.id } : day) };
        return reply(409, { error: "The trip changed since you reviewed it. Review the changes again.", ...previewItinerary(changed, { action: "remove_stop", stop_id: second.id }) });
      }
      return { ...full, stops: full.stops.filter((stop) => stop.id !== second.id) };
    });
    await user.click(screen.getByRole("button", { name: "Remove Burlington" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Burlington" });
    await user.click(await within(dialog).findByRole("radio", { name: "Stowe, Vermont" }));
    await user.click(within(dialog).getByRole("button", { name: "Remove stop" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nothing was changed");
    expect(within(dialog).getByRole("radio", { name: "Stowe, Vermont" })).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Remove stop" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The trip changed since you reviewed it.");
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "2 days change" })).toHaveFocus());
    expect(within(dialog).getByRole("radio", { name: "Stowe, Vermont" })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Remove stop" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sentBodies(fetchMock, ITINERARY).filter((body) => !(body as { preview?: boolean }).preview).map((body) => (body as { expected: string[] }).expected))
      .toEqual([["2026-10-11"], ["2026-10-11"], ["2026-10-11", "2026-10-12"]]);
    expect(current().stops.map((stop) => stop.name)).toEqual(["Stowe, Vermont", "Jay Peak"]);
  });

  it("moves a stop without a review, keeping every day's destination and focus on the stop", async () => {
    const { user, fetchMock } = await openItinerary((body, full) => ({
      ...full, stops: (body.order as string[]).map((id, position) => ({ ...full.stops.find((stop) => stop.id === id)!, position })),
      days: full.days.map((day) => ({ ...day, stop_id: day.stop_id ?? STOWE_STOP.id })),
    }));
    await user.click(screen.getByRole("button", { name: "Move Burlington earlier" }));
    expect(await screen.findByText("Order saved. Every day keeps its destination.")).toBeInTheDocument();
    expect(stopRows()).toEqual(["Burlington", "Stowe, Vermont", "Jay Peak"]);
    expect(screen.getByRole("button", { name: "Move Burlington earlier" })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Burlington later" })).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, ITINERARY)).toEqual([{ action: "reorder_stops", order: [second.id, STOWE_STOP.id, jay.id], expected: [STOWE_STOP.id, second.id, jay.id] }]);
    // Saturday kept Stowe when it stopped being the base.
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Oct 10.*Stowe, Vermont · Hike/ })).toBeInTheDocument());
  });

  it("reloads the stops when their order changed elsewhere", async () => {
    const { user, current } = await openItinerary(() => reply(409, { error: "The trip changed since you reviewed it. Review the changes again." }));
    current().stops.reverse();
    await user.click(screen.getByRole("button", { name: "Move Jay Peak earlier" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The stops changed since you opened them", expect.anything()));
    await waitFor(() => expect(stopRows()).toEqual(["Jay Peak", "Burlington", "Stowe, Vermont"]));
  });

  it("gives several days a destination and clears their activity after a review", async () => {
    const { user, fetchMock } = await openItinerary((body, full) => ({
      ...full, days: full.days.map((day) => (body.dates as string[]).includes(day.date) ? { ...day, stop_id: body.stop_id as string, activity: null } : day),
    }));
    const review = screen.getByRole("button", { name: /^Review changes/ });
    expect(review).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Oct 10/ }));
    await user.click(screen.getByRole("checkbox", { name: /Oct 12/ }));
    expect(review).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Destination for selected days" }), "Burlington");
    await user.selectOptions(screen.getByRole("combobox", { name: "Activity for selected days" }), "No activity");
    await user.click(screen.getByRole("button", { name: "Review changes to 2 days" }));

    const dialog = screen.getByRole("dialog", { name: "Review day changes" });
    expect(await within(dialog).findByText("Burlington and No activity for 2 days")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Sat Oct 10Stowe, Vermont (base) · Hike → Burlington · No activity",
      "Mon Oct 12Jay Peak · No activity → Burlington · No activity",
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sentBodies(fetchMock, ITINERARY).at(-1)).toEqual({
      action: "assign_days", dates: ["2026-10-10", "2026-10-12"], stop_id: second.id, activity: null,
      expected: [{ date: "2026-10-10", stop_id: null, activity: "Hike" }, { date: "2026-10-12", stop_id: jay.id, activity: null }],
    });
    expect(screen.getByText("Days saved.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Oct 10/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Oct 12.*Burlington · No activity/ })).toBeInTheDocument();
  });
});

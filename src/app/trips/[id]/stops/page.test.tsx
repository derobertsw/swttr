import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { fakeTripApi, reply, sentBodies, STOWE_PLACE, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
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
    await user.type(await screen.findByRole("combobox", { name: "Destination" }), "Stowe"); await user.click(await screen.findByRole("option", { name: /Stowe/ })); await user.click(screen.getByRole("button", { name: "Add stop" }));
    expect(await screen.findByText("Burlington")).toBeInTheDocument();
    expect(screen.getByText(/Adding a stop keeps your daily plan unchanged/)).toBeInTheDocument();
    expect(sentBodies(fetchMock, "POST /api/v1/trips/trip-1/stops")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
  });
  it("previews exact affected dates and retains them after a failed assignment", async () => {
    let attempts = 0;
    const fetchMock = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull({ stops: [STOWE_STOP, second] })), "PATCH /api/v1/trips/trip-1/stops/stop-2": () => ++attempts === 1 ? reply(500, { error: "Assignment failed" }) : reply(200, { stop: second }) }); vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); await act(async () => { render(<TripStopsPage params={params} />); });
    await screen.findByText("Burlington"); await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
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
    await screen.findByText("Burlington");
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
    await screen.findByText("Burlington");
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
    await screen.findByText("Burlington");
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

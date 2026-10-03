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
});

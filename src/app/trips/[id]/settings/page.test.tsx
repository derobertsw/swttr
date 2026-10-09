import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { previewDateChange } from "@/lib/trip-dates";
import { ORGANIZER, SAM, STOWE_STOP, TRIP, fakeTripApi, reply, sentBodies, tripFull } from "@/test/tripApi";
import type { TripFull } from "@/types/trips";
import TripSettingsPage from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const params = Promise.resolve({ id: TRIP.id });

// Saturday–Monday at Stowe, touring on Saturday, with Sam's kit on Monday.
const days = ["2026-10-10", "2026-10-11", "2026-10-12"].map((date) => ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id: STOWE_STOP.id, activity: date === "2026-10-10" ? "Ski touring" : null }));
const full: TripFull = tripFull({
  stops: [STOWE_STOP], members: [ORGANIZER, SAM], days,
  kits: [{ id: "kit-sam", trip_day_id: "day-2026-10-12", trip_member_id: SAM.id, effort: "steady", items: [], note: null, state: "ok", updated_at: TRIP.updated_at }],
});
type Body = { preview?: boolean; start_date: string; end_date: string };
const previewOf = (body: unknown, trip = full) => previewDateChange(trip, (body as Body).start_date, (body as Body).end_date);
const saved = (body: unknown) => reply(200, { trip: { ...TRIP, ...(body as object) } });

async function open(routes: Parameters<typeof fakeTripApi>[0]) {
  const api = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, full), ...routes });
  vi.stubGlobal("fetch", api);
  const user = userEvent.setup();
  await act(async () => { render(<TripSettingsPage params={params} />); });
  await screen.findByRole("textbox", { name: "Trip name" });
  return { api, user };
}
const setDates = (start: string, end: string) => {
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("End date"), { target: { value: end } });
};

describe("Trip settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renames the trip without a date review and returns to the trip", async () => {
    const { api, user } = await open({ "PATCH /api/v1/trips/trip-1": saved });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(screen.getByRole("textbox", { name: "Trip name" }));
    await user.type(screen.getByRole("textbox", { name: "Trip name" }), "Leaf peeping ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/trips/trip-1"));
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")).toEqual([{ name: "Leaf peeping" }]);
    expect(toast.success).toHaveBeenCalledWith("Trip renamed.");
  });

  it("asks whether to move the plan or keep it before moving the trip a week later", async () => {
    const { api, user } = await open({ "PATCH /api/v1/trips/trip-1": (body) => (body as Body).preview ? reply(200, previewOf(body)) : saved(body) });
    setDates("2026-10-17", "2026-10-19");
    await user.click(screen.getByRole("button", { name: "Review date change" }));
    const dialog = await screen.findByRole("dialog", { name: "Review date change" });
    await within(dialog).findByText("Sat Oct 10 – Mon Oct 12 · 3 days → Sat Oct 17 – Mon Oct 19 · 3 days");
    expect(within(dialog).getByRole("button", { name: "Change dates" })).toBeDisabled();

    await user.click(within(dialog).getByRole("radio", { name: /Keep plans on their calendar dates/ }));
    const removed = within(dialog).getByRole("heading", { name: "Removed, with their plans and kits" }).parentElement!;
    expect(within(removed).getByText("Sat Oct 10 · Stowe, Vermont · Ski touring")).toBeInTheDocument();
    expect(within(removed).getByText("Kit: Sam")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Remove 3 days and change dates" })).toBeEnabled();

    await user.click(within(dialog).getByRole("radio", { name: /Move the plan to the new dates/ }));
    expect(within(dialog).getByText("Sat Oct 10 → Sat Oct 17 · Stowe, Vermont · Ski touring")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Change dates" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/trips/trip-1"));
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")).toEqual([
      { start_date: "2026-10-17", end_date: "2026-10-19", preview: true },
      { start_date: "2026-10-17", end_date: "2026-10-19", mode: "move", lodging_revision: 0, expected_removed: [], from: { start_date: "2026-10-10", end_date: "2026-10-12" } },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Trip dates changed.");
  });

  it("confirms exactly the removed days it showed, with a new name in the same save", async () => {
    const { api, user } = await open({ "PATCH /api/v1/trips/trip-1": (body) => (body as Body).preview ? reply(200, previewOf(body)) : saved(body) });
    await user.clear(screen.getByRole("textbox", { name: "Trip name" }));
    await user.type(screen.getByRole("textbox", { name: "Trip name" }), "Short weekend");
    setDates("2026-10-10", "2026-10-11");
    await user.click(screen.getByRole("button", { name: "Review date change" }));
    const dialog = await screen.findByRole("dialog", { name: "Review date change" });
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(await within(dialog).findByText("2 days keep their date and plan.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Remove 1 day and change dates" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")[1]).toMatchObject({
      name: "Short weekend", mode: "keep",
      expected_removed: [{ date: "2026-10-12", stop_id: STOWE_STOP.id, activity: null, kit_ids: ["kit-sam"] }],
    });
  });

  it("shows the change as it is now when the trip changed after the review", async () => {
    const changed = { ...full, kits: [...full.kits, { ...full.kits[0], id: "kit-you", trip_member_id: ORGANIZER.id }] };
    let saves = 0;
    const { api, user } = await open({ "PATCH /api/v1/trips/trip-1": (body) => (body as Body).preview ? reply(200, previewOf(body))
      : ++saves === 1 ? reply(409, { error: "The trip changed since you reviewed it. Review the changes again.", ...previewOf(body, changed) }) : saved(body) });
    setDates("2026-10-10", "2026-10-11");
    await user.click(screen.getByRole("button", { name: "Review date change" }));
    const dialog = await screen.findByRole("dialog", { name: "Review date change" });
    await user.click(await within(dialog).findByRole("button", { name: "Remove 1 day and change dates" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The trip changed since you reviewed it.");
    expect(within(dialog).getByText("Kits: Sam, You")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Keeping plans on their dates" })).toHaveFocus());
    expect(mockPush).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove 1 day and change dates" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(sentBodies(api, "PATCH /api/v1/trips/trip-1")[2]).toMatchObject({ expected_removed: [{ kit_ids: ["kit-sam", "kit-you"] }] });
  });

  it("keeps the new dates when saving fails, and returns focus to the form", async () => {
    const { user } = await open({ "PATCH /api/v1/trips/trip-1": (body) => (body as Body).preview ? reply(200, previewOf(body)) : reply(500, { error: "Couldn't change the dates. Nothing was changed; try again." }) });
    setDates("2026-10-10", "2026-10-11");
    await user.click(screen.getByRole("button", { name: "Review date change" }));
    const dialog = await screen.findByRole("dialog", { name: "Review date change" });
    await user.click(await within(dialog).findByRole("button", { name: "Remove 1 day and change dates" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nothing was changed");
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("End date")).toHaveValue("2026-10-11");
    expect(screen.getByRole("button", { name: "Review date change" })).toHaveFocus();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("focuses the field to fix", async () => {
    const { user } = await open({ "PATCH /api/v1/trips/trip-1": reply(400, { error: "Trip name must be 1–200 characters.", field: "name" }) });
    setDates("2026-10-12", "2026-10-10");
    await user.click(screen.getByRole("button", { name: "Review date change" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The end date must be on or after the start date.");
    expect(screen.getByLabelText("End date")).toHaveFocus();
    setDates(TRIP.start_date, TRIP.end_date);
    await user.type(screen.getByRole("textbox", { name: "Trip name" }), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trip name must be 1–200 characters.");
    expect(screen.getByRole("textbox", { name: "Trip name" })).toHaveFocus();
  });
});

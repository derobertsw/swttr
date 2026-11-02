import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayNotesControls } from "./DayNotes";
import { fakeTripApi, reply, sentBodies, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay } from "@/types/trips";

const DATE = "2026-10-10";
const NOTES = `PUT /api/v1/trips/${TRIP.id}/days/${DATE}/notes`;
const DAY: TripDay = { id: "4c1d7a2e-9a51-4f5e-8f0a-2b3c4d5e6f70", trip_id: TRIP.id, stop_id: null, date: DATE, activity: "Alpine", notes: null };
const onSaved = vi.fn();

function renderControls(day: TripDay = DAY) {
  return render(<DayNotesControls tripId={TRIP.id} day={day} dateLabel="Sat, Oct 10" onSaved={onSaved} />);
}

describe("Day notes controls", () => {
  beforeEach(() => { vi.clearAllMocks(); onSaved.mockResolvedValue(undefined); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("adds notes for everyone on the day", async () => {
    const api = fakeTripApi({ [NOTES]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Add notes" }));
    expect(screen.getByRole("form", { name: "Notes for Sat, Oct 10" })).toBeInTheDocument();
    const field = screen.getByLabelText("Notes for everyone");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("maxLength", "2000");
    expect(screen.getByRole("button", { name: "Save notes" })).toBeDisabled();
    await user.type(field, "Tickets at will-call.{Enter}Rentals at Base Lodge by 8:15.");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByText("Notes saved.")).toBeInTheDocument();
    expect(sentBodies(api, NOTES)).toEqual([{ day_id: DAY.id, notes: "Tickets at will-call.\nRentals at Base Lodge by 8:15.", expected: { notes: null } }]);
    expect(onSaved).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add notes" })).toHaveFocus());
  });

  it("edits saved notes from what the editor showed, and removes them by clearing the box", async () => {
    const api = fakeTripApi({ [NOTES]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls({ ...DAY, notes: "Tickets at will-call." });
    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    const field = screen.getByLabelText("Notes for everyone");
    expect(field).toHaveValue("Tickets at will-call.");
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Remove notes" }));
    expect(await screen.findByText("Notes removed.")).toBeInTheDocument();
    expect(sentBodies(api, NOTES)).toEqual([{ day_id: DAY.id, notes: "", expected: { notes: "Tickets at will-call." } }]);
  });

  it("cancels straight back to the button without changes, and asks first with them", async () => {
    vi.stubGlobal("fetch", fakeTripApi({}));
    const user = userEvent.setup();
    renderControls({ ...DAY, notes: "Tickets at will-call." });
    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit notes" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Edit notes" }));
    await user.type(screen.getByLabelText("Notes for everyone"), " Lockers by the café.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard your changes to the notes?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Notes for everyone")).toHaveValue("Tickets at will-call. Lockers by the café.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit notes" })).toHaveFocus());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("asks before a reload drops unsaved notes", async () => {
    vi.stubGlobal("fetch", fakeTripApi({}));
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Add notes" }));
    const unload = () => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    expect(unload()).toBe(false);
    await user.type(screen.getByLabelText("Notes for everyone"), "Parking at lot B.");
    expect(unload()).toBe(true);
    fireEvent.change(screen.getByLabelText("Notes for everyone"), { target: { value: "  " } });
    expect(unload()).toBe(false);
  });

  it("keeps the notes after a failure", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [NOTES]: reply(503, { error: "Day notes can't be saved yet. Try again later.", field: "notes" }) }));
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Add notes" }));
    await user.type(screen.getByLabelText("Notes for everyone"), "Parking at lot B.");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Day notes can't be saved yet.");
    const field = screen.getByLabelText("Notes for everyone");
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("Parking at lot B.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reviews what's saved after a conflict, then saves over it on purpose", async () => {
    const moved = { ...DAY, id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", notes: "Meet at the clock tower.\nBring cash." };
    let conflict = true;
    const api = fakeTripApi({
      [NOTES]: () => conflict ? reply(409, { error: "The notes changed since you opened them. Check them, then try again." }) : reply(200, { ok: true }),
      [`GET /api/v1/trips/${TRIP.id}`]: () => { conflict = false; return reply(200, tripFull({ days: [moved] })); },
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Add notes" }));
    await user.type(screen.getByLabelText("Notes for everyone"), "Parking at lot B.");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The notes changed");
    expect(screen.getByLabelText("Notes for everyone")).not.toHaveAttribute("aria-invalid");
    // The brief behind the editor reloads to show what's saved now.
    expect(onSaved).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Review saved notes" }));
    const notice = await screen.findByText(/Saved now:/);
    expect(notice).toHaveTextContent("Saved now:Meet at the clock tower. Bring cash.Your notes are still here; save to replace them.");
    expect(screen.getByLabelText("Notes for everyone")).toHaveValue("Parking at lot B.");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await screen.findByText("Notes saved.");
    expect(sentBodies(api, NOTES)[1]).toEqual({ day_id: moved.id, notes: "Parking at lot B.", expected: { notes: "Meet at the clock tower.\nBring cash." } });
  });
});

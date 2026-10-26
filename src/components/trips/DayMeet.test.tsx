import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayMeetControls } from "./DayMeet";
import { fakeTripApi, reply, sentBodies, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay } from "@/types/trips";

const DATE = "2026-10-10";
const MEET = `PUT /api/v1/trips/${TRIP.id}/days/${DATE}/meet`;
const DAY: TripDay = { id: "4c1d7a2e-9a51-4f5e-8f0a-2b3c4d5e6f70", trip_id: TRIP.id, stop_id: null, date: DATE, activity: "Alpine",
  meet_time: null, meet_day_offset: 0, meet_time_zone: null };
const onSaved = vi.fn();

function renderControls(day: TripDay = DAY) {
  return render(<DayMeetControls tripId={TRIP.id} day={day} dateLabel="Sat, Oct 10" onSaved={onSaved} />);
}

describe("Day meet time controls", () => {
  beforeEach(() => { vi.clearAllMocks(); onSaved.mockResolvedValue(undefined); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("sets a meet time for the evening before, on the destination's clock", async () => {
    const api = fakeTripApi({ [MEET]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Set meet time" }));
    const time = screen.getByLabelText("Meet time (destination time)");
    expect(time).toHaveFocus();
    expect(screen.getByRole("form", { name: "Meet time for Sat, Oct 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save meet time" })).toBeDisabled();
    await user.type(time, "17:30");
    await user.selectOptions(screen.getByLabelText("Meet on"), "The day before");
    await user.click(screen.getByRole("button", { name: "Save meet time" }));
    expect(await screen.findByText("Meet time saved.")).toBeInTheDocument();
    expect(sentBodies(api, MEET)).toEqual([{ day_id: DAY.id, meet_time: "17:30", meet_day_offset: -1, expected: { meet_time: null, meet_day_offset: 0 } }]);
    expect(onSaved).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("button", { name: "Set meet time" })).toHaveFocus());
  });

  it("changes a saved time from what the editor showed, and cancels back to the button", async () => {
    const api = fakeTripApi({ [MEET]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls({ ...DAY, meet_time: "18:00:00", meet_day_offset: -1, meet_time_zone: "America/New_York" });
    await user.click(screen.getByRole("button", { name: "Change meet time" }));
    expect(screen.getByLabelText("Meet time (destination time)")).toHaveValue("18:00");
    expect(screen.getByLabelText("Meet on")).toHaveValue("-1");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Change meet time" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Change meet time" }));
    await user.selectOptions(screen.getByLabelText("Meet on"), "Sat, Oct 10");
    await user.click(screen.getByRole("button", { name: "Save meet time" }));
    await screen.findByText("Meet time saved.");
    expect(sentBodies(api, MEET)).toEqual([{ day_id: DAY.id, meet_time: "18:00", meet_day_offset: 0, expected: { meet_time: "18:00", meet_day_offset: -1 } }]);
  });

  it("removes it straight away", async () => {
    const api = fakeTripApi({ [MEET]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls({ ...DAY, meet_time: "07:00:00" });
    await user.click(screen.getByRole("button", { name: "Remove meet time" }));
    expect(await screen.findByText("Meet time removed.")).toBeInTheDocument();
    expect(sentBodies(api, MEET)).toEqual([{ day_id: DAY.id, meet_time: null, meet_day_offset: 0, expected: { meet_time: "07:00", meet_day_offset: 0 } }]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("keeps the time after a failure and focuses the field the server names", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [MEET]: reply(400, { error: "Meet before the tour plan's return target, or change the return target in the tour plan.", field: "meet_time" }) }));
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Set meet time" }));
    await user.type(screen.getByLabelText("Meet time (destination time)"), "16:00");
    await user.click(screen.getByLabelText("Meet on"));
    await user.click(screen.getByRole("button", { name: "Save meet time" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Meet before the tour plan's return target");
    const time = screen.getByLabelText("Meet time (destination time)");
    await waitFor(() => expect(time).toHaveFocus());
    expect(time).toHaveValue("16:00");
    expect(time).toHaveAttribute("aria-invalid", "true");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reviews what's saved after a conflict, then saves over it on purpose", async () => {
    const moved = { ...DAY, id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", meet_time: "06:00:00" };
    let conflict = true;
    const api = fakeTripApi({
      [MEET]: () => conflict ? reply(409, { error: "The meet time changed since you opened this. Check it, then try again." }) : reply(200, { ok: true }),
      [`GET /api/v1/trips/${TRIP.id}`]: () => { conflict = false; return reply(200, tripFull({ days: [moved],
        meets: [{ date: DATE, meet_label: "6:00 AM EDT · Sat Oct 10", time_zone_label: "Local time at the destination (America/New_York)." }] })); },
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderControls();
    await user.click(screen.getByRole("button", { name: "Set meet time" }));
    await user.type(screen.getByLabelText("Meet time (destination time)"), "07:15");
    await user.click(screen.getByRole("button", { name: "Save meet time" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The meet time changed");
    await user.click(screen.getByRole("button", { name: "Review saved meet time" }));
    expect(await screen.findByText("Saved now: meet 6:00 AM EDT · Sat Oct 10. Your time is still here; save to replace it.")).toBeInTheDocument();
    expect(screen.getByLabelText("Meet time (destination time)")).toHaveValue("07:15");
    await user.click(screen.getByRole("button", { name: "Save meet time" }));
    await screen.findByText("Meet time saved.");
    expect(sentBodies(api, MEET)[1]).toEqual({ day_id: moved.id, meet_time: "07:15", meet_day_offset: 0, expected: { meet_time: "06:00", meet_day_offset: 0 } });
  });

  it("shows the current meet time after a removal that conflicts", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [MEET]: reply(409, { error: "The meet time changed since you opened this. Check it, then try again." }) }));
    const user = userEvent.setup();
    renderControls({ ...DAY, meet_time: "07:00:00" });
    await user.click(screen.getByRole("button", { name: "Remove meet time" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The meet time changed");
    expect(onSaved).toHaveBeenCalledOnce();
  });
});

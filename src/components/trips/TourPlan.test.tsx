import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayTourPlan } from "./TourPlan";
import { buildTourPlanSummary } from "@/lib/trip-tour-plans";
import { fakeTripApi, reply, sentBodies, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripLocation, TripTourPlan, TripTourPlanSummary } from "@/types/trips";

const DATE = "2026-10-10";
const route = `/api/v1/trips/${TRIP.id}/days/${DATE}/tour-plan`;
const saved = (extra: Partial<TripTourPlan> = {}): TripTourPlanSummary => buildTourPlanSummary({
  id: "plan-1", trip_id: TRIP.id, trip_day_id: "day-1", objective: "Tuckerman Ravine", route_url: "https://example.com/route",
  meet_time: "06:30:00", meet_day_offset: 0, distance: 9.5, distance_unit: "km", ascent: 1100, ascent_unit: "m",
  duration_minutes: 360, metrics_source: null, metrics_source_url: null, approach_notes: "Skin up the Tuckerman trail", access_notes: "Pinkham Notch lot fills by 7",
  access_url: null, backup_plan: "Hillman's Highway if the bowl is loaded", return_time: "15:00:00", return_day_offset: 0,
  checkin_notes: "Text Sam by 5 PM", pickup_notes: null, time_zone: "America/New_York", revision: 3, created_by: "user-1",
  updated_by: "user-1", created_at: "2026-10-14T20:00:00Z", updated_at: "2026-10-14T20:00:00Z", ...extra,
}, DATE);
const DAYS = [{ id: "day-1", trip_id: TRIP.id, stop_id: null, date: DATE, activity: "Backcountry" }];
const onSaved = vi.fn().mockResolvedValue(undefined);
const onRestore = vi.fn().mockResolvedValue(undefined);
function renderPlan({ plans = [] as TripTourPlanSummary[], activity = "Backcountry" as string | null, canEdit = true } = {}) {
  return render(<DayTourPlan data={tripFull({ days: DAYS, tour_plans: plans })} date={DATE} dateLabel="Sat Oct 10" activity={activity}
    canEdit={canEdit} onSaved={onSaved} onRestore={onRestore} />);
}

describe("Day tour plan", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, ""); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("isn't shown on another activity's day without a saved plan", () => {
    const { container } = renderPlan({ activity: "Alpine" });
    expect(container).toBeEmptyDOMElement();
  });

  it("saves a route-only draft after the server confirms it", async () => {
    let finish = () => {};
    const api = fakeTripApi({ [`PUT ${route}`]: () => new Promise((resolve) => { finish = () => resolve(reply(200, { revision: 1 })); }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderPlan();
    expect(screen.getByText(/No tour plan yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add tour plan" }));
    await user.type(screen.getByLabelText("Route or objective"), "Tuckerman Ravine");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByText("Tour plan saved.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(sentBodies(api, `PUT ${route}`)[0]).toMatchObject({
      day_id: "day-1", expected_revision: 0,
      plan: { objective: "Tuckerman Ravine", meet_time: null, meet_day_offset: 0, distance: null, distance_unit: null, duration_minutes: null, return_day_offset: 0 },
    });
  });

  it("keeps the input and its save identity after a failure, so a retry can't save twice", async () => {
    const api = fakeTripApi({ [`PUT ${route}`]: reply(500, { error: "Database unavailable" }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Add tour plan" }));
    await user.type(screen.getByLabelText("Route or objective"), "Tuckerman Ravine");
    await user.type(screen.getByLabelText("Meet time (destination time)"), "06:30");
    await user.selectOptions(screen.getByLabelText("Meet on"), "The day before");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByLabelText("Route or objective")).toHaveValue("Tuckerman Ravine");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    const bodies = sentBodies(api, `PUT ${route}`) as Array<{ mutation_id: string; plan: object }>;
    expect(bodies).toHaveLength(2);
    expect(bodies[0].mutation_id).toBe(bodies[1].mutation_id);
    expect(bodies[0].plan).toMatchObject({ meet_time: "06:30", meet_day_offset: -1 });
  });

  it("focuses the field the server rejects, opening its section", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`PUT ${route}`]: reply(400, { error: "Use a complete http or https route link.", field: "route_url" }) }));
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Add tour plan" }));
    await user.type(screen.getByLabelText("Route or objective"), "Tuckerman");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    await waitFor(() => expect(screen.getByLabelText("Route or map link")).toHaveFocus());
    expect(screen.getByLabelText("Route or map link")).toHaveAttribute("aria-invalid", "true");
  });

  it("sends figures with their units and the duration in minutes", async () => {
    const api = fakeTripApi({ [`PUT ${route}`]: reply(200, { revision: 1 }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Add tour plan" }));
    await user.type(screen.getByLabelText("Route or objective"), "Tuckerman");
    await user.click(screen.getByText("Route link, distance and time (optional)"));
    await user.type(screen.getByLabelText("Distance"), "6.2");
    await user.type(screen.getByLabelText("Hours"), "5");
    await user.type(screen.getByLabelText("Minutes"), "45");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    // Without a metric temperature preference, figures default to miles and feet.
    expect(sentBodies(api, `PUT ${route}`)[0]).toMatchObject({ plan: { distance: "6.2", distance_unit: "mi", ascent: null, ascent_unit: null, duration_minutes: 345 } });
  });

  it("shows the saved plan's essentials without editing, and more on demand", async () => {
    const user = userEvent.setup();
    renderPlan({ plans: [saved()] });
    expect(screen.getByText("Tuckerman Ravine")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open route link (new tab)" })).toHaveAttribute("href", "https://example.com/route");
    expect(screen.getByText("6:30 AM EDT · Sat Oct 10 · Meeting point not set")).toBeInTheDocument();
    expect(screen.getByText("Hillman's Highway if the bowl is loaded")).toBeInTheDocument();
    expect(screen.getByText("3:00 PM EDT · Sat Oct 10")).toBeInTheDocument();
    expect(screen.getByText("Text Sam by 5 PM")).toBeInTheDocument();
    expect(screen.getByText("Pinkham Notch lot fills by 7")).toBeVisible();
    expect(screen.getByText(/9.5 km · 1,100 m ascent · 6 h/)).not.toBeVisible();
    await user.click(screen.getByText("More tour details"));
    expect(screen.getByText(/9.5 km · 1,100 m ascent · 6 h/)).toBeVisible();
    expect(screen.getByText("Crew estimate")).toBeVisible();
    expect(screen.getByText("Times are local to the destination (America/New_York).")).toBeInTheDocument();
  });

  it("meets at the day's access point from Getting there, its own or its stop's", async () => {
    const lot = (label: string): TripLocation => ({ label, address: null, latitude: 44.2571, longitude: -71.2531, precision: "exact",
      time_zone: null, source: "manual", provider: null, provider_id: null, attribution: null });
    const stop = { ...STOWE_STOP, access_point: lot("Pinkham Notch lot") };
    const { rerender } = render(<DayTourPlan data={tripFull({ stops: [stop], days: DAYS, tour_plans: [saved()] })} date={DATE} dateLabel="Sat Oct 10"
      activity="Backcountry" canEdit onSaved={onSaved} onRestore={onRestore} />);
    expect(screen.getByText("6:30 AM EDT · Sat Oct 10 · Pinkham Notch lot")).toBeInTheDocument();
    const own = [{ ...DAYS[0], access_point: lot("Cog Railway base"), access_point_stop_id: STOWE_STOP.id }];
    rerender(<DayTourPlan data={tripFull({ stops: [stop], days: own, tour_plans: [saved({ meet_time: null })] })} date={DATE} dateLabel="Sat Oct 10"
      activity="Backcountry" canEdit onSaved={onSaved} onRestore={onRestore} />);
    expect(screen.getByText("Time not set · Cog Railway base")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Change tour plan" }));
    expect(within(screen.getByRole("dialog")).getByText("Cog Railway base")).toBeVisible();
    expect(within(screen.getByRole("dialog")).getByText("Change the day's access point in Getting there.")).toBeVisible();
  });

  it("gives members the plan without organizer actions", () => {
    renderPlan({ plans: [saved()], canEdit: false });
    expect(screen.getByText("Managed by the organizer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tour plan/ })).not.toBeInTheDocument();
    expect(screen.getByText("Hillman's Highway if the bowl is loaded")).toBeInTheDocument();
  });

  it("keeps pending text while showing a newer saved plan, then saves over that revision", async () => {
    // The trip's dates moved, so another day holds this date now, with its own plan.
    const newer = saved({ revision: 4, trip_day_id: "day-2", backup_plan: "Stay below treeline" });
    const api = fakeTripApi({
      [`PUT ${route}`]: (body) => reply((body as { expected_revision: number }).expected_revision === 4 ? 200 : 409, { error: "The tour plan or this day changed. Review the saved plan before saving again." }),
      [`GET /api/v1/trips/${TRIP.id}`]: reply(200, tripFull({ days: [{ ...DAYS[0], id: "day-2" }], tour_plans: [newer] })),
    });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderPlan({ plans: [saved()] });
    await user.click(screen.getByRole("button", { name: "Change tour plan" }));
    const objective = screen.getByLabelText("Route or objective");
    await user.clear(objective);
    await user.type(objective, "Gulf of Slides");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The tour plan or this day changed");
    await user.click(screen.getByRole("button", { name: "Review saved plan" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("Stay below treeline")).toBeInTheDocument();
    expect(screen.getByLabelText("Route or objective")).toHaveValue("Gulf of Slides");
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(sentBodies(api, `PUT ${route}`).map((body) => {
      const { day_id, expected_revision } = body as { day_id: string; expected_revision: number };
      return [day_id, expected_revision];
    })).toEqual([["day-1", 3], ["day-2", 4]]);
  });

  it.each(["new revision", "removed plan", "activity change", "removed inactive plan", "different day"] as const)(
    "keeps an open draft and its original conflict baseline after a refresh: %s", async (change) => {
      const api = fakeTripApi({ [`PUT ${route}`]: reply(409, { error: "Review the saved plan before saving again." }) });
      vi.stubGlobal("fetch", api);
      const user = userEvent.setup();
      const view = renderPlan({ plans: [saved()] });
      await user.click(screen.getByRole("button", { name: "Change tour plan" }));
      const objective = screen.getByLabelText("Route or objective");
      await user.clear(objective);
      await user.type(objective, "Gulf of Slides");
      await user.click(screen.getByText("Backup and return (optional)"));
      await user.clear(screen.getByRole("textbox", { name: /^Backup plan/ }));
      await user.type(screen.getByRole("textbox", { name: /^Backup plan/ }), "Stay below treeline");

      const plans = change.includes("removed") ? [] : [saved({ revision: 4, objective: "Another saved route" })];
      const days = change === "different day" ? [{ ...DAYS[0], id: "day-2" }] : DAYS;
      view.rerender(<DayTourPlan data={tripFull({ days, tour_plans: plans })} date={DATE} dateLabel="Sat Oct 10"
        activity={change.includes("inactive") || change === "activity change" ? "Alpine" : "Backcountry"}
        canEdit onSaved={onSaved} onRestore={onRestore} />);

      expect(screen.getByLabelText("Route or objective")).toHaveValue("Gulf of Slides");
      expect(screen.getByRole("textbox", { name: /^Backup plan/ })).toHaveValue("Stay below treeline");
      await user.click(screen.getByRole("button", { name: "Save tour plan" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Review the saved plan");
      expect(sentBodies(api, `PUT ${route}`)[0]).toMatchObject({
        day_id: "day-1", expected_revision: 3,
        plan: { objective: "Gulf of Slides", backup_plan: "Stay below treeline" },
      });
      expect(onSaved).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByText("Discard changes?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Keep editing" }));
      expect(screen.getByLabelText("Route or objective")).toHaveValue("Gulf of Slides");
    },
  );

  it("keeps a name-only draft when another plan is added during a refresh", async () => {
    const api = fakeTripApi({ [`PUT ${route}`]: reply(409, { error: "Review the saved plan before saving again." }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    const view = renderPlan();
    await user.click(screen.getByRole("button", { name: "Add tour plan" }));
    await user.type(screen.getByLabelText("Route or objective"), "My hut approach");
    view.rerender(<DayTourPlan data={tripFull({ days: DAYS, tour_plans: [saved()] })} date={DATE} dateLabel="Sat Oct 10"
      activity="Backcountry" canEdit onSaved={onSaved} onRestore={onRestore} />);
    expect(screen.getByLabelText("Route or objective")).toHaveValue("My hut approach");
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Remove tour plan" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save tour plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Review the saved plan");
    expect(sentBodies(api, `PUT ${route}`)[0]).toMatchObject({ day_id: "day-1", expected_revision: 0, plan: { objective: "My hut approach" } });
  });

  it("removes a plan only after confirming, at its revision", async () => {
    const api = fakeTripApi({ [`DELETE ${route}`]: reply(200, { revision: 0 }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderPlan({ plans: [saved()] });
    await user.click(screen.getByRole("button", { name: "Change tour plan" }));
    await user.click(screen.getByRole("button", { name: "Remove tour plan" }));
    expect(screen.getByText(/will be deleted for everyone on the trip/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove tour plan" }));
    expect(await screen.findByText("Tour plan removed.")).toBeInTheDocument();
    expect(sentBodies(api, `DELETE ${route}`)[0]).toMatchObject({ day_id: "day-1", expected_revision: 3 });
  });

  it("asks before discarding edits", async () => {
    const user = userEvent.setup();
    renderPlan();
    await user.click(screen.getByRole("button", { name: "Add tour plan" }));
    await user.type(screen.getByLabelText("Route or objective"), "Tuckerman");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Route or objective")).toHaveValue("Tuckerman");
  });

  it("keeps a plan from another activity's day behind a disclosure with Restore", async () => {
    const user = userEvent.setup();
    renderPlan({ plans: [saved()], activity: "Alpine" });
    expect(screen.queryByRole("heading", { name: "Tour plan" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Saved tour plan · Tuckerman Ravine"));
    expect(screen.getByText(/activity is Alpine, so the tour plan isn't in use/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Restore tour plan" }));
    expect(onRestore).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Tour plan restored/)).toBeInTheDocument();
  });

  it("moves focus to the plan once Restore brings it back", async () => {
    const user = userEvent.setup();
    const view = renderPlan({ plans: [saved()], activity: "Alpine" });
    onRestore.mockImplementationOnce(async () => {
      view.rerender(<DayTourPlan data={tripFull({ days: DAYS, tour_plans: [saved()] })} date={DATE} dateLabel="Sat Oct 10" activity="Backcountry"
        canEdit onSaved={onSaved} onRestore={onRestore} />);
    });
    await user.click(screen.getByText("Saved tour plan · Tuckerman Ravine"));
    await user.click(screen.getByRole("button", { name: "Restore tour plan" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Tour plan" })).toHaveFocus());
  });

  it("says why Restore didn't work", async () => {
    onRestore.mockRejectedValueOnce(new Error("Check your connection and try again."));
    const user = userEvent.setup();
    renderPlan({ plans: [saved()], activity: null });
    await user.click(screen.getByText("Saved tour plan · Tuckerman Ravine"));
    await user.click(screen.getByRole("button", { name: "Restore tour plan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't restore the tour plan: Check your connection and try again.");
  });
});

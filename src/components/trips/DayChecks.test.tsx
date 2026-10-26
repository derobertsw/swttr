import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ORGANIZER, ORGANIZER_TO_CREW, SAM, STOWE_STOP, TRIP, fakeTripApi, reply, sentBodies, tripFull } from "@/test/tripApi";
import { buildTourPlanSummary } from "@/lib/trip-tour-plans";
import { dayChecksFor, planReviewContext, preparationFor, summarizeDayChecks, type DayCheckRows } from "@/lib/trip-day-checks";
import type { TripDay, TripFull, TripGroupGear, TripMember } from "@/types/trips";
import { CrewPreparation, DayChecks, TourPreparation } from "./DayChecks";

// The meet time is the day's (#333).
const DAY: TripDay = { id: "day-1", trip_id: TRIP.id, stop_id: STOWE_STOP.id, date: "2026-10-10", activity: "Backcountry",
  meet_time: "06:30:00", meet_day_offset: 0, meet_time_zone: "America/New_York" };
const ANA: TripMember = { ...SAM, id: "member-ana", user_id: "user-2", display_name: "Ana", status: "joined", invite_token: null };
const GUS: TripMember = { ...SAM, id: "member-gus", user_id: null, display_name: "Gus", status: "guest", invite_token: null };
const PLAN = buildTourPlanSummary({
  id: "plan-1", trip_id: TRIP.id, trip_day_id: DAY.id, objective: "Tuckerman Ravine", route_url: null,
  distance: null, distance_unit: null, ascent: null, ascent_unit: null,
  duration_minutes: null, metrics_source: null, metrics_source_url: null, approach_notes: null, access_notes: null,
  access_url: null, backup_plan: "Lower snowfields", return_time: null, return_day_offset: 0, checkin_notes: null,
  pickup_notes: null, time_zone: "America/New_York", revision: 1, created_by: "user-1", updated_by: "user-1",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
}, DAY.date);
const URL = "POST /api/v1/trips/trip-1/days/2026-10-10/checks";

type Entry = DayCheckRows["entries"][number];
let entryNumber = 0;
/** A saved entry for a check on DAY, recorded against the plan as PLAN has it. */
const entry = (extra: Partial<Entry> & Pick<Entry, "trip_member_id" | "kind">): Entry => ({
  id: `00000000-0000-4000-8000-00000000000${++entryNumber}`, entry_number: entryNumber, trip_day_id: DAY.id, action: "recorded",
  recorded_by: "user-1", plan_revision: extra.kind === "plan_review" ? 1 : null, time_zone: "America/New_York", created_at: "2026-10-10T10:12:00Z",
  context: extra.kind === "plan_review" ? planReviewContext({ stops: [STOWE_STOP], tour_plans: [PLAN] }, DAY) : { date: DAY.date, transceiver: null },
  ...extra,
});

/** The trip as `viewer` reads it, with checks from `entries`. */
function trip(viewer: string, entries: Entry[] = [], { members = [ORGANIZER, ANA, GUS], plans = [PLAN], gear = [] as TripGroupGear[], day = DAY } = {}): TripFull {
  const base = tripFull({ stops: [STOWE_STOP], days: [day], members: viewer === "user-1" ? members : members.map((m) => m === ORGANIZER ? ORGANIZER_TO_CREW : m),
    tour_plans: plans, gear });
  const day_checks = dayChecksFor(summarizeDayChecks({ entries, equipment: new Map() }, base), base, viewer);
  return { ...base, day_checks, preparation: preparationFor(base, day_checks, viewer, Date.parse("2026-10-01T12:00:00Z")) };
}

/** DayChecks whose reload moves on to the next trip in `after`. */
function Harness({ initial, after = [], userId, reload }: { initial: TripFull; after?: TripFull[]; userId: string; reload?: () => Promise<void> }) {
  const [data, setData] = useState(initial);
  const [queue] = useState(() => [...after]);
  return <DayChecks data={data} date={DAY.date} dateLabel="Sat, Oct 10" userId={userId}
    onSaved={async () => { await reload?.(); const next = queue.shift(); if (next) setData(next); }} />;
}

const checkbox = (name: RegExp | string) => screen.getByRole("checkbox", { name });

describe("Day checks", () => {
  beforeEach(() => { entryNumber = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("lists Before leaving and At the trailhead, as checkboxes naming the check, the person and the day", () => {
    render(<Harness initial={trip("user-2")} userId="user-2" />);
    const section = screen.getByRole("region", { name: "Day checks" });
    expect(within(section).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Day checks", "Before leaving", "At the trailhead"]);
    expect(checkbox("Tour and backup plan reviewed, you, Sat, Oct 10")).not.toBeChecked();
    expect(checkbox("Transceiver check, you, Sat, Oct 10")).toHaveAccessibleDescription(/^Not recorded yet/);
    expect(within(section).getByRole("link", { name: "Open the tour plan" })).toHaveAttribute("href", "#tour-plan-heading");
    // Only the organizer records a managed guest's checks.
    expect(within(section).queryByText(/Gus/)).not.toBeInTheDocument();
  });

  it("shows a check as recorded only once the server confirms it and the trip reloads", async () => {
    let finish!: () => void;
    const api = fakeTripApi({ [URL]: () => new Promise((resolve) => { finish = () => resolve(reply(200, { entry_id: "entry-1" })); }) });
    vi.stubGlobal("fetch", api);
    const recorded = trip("user-2", [entry({ trip_member_id: ANA.id, kind: "transceiver", recorded_by: "user-2" })]);
    render(<Harness initial={trip("user-2")} after={[recorded]} userId="user-2" />);
    const user = userEvent.setup();
    await user.click(checkbox(/^Transceiver check/));
    expect(checkbox(/^Transceiver check/)).not.toBeChecked();
    expect(checkbox(/^Transceiver check/)).toHaveAttribute("aria-busy", "true");
    // A second tap while it saves sends nothing.
    await user.click(checkbox(/^Transceiver check/));
    expect(sentBodies(api, URL)).toEqual([{
      action: "record", kind: "transceiver", day_id: DAY.id, member_id: ANA.id, expected_entry_id: null,
      context_key: trip("user-2").day_checks![0].checks.find((check) => check.member_id === ANA.id && check.kind === "transceiver")!.context_key,
      mutation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }]);
    finish();
    await waitFor(() => expect(checkbox(/^Transceiver check/)).toBeChecked());
    expect(checkbox(/^Transceiver check/)).toHaveAccessibleDescription("Recorded 6:12 AM EDT · Sat Oct 10");
    expect(screen.getByRole("status")).toHaveTextContent("Recorded: Transceiver check, you, Sat, Oct 10");
  });

  it("keeps a check as it was when saving fails, and retries with the same save identity", async () => {
    let attempt = 0;
    const api = fakeTripApi({ [URL]: () => ++attempt === 1 ? reply(500, { error: "Couldn't save the check. Try again." }) : reply(200, { entry_id: "entry-1" }) });
    vi.stubGlobal("fetch", api);
    render(<Harness initial={trip("user-2")} userId="user-2" />);
    const user = userEvent.setup();
    await user.click(checkbox(/^Tour and backup plan reviewed/));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the check: Couldn't save the check. Try again.");
    expect(checkbox(/^Tour and backup plan reviewed/)).not.toBeChecked();
    await user.click(checkbox(/^Tour and backup plan reviewed/));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    const [first, retry] = sentBodies(api, URL) as Array<{ mutation_id: string }>;
    expect(retry.mutation_id).toBe(first.mutation_id);
  });

  it("offers the latest when the plan changed since the page loaded", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [URL]: reply(409, { error: "What this check covers changed since you opened the day." }) }));
    const reload = vi.fn().mockResolvedValue(undefined);
    render(<Harness initial={trip("user-2")} userId="user-2" reload={reload} />);
    const user = userEvent.setup();
    await user.click(checkbox(/^Tour and backup plan reviewed/));
    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByRole("button", { name: "Check the latest" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(reload).toHaveBeenCalledOnce();
  });

  it("undoes a recorded check, keeping it in the history", async () => {
    const first = entry({ trip_member_id: ANA.id, kind: "plan_review", recorded_by: "user-2" });
    const api = fakeTripApi({ [URL]: reply(200, { entry_id: "entry-2" }) });
    vi.stubGlobal("fetch", api);
    const undone = trip("user-2", [first, entry({ trip_member_id: ANA.id, kind: "plan_review", recorded_by: "user-2", action: "withdrawn", created_at: "2026-10-10T10:20:00Z" })]);
    render(<Harness initial={trip("user-2", [first])} after={[undone]} userId="user-2" />);
    expect(checkbox(/^Tour and backup plan reviewed/)).toHaveAccessibleDescription("Recorded 6:12 AM EDT · Sat Oct 10 · tour plan revision 1");
    const user = userEvent.setup();
    await user.click(checkbox(/^Tour and backup plan reviewed/));
    expect(sentBodies(api, URL)).toMatchObject([{ action: "withdraw", kind: "plan_review", expected_entry_id: first.id }]);
    await waitFor(() => expect(checkbox(/^Tour and backup plan reviewed/)).not.toBeChecked());
    expect(checkbox(/^Tour and backup plan reviewed/)).toHaveAccessibleDescription("Not recorded · Undone 6:20 AM EDT · Sat Oct 10 · tour plan revision 1");
    await user.click(screen.getByText("History"));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Undone 6:20 AM EDT · Sat Oct 10 · tour plan revision 1", "Recorded 6:12 AM EDT · Sat Oct 10 · tour plan revision 1",
    ]);
  });

  it("says when the plan changed since it was reviewed, and records it again", async () => {
    const first = entry({ trip_member_id: ANA.id, kind: "plan_review", recorded_by: "user-2" });
    const changed = trip("user-2", [first], { plans: [{ ...PLAN, backup_plan: "Stay low" }], day: { ...DAY, meet_time: "07:00:00" } });
    const api = fakeTripApi({ [URL]: reply(200, { entry_id: "entry-2" }) });
    vi.stubGlobal("fetch", api);
    render(<Harness initial={changed} userId="user-2" />);
    expect(checkbox(/^Tour and backup plan reviewed/)).not.toBeChecked();
    expect(screen.getByText("Plan changed — review it again")).toBeInTheDocument();
    expect(screen.getByText("Backup plan changed · Meet time changed")).toBeInTheDocument();
    await userEvent.setup().click(checkbox(/^Tour and backup plan reviewed/));
    expect(sentBodies(api, URL)).toMatchObject([{ action: "record", expected_entry_id: first.id }]);
  });

  it("has no plan to review without a tour plan, but keeps the transceiver check", () => {
    render(<Harness initial={trip("user-2", [], { plans: [] })} userId="user-2" />);
    expect(screen.queryByRole("checkbox", { name: /^Tour and backup plan reviewed/ })).not.toBeInTheDocument();
    expect(screen.getByText(/no tour plan to review yet/)).toBeInTheDocument();
    expect(checkbox(/^Transceiver check/)).toBeInTheDocument();
  });

  it("lets the organizer record a managed guest's checks, shown as recorded by them", async () => {
    const recorded = trip("user-1", [entry({ trip_member_id: GUS.id, kind: "transceiver", recorded_by: "user-1" })]);
    const api = fakeTripApi({ [URL]: reply(200, { entry_id: "entry-1" }) });
    vi.stubGlobal("fetch", api);
    render(<Harness initial={trip("user-1")} after={[recorded]} userId="user-1" />);
    expect(screen.getByRole("heading", { name: "Gus · managed guest" })).toBeInTheDocument();
    await userEvent.setup().click(checkbox("Transceiver check, Gus, Sat, Oct 10"));
    expect(sentBodies(api, URL)).toMatchObject([{ action: "record", kind: "transceiver", member_id: GUS.id }]);
    await waitFor(() => expect(checkbox("Transceiver check, Gus, Sat, Oct 10")).toBeChecked());
    expect(checkbox("Transceiver check, Gus, Sat, Oct 10")).toHaveAccessibleDescription("Recorded 6:12 AM EDT · Sat Oct 10 by you");
    expect(checkbox("Transceiver check, you, Sat, Oct 10")).not.toBeChecked();
  });

  it("says when the person isn't taking part that day", () => {
    const data = trip("user-2");
    render(<Harness initial={{ ...data, day_checks: [{ ...data.day_checks![0], checks: [] }] }} userId="user-2" />);
    expect(screen.getByText("You're not taking part on Saturday, so there are no checks for you.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("Crew preparation", () => {
  beforeEach(() => { entryNumber = 0; });
  const gear: TripGroupGear[] = [
    { id: "gear-1", trip_id: TRIP.id, description: "Group shelter", assignee_member_id: ANA.id, sort_order: 0, created_at: "", accepted_at: null, packed_at: null },
    { id: "gear-2", trip_id: TRIP.id, description: "Repair kit", assignee_member_id: GUS.id, sort_order: 1, created_at: "", accepted_at: "2026-10-02T00:00:00Z", packed_at: null },
  ];

  it("summarizes everyone else's checks and shared items, and expands to each person", async () => {
    const data = trip("user-1", [
      entry({ trip_member_id: ANA.id, kind: "plan_review", recorded_by: "user-2" }),
      entry({ trip_member_id: GUS.id, kind: "transceiver", recorded_by: "user-1" }),
    ], { gear, plans: [{ ...PLAN, objective: "Hillman's Highway" }] });
    render(<CrewPreparation data={data} date={DAY.date} dateLabel="Sat, Oct 10" userId="user-1" />);
    const section = screen.getByRole("region", { name: "Crew preparation · Sat, Oct 10" });
    expect(within(section).getByText("Plan reviewed: 0 of 2 · Transceiver checks: 1 of 2 · 1 shared item awaiting acceptance")).toBeInTheDocument();
    await userEvent.setup().click(within(section).getByText("Show each person"));
    const [ana, gus] = within(section).getAllByRole("listitem");
    expect(within(ana).getAllByRole("definition").map((value) => value.textContent)).toEqual([
      "Recorded before it changed: Route changed", "Not recorded yet", "Awaiting acceptance",
    ]);
    expect(within(gus).getByText("· managed guest")).toBeInTheDocument();
    expect(within(gus).getAllByRole("definition").map((value) => value.textContent)).toEqual([
      "Not recorded yet", "Recorded 6:12 AM EDT · Sat Oct 10 by you", "Accepted · not packed",
    ]);
  });

  it("isn't shown on a solo day", () => {
    const { container } = render(<CrewPreparation data={trip("user-1", [], { members: [ORGANIZER] })} date={DAY.date} dateLabel="Sat, Oct 10" userId="user-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Tour preparation", () => {
  it("lists the person's own items first, then the organizer's crew items, each with a link to act on", () => {
    render(<TourPreparation items={[
      { kind: "no_tour_plan", scope: "crew", date: "2026-10-11", label: "No tour plan for Sun Oct 11", action: { label: "Add the tour plan", href: "/trips/trip-1/days/2026-10-11#tour-plan-heading" } },
      { kind: "plan_out_of_date", scope: "personal", date: "2026-10-10", label: "Your tour and backup plan review for Sat Oct 10 is out of date: Route changed",
        action: { label: "Review the plan again", href: "/trips/trip-1/days/2026-10-10#day-checks" } },
    ]} />);
    const section = screen.getByRole("region", { name: "Tour preparation" });
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Your tour and backup plan review for Sat Oct 10 is out of date: Route changed Review the plan again",
      "No tour plan for Sun Oct 11 Add the tour plan",
    ]);
    expect(within(section).getByRole("link", { name: "Review the plan again, Sat Oct 10" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10#day-checks");
    expect(within(section).getByRole("heading", { name: "Crew" })).toBeInTheDocument();
  });

  it("isn't shown with nothing to act on", () => {
    const { container } = render(<TourPreparation items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayConditions } from "./DayConditions";
import { fakeTripApi, ORGANIZER, reply, sentBodies, TRIP, tripFull } from "@/test/tripApi";
import type { TripConditionsReview, TripDayConditionsSource, TripFull, TripMember } from "@/types/trips";

const DATE = "2026-10-10";
const sourcesRoute = `/api/v1/trips/${TRIP.id}/days/${DATE}/conditions`;
const reviewsRoute = `${sourcesRoute}/reviews`;
const DAYS = [{ id: "day-1", trip_id: TRIP.id, stop_id: null, date: DATE, activity: "Backcountry" }];
const SAM: TripMember = { ...ORGANIZER, id: "member-sam", user_id: "user-2", display_name: "Sam", role: "member" };
const ALEX: TripMember = { ...ORGANIZER, id: "member-alex", user_id: "user-3", display_name: "Alex", role: "member" };

const review = (user: string, extra: Partial<TripConditionsReview> = {}, current: Partial<TripConditionsReview["current"]> = {}): TripConditionsReview => ({
  user_id: user, stale_reasons: [], history: [],
  current: { id: `entry-${user}`, action: "reviewed", note: null, reviewed_at: "2026-10-09T22:12:00Z", created_at: "2026-10-09T22:12:00Z", ...current },
  ...extra,
});
const source = (extra: Partial<TripDayConditionsSource> = {}): TripDayConditionsSource => ({
  id: "source-1", trip_id: TRIP.id, category: "avalanche", name: "Mount Washington Avalanche Center", region: "Presidential Range",
  url: "https://www.mountwashingtonavalanchecenter.org/", revision: 2, created_by: "user-1", updated_by: "user-1",
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", date: DATE, trip_day_id: "day-1", context_key: "key-1",
  reviews: [], ...extra,
});
const onSaved = vi.fn().mockResolvedValue(undefined);
const data = (conditions: TripDayConditionsSource[] = []): TripFull => tripFull({ days: DAYS, members: [ORGANIZER, SAM, ALEX], conditions });
function renderConditions({ conditions = [] as TripDayConditionsSource[], activity = "Backcountry" as string | null, userId = "user-1" as string | null } = {}) {
  return render(<DayConditions data={data(conditions)} date={DATE} dateLabel="Sat Oct 10" activity={activity} userId={userId} onSaved={onSaved} />);
}

describe("Day conditions", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, ""); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("isn't shown on another activity's day without sources, but is with them", () => {
    const { container, unmount } = renderConditions({ activity: "Alpine" });
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderConditions({ activity: "Alpine", conditions: [source()] });
    expect(screen.getByRole("heading", { name: "Conditions" })).toBeInTheDocument();
  });

  it("asks the organizer to add an official source, and members to check one", () => {
    const { unmount } = renderConditions();
    expect(screen.getByText(/No sources yet. Add or check an official source/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add source" })).toBeInTheDocument();
    unmount();
    renderConditions({ userId: "user-2" });
    expect(screen.getByText(/No sources yet. Check an official source before you go/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add source" })).not.toBeInTheDocument();
  });

  it("shows each source's type, area and link without a validity it doesn't have", () => {
    renderConditions({ conditions: [source(), source({ id: "source-2", category: "access", name: "WMNF road status", region: null, url: "https://example.org/roads" })] });
    expect(screen.getByText("Avalanche forecast · Presidential Range")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open forecast (new tab)" })).toHaveAttribute("href", "https://www.mountwashingtonavalanchecenter.org/");
    expect(screen.getByRole("link", { name: "Open forecast (new tab)" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Open access information (new tab)" })).toHaveAttribute("href", "https://example.org/roads");
    expect(screen.getAllByText("Validity not available in SWTTR — check the source.")).toHaveLength(2);
    expect(screen.getAllByText("No review recorded")).toHaveLength(2);
    expect(screen.getByText("Your reviews: 0 of 2 recorded for Saturday")).toBeInTheDocument();
  });

  it("adds the organizer's source after the server confirms it", async () => {
    const api = fakeTripApi({ [`POST ${sourcesRoute}`]: reply(200, { source_id: "source-1", revision: 1 }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderConditions();
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await user.type(screen.getByLabelText("Source name"), "Mount Washington Avalanche Center");
    await user.type(screen.getByLabelText("Area or region (optional)"), "Presidential Range");
    await user.type(screen.getByLabelText("Link"), "https://www.mountwashingtonavalanchecenter.org/");
    await user.click(screen.getByRole("button", { name: "Save source" }));
    expect(await screen.findByText("Source added.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(sentBodies(api, `POST ${sourcesRoute}`)[0]).toMatchObject({
      action: "add", day_id: "day-1",
      source: { category: "avalanche", name: "Mount Washington Avalanche Center", region: "Presidential Range", url: "https://www.mountwashingtonavalanchecenter.org/" },
    });
  });

  it("focuses the field the server rejects and keeps the input", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`POST ${sourcesRoute}`]: reply(400, { error: "Use a complete http or https link, up to 2,000 characters.", field: "url" }) }));
    const user = userEvent.setup();
    renderConditions();
    await user.click(screen.getByRole("button", { name: "Add source" }));
    await user.type(screen.getByLabelText("Source name"), "MWAC");
    await user.type(screen.getByLabelText("Link"), "http://x");
    await user.click(screen.getByRole("button", { name: "Save source" }));
    await waitFor(() => expect(screen.getByLabelText("Link")).toHaveFocus());
    expect(screen.getByLabelText("Link")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Source name")).toHaveValue("MWAC");
  });

  it("edits a source at its revision, and removes it from the day only after confirming", async () => {
    const api = fakeTripApi({ [`POST ${sourcesRoute}`]: reply(200, { source_id: "source-1", revision: 3 }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderConditions({ conditions: [source()] });
    await user.click(screen.getByRole("button", { name: "Edit source Mount Washington Avalanche Center" }));
    await user.click(screen.getByRole("button", { name: "Remove from this day" }));
    expect(screen.getByText(/will no longer be listed for Sat Oct 10. Reviews already recorded for it are kept./)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove source" }));
    expect(await screen.findByText("Source removed from Sat Oct 10. Reviews recorded for it are kept.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${sourcesRoute}`)[0]).toEqual({ action: "remove", day_id: "day-1", source_id: "source-1", expected_revision: 2, mutation_id: expect.any(String) });
  });

  it("gives members the sources without organizer actions", () => {
    renderConditions({ conditions: [source()], userId: "user-2" });
    expect(screen.getByText("Sources are managed by the organizer. You record your own reviews.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit source/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record my review of Mount Washington Avalanche Center" })).toBeInTheDocument();
  });

  it("records a member's review only from Record my review, never from opening the link", async () => {
    const api = fakeTripApi({ [`POST ${reviewsRoute}`]: reply(200, { entry_id: "entry-1" }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderConditions({ conditions: [source()], userId: "user-2" });
    screen.getByRole("link", { name: "Open forecast (new tab)" }).addEventListener("click", (event) => event.preventDefault());
    await user.click(screen.getByRole("link", { name: "Open forecast (new tab)" }));
    expect(api).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Record my review/ }));
    await user.type(screen.getByLabelText("Note (optional)"), "Considerable on east aspects");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    expect(await screen.findByText("Review recorded.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${reviewsRoute}`)[0]).toEqual({
      action: "record", day_id: "day-1", source_id: "source-1", expected_entry_id: null, mutation_id: expect.any(String),
      note: "Considerable on east aspects", context_key: "key-1",
    });
  });

  it("shows the person's own review, and one recorded before the plan changed as needing another look", () => {
    const { unmount } = renderConditions({ userId: "user-2", conditions: [source({ reviews: [review("user-2", {}, { note: "Low danger" })] })] });
    expect(screen.getByText(/^You reviewed this source/)).toBeInTheDocument();
    expect(screen.getByText("Your note: Low danger")).toBeInTheDocument();
    expect(screen.getByText("Your reviews: 1 of 1 recorded for Saturday")).toBeInTheDocument();
    unmount();
    renderConditions({ userId: "user-2", conditions: [source({ reviews: [review("user-2", { stale_reasons: ["Route changed", "Date changed from Fri Oct 9"] })] })] });
    expect(screen.getByText("Plan changed — review again")).toBeInTheDocument();
    expect(screen.getByText("Route changed · Date changed from Fri Oct 9")).toBeInTheDocument();
    expect(screen.getByText("Your reviews: 0 of 1 recorded for Saturday")).toBeInTheDocument();
  });

  it("keeps the crew's reviews collapsed, each attributed, without counting them as yours", async () => {
    const user = userEvent.setup();
    renderConditions({ userId: "user-2", conditions: [source({ reviews: [
      review("user-1", {}, { note: "Wind slab on the headwall" }),
      review("user-3", { history: [{ id: "old", action: "reviewed", note: null, reviewed_at: "2026-10-09T12:00:00Z", created_at: "2026-10-09T12:00:00Z" }] },
        { action: "withdrawn", created_at: "2026-10-09T23:00:00Z" }),
    ] })] });
    expect(screen.getByText("No review recorded")).toBeInTheDocument();
    expect(screen.getByText("Your reviews: 0 of 1 recorded for Saturday")).toBeInTheDocument();
    expect(screen.getByText(/The organizer recorded a review/)).not.toBeVisible();
    await user.click(screen.getByText("Crew reviews (2)"));
    expect(screen.getByText(/The organizer recorded a review/)).toBeVisible();
    expect(screen.getByText("Wind slab on the headwall")).toBeVisible();
    expect(screen.getByText(/Alex withdrew their review/)).toBeVisible();
    await user.click(screen.getByText("Alex's review history"));
    expect(screen.getByText(/^Recorded a review ·/)).toBeVisible();
  });

  it("corrects the note and withdraws from the latest entry, with a confirmation to withdraw", async () => {
    const api = fakeTripApi({ [`POST ${reviewsRoute}`]: reply(200, { entry_id: "entry-2" }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderConditions({ userId: "user-2", conditions: [source({ reviews: [review("user-2", {}, { note: "Low" })] })] });
    await user.click(screen.getByRole("button", { name: /Edit note/ }));
    const note = screen.getByLabelText("Note (optional)");
    expect(note).toHaveValue("Low");
    await user.clear(note);
    await user.type(note, "Moderate, not low");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Note saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Withdraw review of/ }));
    expect(within(screen.getByRole("dialog")).getByText(/will show as withdrawn. Its history is kept./)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw review" }));
    expect(await screen.findByText("Review withdrawn.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${reviewsRoute}`)).toEqual([
      { action: "correct", day_id: "day-1", source_id: "source-1", expected_entry_id: "entry-user-2", mutation_id: expect.any(String), note: "Moderate, not low" },
      { action: "withdraw", day_id: "day-1", source_id: "source-1", expected_entry_id: "entry-user-2", mutation_id: expect.any(String) },
    ]);
  });

  it("keeps the note and its save identity after a failure, so a retry can't record twice", async () => {
    const api = fakeTripApi({ [`POST ${reviewsRoute}`]: reply(500, { error: "Couldn't save your review. Your note is still here; try again." }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    renderConditions({ userId: "user-2", conditions: [source()] });
    await user.click(screen.getByRole("button", { name: /Record my review/ }));
    await user.type(screen.getByLabelText("Note (optional)"), "Checked at 6");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your note is still here");
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Checked at 6");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    const bodies = sentBodies(api, `POST ${reviewsRoute}`) as Array<{ mutation_id: string }>;
    expect(bodies).toHaveLength(2);
    expect(bodies[0].mutation_id).toBe(bodies[1].mutation_id);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("after a plan change, loads the latest and records against it with the note kept", async () => {
    const api = fakeTripApi({ [`POST ${reviewsRoute}`]: (body) => (body as { context_key: string }).context_key === "key-2"
      ? reply(200, { entry_id: "entry-1" })
      : reply(409, { error: "This day's plan or the source changed since you opened it. Check the latest before recording your review." }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    const view = renderConditions({ userId: "user-2", conditions: [source()] });
    onSaved.mockImplementationOnce(async () => {
      view.rerender(<DayConditions data={data([source({ context_key: "key-2" })])} date={DATE} dateLabel="Sat Oct 10" activity="Backcountry" userId="user-2" onSaved={onSaved} />);
    });
    await user.click(screen.getByRole("button", { name: /Record my review/ }));
    await user.type(screen.getByLabelText("Note (optional)"), "Checked at 6");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed since you opened it");
    await user.click(screen.getByRole("button", { name: "Check the latest" }));
    expect(await screen.findByText(/Check the source again; your note is still here./)).toBeInTheDocument();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Checked at 6");
    await user.click(screen.getByRole("button", { name: "Save review" }));
    expect(await screen.findByText("Review recorded.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${reviewsRoute}`).map((body) => (body as { context_key: string }).context_key)).toEqual(["key-1", "key-2"]);
  });

  it("asks before discarding a note", async () => {
    const user = userEvent.setup();
    renderConditions({ userId: "user-2", conditions: [source()] });
    await user.click(screen.getByRole("button", { name: /Record my review/ }));
    await user.type(screen.getByLabelText("Note (optional)"), "Half written");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Half written");
  });
});

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripStays, DayLodging } from "./TripStays";
import { buildLodging, previewLodging } from "@/lib/trip-lodging";
import { fakeTripApi, reply, sentBodies, TRIP, tripFull } from "@/test/tripApi";
import type { TripLocation, TripLodgingAction, TripLodgingNight, TripStay, TripStayInput } from "@/types/trips";

const hotel: TripStay = { id: "40f9f55e-0e74-4c4a-923f-d7a3f92468a0", trip_id: TRIP.id, name: "Hotel", check_in: "2026-10-09", check_out: "2026-10-11", type: null, address: null, property_url: "https://example.com", check_in_time: null, check_out_time: null, notes: "Meet in lobby", booking_status: "booked", created_at: TRIP.created_at, updated_at: TRIP.updated_at };
const assigned: TripLodgingNight[] = ["2026-10-09", "2026-10-10"].map((date) => ({ trip_id: TRIP.id, date, stay_id: hotel.id, status: "assigned" }));
const full = (stays: TripStay[] = [], nights: TripLodgingNight[] = [], revision = 0) => tripFull({ trip: { ...TRIP, lodging_revision: revision }, lodging: buildLodging({ ...TRIP, lodging_revision: revision }, stays, nights) });
const previewRoute = (data = full()) => (body: unknown) => {
  const input = body as { action: TripLodgingAction; stay: TripStayInput; stay_id: string; date: string; status: string };
  const payload = input.action === "save" ? input.stay : input.action === "remove" ? { id: input.stay_id } : { date: input.date, status: input.status };
  return reply(200, previewLodging(data.trip, data.lodging!, input.action, payload));
};
const base = `/api/v1/trips/${TRIP.id}`;
const onSaved = vi.fn().mockResolvedValue(undefined);
async function openNew() {
  const user = userEvent.setup();
  render(<TripStays data={full()} canEdit onSaved={onSaved} />);
  await user.click(screen.getByRole("button", { name: "Add stay" }));
  return user;
}

describe("Crew stays editor", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, ""); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("saves a name-only stay only after confirmation, with an explicit Not booked default", async () => {
    let finish = () => {};
    const api = fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(), [`POST ${base}/stays`]: () => new Promise((resolve) => { finish = () => resolve(reply(200, { revision: 1 })); }) });
    vi.stubGlobal("fetch", api);
    const user = await openNew();
    await user.type(screen.getByLabelText("Stay name"), "Cabin");
    expect(screen.getByLabelText("Booking status")).toHaveValue("not_booked");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    expect(await screen.findByText("No night assignments will change.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save stay" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => finish());
    expect(await screen.findByText("Stay saved.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledOnce();
    expect(sentBodies(api, `POST ${base}/stays`)[0]).toMatchObject({ stay: { name: "Cabin", check_in: null, check_out: null, booking_status: "not_booked" }, expected_revision: 0 });
  });
  it("keeps input and the save identity after failure, so retry cannot duplicate a stay", async () => {
    const api = fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(), [`POST ${base}/stays`]: reply(500, { error: "Database unavailable" }) });
    vi.stubGlobal("fetch", api);
    const user = await openNew();
    await user.type(screen.getByLabelText("Stay name"), "Cabin");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    await user.click(await screen.findByRole("button", { name: "Save stay" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByLabelText("Stay name")).toHaveValue("Cabin");
    expect(onSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save stay" }));
    const bodies = sentBodies(api, `POST ${base}/stays`) as Array<{ mutation_id: string }>;
    expect(bodies).toHaveLength(2); expect(bodies[0].mutation_id).toBe(bodies[1].mutation_id);
  });
  it("shows two nights and the affected morning before explicitly replacing an overlap", async () => {
    const existing = full([hotel], assigned);
    const api = fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(existing), [`POST ${base}/stays`]: reply(200, { revision: 1 }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    render(<TripStays data={existing} canEdit onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Add stay" }));
    await user.type(screen.getByLabelText("Stay name"), "Hut");
    await user.type(screen.getByLabelText("Check-in"), "2026-10-10");
    await user.type(screen.getByLabelText("Check-out"), "2026-10-12");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    expect(await screen.findByText("Sat Oct 10 → Mon Oct 12 · 2 nights")).toBeInTheDocument();
    expect(screen.getByText("Sun Oct 11 starting point: Hut")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save stay" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Replace the existing plans for 2026-10-10/ }));
    await user.click(screen.getByRole("button", { name: "Replace those nights and save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(sentBodies(api, `POST ${base}/stays`)[0]).toMatchObject({ replace_nights: true });
  });
  it("preserves pending text while inspecting a newer revision before retrying", async () => {
    const original = full([hotel], assigned);
    const current = full([{ ...hotel, name: "New saved hotel", notes: "New crew notes" }], assigned, 2);
    let attempts = 0;
    const api = fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(current), [`PATCH ${base}/stays/${hotel.id}`]: () => ++attempts === 1 ? reply(409, { error: "Plan changed" }) : reply(200, { revision: 3 }), [`GET ${base}`]: reply(200, current) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    render(<TripStays data={original} canEdit onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Edit Hotel" }));
    await user.clear(screen.getByLabelText("Stay name")); await user.type(screen.getByLabelText("Stay name"), "Pending hotel");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    await user.click(await screen.findByRole("button", { name: "Save stay" }));
    await user.click(await screen.findByRole("button", { name: "Review saved plan" }));
    expect(await screen.findByText(/New saved hotel ·/)).toHaveTextContent("New crew notes");
    expect(screen.getByLabelText("Stay name")).toHaveValue("Pending hotel");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    await user.click(await screen.findByRole("button", { name: "Save stay" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(sentBodies(api, `PATCH ${base}/stays/${hotel.id}`)[1]).toMatchObject({ expected_revision: 2, stay: { name: "Pending hotel" } });
  });
  it("asks before discarding dirty text and returns focus to the opener", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = await openNew();
    await user.type(screen.getByLabelText("Stay name"), "Pending cabin");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Stay name")).toHaveValue("Pending cabin");
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add stay" })).toHaveFocus();
  });
  it("offers Keep editing after browser Back and closes a clean editor without prompting", async () => {
    const user = await openNew();
    await user.type(screen.getByLabelText("Stay name"), "Pending");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await user.clear(screen.getByLabelText("Stay name"));
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("previews removal and keeps the saved row when removal fails", async () => {
    const existing = full([hotel], assigned);
    vi.stubGlobal("fetch", fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(existing), [`DELETE ${base}/stays/${hotel.id}`]: reply(500, { error: "Removal failed" }) }));
    const user = userEvent.setup(); render(<TripStays data={existing} canEdit onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Remove Hotel from trip" }));
    expect(screen.getByText(/does not cancel your booking/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review removal" }));
    expect(await screen.findByText("Sat Oct 10 starting point: Not set")).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove from trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Removal failed");
    expect(screen.getByRole("heading", { name: "Hotel", hidden: true })).toBeInTheDocument();
  });
  it("lets members read notes and links without exposing organizer actions", () => {
    render(<TripStays data={full([hotel], assigned)} canEdit={false} onSaved={onSaved} />);
    expect(screen.getByText("Managed by the organizer")).toBeInTheDocument();
    expect(screen.getByText("Crew notes: Meet in lobby")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open property website (new tab)" })).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("button", { name: /Add stay|Edit|Remove|Set location/ })).not.toBeInTheDocument();
  });
  it("keeps optional details under disclosure and focuses a server-rejected field", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`POST ${base}/stays/preview`]: reply(400, { error: "Choose both dates", field: "check_out" }) }));
    const user = await openNew();
    await user.type(screen.getByLabelText("Stay name"), "Hotel");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose both dates");
    expect(screen.getByLabelText("Check-out")).toHaveFocus();
    expect(screen.getByLabelText("Check-out")).toHaveAttribute("aria-invalid", "true");
  });
  describe("stay locations (#208)", () => {
    const topnotch: TripLocation = { label: "Topnotch Resort", address: "4000 Mountain Road, Stowe, VT 05672, United States of America", latitude: 44.49391, longitude: -72.73918,
      precision: "exact", time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: "51a8d60c", attribution: "© OpenStreetMap contributors" };
    const rental = { ...hotel, address: "4000 Mountain Rd, Stowe" };
    it("searches a stay's saved address from Set location and saves the confirmed place", async () => {
      const existing = full([rental], assigned);
      const api = fakeTripApi({ [`GET ${base}/locations`]: reply(200, { results: [topnotch] }), [`POST ${base}/stays/preview`]: previewRoute(existing), [`PATCH ${base}/stays/${hotel.id}`]: reply(200, { revision: 1 }) });
      vi.stubGlobal("fetch", api);
      const user = userEvent.setup();
      render(<TripStays data={existing} canEdit onSaved={onSaved} />);
      expect(screen.getByText("Booked · Location confirmation needed for drive times")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Set location for Hotel" }));
      const dialog = screen.getByRole("dialog");
      await waitFor(() => expect(within(dialog).getByRole("combobox", { name: "Search name or address" })).toHaveFocus());
      expect(within(dialog).getByRole("combobox", { name: "Search name or address" })).toHaveValue("4000 Mountain Rd, Stowe");
      await user.click(await within(dialog).findByRole("option", { name: /Topnotch Resort/ }));
      await user.click(within(dialog).getByRole("button", { name: "Use this location" }));
      // Choosing a place doesn't rewrite the address the organizer typed.
      expect(within(dialog).getByLabelText("Address or location description")).toHaveValue("4000 Mountain Rd, Stowe");
      await user.click(within(dialog).getByRole("button", { name: "Review nights" }));
      await user.click(await within(dialog).findByRole("button", { name: "Save stay" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
      expect(sentBodies(api, `PATCH ${base}/stays/${hotel.id}`)[0]).toMatchObject({ stay: { location: topnotch, address: "4000 Mountain Rd, Stowe" } });
    });
    it("keeps a saved place through other edits, and sends null only when it's removed", async () => {
      const existing = full([{ ...hotel, location: topnotch }], assigned);
      const api = fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(existing), [`PATCH ${base}/stays/${hotel.id}`]: reply(200, { revision: 1 }) });
      vi.stubGlobal("fetch", api);
      const user = userEvent.setup();
      render(<TripStays data={existing} canEdit onSaved={onSaved} />);
      expect(screen.getByText("Booked · Location set")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Set location/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Edit Hotel" }));
      await user.type(screen.getByLabelText("Stay name"), " Annex");
      await user.click(screen.getByRole("button", { name: "Review nights" }));
      await user.click(await screen.findByRole("button", { name: "Save stay" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
      expect(sentBodies(api, `PATCH ${base}/stays/${hotel.id}`)[0]).toMatchObject({ stay: { name: "Hotel Annex", location: topnotch } });
      await user.click(screen.getByRole("button", { name: "Edit Hotel" }));
      await user.click(screen.getByRole("button", { name: "Remove location" }));
      await user.click(screen.getByRole("button", { name: "Review nights" }));
      await user.click(await screen.findByRole("button", { name: "Save stay" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
      expect(sentBodies(api, `PATCH ${base}/stays/${hotel.id}`)[1]).toMatchObject({ stay: { location: null } });
    });
    it("keeps the typed text as the address when search is unavailable", async () => {
      vi.stubGlobal("fetch", fakeTripApi({ [`GET ${base}/locations`]: reply(503, { error: "Location search isn't available right now.", code: "unavailable" }) }));
      const user = await openNew();
      await user.type(screen.getByRole("combobox", { name: "Search name or address" }), "Cabin on Mountain Rd");
      await user.click(await screen.findByRole("button", { name: "Save location later" }));
      expect(screen.getByLabelText("Address or location description")).toHaveValue("Cabin on Mountain Rd");
      await waitFor(() => expect(screen.getByLabelText("Address or location description")).toHaveFocus());
    });
    it("shows members the place in words with a map link and its credit", async () => {
      const user = userEvent.setup();
      render(<TripStays data={full([{ ...hotel, location: { ...topnotch, precision: "approximate", label: "Stowe" } }], assigned)} canEdit={false} onSaved={onSaved} />);
      expect(screen.getByText("Booked · Approximate location")).toBeInTheDocument();
      await user.click(screen.getByText("Stay details"));
      expect(screen.getByText("Approximate area — choose the exact property for drive times.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open map (new tab)" })).toHaveAttribute("target", "_blank");
      expect(screen.getByRole("link", { name: "Powered by Geoapify" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" })).toBeInTheDocument();
    });
  });
  it("shows departures for a stay that only starts a day as its own starting point", async () => {
    const lodge = { ...hotel, check_in: null, check_out: null };
    const data = { ...full([lodge]), days: [{ id: "day-11", trip_id: TRIP.id, stop_id: null, date: "2026-10-11", activity: null, origin: null, origin_stay_id: lodge.id, no_drive: true }] };
    const day = { date: "2026-10-11", date_label: "Sun Oct 11", night_label: "Sat Oct 10", state: "no_drive", origin: { label: "Hotel", stay_id: lodge.id, own: true },
      crew_stay: null, destination: null, estimate: null, manual: null, previous: null, pair_key: null, same_drive_dates: [], closures: [], directions: null };
    const api = fakeTripApi({ [`GET ${base}/drive-estimates`]: reply(200, { days: [day], stays: [{ stay_id: lodge.id, dates: ["2026-10-11"], next: "2026-10-11" }] }) });
    vi.stubGlobal("fetch", api);
    render(<TripStays data={data} canEdit onSaved={onSaved} />);
    expect(await screen.findByText("Next departure · Sun Oct 11: No drive planned")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("shows today's origin separately from tonight's stay", () => {
    const hut = { ...hotel, id: "a682b8af-d26b-4213-a816-39de3eb155eb", name: "Hut" };
    const data = full([hotel, hut], [...assigned, { trip_id: TRIP.id, date: "2026-10-11", stay_id: hut.id, status: "assigned" }]);
    render(<DayLodging data={data} date="2026-10-11" />);
    expect(screen.getByText("Starting from").nextElementSibling).toHaveTextContent("Hotel");
    expect(screen.getByText("Staying tonight").nextElementSibling).toHaveTextContent("Hut");
  });

  it("requires an explicit No stay needed choice and previews that the morning origin is unset", async () => {
    const existing = full([hotel], assigned);
    const api = fakeTripApi({ [`POST ${base}/stays/preview`]: previewRoute(existing), [`PUT ${base}/lodging-nights/2026-10-10`]: reply(200, { revision: 1 }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    render(<TripStays data={existing} canEdit onSaved={onSaved} />);
    await user.click(screen.getByText("Crew nights"));
    await user.click(screen.getByRole("button", { name: "Change night 2026-10-10" }));
    expect(screen.getByLabelText("Change night plan to")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Change night plan to"), "no_stay");
    await user.click(screen.getByRole("button", { name: "Review nights" }));
    expect(await screen.findByText("Sun Oct 11 starting point: Not set")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Replace the existing plans/ }));
    await user.click(screen.getByRole("button", { name: "Replace those nights and save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(sentBodies(api, `PUT ${base}/lodging-nights/2026-10-10`)[0]).toMatchObject({ status: "no_stay", replace_nights: true });
  });
});


describe("Stay deep-link restoration", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { window.history.replaceState({}, "", "/"); vi.restoreAllMocks(); });

  it("waits for lodging data and restores an encoded stay link only once", () => {
    const saved = { ...hotel, id: "stay:room 1" };
    window.history.replaceState({}, "", `/trips/${TRIP.id}/stays#stay-${encodeURIComponent(saved.id)}`);
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const result = render(<TripStays data={full()} canEdit={false} onSaved={onSaved} />);
    expect(scroll).not.toHaveBeenCalled();
    result.rerender(<TripStays data={full([saved])} canEdit={false} onSaved={onSaved} />);
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll.mock.instances[0]).toBe(document.getElementById(`stay-${saved.id}`));
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    result.rerender(<TripStays data={full([{ ...saved, name: "Updated room" }])} canEdit={false} onSaved={onSaved} />);
    expect(scroll).toHaveBeenCalledOnce();
  });

  it.each(["", "#stay-missing", "#unrelated"])("does not scroll without a matching stay (%s)", (hash) => {
    window.history.replaceState({}, "", `/trips/${TRIP.id}${hash}`);
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    render(<TripStays data={full([hotel])} canEdit={false} onSaved={onSaved} />);
    expect(scroll).not.toHaveBeenCalled();
  });
});

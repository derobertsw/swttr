import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayAccessPoint } from "./DayAccessPoint";
import { previewAccessPoint } from "@/lib/trip-access-points";
import { fakeTripApi, reply, sentBodies, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripAccessPointRequest, TripDay, TripFull, TripLocation, TripStop } from "@/types/trips";

const LOT: TripLocation = { label: "Mountain Road lot", address: "Mountain Road, Stowe, VT 05672, United States of America", latitude: 44.528, longitude: -72.7853,
  precision: "exact", time_zone: "America/New_York", source: "search", provider: "geoapify", provider_id: "51a8d6", attribution: "© OpenStreetMap contributors" };
const SPRUCE: TripLocation = { ...LOT, label: "Spruce Peak lot", address: "Spruce Peak, Stowe, VT", latitude: 44.5307, longitude: -72.7829, provider_id: "51b9e7" };
const JAY: TripStop = { ...STOWE_STOP, id: "stop-jay", position: 1, name: "Jay Peak" };
// Saturday on the base (Stowe), Sunday at Jay Peak, Monday at Stowe.
const day = (date: string, stop_id: string | null, own: TripLocation | null = null): TripDay =>
  ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id, activity: null, access_point: own, access_point_stop_id: own ? STOWE_STOP.id : null });
const trip = (stowePoint: TripLocation | null = null, saturday: TripLocation | null = null) => tripFull({
  stops: [{ ...STOWE_STOP, access_point: stowePoint }, JAY],
  days: [day("2026-10-10", null, saturday), day("2026-10-11", JAY.id), day("2026-10-12", STOWE_STOP.id)],
});
const base = `/api/v1/trips/${TRIP.id}`;
const accessRoute = (data: TripFull) => (body: unknown) => {
  const request = body as TripAccessPointRequest & { preview?: boolean };
  if (!request.preview) return reply(200, { ok: true });
  const preview = previewAccessPoint(data, request);
  return "error" in preview ? reply(preview.status, { error: preview.error }) : reply(200, preview);
};
const onSaved = vi.fn();
const show = (data: TripFull, canEdit = true) => render(<DayAccessPoint data={data} day={data.days[0]} dateLabel="Sat Oct 10" canEdit={canEdit} onSaved={onSaved} />);

describe("Getting there on a trip day", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("finds a place, then asks whether it's only this day or every day at the stop, with the dates, before saving", async () => {
    const data = trip();
    const api = fakeTripApi({ [`GET ${base}/locations`]: reply(200, { results: [LOT] }), [`POST ${base}/access-points`]: accessRoute(data) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup();
    show(data);
    expect(screen.getByText("Access point not set")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set access point" }));
    const search = screen.getByRole("combobox", { name: "Search name or address" });
    await waitFor(() => expect(search).toHaveFocus());
    expect(screen.getByRole("group", { name: "Where will you park or meet?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose days" })).toBeDisabled();
    await user.type(search, "Mountain Road");
    await user.click(await screen.findByRole("option", { name: /Mountain Road lot/ }));
    await user.click(screen.getByRole("button", { name: "Use this location" }));
    await user.click(screen.getByRole("button", { name: "Choose days" }));

    const dialog = await screen.findByRole("dialog");
    const options = within(dialog).getByRole("group", { name: "Which days use Mountain Road lot?" });
    expect(within(options).getByRole("radio", { name: /Only Sat Oct 10/ })).not.toBeChecked();
    expect(within(options).getByRole("radio", { name: "All days at Stowe, Vermont (2 days) Sat Oct 10 and Mon Oct 12." })).not.toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Save access point" })).toBeDisabled();
    await user.click(within(options).getByRole("radio", { name: /All days at Stowe/ }));
    expect(within(dialog).getByRole("heading", { name: "2 days change" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save access point" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(screen.getByText("Access point saved.")).toBeInTheDocument();
    expect(sentBodies(api, `POST ${base}/access-points`)[1]).toMatchObject({ action: "set_access_point", date: "2026-10-10", scope: "stop", location: LOT });
  });

  it("keeps the day's own point apart from its stop's, and removing it goes back to the stop's", async () => {
    const data = trip(LOT, SPRUCE);
    vi.stubGlobal("fetch", fakeTripApi({ [`POST ${base}/access-points`]: accessRoute(data) }));
    const user = userEvent.setup();
    show(data);
    expect(screen.getByText("Spruce Peak lot")).toBeInTheDocument();
    expect(screen.getByText("Only Sat Oct 10")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove access point" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Only Sat Oct 10 It uses Stowe, Vermont's access point, Mountain Road lot, again." })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /All days at Stowe, Vermont \(2 days\)/ })).toBeInTheDocument();
  });

  it("shows members the shared point, approximate when it is, without changes", () => {
    show(trip({ ...LOT, label: "Stowe", precision: "approximate" }), false);
    expect(screen.getByText("Approximate area — choose the exact entrance or parking for drive times.")).toBeInTheDocument();
    expect(screen.getByText("Every day at Stowe, Vermont")).toBeInTheDocument();
    expect(screen.getByText("Managed by the organizer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open map (new tab)" })).toHaveAttribute("href", expect.stringContaining("mlat=44.528"));
    expect(screen.getByRole("link", { name: "Powered by Geoapify" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("returns focus to the button that opened the search when it's cancelled", async () => {
    const user = userEvent.setup();
    show(trip());
    await user.click(screen.getByRole("button", { name: "Set access point" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Set access point" })).toHaveFocus());
  });

  it("asks for a destination first when the trip has none", () => {
    show(tripFull({ days: [day("2026-10-10", null)] }));
    expect(screen.getByText("Choose a destination first")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

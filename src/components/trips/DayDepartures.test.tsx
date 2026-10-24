import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayDrive, StayDepartures, type DriveEstimatesState } from "@/components/trips/DriveEstimate";
import { DayLodging } from "@/components/trips/TripStays";
import { TripMapDaySummary } from "@/components/trips/TripMapDay";
import { followDeparture } from "@/components/trips/trip-map-presentation";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { projectTripMap } from "@/lib/trip-map";
import { LODGE_PLACE, PINE_PLACE, splitDriveTrip, VILLAGE_PLACE } from "@/test/driveTrip";
import { ALEX, BLAIR, CASEY, ELI, FRAN, FRI, personNight, PINE, SAT, splitRows, SUN, VILLAGE } from "@/test/splitStays";
import { departurePlans } from "@/lib/trip-drive";
import type { TripDriveEstimates, TripFull } from "@/types/trips";

/**
 * Departures by origin (#333) on the downhill reference journey: Saturday,
 * Alex, Blair and Dana leave the Pine rental and Eli and Fran (a pending
 * invitation) the Village hotel, for the same lot.
 */
const NOW = Date.parse("2026-10-05T15:00:00Z");
const MINUTES: Record<string, number> = { [PINE_PLACE.latitude]: 12, [VILLAGE_PLACE.latitude]: 18, [LODGE_PLACE.latitude]: 3 };
const matrix = async (sources: Array<{ latitude: number }>, targets: unknown[]) =>
  sources.map((source) => targets.map(() => ({ seconds: MINUTES[source.latitude] * 60, meters: 9_000 })));
const estimatesFor = (full: TripFull) => tripDriveEstimates(full, { read: async () => [], write: async () => undefined }, { now: NOW, matrix });
const state = (estimates: TripDriveEstimates): DriveEstimatesState =>
  ({ estimates, error: null, loading: false, routeChanged: false, refreshing: false, retry: vi.fn() });
const row = (scope: HTMLElement, term: string) => within(scope).getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;

describe("Your departure on the day (#333)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("leads with your own stay, then the crew's where it differs", () => {
    const { container } = render(<DayLodging data={splitDriveTrip()} date={SAT} memberId={ELI.id} />);
    expect(screen.getByText("Your stay")).toBeInTheDocument();
    expect(row(container, "Starting from")).toHaveTextContent("Village hotel");
    expect(row(container, "Staying tonight")).toHaveTextContent("Village hotel");
    expect(row(container, "Crew starting from")).toHaveTextContent("Pine rental (3) · Village hotel (2)");
    expect(row(container, "Crew staying tonight")).toHaveTextContent("Pine rental (4) · Village hotel (2)");
  });
  it("says when you aren't taking part, and keeps the crew's view for someone not on the crew", () => {
    const { container, unmount } = render(<DayLodging data={splitDriveTrip()} date={SAT} memberId={CASEY.id} />);
    expect(row(container, "Starting from")).toHaveTextContent("Not taking part");
    expect(row(container, "Staying tonight")).toHaveTextContent("Pine rental");
    unmount();
    const crew = render(<DayLodging data={splitDriveTrip()} date={SAT} memberId={null} />);
    expect(screen.getByText("Crew stay")).toBeInTheDocument();
    expect(row(crew.container, "Starting from")).toHaveTextContent("Pine rental (3) · Village hotel (2)");
    expect(within(crew.container).queryByText("Crew starting from")).not.toBeInTheDocument();
  });
  it("shows your own drive first, and every departure by name for anyone to open", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (X11; Linux x86_64)");
    const full = splitDriveTrip();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Oct 10" onSaved={vi.fn()} canEdit={false} memberId={ELI.id} drive={state(await estimatesFor(full))} />);
    const drive = screen.getByRole("region", { name: "Your drive" });
    expect(within(drive).getByText("Village hotel → Spruce Peak lot")).toBeInTheDocument();
    expect(within(drive).getByText("About 18 min drive · 5.6 mi · one way")).toBeInTheDocument();
    expect(within(drive).getAllByRole("link", { name: /Directions from Village hotel to Spruce Peak lot/ })[0])
      .toHaveAttribute("href", expect.stringContaining(`origin=${VILLAGE_PLACE.latitude},${VILLAGE_PLACE.longitude}`));
    await userEvent.click(within(drive).getByText("Departures · 2 starting points"));
    const items = within(drive).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Pine rental · Alex, Blair, and Dana", "Village hotel · You and Fran (invitation pending)",
    ]);
    expect(within(items[0]).getByText("About 12 min drive to Spruce Peak lot · 5.6 mi · one way · calculated just now")).toBeVisible();
    expect(within(items[0]).getByRole("link", { name: /Directions from Pine rental/ })).toBeVisible();
  });
  it("keeps the organizer's estimate controls on the crew's drive", async () => {
    const full = splitDriveTrip();
    const failing = await tripDriveEstimates(full, { read: async () => [], write: async () => undefined },
      { now: NOW, matrix: async () => { throw new Error("timeout"); } });
    const { unmount } = render(<DayDrive data={full} date={SAT} dateLabel="Sat Oct 10" onSaved={vi.fn()} canEdit memberId={ELI.id} drive={state(failing)} />);
    expect(screen.getByRole("region", { name: "Your drive" })).toHaveTextContent("Drive estimate unavailable");
    expect(screen.queryByRole("button", { name: "Add your estimate" })).not.toBeInTheDocument();
    unmount();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Oct 10" onSaved={vi.fn()} canEdit memberId={ALEX.id} drive={state(failing)} />);
    expect(screen.getByRole("button", { name: "Add your estimate" })).toBeInTheDocument();
  });
  it("lets an organizer leaving from another stay show the crew's drive and manage its estimate", async () => {
    // Alex and Fran swap Friday nights: the rental is still the crew's, Alex leaves from the hotel.
    const rows = splitRows();
    rows.assignments = rows.assignments.map((night) => night.date !== FRI ? night
      : night.member_id === ALEX.id ? personNight(ALEX.id, FRI, VILLAGE) : night.member_id === FRAN.id ? personNight(FRAN.id, FRI, PINE) : night);
    const full = splitDriveTrip({ rows });
    const pinePair = departurePlans(full).find((day) => day[0].date === SAT)![0].pair_key!;
    const manual = [{ trip_day_id: `day-${SAT}`, pair_key: pinePair, origin_label: "Pine rental", destination_label: "Spruce Peak lot",
      duration_seconds: 900, note: null, use_calculated: false, entered_at: "2026-10-04T12:00:00.000Z" }];
    const estimates = await tripDriveEstimates(full, { read: async () => [], write: async () => undefined, manual: async () => manual },
      { now: NOW, matrix: async () => { throw new Error("timeout"); } });
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Oct 10" onSaved={vi.fn()} canEdit memberId={ALEX.id} drive={state(estimates)} />);
    expect(screen.getByRole("region", { name: "Your drive" })).toHaveTextContent("Village hotel → Spruce Peak lot");
    expect(screen.queryByRole("button", { name: "Edit your estimate" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Departures · 2 starting points"));
    await userEvent.click(screen.getByRole("button", { name: "Show drive from Pine rental" }));
    const crew = screen.getByRole("region", { name: "Drive from Pine rental" });
    expect(within(crew).getByText("Pine rental → Spruce Peak lot")).toBeInTheDocument();
    expect(within(crew).getByRole("button", { name: "Edit your estimate" })).toBeInTheDocument();
    expect(within(crew).getByRole("button", { name: "Show drive from Pine rental" })).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toHaveTextContent("Drive from Pine rental");
  });
  it("says your own starting point is missing when the crew has one", async () => {
    // Blair's Friday night isn't planned.
    const rows = { ...splitRows(), assignments: splitRows().assignments.filter((night) => !(night.member_id === BLAIR.id && night.date === FRI)) };
    const full = splitDriveTrip({ rows });
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Oct 10" onSaved={vi.fn()} canEdit={false} memberId={BLAIR.id} drive={state(await estimatesFor(full))} />);
    const drive = screen.getByRole("region", { name: "Your drive" });
    expect(within(drive).getByText("Your starting point isn't set")).toBeInTheDocument();
    expect(within(drive).getByText("You don't have a stay planned for Fri Oct 9 night.")).toBeInTheDocument();
  });
  it("lists the hotel's own drive under the hotel's departures", async () => {
    const full = splitDriveTrip();
    render(<StayDepartures tripId={full.trip.id} stayId={VILLAGE.id} drive={state(await estimatesFor(full))} />);
    expect(screen.getByText("Next departure · Sat Oct 10: About 18 min drive to Spruce Peak lot · 5.6 mi · one way")).toBeInTheDocument();
  });
});

describe("Departures on the trip map (#333)", () => {
  const mapFor = async () => {
    const full = splitDriveTrip();
    return projectTripMap(full, await estimatesFor(full), SAT);
  };
  it("follows your own departure and night, and shows another when you choose it", async () => {
    const map = await mapFor();
    const [crew] = map.days;
    const mine = followDeparture(crew, ELI.id);
    expect(mine).toMatchObject({ starting_from: "Village hotel", origin_place_id: `stay:${VILLAGE.id}:location`, drive: { origin: { label: "Village hotel" } } });
    expect(mine.geometry.revision).toBe(crew.departures[1].geometry.revision);
    const onFollow = vi.fn();
    render(<TripMapDaySummary tripId={map.trip.id} day={mine} places={map.places} canEdit={false} memberId={ELI.id} following={crew.departures[1].key} onFollow={onFollow} />);
    const card = screen.getByRole("region", { name: /Sat Oct 10/ });
    expect(row(card, "Starting from")).toHaveTextContent("Village hotel");
    expect(row(card, "Getting there")).toHaveTextContent("About 18 min drive to Spruce Peak lot");
    const departures = row(card, "Departures");
    expect(departures).toHaveTextContent("Pine rental · Alex, Blair, Dana");
    expect(departures).toHaveTextContent("Village hotel · You, Fran (invitation pending)");
    expect(within(departures).getByRole("button", { name: "Show Village hotel departure" })).toHaveAttribute("aria-pressed", "true");
    expect(within(departures).getByRole("button", { name: "Show Pine rental departure" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(within(departures).getByRole("button", { name: "Show Pine rental departure" }));
    expect(onFollow).toHaveBeenCalledWith(`stay:${PINE.id}`);
    // Chosen, the rental's drive replaces yours on the map.
    expect(followDeparture(crew, ELI.id, `stay:${PINE.id}`)).toMatchObject({ starting_from: "Pine rental", origin_place_id: `stay:${PINE.id}:location` });
  });
  it("says the drive is the crew's for someone with no departure that day", async () => {
    const [saturday] = (await mapFor()).days;
    // Casey arrives Saturday evening and isn't taking part.
    expect(followDeparture(saturday, CASEY.id)).toMatchObject({
      starting_from: "Not taking part · the crew starts from Pine rental", staying_tonight: "Pine rental",
      origin_place_id: saturday.origin_place_id, drive: { origin: { label: "Pine rental" } },
    });
  });
  it("leads with Sunday's checkout morning from the rental for Casey", async () => {
    const full = splitDriveTrip();
    const sunday = projectTripMap(full, await estimatesFor(full), SUN).days[0];
    expect(followDeparture(sunday, CASEY.id)).toMatchObject({ starting_from: "Pine rental", staying_tonight: "Mountain lodge" });
  });
});

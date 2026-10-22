import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { drivePlans } from "@/lib/trip-drive";
import type { ManualEstimateRow } from "@/lib/trip-drive-estimates";
import { buildTourPlanSummary } from "@/lib/trip-tour-plans";
import { driveTrip, place } from "@/test/driveTrip";
import { storedDrive, tripMapFixture } from "@/test/tripMap";
import type { TripMap } from "@/types/trip-map";
import type { TripTourPlan } from "@/types/trips";
import { TripMapDaySummary } from "./TripMapDay";
import { dayRoles } from "./trip-map-presentation";

const FRI = "2027-01-08", SAT = "2027-01-09", SUN = "2027-01-10", MON = "2027-01-11";
const NOW = Date.parse("2027-01-07T12:00:00Z");
const CALCULATED = new Date(NOW).toISOString();

function summary(map: TripMap, date: string, canEdit = true) {
  const day = map.days.find((entry) => entry.date === date)!;
  render(<TripMapDaySummary tripId={map.trip.id} day={day} places={map.places} canEdit={canEdit} />);
  return { day, card: screen.getByRole("region", { name: new RegExp(day.date_label) }) };
}
/** Each <dt>'s <dd>, read the way a screen reader pairs them. */
const row = (card: HTMLElement, term: string) => within(card).getByText(term, { selector: "dt" }).nextElementSibling as HTMLElement;
const coordinates = (map: TripMap, id: string | null) => {
  const found = map.places.find((entry) => entry.id === id)!.coordinates!;
  return `${found.latitude},${found.longitude}`;
};

describe("Selected day logistics on the trip map", () => {
  it("keeps the checkout morning's origin separate from tonight's stay and hands both saved endpoints to directions", async () => {
    const full = driveTrip();
    const map = await tripMapFixture(full, { rows: [storedDrive(full, SUN, CALCULATED)], now: NOW });
    const { day, card } = summary(map, SUN);
    expect(row(card, "Starting from")).toHaveTextContent("Stowe Motel");
    expect(row(card, "Getting there")).toHaveTextContent("Smuggs lot");
    expect(row(card, "Getting there")).toHaveTextContent("About 30 min drive to Smuggs lot · 15 mi · one way");
    expect(row(card, "Getting there")).toHaveTextContent("Calculated just now · typical traffic, not live");
    // Smuggs from Stowe in January avoids the closed Notch, and says so.
    expect(row(card, "Getting there")).toHaveTextContent(/Avoids VT 108 through Smugglers' Notch.*Check road conditions before you drive\./);
    expect(row(card, "Staying tonight")).toHaveTextContent("Village Inn");
    expect(row(card, "Staying tonight")).toHaveTextContent("Location not set");

    // The handoff names the access point, and its URL drives between the day's
    // origin and access places, never tonight's stay or the destination.
    expect(day.origin_place_id).toBe("stay:stay-motel:location");
    expect(day.access_place_id).toBe("stop:stop-smuggs:access_point");
    const directions = within(card).getByRole("link", { name: "Directions to Smuggs lot from Stowe Motel (opens Google Maps)" });
    expect(directions).toHaveTextContent("Directions to Smuggs lot");
    const url = new URL(directions.getAttribute("href")!);
    expect(url.searchParams.get("origin")).toBe(coordinates(map, day.origin_place_id));
    expect(url.searchParams.get("destination")).toBe(coordinates(map, day.access_place_id));
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(directions).toHaveAttribute("target", "_blank");
    expect(within(card).getByRole("link", { name: "View day" })).toHaveAttribute("href", `/trips/trip-drive/days/${SUN}`);
  });

  it("names a day's roles from its own references, even when one stay fills two", async () => {
    const map = await tripMapFixture();
    const motel = map.places.find((entry) => entry.id === "stay:stay-motel:location")!;
    const inn = map.places.find((entry) => entry.id === "stay:stay-inn:location")!;
    const day = (date: string) => map.days.find((entry) => entry.date === date)!;
    expect(dayRoles(motel, day(SAT))).toEqual(["origin", "tonight"]);
    expect(dayRoles(motel, day(SUN))).toEqual(["origin"]);
    expect(dayRoles(inn, day(SUN))).toEqual(["tonight"]);
    expect(dayRoles(motel, day(FRI))).toEqual(["tonight"]);
    // A shared access point repeats on each of its days without becoming a second place.
    const spruce = map.places.find((entry) => entry.id === "stop:stop-stowe:access_point")!;
    expect([dayRoles(spruce, day(FRI)), dayRoles(spruce, day(SAT))]).toEqual([["access"], ["access"]]);
    expect(map.places.filter((entry) => entry.name === "Spruce Peak lot")).toHaveLength(1);
  });

  it("labels last night's crew stay apart from a day-only starting point", async () => {
    const full = driveTrip();
    full.days[1] = { ...full.days[1], origin: place("Trailhead cabin", 44.51, -72.75) };
    const map = await tripMapFixture(full);
    const { day, card } = summary(map, SAT);
    expect(row(card, "Starting from")).toHaveTextContent("Trailhead cabin · only this day");
    const motel = map.places.find((entry) => entry.id === day.crew_stay_place_id)!;
    expect(dayRoles(motel, day)).toEqual(["tonight"]);
    expect(dayRoles(map.places.find((entry) => entry.id === day.origin_place_id)!, day)).toEqual(["origin"]);
    expect(within(card).getByRole("link", { name: /Directions to Spruce Peak lot from Trailhead cabin/ }).getAttribute("href")).toContain("origin=44.51,-72.75");
  });

  it("asks for the first day's missing origin without offering directions", async () => {
    const map = await tripMapFixture();
    const { card } = summary(map, FRI);
    expect(row(card, "Starting from")).toHaveTextContent("Not setNo crew stay Thu Jan 7 night");
    expect(row(card, "Getting there")).toHaveTextContent("Starting point not set");
    expect(within(card).queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Set starting point" })).toHaveAttribute("href", `/trips/trip-drive/days/${FRI}#getting-there-${FRI}`);
  });

  it("sends an unlocated stay origin to its stay editor, and a member only to the day", async () => {
    const map = await tripMapFixture();
    summary(map, MON);
    expect(screen.getByRole("link", { name: "Set the exact location of Village Inn" })).toHaveAttribute("href", "/trips/trip-drive/stays#stay-stay-inn");
    document.body.innerHTML = "";
    const { card } = summary(map, MON, false);
    expect(row(card, "Getting there")).toHaveTextContent("Needs the stay's location");
    expect(within(card).queryByRole("link", { name: /Set|Edit/ })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "View day" })).toBeVisible();
  });

  it("keeps an approximate access point and an unmapped hut out of directions, with their refinement actions", async () => {
    const full = driveTrip();
    full.stops[0].access_point = place("Stowe village", 44.4654, -72.6874, "approximate");
    full.stops[1] = { ...full.stops[1], name: "Bolton hut", latitude: null as unknown as number, longitude: null as unknown as number, access_point: null };
    const map = await tripMapFixture(full);
    const approximate = summary(map, SAT).card;
    expect(row(approximate, "Getting there")).toHaveTextContent("Stowe villageApproximate locationNeeds the exact entrance or parking");
    expect(within(approximate).queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
    expect(within(approximate).getByRole("link", { name: "Choose the exact entrance or parking" })).toHaveAttribute("href", `/trips/trip-drive/days/${SAT}#getting-there-${SAT}`);
    document.body.innerHTML = "";
    const hut = summary(map, SUN).card;
    expect(row(hut, "Getting there")).toHaveTextContent("Bolton hut access pointLocation not setAccess point not set");
    expect(within(hut).queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
    expect(within(hut).getByRole("link", { name: "Set access point" })).toBeVisible();
  });

  it("keeps No drive planned and No stay needed distinct", async () => {
    const map = await tripMapFixture();
    const day = map.days.find((entry) => entry.date === SAT)!;
    Object.assign(day, { drive: { ...day.drive, state: "no_drive", directions: null }, staying_tonight: "No stay needed", tonight_status: "no_stay", tonight_place_id: null });
    const { card } = summary(map, SAT);
    expect(row(card, "Getting there")).toHaveTextContent("No drive planned");
    expect(row(card, "Staying tonight")).toHaveTextContent("No stay needed");
    expect(row(card, "Starting from")).toHaveTextContent("Stowe Motel");
    expect(within(card).queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
  });

  it("shows the organizer's estimate and a stale one without inventing zero minutes", async () => {
    const full = driveTrip();
    const manual: ManualEstimateRow = { trip_day_id: full.days[1].id, pair_key: drivePlans(full)[1].pair_key!, duration_seconds: 2400,
      origin_label: "Stowe Motel", destination_label: "Spruce Peak lot", entered_at: CALCULATED, use_calculated: false, note: null };
    const manualMap = await tripMapFixture(full, { manual: [manual], now: NOW });
    expect(row(summary(manualMap, SAT, false).card, "Getting there")).toHaveTextContent("About 40 min drive to Spruce Peak lot · one way · the organizer's estimate");
    document.body.innerHTML = "";
    const staleMap = await tripMapFixture(full, { rows: [storedDrive(full, SAT, CALCULATED)], now: NOW + 8 * 86_400_000 });
    const stale = summary(staleMap, SAT, false).card;
    expect(row(stale, "Getting there")).toHaveTextContent("About 30 min drive to Spruce Peak lot · 15 mi · one way · not updated");
    expect(within(stale).getByRole("link", { name: "Check the drive time on the day plan" })).toHaveAttribute("href", `/trips/trip-drive/days/${SAT}#getting-there-${SAT}`);
    expect(within(stale).getByRole("link", { name: /Directions to Spruce Peak lot/ })).toBeVisible();
    document.body.innerHTML = "";
    const unknown = summary(await tripMapFixture(full), SAT, false).card;
    expect(row(unknown, "Getting there")).toHaveTextContent("Drive estimate unavailable");
    expect(row(unknown, "Getting there")).not.toHaveTextContent(/0 min/);
  });

  it("separates the meeting, pickup notes, approach and tour route from the drive", async () => {
    const full = driveTrip();
    const plan = { id: "tour", trip_id: full.trip.id, trip_day_id: full.days[1].id, objective: "North Ridge", route_url: "https://example.com/tour",
      meet_time: "08:00", meet_day_offset: 0, return_time: null, time_zone: "America/New_York", revision: 1, updated_at: "2027-01-01T12:00:00Z",
      access_notes: "Permit required at the kiosk", pickup_notes: "Second car at the lower lot", approach_notes: "Skin 40 min up the summer road" } as TripTourPlan;
    full.tour_plans = [buildTourPlanSummary(plan, SAT)];
    const map = await tripMapFixture(full);
    const { card } = summary(map, SAT);
    expect(row(card, "Meet")).toHaveTextContent(/8:00.* · Spruce Peak lot/);
    expect(row(card, "Meet")).toHaveTextContent("Times are local to the destination (America/New_York).");
    expect(row(card, "Pickup")).toHaveTextContent("Second car at the lower lotNotes only · not on the map");
    expect(row(card, "Approach (ski or walk)")).toHaveTextContent("Skin 40 min up the summer roadFrom the tour plan · not a calculated route or time");
    expect(row(card, "Access notes")).toHaveTextContent("Permit required at the kiosk");
    expect(row(card, "Getting there")).not.toHaveTextContent("40 min");
    expect(within(card).getByRole("link", { name: "Open tour route (new tab)" })).toHaveAttribute("href", "https://example.com/tour");
    expect(within(card).getByRole("link", { name: /Directions to Spruce Peak lot/ }).getAttribute("href")).not.toContain("example.com");
    expect(within(card).getByRole("link", { name: "Edit tour plan" })).toHaveAttribute("href", `/trips/trip-drive/days/${SAT}#tour-plan-heading`);
    expect(within(card).getByRole("link", { name: "Edit tonight's stay" })).toHaveAttribute("href", "/trips/trip-drive/stays#stay-stay-motel");
  });

  it("leaves out a saved tour plan that isn't in use after the day changed activity", async () => {
    const full = driveTrip();
    const plan = { id: "tour", trip_id: full.trip.id, trip_day_id: full.days[1].id, objective: "North Ridge", route_url: "https://example.com/tour",
      meet_time: "08:00", meet_day_offset: 0, return_time: null, time_zone: "America/New_York", revision: 1, updated_at: "2027-01-01T12:00:00Z",
      access_notes: "Permit required at the kiosk", pickup_notes: "Second car at the lower lot", approach_notes: "Skin 40 min up the summer road" } as TripTourPlan;
    full.tour_plans = [buildTourPlanSummary(plan, SAT)];
    full.days[1] = { ...full.days[1], activity: "Alpine" };
    const map = await tripMapFixture(full);
    const { day, card } = summary(map, SAT);
    expect(within(card).getByRole("heading")).toHaveTextContent("Sat Jan 9 · Alpine · Stowe, Vermont");
    for (const term of ["Meet", "Pickup", "Approach (ski or walk)", "Access notes"]) expect(within(card).queryByText(term, { selector: "dt" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("link", { name: /tour route|tour plan/ })).not.toBeInTheDocument();
    expect(dayRoles(map.places.find((entry) => entry.id === day.access_place_id)!, day)).toEqual(["access"]);
    expect(within(card).getByRole("link", { name: /Directions to Spruce Peak lot/ })).toBeVisible();
  });
});

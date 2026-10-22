import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayAccessPoint } from "@/components/trips/DayAccessPoint";
import { DayDrive, StayDepartures, useDriveEstimates, type DriveEstimatesState } from "@/components/trips/DriveEstimate";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { RoutingUnavailable } from "@/lib/locations/routing";
import { driveTrip, MOTEL, place, SPRUCE_LOT } from "@/test/driveTrip";
import { fakeTripApi, reply, sentBodies } from "@/test/tripApi";
import type { ManualEstimateRow } from "@/lib/trip-drive-estimates";
import type { StoredDriveEstimate } from "@/lib/trip-drive";
import type { TripDay, TripDriveEstimates, TripFull } from "@/types/trips";

const NOW = Date.parse("2027-01-05T15:00:00Z");
const SAT = "2027-01-09", SUN = "2027-01-10";
const URL = "/api/v1/trips/trip-drive/drive-estimates";
const memory = () => ({ read: async () => [], write: async () => undefined });
const matrix = async (sources: unknown[], targets: Array<{ latitude: number }>) =>
  sources.map(() => targets.map((target) => target.latitude === 44.53 ? { seconds: 720, meters: 9_000 } : { seconds: 4_440, meters: 64_000 }));
/** The server's answer for a trip, built by the real estimate code. */
const estimatesFor = (full: TripFull, options: Parameters<typeof tripDriveEstimates>[2] = {}) =>
  tripDriveEstimates(full, memory(), { now: NOW, matrix, ...options });
const state = (estimates: TripDriveEstimates | null, overrides: Partial<DriveEstimatesState> = {}): DriveEstimatesState =>
  ({ estimates, error: null, loading: false, routeChanged: false, refreshing: false, retry: vi.fn(), ...overrides });

function setUserAgent(value: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
}

describe("The day's drive", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the stay to the access point, one way, with Directions in Google Maps and the estimate's details", async () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    render(<DayDrive data={driveTrip()} date={SUN} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(await estimatesFor(driveTrip()))} />);
    const drive = screen.getByRole("region", { name: "Drive" });
    expect(within(drive).getByText("Stowe Motel → Smuggs lot")).toBeInTheDocument();
    expect(within(drive).getByText("About 1 hr 14 min drive · 40 mi · one way")).toBeInTheDocument();
    const directions = within(drive).getByRole("link", { name: "Directions from Stowe Motel to Smuggs lot (opens Google Maps)" });
    expect(directions).toHaveAttribute("href", expect.stringContaining("https://www.google.com/maps/dir/?api=1&origin=44.4875,-72.7262"));
    expect(directions).toHaveAttribute("target", "_blank");
    // Age and the provider's credit remain visible with details collapsed.
    expect(within(drive).getByText(/Calculated just now/)).toBeVisible();
    expect(within(drive).getByRole("link", { name: "Powered by Geoapify" })).toBeVisible();
    expect(within(drive).getByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
    await userEvent.click(within(drive).getByText("Estimate details"));
    expect(within(drive).getByText("Typical traffic, not live. No departure time is used. Check road conditions before you drive.")).toBeVisible();
    expect(within(drive).getByText("Avoids VT 108 through Smugglers' Notch, usually closed November to mid-May.")).toBeVisible();
    expect(within(drive).getByRole("link", { name: "Powered by Geoapify" })).toBeVisible();
  });
  it("opens Apple Maps on an iPhone", async () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) SWTTRNativeTabs");
    render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit={false} drive={state(await estimatesFor(driveTrip()))} />);
    expect(screen.getByRole("link", { name: /opens Apple Maps/ })).toHaveAttribute("href", "https://maps.apple.com/?saddr=44.4875,-72.7262&daddr=44.53,-72.7816&dirflg=d");
  });
  it("asks the organizer to plan the stay the night before, and tells members who will", async () => {
    const estimates = await estimatesFor(driveTrip());
    const { rerender } = render(<DayDrive data={driveTrip()} date="2027-01-08" dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(estimates)} />);
    expect(screen.getByText("Choose where you're starting")).toBeInTheDocument();
    expect(screen.getByText(/No crew stay is set for Thu Jan 7 night/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Stays" })).toHaveAttribute("href", "/trips/trip-drive/stays#trip-stays-heading");
    rerender(<DayDrive data={driveTrip()} date="2027-01-11" dateLabel="Day" onSaved={vi.fn()} canEdit={false} drive={state(estimates)} />);
    expect(screen.getByText("Village Inn has no location yet")).toBeInTheDocument();
    expect(screen.getByText("The drive time appears once the organizer sets its location.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to Stays" })).not.toBeInTheDocument();
  });
  it("says a hut has no road route, without a time or Directions", async () => {
    const hut = await tripDriveEstimates(driveTrip(), memory(), { now: NOW, matrix: async (sources, targets) => sources.map(() => targets.map(() => null)) });
    render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(hut)} />);
    expect(screen.getByText("No road route found")).toBeInTheDocument();
    expect(screen.queryByText(/About/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
  });
  it("keeps Directions, Retry and manual recovery after an expired no-route refresh fails", async () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    const full = driveTrip();
    let rows: StoredDriveEstimate[] = [];
    const store = { read: async () => rows, write: async (saved: StoredDriveEstimate[]) => { rows = saved; } };
    await tripDriveEstimates(full, store, { now: NOW, matrix: async (sources, targets) => sources.map(() => targets.map(() => null)) });
    const estimates = await tripDriveEstimates(full, store, { now: NOW + 8 * 86_400_000, matrix: async () => { throw new RoutingUnavailable("timeout"); } });
    render(<DayDrive data={full} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(estimates)} />);
    expect(screen.getByText("Drive estimate unavailable")).toBeVisible();
    expect(screen.getByRole("link", { name: /Directions from Stowe Motel to Spruce Peak lot/ })).toHaveAttribute("href",
      "https://www.google.com/maps/dir/?api=1&origin=44.4875,-72.7262&destination=44.53,-72.7816&travelmode=driving");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add your estimate" })).toBeVisible();
    expect(screen.queryByText("No road route found")).not.toBeInTheDocument();
    expect(screen.queryByText(/About .* drive/)).not.toBeInTheDocument();
  });
  it("doesn't credit a routing result when none is displayed", async () => {
    const estimates = await estimatesFor(driveTrip(), { matrix: async () => { throw new RoutingUnavailable("timeout"); } });
    render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(estimates)} />);
    expect(screen.getByText("Drive estimate unavailable")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Powered by Geoapify" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "© OpenStreetMap contributors" })).not.toBeInTheDocument();
  });
  it("offers Retry when the estimate is unavailable, and keeps an earlier pair's estimate only in the details", async () => {
    const store = { read: async () => [{ date: SAT, route_key: "drive|approximated|old", origin_label: "Stowe Motel", destination_label: "Mountain Road lot",
      status: "ok" as const, duration_seconds: 600, distance_meters: 8_000, calculated_at: "2027-01-04T15:00:00.000Z" }], write: async () => undefined };
    const failed = await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: async () => { throw new RoutingUnavailable("429"); } });
    const retry = vi.fn();
    render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(failed, { retry })} />);
    expect(screen.getByText("Route changed — couldn't update the estimate")).toBeInTheDocument();
    expect(screen.queryByText(/About 10 min drive/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Powered by Geoapify" })).toBeVisible();
    await userEvent.click(screen.getByText("Estimate details"));
    expect(screen.getByText(/Earlier estimate, for Stowe Motel → Mountain Road lot: about 10 min/)).toBeVisible();
    expect(screen.getByText(/Typical traffic, not live. No departure time is used/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });
  it("holds only the drive row while loading, and offers Retry when the estimates don't load", async () => {
    const { rerender } = render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(null, { loading: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking the drive time…");
    rerender(<DayDrive data={driveTrip()} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(null, { error: "Check your connection and try again." })} />);
    expect(screen.getByText("Drive times couldn't load.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("A stay's departures on Overview", () => {
  it("shows the next departure and every morning that starts there, each linking to its day", async () => {
    render(<StayDepartures tripId="trip-drive" stayId="stay-motel" drive={state(await estimatesFor(driveTrip()))} />);
    expect(screen.getByText("Next departure · Sat Jan 9: About 12 min drive to Spruce Peak lot · 5.6 mi · one way")).toBeInTheDocument();
    expect(screen.getByText("Calculated just now")).toBeVisible();
    expect(screen.getByRole("link", { name: "Powered by Geoapify" })).toBeVisible();
    await userEvent.click(screen.getByText("View access times"));
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Sat Jan 9 · About 12 min drive to Spruce Peak lot · 5.6 mi · one way · calculated just now",
      "Sun Jan 10 · About 1 hr 14 min drive to Smuggs lot · 40 mi · one way · calculated just now",
    ]);
    expect(within(items[1]).getByRole("link", { name: "Sun Jan 10" })).toHaveAttribute("href", `/trips/trip-drive/days/${SUN}`);
  });
});

function Probe({ data }: { data: TripFull }) {
  const drive = useDriveEstimates(data);
  return <p data-testid="probe">{drive.loading ? "loading" : drive.error ?? drive.estimates?.days.find((day) => day.date === SAT)?.destination?.label}</p>;
}

describe("Fetching the estimates", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("fetches again when the plan changes and never shows an older answer for the newer plan", async () => {
    const before = driveTrip();
    const after = driveTrip();
    after.stops[0] = { ...after.stops[0], access_point: place("Mountain Road lot", 44.528, -72.7853) };
    const [oldAnswer, newAnswer] = await Promise.all([estimatesFor(before), estimatesFor(after)]);
    let releaseOld!: () => void;
    const answers = [
      () => new Promise<ReturnType<typeof reply>>((resolve) => { releaseOld = () => resolve(reply(200, oldAnswer)); }),
      () => reply(200, newAnswer),
    ];
    const fetchMock = fakeTripApi({ [`GET ${URL}`]: () => answers.shift()!() });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<Probe data={before} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("loading");
    rerender(<Probe data={after} />);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("Mountain Road lot"));
    await act(async () => releaseOld());
    expect(screen.getByTestId("probe")).toHaveTextContent("Mountain Road lot");
    // An unrelated refresh of the same plan doesn't fetch again.
    rerender(<Probe data={structuredClone(after)} />);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("says why when the estimates can't load", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${URL}`]: reply(500, { error: "Couldn't load drive times. Try again." }) }));
    render(<Probe data={driveTrip()} />);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("Couldn't load drive times. Try again."));
  });

  it("announces a changed route while updating and hides the old pair's time", async () => {
    function DayProbe({ data }: { data: TripFull }) {
      const drive = useDriveEstimates(data);
      return <DayDrive data={data} date={SAT} dateLabel="Day" drive={drive} canEdit onSaved={vi.fn()} />;
    }
    const before = driveTrip(), after = driveTrip();
    after.stops[0] = { ...after.stops[0], access_point: place("Mountain Road lot", 44.528, -72.7853) };
    const oldAnswer = await estimatesFor(before);
    let release!: () => void;
    const answers = [
      () => reply(200, oldAnswer),
      () => new Promise<ReturnType<typeof reply>>((resolve) => { release = () => resolve(reply(500, { error: "Try again." })); }),
    ];
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${URL}`]: () => answers.shift()!() }));
    const { rerender } = render(<DayProbe data={before} />);
    expect(await screen.findByText("About 12 min drive · 5.6 mi · one way")).toBeVisible();
    rerender(<DayProbe data={after} />);
    expect(screen.getByRole("status")).toHaveTextContent("Route changed — updating estimate");
    expect(screen.queryByText(/About 12 min/)).not.toBeInTheDocument();
    await act(async () => release());
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.queryByText(/About 12 min/)).not.toBeInTheDocument();
  });
});

const FRI = "2027-01-08";
const CABIN = place("Ridge cabin", 44.51, -72.75);
const ORIGIN_URL = (date: string) => `/api/v1/trips/trip-drive/days/${date}/origin`;
const ESTIMATE_URL = `/api/v1/trips/trip-drive/days/${SAT}/drive-estimate`;
const failing = async () => { throw new RoutingUnavailable("429"); };
/** The trip with some days' own fields set. */
const withDays = (...days: Array<Partial<TripDay> & { date: string }>) => {
  const full = driveTrip();
  full.days = full.days.map((day) => ({ ...day, ...days.find((own) => own.date === day.date) }));
  return full;
};
/** Your estimate as 029 stores it, on the fixture's day for `date`. */
const yours = (date: string, minutes: number, overrides: Partial<ManualEstimateRow> = {}): ManualEstimateRow => ({
  trip_day_id: `day-${date}`, pair_key: `drive|${MOTEL.latitude},${MOTEL.longitude}>${SPRUCE_LOT.latitude},${SPRUCE_LOT.longitude}`,
  origin_label: "Stowe Motel", destination_label: "Spruce Peak lot", duration_seconds: minutes * 60, note: "Resort directions page",
  use_calculated: false, entered_at: "2027-01-04T12:00:00.000Z", ...overrides,
});
const withManual = (full: TripFull, rows: ManualEstimateRow[], options: Parameters<typeof tripDriveEstimates>[2] = {}) =>
  tripDriveEstimates(full, { ...memory(), manual: async () => rows }, { now: NOW, matrix, ...options });

describe("Where the day starts", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("offers Set starting point on the first day, saves a saved stay for only that day, and announces it", async () => {
    const fetchMock = fakeTripApi({ [`PUT ${ORIGIN_URL(FRI)}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn(async () => undefined);
    const full = driveTrip();
    render(<DayDrive data={full} date={FRI} dateLabel="Fri Jan 8" canEdit drive={state(await estimatesFor(full))} onSaved={onSaved} />);
    expect(screen.getByText("Choose where you're starting")).toBeInTheDocument();
    expect(screen.getByText(/Set a starting point for this day, or/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Stays" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set starting point" }));
    const form = screen.getByRole("form", { name: "Starting point for Fri Jan 8" });
    // No crew stay that night, so the choices are the saved stays with a place, or another place.
    expect(within(form).getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Stowe MotelSaved stay", "Another placeSearch for a place or enter coordinates",
    ]);
    await waitFor(() => expect(within(form).getByRole("radio", { name: /Stowe Motel/ })).toHaveFocus());
    expect(within(form).getByRole("button", { name: "Save starting point" })).toBeDisabled();
    await userEvent.click(within(form).getByRole("radio", { name: /Stowe Motel/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save starting point" }));
    expect(sentBodies(fetchMock, `PUT ${ORIGIN_URL(FRI)}`)).toEqual([{
      origin: { stay_id: "stay-motel" }, no_drive: false, expected: { origin: null, origin_stay_id: null, no_drive: false },
    }]);
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByText("Starting point saved.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Set starting point" })).toHaveFocus());
  });
  it("shows a day's own starting point, and Use crew stay again keeps No drive planned", async () => {
    const fetchMock = fakeTripApi({ [`PUT ${ORIGIN_URL(SAT)}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const full = withDays({ date: SAT, origin: CABIN });
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await estimatesFor(full))} onSaved={vi.fn()} />);
    expect(screen.getByText("Starting from Ridge cabin · only this day")).toBeInTheDocument();
    expect(screen.getByText("Ridge cabin → Spruce Peak lot")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Directions from Ridge cabin to Spruce Peak lot/ })).toHaveAttribute("href", expect.stringContaining("origin=44.51,-72.75"));
    await userEvent.click(screen.getByRole("button", { name: "Use crew stay again" }));
    expect(sentBodies(fetchMock, `PUT ${ORIGIN_URL(SAT)}`)).toEqual([{
      origin: null, no_drive: false, expected: { origin: CABIN, origin_stay_id: null, no_drive: false },
    }]);
    expect(await screen.findByText("Starting from Stowe Motel again.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Change starting point" })).toHaveFocus());
  });
  it("plans no drive, keeping the named starting point, and members only read it", async () => {
    const fetchMock = fakeTripApi({ [`PUT ${ORIGIN_URL(SAT)}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const full = driveTrip();
    const { unmount } = render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await estimatesFor(full))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Change starting point" }));
    const form = screen.getByRole("form", { name: "Starting point for Sat Jan 9" });
    expect(within(form).getByRole("radio", { name: /Crew stay · Stowe Motel/ })).toBeChecked();
    await userEvent.click(within(form).getByRole("checkbox", { name: /No drive planned/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save starting point" }));
    expect(sentBodies(fetchMock, `PUT ${ORIGIN_URL(SAT)}`)).toEqual([{ origin: null, no_drive: true, expected: { origin: null, origin_stay_id: null, no_drive: false } }]);
    expect(await screen.findByText("Starting point saved. No drive planned.")).toBeInTheDocument();
    unmount();

    const planned = withDays({ date: SAT, no_drive: true });
    render(<DayDrive data={planned} date={SAT} dateLabel="Sat Jan 9" canEdit={false} drive={state(await estimatesFor(planned))} onSaved={vi.fn()} />);
    expect(screen.getByText("Starting from Stowe Motel · No drive planned")).toBeInTheDocument();
    expect(screen.queryByText(/About/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("keeps a day's own stay as its own when it's also the crew stay, so a later lodging change can't move it", async () => {
    const fetchMock = fakeTripApi({ [`PUT ${ORIGIN_URL(SAT)}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const own = { origin: { ...MOTEL, label: "Stowe Motel" }, origin_stay_id: "stay-motel" };
    const full = withDays({ date: SAT, ...own });
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await estimatesFor(full))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Change starting point" }));
    const form = screen.getByRole("form", { name: "Starting point for Sat Jan 9" });
    expect(within(form).getByRole("radio", { name: /This day's own · kept if the crew stay changes/ })).toBeChecked();
    expect(within(form).getByRole("radio", { name: /Crew stay · Stowe Motel/ })).not.toBeChecked();
    await userEvent.click(within(form).getByRole("checkbox", { name: /No drive planned/ }));
    await userEvent.click(within(form).getByRole("button", { name: "Save starting point" }));
    expect(sentBodies(fetchMock, `PUT ${ORIGIN_URL(SAT)}`)).toEqual([{ origin: { stay_id: "stay-motel" }, no_drive: true, expected: { ...own, no_drive: false } }]);
  });
  it("cancels without saving, and returns focus to Change starting point", async () => {
    const fetchMock = fakeTripApi({});
    vi.stubGlobal("fetch", fetchMock);
    render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await estimatesFor(driveTrip()))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Change starting point" }));
    await userEvent.click(screen.getByRole("radio", { name: /Another place/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Change starting point" })).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps the choice when the day changed since, and saves against what's saved now after a review", async () => {
    const changed = withDays({ date: SAT, origin: CABIN });
    let attempt = 0;
    const fetchMock = fakeTripApi({
      [`PUT ${ORIGIN_URL(SAT)}`]: () => ++attempt === 1 ? reply(409, { error: "The starting point changed since you opened this. Check it, then try again." }) : reply(200, { ok: true }),
      "GET /api/v1/trips/trip-drive": reply(200, changed),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<DayDrive data={driveTrip()} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await estimatesFor(driveTrip()))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Change starting point" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /No drive planned/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save starting point" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The starting point changed since you opened this.");
    expect(screen.getByRole("checkbox", { name: /No drive planned/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Review saved starting point" }));
    expect(await screen.findByText(/Saved now: starting from Ridge cabin, only this day\. Your choice is still here/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save starting point" }));
    expect(sentBodies(fetchMock, `PUT ${ORIGIN_URL(SAT)}`)[1]).toEqual({ origin: null, no_drive: true, expected: { origin: CABIN, origin_stay_id: null, no_drive: false } });
    expect(await screen.findByText("Starting point saved. No drive planned.")).toBeInTheDocument();
  });
});

describe("Your estimate", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  /** Sunday drives from the motel to Spruce Peak lot too. */
  const twoDays = () => {
    const full = driveTrip();
    full.stops[1] = { ...full.stops[1], access_point: SPRUCE_LOT };
    return full;
  };

  it("adds one when routing has none, for the days with the same drive, and asks for the estimates again", async () => {
    const fetchMock = fakeTripApi({ [`PUT ${ESTIMATE_URL}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const retry = vi.fn();
    const full = twoDays();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [], { matrix: failing }), { retry })} onSaved={vi.fn()} />);
    expect(screen.getByText("Drive estimate unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add your estimate" }));
    const form = screen.getByRole("form", { name: "Add your estimate" });
    expect(within(form).getByText("Stowe Motel → Spruce Peak lot · by car, one way")).toBeInTheDocument();
    await waitFor(() => expect(within(form).getByRole("textbox", { name: "Hours" })).toHaveFocus());
    await userEvent.type(within(form).getByRole("textbox", { name: "Minutes" }), "40");
    await userEvent.type(within(form).getByRole("textbox", { name: "Source or note (optional)" }), "Resort directions page");
    expect(within(form).getByRole("checkbox", { name: "Sat Jan 9 (this day)" })).toBeDisabled();
    await userEvent.click(within(form).getByRole("checkbox", { name: "Sun Jan 10" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save your estimate" }));
    expect(sentBodies(fetchMock, `PUT ${ESTIMATE_URL}`)).toEqual([{
      pair_key: "drive|44.4875,-72.7262>44.53,-72.7816", duration_seconds: 2400, note: "Resort directions page",
      dates: [SAT, SUN], clear: [], expected: [{ date: SAT, entered_at: null, use_calculated: null }, { date: SUN, entered_at: null, use_calculated: null }],
    }]);
    expect(await screen.findByText("Your estimate saved for Sat Jan 9 and Sun Jan 10.")).toBeInTheDocument();
    expect(retry).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Drive" })).toHaveFocus());
  });
  it("keeps the entry and focuses the time when the server refuses it", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ [`PUT ${ESTIMATE_URL}`]: reply(400, { error: "Enter a time from 1 minute to 24 hours.", field: "duration" }) }));
    const full = driveTrip();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [], { matrix: failing }))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add your estimate" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Source or note (optional)" }), "Guess");
    await userEvent.click(screen.getByRole("button", { name: "Save your estimate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a time from 1 minute to 24 hours.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Hours" })).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Hours" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "Source or note (optional)" })).toHaveValue("Guess");
  });
  it("keeps the entry when a conflict review finds the day has no drive to estimate now", async () => {
    const full = driveTrip();
    const removed = driveTrip();
    removed.stops[0] = { ...removed.stops[0], access_point: null };
    const [before, after] = await Promise.all([withManual(full, [], { matrix: failing }), withManual(removed, [], { matrix: failing })]);
    vi.stubGlobal("fetch", fakeTripApi({
      [`PUT ${ESTIMATE_URL}`]: reply(409, { error: "Your estimate or this day's drive changed since you opened it. Check it, then try again." }),
      [`GET ${URL}`]: reply(200, after),
    }));
    const retry = vi.fn();
    const { rerender } = render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(before, { retry })} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add your estimate" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Minutes" }), "40");
    await userEvent.type(screen.getByRole("textbox", { name: "Source or note (optional)" }), "Resort directions page");
    await userEvent.click(screen.getByRole("button", { name: "Save your estimate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed since you opened it");
    await userEvent.click(screen.getByRole("button", { name: "Review saved estimate" }));
    expect(await screen.findByText("This day has no drive to estimate now. Cancel to see why.")).toBeInTheDocument();
    expect(retry).toHaveBeenCalled();
    // The card refreshes to a day with no access point; the entry stays, and can't be saved.
    rerender(<DayDrive data={removed} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(after, { retry })} onSaved={vi.fn()} />);
    expect(screen.getByText("Choose the entrance or parking")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Minutes" })).toHaveValue("40");
    expect(screen.getByRole("textbox", { name: "Source or note (optional)" })).toHaveValue("Resort directions page");
    expect(screen.getByRole("button", { name: "Save your estimate" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Drive" })).toHaveFocus());
  });
  it("is labeled as yours, with Edit and Remove, and the organizer's for everyone else", async () => {
    const full = driveTrip();
    const estimates = await withManual(full, [yours(SAT, 40)], { matrix: failing });
    const { rerender } = render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(estimates)} onSaved={vi.fn()} />);
    expect(screen.getByText("About 40 min drive · one way")).toBeInTheDocument();
    expect(screen.getByText(/^Your estimate · entered .* · Resort directions page$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit your estimate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove your estimate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add your estimate" })).not.toBeInTheDocument();
    expect(screen.queryByText("Estimate details")).not.toBeInTheDocument();
    expect(screen.queryByText(/Typical traffic/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No departure time is used/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Powered by Geoapify" })).not.toBeInTheDocument();
    rerender(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit={false} drive={state(estimates)} onSaved={vi.fn()} />);
    expect(screen.getByText(/^Organizer's estimate · entered/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /estimate/ })).not.toBeInTheDocument();
  });
  it("offers the calculated estimate for the same drive separately, and switches only when asked", async () => {
    const fetchMock = fakeTripApi({ [`PATCH ${ESTIMATE_URL}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const full = driveTrip();
    const { unmount } = render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [yours(SAT, 40)]))} onSaved={vi.fn()} />);
    expect(screen.getByText("About 40 min drive · one way")).toBeInTheDocument();
    expect(screen.getByText(/^Calculated estimate: about 12 min · 5.6 mi/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use calculated estimate" }));
    expect(sentBodies(fetchMock, `PATCH ${ESTIMATE_URL}`)).toEqual([{ use_calculated: true, expected: [{ date: SAT, entered_at: "2027-01-04T12:00:00.000Z", use_calculated: false }] }]);
    expect(await screen.findByText("Using the calculated estimate.")).toBeInTheDocument();
    unmount();

    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [yours(SAT, 40, { use_calculated: true })]))} onSaved={vi.fn()} />);
    expect(screen.getByText("About 12 min drive · 5.6 mi · one way")).toBeInTheDocument();
    expect(screen.getByText(/^Your estimate: about 40 min · entered/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use your estimate" })).toBeInTheDocument();
  });
  it("labels a stale calculated alternative without changing the chosen manual estimate", async () => {
    const full = driveTrip();
    let rows: StoredDriveEstimate[] = [];
    const store = { read: async () => rows, write: async (saved: StoredDriveEstimate[]) => { rows = saved; }, manual: async () => [yours(SAT, 40)] };
    await tripDriveEstimates(full, store, { now: NOW, matrix });
    const estimates = await tripDriveEstimates(full, store, { now: NOW + 8 * 86_400_000, matrix: failing });
    render(<DayDrive data={full} date={SAT} dateLabel="Day" onSaved={vi.fn()} canEdit drive={state(estimates)} />);
    expect(screen.getByText("About 40 min drive · one way")).toBeVisible();
    expect(screen.getByText("Calculated estimate: about 12 min · 5.6 mi · one way (calculated 8 days ago) · not updated")).toBeVisible();
    await userEvent.click(screen.getByText("Estimate details"));
    expect(screen.getByText(/Typical traffic, not live. No departure time is used/)).toBeVisible();
  });
  it("asks which days before removing it, and removes it from all of them", async () => {
    const fetchMock = fakeTripApi({ [`DELETE ${ESTIMATE_URL}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const full = twoDays();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [yours(SAT, 40), yours(SUN, 40)], { matrix: failing }))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove your estimate" }));
    const question = screen.getByText("Remove your estimate from Sat Jan 9 and Sun Jan 10? Any calculated estimate stays.");
    await waitFor(() => expect(question).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit your estimate" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "Remove your estimate" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove your estimate" }));
    const seen = { entered_at: "2027-01-04T12:00:00.000Z", use_calculated: false };
    expect(sentBodies(fetchMock, `DELETE ${ESTIMATE_URL}`)).toEqual([{ dates: [SAT, SUN], expected: [{ date: SAT, ...seen }, { date: SUN, ...seen }] }]);
    expect(await screen.findByText("Your estimate removed.")).toBeInTheDocument();
  });
  it("reviews what's saved after a removal conflict, then removes against it", async () => {
    const full = driveTrip();
    const [before, after] = await Promise.all([
      withManual(full, [yours(SAT, 40)], { matrix: failing }),
      withManual(full, [yours(SAT, 45, { entered_at: "2027-01-05T09:00:00.000Z", note: "Front desk" })], { matrix: failing }),
    ]);
    let attempt = 0;
    const fetchMock = fakeTripApi({
      [`DELETE ${ESTIMATE_URL}`]: () => ++attempt === 1
        ? reply(409, { error: "Your estimate or this day's drive changed since you opened it. Check it, then try again." }) : reply(200, { ok: true }),
      [`GET ${URL}`]: reply(200, after),
    });
    vi.stubGlobal("fetch", fetchMock);
    const retry = vi.fn();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(before, { retry })} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove your estimate" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove your estimate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed since you opened it");
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remove your estimate" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review saved estimate" }));
    const question = await screen.findByText("Saved now: about 45 min · Front desk. Remove your estimate from Sat Jan 9? Any calculated estimate stays.");
    expect(question).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Remove your estimate" }));
    expect(sentBodies(fetchMock, `DELETE ${ESTIMATE_URL}`)[1]).toEqual({ dates: [SAT], expected: [{ date: SAT, entered_at: "2027-01-05T09:00:00.000Z", use_calculated: false }] });
    expect(await screen.findByText("Your estimate removed.")).toBeInTheDocument();
  });
  it("keeps an open entry when the day's last destination is removed, then returns focus to Getting there", async () => {
    const full = driveTrip();
    const gone = driveTrip({ stops: [] });
    const [before, after] = await Promise.all([withManual(full, [], { matrix: failing }), withManual(gone, [], { matrix: failing })]);
    vi.stubGlobal("fetch", fakeTripApi({
      [`PUT ${ESTIMATE_URL}`]: reply(409, { error: "Your estimate or this day's drive changed since you opened it. Check it, then try again." }),
      [`GET ${URL}`]: reply(200, after),
    }));
    const card = (data: TripFull, estimates: TripDriveEstimates) => (
      <DayAccessPoint data={data} day={data.days[1]} dateLabel="Sat Jan 9" canEdit onSaved={vi.fn()}>
        <DayDrive data={data} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(estimates)} onSaved={vi.fn()} />
      </DayAccessPoint>
    );
    const { rerender } = render(card(full, before));
    await userEvent.click(screen.getByRole("button", { name: "Add your estimate" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Minutes" }), "40");
    await userEvent.click(screen.getByRole("button", { name: "Save your estimate" }));
    await userEvent.click(await screen.findByRole("button", { name: "Review saved estimate" }));
    expect(await screen.findByText("This day has no drive to estimate now. Cancel to see why.")).toBeInTheDocument();
    rerender(card(gone, after));
    expect(screen.getByText("Choose a destination first")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Minutes" })).toHaveValue("40");
    expect(screen.getByRole("button", { name: "Save your estimate" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /starting point/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Drive" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Getting there" })).toHaveFocus());
  });
  it("edits the days it was saved for, removing it from a day that's unticked", async () => {
    const fetchMock = fakeTripApi({ [`PUT ${ESTIMATE_URL}`]: reply(200, { ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const full = twoDays();
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [yours(SAT, 40), yours(SUN, 40)], { matrix: failing }))} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit your estimate" }));
    const form = screen.getByRole("form", { name: "Edit your estimate" });
    expect(within(form).getByRole("textbox", { name: "Hours" })).toHaveValue("0");
    expect(within(form).getByRole("textbox", { name: "Minutes" })).toHaveValue("40");
    expect(within(form).getByRole("checkbox", { name: "Sun Jan 10" })).toBeChecked();
    await userEvent.click(within(form).getByRole("checkbox", { name: "Sun Jan 10" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save your estimate" }));
    expect(sentBodies(fetchMock, `PUT ${ESTIMATE_URL}`)[0]).toMatchObject({ dates: [SAT], clear: [SUN], duration_seconds: 2400 });
  });
  it("asks for a review once the day's drive is another pair", async () => {
    const full = withDays({ date: SAT, origin: CABIN });
    render(<DayDrive data={full} date={SAT} dateLabel="Sat Jan 9" canEdit drive={state(await withManual(full, [yours(SAT, 40)]))} onSaved={vi.fn()} />);
    expect(screen.getByText("About 12 min drive · 5.6 mi · one way")).toBeInTheDocument();
    expect(screen.getByText("Your estimate, about 40 min, was for Stowe Motel → Spruce Peak lot. Edit it to use it for this drive, or remove it.")).toBeInTheDocument();
  });
});

describe("Overview summaries with starting points and your estimate", () => {
  it("names your estimate and No drive planned", async () => {
    const full = withDays({ date: SUN, no_drive: true });
    render(<StayDepartures tripId="trip-drive" stayId="stay-motel" canEdit drive={state(await withManual(full, [yours(SAT, 40)], { matrix: failing }))} />);
    await userEvent.click(screen.getByText("View access times"));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Sat Jan 9 · About 40 min drive to Spruce Peak lot · one way · your estimate",
      "Sun Jan 10 · No drive planned",
    ]);
  });
});

function RetryProbe({ data }: { data: TripFull }) {
  const drive = useDriveEstimates(data);
  return <>
    <p data-testid="retry-probe">{drive.loading ? "loading" : `${drive.estimates?.days[1].state}${drive.refreshing ? " · refreshing" : ""}`}</p>
    <button type="button" onClick={drive.retry}>Again</button>
  </>;
}

describe("Checking again", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps showing the estimates for the same plan while it checks again", async () => {
    const full = driveTrip();
    const [first, second] = await Promise.all([estimatesFor(full), withManual(full, [yours(SAT, 40)])]);
    let release!: () => void;
    const answers = [
      () => reply(200, first),
      () => new Promise<ReturnType<typeof reply>>((resolve) => { release = () => resolve(reply(200, second)); }),
    ];
    vi.stubGlobal("fetch", fakeTripApi({ [`GET ${URL}`]: () => answers.shift()!() }));
    render(<RetryProbe data={full} />);
    await waitFor(() => expect(screen.getByTestId("retry-probe")).toHaveTextContent("available"));
    await userEvent.click(screen.getByRole("button", { name: "Again" }));
    expect(screen.getByTestId("retry-probe")).toHaveTextContent("available · refreshing");
    await act(async () => release());
    expect(screen.getByTestId("retry-probe")).toHaveTextContent(/^manual$/);
  });
});


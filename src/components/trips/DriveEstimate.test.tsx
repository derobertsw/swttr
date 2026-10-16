import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayDrive, StayDepartures, useDriveEstimates, type DriveEstimatesState } from "@/components/trips/DriveEstimate";
import { tripDriveEstimates } from "@/lib/trip-drive-estimates";
import { RoutingUnavailable } from "@/lib/locations/routing";
import { driveTrip, place } from "@/test/driveTrip";
import { fakeTripApi, reply } from "@/test/tripApi";
import type { TripDriveEstimates, TripFull } from "@/types/trips";

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
  ({ estimates, error: null, loading: false, retry: vi.fn(), ...overrides });

function setUserAgent(value: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(value);
}

describe("The day's drive", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the stay to the access point, one way, with Directions in Google Maps and the estimate's details", async () => {
    setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
    render(<DayDrive tripId="trip-drive" date={SUN} canEdit drive={state(await estimatesFor(driveTrip()))} />);
    const drive = screen.getByRole("region", { name: "Drive" });
    expect(within(drive).getByText("Stowe Motel → Smuggs lot")).toBeInTheDocument();
    expect(within(drive).getByText("About 1 hr 14 min drive · 40 mi · one way")).toBeInTheDocument();
    const directions = within(drive).getByRole("link", { name: "Directions from Stowe Motel to Smuggs lot (opens Google Maps)" });
    expect(directions).toHaveAttribute("href", expect.stringContaining("https://www.google.com/maps/dir/?api=1&origin=44.4875,-72.7262"));
    expect(directions).toHaveAttribute("target", "_blank");
    await userEvent.click(within(drive).getByText("Estimate details"));
    expect(within(drive).getByText("Typical traffic, not live. Check road conditions before you drive.")).toBeVisible();
    expect(within(drive).getByText("Avoids VT 108 through Smugglers' Notch, usually closed November to mid-May.")).toBeVisible();
    expect(within(drive).getByRole("link", { name: "Powered by Geoapify" })).toBeVisible();
  });
  it("opens Apple Maps on an iPhone", async () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) SWTTRNativeTabs");
    render(<DayDrive tripId="trip-drive" date={SAT} canEdit={false} drive={state(await estimatesFor(driveTrip()))} />);
    expect(screen.getByRole("link", { name: /opens Apple Maps/ })).toHaveAttribute("href", "https://maps.apple.com/?saddr=44.4875,-72.7262&daddr=44.53,-72.7816&dirflg=d");
  });
  it("asks the organizer to plan the stay the night before, and tells members who will", async () => {
    const estimates = await estimatesFor(driveTrip());
    const { rerender } = render(<DayDrive tripId="trip-drive" date="2027-01-08" canEdit drive={state(estimates)} />);
    expect(screen.getByText("Choose where you're starting")).toBeInTheDocument();
    expect(screen.getByText(/No crew stay is set for Thu Jan 7 night/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Stays" })).toHaveAttribute("href", "/trips/trip-drive#trip-stays-heading");
    rerender(<DayDrive tripId="trip-drive" date="2027-01-11" canEdit={false} drive={state(estimates)} />);
    expect(screen.getByText("Village Inn has no location yet")).toBeInTheDocument();
    expect(screen.getByText("The drive time appears once the organizer sets its location.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to Stays" })).not.toBeInTheDocument();
  });
  it("says a hut has no road route, without a time or Directions", async () => {
    const hut = await tripDriveEstimates(driveTrip(), memory(), { now: NOW, matrix: async (sources, targets) => sources.map(() => targets.map(() => null)) });
    render(<DayDrive tripId="trip-drive" date={SAT} canEdit drive={state(hut)} />);
    expect(screen.getByText("No road route found")).toBeInTheDocument();
    expect(screen.queryByText(/About/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Directions/ })).not.toBeInTheDocument();
  });
  it("offers Retry when the estimate is unavailable, and keeps an earlier pair's estimate only in the details", async () => {
    const store = { read: async () => [{ date: SAT, route_key: "drive|approximated|old", origin_label: "Stowe Motel", destination_label: "Mountain Road lot",
      status: "ok" as const, duration_seconds: 600, distance_meters: 8_000, calculated_at: "2027-01-04T15:00:00.000Z" }], write: async () => undefined };
    const failed = await tripDriveEstimates(driveTrip(), store, { now: NOW, matrix: async () => { throw new RoutingUnavailable("429"); } });
    const retry = vi.fn();
    render(<DayDrive tripId="trip-drive" date={SAT} canEdit drive={state(failed, { retry })} />);
    expect(screen.getByText("Route changed — couldn't update the estimate")).toBeInTheDocument();
    expect(screen.queryByText(/About 10 min drive/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Estimate details"));
    expect(screen.getByText(/Earlier estimate, for Stowe Motel → Mountain Road lot: about 10 min/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });
  it("holds only the drive row while loading, and offers Retry when the estimates don't load", async () => {
    const { rerender } = render(<DayDrive tripId="trip-drive" date={SAT} canEdit drive={state(null, { loading: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking the drive time…");
    rerender(<DayDrive tripId="trip-drive" date={SAT} canEdit drive={state(null, { error: "Check your connection and try again." })} />);
    expect(screen.getByText("Drive times couldn't load.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("A stay's departures on Overview", () => {
  it("shows the next departure and every morning that starts there, each linking to its day", async () => {
    render(<StayDepartures tripId="trip-drive" stayId="stay-motel" drive={state(await estimatesFor(driveTrip()))} />);
    expect(screen.getByText("Next departure · Sat Jan 9: About 12 min to Spruce Peak lot · 5.6 mi")).toBeInTheDocument();
    await userEvent.click(screen.getByText("View access times"));
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Sat Jan 9 · About 12 min to Spruce Peak lot · 5.6 mi",
      "Sun Jan 10 · About 1 hr 14 min to Smuggs lot · 40 mi",
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
});

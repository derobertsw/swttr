import { useSyncExternalStore } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { driveTrip } from "@/test/driveTrip";
import { fakeTripApi, reply } from "@/test/tripApi";
import { storedDrive, tripMapFixture } from "@/test/tripMap";
import { fakeClerkState, resetFakeClerk } from "@/test/fakeClerk";
import { offlineBrief, resetDeviceStorage } from "@/test/offlineBrief";
import { storeSavedBrief } from "@/lib/offline-briefs";
import type { TripMap, TripMapDay } from "@/types/trip-map";
import { TripMapView } from "./TripMapView";

vi.mock("@clerk/nextjs", async () => (await import("@/test/fakeClerk")).fakeClerkModule);
const canvas = vi.hoisted(() => ({ props: null as unknown as Record<string, unknown>, crash: false }));
vi.mock("next/navigation", () => ({ useSearchParams: () => {
  const search = useSyncExternalStore((cb) => { window.addEventListener("popstate", cb); return () => window.removeEventListener("popstate", cb); }, () => window.location.search);
  return new URLSearchParams(search);
} }));
vi.mock("next/dynamic", () => ({ default: () => function MockCanvas(props: Record<string, unknown>) {
  canvas.props = props;
  if (canvas.crash) throw new Error("SDK chunk failed");
  return <div aria-label="Test canvas"><button onClick={() => (props.onSelect as (id: string) => void)("stop:stop-stowe:destination")}>Choose destination marker</button><button onClick={() => (props.onGroup as (ids: string[]) => void)(["stop:stop-stowe:destination", "stop:stop-smuggs:destination"])}>Open coincident group</button><button onClick={() => (props.onError as () => void)()}>Fail tiles</button></div>;
} }));

const base = await tripMapFixture();
let data: TripMap;
const path = "/trips/trip-drive/map";
const nativePush = window.history.pushState.bind(window.history);
beforeEach(() => {
  data = structuredClone(base); canvas.crash = false;
  resetDeviceStorage(); resetFakeClerk();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  nativePush({}, "", path);
  vi.spyOn(window.history, "pushState").mockImplementation((state, unused, url) => { nativePush(state, unused, url); window.dispatchEvent(new PopStateEvent("popstate")); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const view = (canEdit = false) => render(<TripMapView data={data} canEdit={canEdit} />);

describe("Synchronized trip map and accessible list", () => {
  it("selects a marker and row through the same stable URL and preserves all repeat dates", async () => {
    window.history.replaceState({ __NA: true }, "");
    const user = userEvent.setup(); view();
    await user.click(screen.getByRole("button", { name: "Choose destination marker" }));
    expect(window.location.search).toBe("?place=stop%3Astop-stowe%3Adestination");
    expect(vi.mocked(window.history.pushState).mock.calls[0][0]).not.toHaveProperty("__NA");
    expect(screen.getByRole("heading", { name: /Destination · Stowe, Vermont/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Destination · Stowe, Vermont/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "List" }));
    const row = screen.getByRole("button", { name: /Destination · Stowe, Vermont/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    // Days read as the date picker names them, from the server's labels (#235).
    expect(row).toHaveTextContent("Fri Jan 8 · Sat Jan 9");
    await user.click(screen.getByRole("button", { name: /Village Inn/ }));
    expect(screen.getByRole("link", { name: "View stay" })).toHaveAttribute("href", "/trips/trip-drive/stays#stay-stay-inn");
    expect(screen.getByRole("link", { name: "View day · Sun Jan 10" })).toBeVisible();
    expect(screen.getByRole("region", { name: /Village Inn/ })).not.toHaveTextContent(/\d{4}-\d{2}-\d{2}/);
    expect(screen.getByText(/^Selected Village Inn\./)).toHaveTextContent("Selected Village Inn. Dates: Sun Jan 10, Mon Jan 11.");
  });

  it("retains missing and approximate places and every date, including an unmapped day", async () => {
    data.places[0].precision = "approximate";
    data.dates.push({ date: "2027-01-12", label: "Tue, Jan 12" });
    view(); const user = userEvent.setup();
    expect(screen.getByText(/5 of 6 places shown/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: /Village Inn/ })).toHaveTextContent("Location not set");
    expect(screen.getByRole("button", { name: /Stowe Motel/ })).toHaveTextContent("Approximate location");
    await user.selectOptions(screen.getByLabelText("Trip dates"), "2027-01-12");
    expect(screen.getByText("No places assigned to this day yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "View day" })).toHaveAttribute("href", "/trips/trip-drive/days/2027-01-12");
    expect(screen.queryByRole("link", { name: "Add destination" })).not.toBeInTheDocument();
  });

  it("opens individually named coincident places without filtering itinerary rows", async () => {
    view(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open coincident group" }));
    const group = screen.getByRole("region", { name: "Places in selected group" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    await user.click(within(group).getByRole("button", { name: /Smugglers/ }));
    expect(window.location.search).toContain("stop-smuggs");
    await user.click(screen.getByRole("button", { name: "List" }));
    expect(within(screen.getByRole("list", { name: "Itinerary places" })).getAllByRole("button")).toHaveLength(data.places.length);
  });

  it("provides list recovery for SDK/tiles failure with permitted canonical edit links", async () => {
    view(true); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Fail tiles" }));
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use list" }));
    await user.click(screen.getByRole("button", { name: /Stowe, Vermont/ }));
    expect(screen.getByRole("link", { name: "Edit in trip plan" })).toHaveAttribute("href", "/trips/trip-drive/stops");
    expect(screen.getByRole("contentinfo", { name: "Map and place attribution" })).toBeVisible();
    expect(screen.getByRole("link", { name: "OpenFreeMap" })).toBeVisible();
  });

  it("catches an import/render failure without losing the list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); canvas.crash = true; view();
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use list" }));
    expect(screen.getByRole("list", { name: "Itinerary places" })).toBeVisible();
  });

  it("treats a renderer chunk that fails to load like any map failure: no road line to show (#235)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); canvas.crash = true;
    const fetchMock = fakeTripApi({});
    vi.stubGlobal("fetch", fetchMock);
    nativePush({}, "", `${path}?date=2027-01-09`); view();
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeVisible();
    // Show drive would otherwise request a line and report it drawn on a map that isn't there.
    expect(screen.getByRole("button", { name: "Show drive" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    canvas.crash = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry map" }));
    expect(screen.getByLabelText("Test canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show drive" })).toBeEnabled();
  });

  it("recovers offline and keeps list selection usable without requesting geolocation", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    view();
    expect(screen.getByRole("heading", { name: "Map needs a connection" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Use list" }));
    await userEvent.click(screen.getByRole("button", { name: /Village Inn/ }));
    expect(screen.getByRole("heading", { name: /Village Inn/ })).toBeVisible();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event("online")));
  });

  it("offline, offers the trip's saved brief only when this account saved one (#235, #214)", async () => {
    const tripBrief = (tripId: string, userId = "user_1") => offlineBrief({
      trip: { ...offlineBrief().trip, id: tripId }, viewer: { user_id: userId, member_id: "m-1" },
    });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    try {
      // Another trip's copy doesn't count: this one isn't saved.
      await storeSavedBrief("user_1", tripBrief("trip-other"));
      const { unmount } = view();
      expect(await screen.findByText(/This trip isn't saved on this device\./)).toBeVisible();
      expect(screen.queryByRole("link", { name: "Open saved brief" })).not.toBeInTheDocument();
      unmount();

      await storeSavedBrief("user_1", tripBrief("trip-drive"));
      const second = view();
      const open = await screen.findByRole("link", { name: "Open saved brief" });
      // A full page load, which the saved page's worker answers with no connection.
      expect(open).toHaveAttribute("href", "/trips/saved?trip=trip-drive");
      expect(screen.getByText(/^Saved on this device .* · Sat Feb 13 – Sun Feb 14\. The saved brief has the day logistics, not a map\.$/)).toBeVisible();
      expect(screen.queryByText(/isn't saved on this device/)).not.toBeInTheDocument();
      second.unmount();

      // Nobody known to be signed in (Clerk hasn't loaded): no copy is offered or denied.
      fakeClerkState.loaded = false;
      view();
      expect(screen.getByRole("heading", { name: "Map needs a connection" })).toBeVisible();
      await act(async () => { await new Promise((done) => setTimeout(done, 20)); });
      expect(screen.queryByRole("link", { name: "Open saved brief" })).not.toBeInTheDocument();
      expect(screen.queryByText(/saved on this device/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Use list" })).toBeEnabled();
    } finally {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    }
  });

  it("restores a deep-linked date/place and scroll through history, and recovers removed IDs", async () => {
    nativePush({ "tripMapScroll:trip-drive": 187 }, "", `${path}?date=2027-01-10&place=stay%3Astay-inn%3Alocation&view=list`);
    const result = view();
    expect(screen.getByRole("heading", { name: /Village Inn/ })).toBeVisible();
    expect(screen.getByLabelText("Trip dates")).toHaveValue("2027-01-10");
    const pane = screen.getByRole("heading", { name: /Village Inn/ }).parentElement!.parentElement!;
    expect(pane.scrollTop).toBe(187);
    pane.scrollTop = 240; fireEvent.scroll(pane);
    await waitFor(() => expect(window.history.state["tripMapScroll:trip-drive"]).toBe(240));
    act(() => { nativePush({}, "", `${path}?date=removed&place=removed`); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(screen.getByRole("alert")).toHaveTextContent("This day is no longer in the itinerary");
    await userEvent.click(screen.getByRole("button", { name: "Show all days" }));
    expect(screen.getByLabelText("Trip dates")).toHaveValue("");
    result.rerender(<TripMapView data={{ ...data, places: [] }} canEdit={false} />);
    expect(screen.getByText("Add a destination to see it on the map.")).toBeVisible();
  });

  it("coalesces scroll bursts and bounds history writes during sustained scrolling", () => {
    vi.useFakeTimers(); const result = view();
    const pane = screen.getByRole("heading", { name: "Place list" }).parentElement!.parentElement!;
    const replace = vi.spyOn(window.history, "replaceState");
    for (let i = 1; i <= 100; i++) { pane.scrollTop = i; fireEvent.scroll(pane); }
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600));
    expect(replace).toHaveBeenCalledOnce();
    expect(window.history.state["tripMapScroll:trip-drive"]).toBe(100);
    for (let tick = 0; tick < 100; tick++) {
      pane.scrollTop = 101 + tick; fireEvent.scroll(pane);
      act(() => vi.advanceTimersByTime(100));
    }
    expect(replace.mock.calls.length).toBeLessThan(25);
    result.unmount();
  });

  it("tolerates browser history throttling and still changes selection", () => {
    vi.useFakeTimers(); const result = view();
    const pane = screen.getByRole("heading", { name: "Place list" }).parentElement!.parentElement!;
    vi.spyOn(window.history, "replaceState").mockImplementation(() => { throw new DOMException("History throttled", "SecurityError"); });
    pane.scrollTop = 91; fireEvent.scroll(pane);
    expect(() => act(() => vi.advanceTimersByTime(600))).not.toThrow();
    fireEvent.click(screen.getByRole("button", { name: "Choose destination marker" }));
    expect(window.location.search).toContain("stop-stowe");
    expect(screen.getByRole("heading", { name: /Destination · Stowe, Vermont/ })).toHaveFocus();
    result.unmount();
  });

  it("flushes the outgoing scroll entry before navigation and cancels delayed saves", () => {
    vi.useFakeTimers(); const result = view();
    const pane = screen.getByRole("heading", { name: "Place list" }).parentElement!.parentElement!;
    pane.scrollTop = 201; fireEvent.scroll(pane);
    const replace = vi.spyOn(window.history, "replaceState");
    fireEvent.click(screen.getByRole("button", { name: "Choose destination marker" }));
    expect(replace.mock.calls[0][0]).toMatchObject({ "tripMapScroll:trip-drive": 201 });
    expect(window.history.state["tripMapScroll:trip-drive"]).toBe(0);
    replace.mockClear();
    act(() => vi.advanceTimersByTime(600));
    expect(replace).not.toHaveBeenCalled();
    pane.scrollTop = 250; fireEvent.scroll(pane);
    act(() => vi.advanceTimersByTime(500));
    result.unmount();
    act(() => vi.advanceTimersByTime(50));
    expect(replace).not.toHaveBeenCalled();
  });

  it("uses the list from a deep link without mounting the SDK, and keyboard Skip map focuses it", async () => {
    nativePush({}, "", `${path}?view=list`); view();
    expect(screen.queryByLabelText("Test canvas")).not.toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip map" }); skip.focus();
    await userEvent.keyboard("{Enter}");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("heading", { name: "Place list" })).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Edit in trip plan" })).not.toBeInTheDocument();
  });

  it("moves focus to the list only once a phone shows it, however late the router commits ?view=list (#235)", async () => {
    // Next applies a pushState to useSearchParams after a transition, often later than one frame.
    vi.mocked(window.history.pushState).mockImplementation((state, unused, url) => {
      nativePush(state, unused, url);
      setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate")), 50);
    });
    view();
    const heading = screen.getByRole("heading", { name: "Place list", hidden: true });
    const hiddenWhenFocused: boolean[] = [];
    heading.addEventListener("focus", () => hiddenWhenFocused.push(heading.closest("section")!.classList.contains("hidden")));
    const skip = screen.getByRole("button", { name: "Skip map" }); skip.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(heading).toHaveFocus());
    expect(window.location.search).toBe("?view=list");
    expect(hiddenWhenFocused).toEqual([false]);
    // Already in List, Skip map focuses it again without another history entry.
    skip.focus();
    await userEvent.keyboard("{Enter}");
    expect(heading).toHaveFocus();
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });
});

describe("Reading and Tab order (#235)", () => {
  const follows = (first: Node, second: Node) => !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("reaches the map, its controls and credits before the day below them on a phone, and the list first beside the map on desktop", () => {
    nativePush({}, "", `${path}?date=2027-01-10`);
    const phone = view();
    const credits = screen.getByRole("contentinfo", { name: "Map and place attribution" });
    expect(follows(screen.getByRole("region", { name: "Map view" }), credits)).toBe(true);
    expect(follows(credits, screen.getByRole("region", { name: /Sun Jan 10/ }))).toBe(true);
    phone.unmount();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    view();
    expect(follows(screen.getByRole("region", { name: /Sun Jan 10/ }), screen.getByRole("region", { name: "Map view" }))).toBe(true);
    expect(follows(screen.getByRole("region", { name: "Map view" }), screen.getByRole("contentinfo", { name: "Map and place attribution" }))).toBe(true);
  });
});

describe("Selected day logistics in the map (#234)", () => {
  const SAT = "2027-01-09", SUN = "2027-01-10";
  const geometryUrl = (date: string) => `GET /api/v1/trips/trip-drive/days/${date}/geometry`;
  const dayOf = (map: TripMap, date: string) => map.days.find((entry) => entry.date === date)!;
  const LINE = [[[-72.7262, 44.4875], [-72.75, 44.55], [-72.7837, 44.587]]];
  const road = (day: TripMapDay, state: "available" | "unavailable" = "available") => ({
    trip_id: "trip-drive", day_id: day.id, date: day.date, revision: day.geometry.revision, mode: "drive",
    origin_place_id: day.origin_place_id, access_place_id: day.access_place_id,
    ...(state === "available" ? { state, geometry: { type: "MultiLineString", coordinates: LINE }, provider: "geoapify", calculated_at: "2027-01-07T12:00:00Z", attribution: [] } : { state, geometry: null }),
  });

  it("lists the day's roles in order, focuses the drive and draws only its returned road line", async () => {
    nativePush({}, "", `${path}?date=${SUN}`);
    const day = dayOf(data, SUN);
    const api = fakeTripApi({ [geometryUrl(SUN)]: reply(200, road(day)) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup(); view();
    expect(screen.getByRole("region", { name: /Sun Jan 10/ })).toHaveTextContent("Starting fromStowe Motel");
    expect(within(screen.getByRole("list", { name: "Itinerary places" })).getAllByRole("button").map((row) => row.querySelector("span")!.textContent))
      .toEqual(["● Starting from · Stowe Motel", "◆ Access · Smuggs lot", "▲ Destination · Smugglers' Notch, Vermont", "⌂ Staying tonight · Village Inn"]);
    expect(canvas.props).toMatchObject({ day: { date: SUN }, route: null, focusIds: null });
    expect(api).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Show drive" }));
    expect(canvas.props.focusIds).toEqual([day.origin_place_id, day.access_place_id]);
    expect(api).toHaveBeenCalledOnce();
    expect(api.mock.calls[0][0]).toBe(`/api/v1/trips/trip-drive/days/${SUN}/geometry?revision=${day.geometry.revision}`);
    await waitFor(() => expect(canvas.props.route).toEqual(LINE));
    expect(screen.getByText("Road route line: Stowe Motel → Smuggs lot, by car, one way.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show drive" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Show whole day" }));
    expect(canvas.props.focusIds).toBeNull();
    expect(canvas.props.route).toEqual(LINE);
    await user.click(screen.getByRole("button", { name: "Show drive" }));
    expect(api).toHaveBeenCalledOnce();

    await user.selectOptions(screen.getByLabelText("Trip dates"), SAT);
    expect(canvas.props).toMatchObject({ day: { date: SAT }, route: null, focusIds: null });
    expect(api).toHaveBeenCalledOnce();
  });

  it("keeps a known estimate when the route line is unavailable and retries only on request", async () => {
    const full = driveTrip();
    data = await tripMapFixture(full, { rows: [storedDrive(full, SAT, "2027-01-07T12:00:00Z")], now: Date.parse("2027-01-07T12:00:00Z") });
    nativePush({}, "", `${path}?date=${SAT}`);
    const api = fakeTripApi({ [geometryUrl(SAT)]: reply(200, road(dayOf(data, SAT), "unavailable")) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup(); view();
    await user.click(screen.getByRole("button", { name: "Show drive" }));
    expect(await screen.findByText(/Route line unavailable\. The day's drive details still apply\./)).toBeVisible();
    expect(screen.getByRole("region", { name: /Sat Jan 9/ })).toHaveTextContent("About 30 min drive to Spruce Peak lot · 15 mi · one way");
    expect(canvas.props.route).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry route line" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  });

  it("removes the old line at once when the drive's endpoints change and ignores the late answer", async () => {
    nativePush({}, "", `${path}?date=${SUN}`);
    const before = dayOf(data, SUN);
    let finish!: (value: ReturnType<typeof reply>) => void;
    const api = fakeTripApi({ [geometryUrl(SUN)]: () => new Promise((resolve) => { finish = resolve; }) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup(); const result = view();
    await user.click(screen.getByRole("button", { name: "Show drive" }));
    expect(screen.getByText("Loading the road route line…")).toBeVisible();
    // The organizer moved the access point in its editor; the refreshed map has a new route revision.
    const edited = structuredClone(data);
    Object.assign(dayOf(edited, SUN).geometry, { revision: "b".repeat(64) });
    result.rerender(<TripMapView data={edited} canEdit={false} />);
    await act(async () => { finish(reply(200, road(before))); });
    expect(canvas.props.route).toBeNull();
    expect(screen.getByText(/The road route line isn't loaded\./)).toBeVisible();
  });

  it("drops a loaded line when a refresh finds no road route for the same pair", async () => {
    nativePush({}, "", `${path}?date=${SUN}`);
    const api = fakeTripApi({ [geometryUrl(SUN)]: reply(200, road(dayOf(data, SUN))) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup(); const result = view();
    await user.click(screen.getByRole("button", { name: "Show drive" }));
    await waitFor(() => expect(canvas.props.route).toEqual(LINE));
    // Same endpoints and route revision; the refreshed estimate is now an explicit no-route answer.
    const refreshed = structuredClone(data);
    const sunday = dayOf(refreshed, SUN);
    Object.assign(sunday, { drive: { ...sunday.drive, state: "no_route", directions: null }, geometry: { ...sunday.geometry, state: "not_applicable", reason: "drive_not_ready" } });
    result.rerender(<TripMapView data={refreshed} canEdit={false} />);
    expect(canvas.props.route).toBeNull();
    expect(screen.getByText(/No road route found, so no line is drawn\./)).toBeVisible();
    expect(screen.queryByText(/Road route line:/)).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledOnce();
  });

  it("keeps the day, place, drive focus and line across a refresh after returning from directions", async () => {
    nativePush({}, "", `${path}?date=${SUN}&place=stay%3Astay-motel%3Alocation`);
    const api = fakeTripApi({ [geometryUrl(SUN)]: reply(200, road(dayOf(data, SUN))) });
    vi.stubGlobal("fetch", api);
    const user = userEvent.setup(); const result = view();
    await user.click(screen.getByRole("button", { name: "Show drive" }));
    await waitFor(() => expect(canvas.props.route).toEqual(LINE));
    expect(screen.getByRole("link", { name: /Directions to Smuggs lot from Stowe Motel/ })).toHaveAttribute("target", "_blank");
    // The map page reloads its snapshot on focus; an unchanged pair keeps its line.
    act(() => window.dispatchEvent(new Event("focus")));
    result.rerender(<TripMapView data={structuredClone(data)} canEdit={false} />);
    expect(window.location.search).toBe(`?date=${SUN}&place=stay%3Astay-motel%3Alocation`);
    expect(screen.getByRole("heading", { name: /Starting from · Stowe Motel/ })).toBeVisible();
    expect(canvas.props).toMatchObject({ route: LINE, focusIds: [dayOf(data, SUN).origin_place_id, dayOf(data, SUN).access_place_id] });
    expect(api).toHaveBeenCalledOnce();
  });

  it("offers no drive focus on a no-drive day or offline, while the logistics stay readable", async () => {
    Object.assign(dayOf(data, SAT), { drive: { ...dayOf(data, SAT).drive, state: "no_drive", directions: null }, geometry: { ...dayOf(data, SAT).geometry, state: "not_applicable", reason: "drive_not_ready" } });
    nativePush({}, "", `${path}?date=${SAT}`);
    const result = view();
    expect(screen.queryByRole("button", { name: "Show drive" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show whole day" })).toBeVisible();
    expect(screen.getByRole("region", { name: /Sat Jan 9/ })).toHaveTextContent("No drive planned");
    result.unmount();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    nativePush({}, "", `${path}?date=${SUN}`);
    view();
    expect(screen.getByRole("heading", { name: "Map needs a connection" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show drive" })).toBeDisabled();
    expect(screen.getByRole("region", { name: /Sun Jan 10/ })).toHaveTextContent("Staying tonightVillage Inn");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event("online")));
  });
});

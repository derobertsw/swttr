import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTrip } from "@/hooks/useTrip";
import { TRIP, fakeTripApi, reply, tripFull } from "@/test/tripApi";
import { TripProvider } from "./TripProvider";

let userId: string | null = "user-1";
let sessionId = "session-1";
let isLoaded = true;
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId, sessionId, isLoaded }) }));

function Consumer({ id = TRIP.id, label = "Trip" }: { id?: string; label?: string }) {
  const { data, loading, error, refresh } = useTrip(id);
  return <section aria-label={label}>
    <span>{data?.trip.name ?? "No trip"}</span>
    {loading && <span>Loading</span>}
    {error && <span role="alert">{error}</span>}
    <button onClick={() => void refresh()}>Refresh {label}</button>
  </section>;
}

beforeEach(() => { userId = "user-1"; sessionId = "session-1"; isLoaded = true; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("shared trip data", () => {
  it("uses one request for multiple consumers and reuses data when subpages remount", async () => {
    const api = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) });
    vi.stubGlobal("fetch", api);
    const { rerender } = render(<TripProvider tripId={TRIP.id}><Consumer /><Consumer label="Day" /></TripProvider>);
    await waitFor(() => expect(screen.getAllByText(TRIP.name)).toHaveLength(2));
    expect(api).toHaveBeenCalledTimes(1);

    rerender(<TripProvider tripId={TRIP.id}><Consumer key="gear-page" label="Gear" /></TripProvider>);
    expect(screen.getByText(TRIP.name)).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("doesn't fetch full-trip data on pages that don't consume it", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<TripProvider tripId={TRIP.id}><p>Packing</p></TripProvider>);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares a confirmed refresh with the next page", async () => {
    let name = "Original";
    const api = fakeTripApi({ "GET /api/v1/trips/trip-1": () => reply(200, tripFull({ trip: { ...TRIP, name } })) });
    vi.stubGlobal("fetch", api);
    const { rerender } = render(<TripProvider tripId={TRIP.id}><Consumer /></TripProvider>);
    await screen.findByText("Original");
    name = "Saved";
    fireEvent.click(screen.getByRole("button", { name: "Refresh Trip" }));
    await screen.findByText("Saved");
    rerender(<TripProvider tripId={TRIP.id}><Consumer key="overview-page" /></TripProvider>);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it.each(["account", "session", "sign-out", "unresolved"])("immediately clears data on %s changes and drops pending responses", async (change) => {
    let finish!: (value: ReturnType<typeof reply>) => void;
    const api = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) });
    vi.stubGlobal("fetch", api);
    const tree = () => <TripProvider tripId={TRIP.id}><Consumer /></TripProvider>;
    const { rerender } = render(tree());
    await screen.findByText(TRIP.name);
    api.mockImplementationOnce(() => new Promise((resolve) => {
      finish = (value) => resolve({ ok: true, status: value.status, json: async () => value.body } as Response);
    }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh Trip" }));
    // Hold both the old response and any request for the replacement identity.
    api.mockImplementation(() => new Promise(() => {}));
    if (change === "account") userId = "user-2";
    if (change === "session") sessionId = "session-2";
    if (change === "sign-out") userId = null;
    if (change === "unresolved") isLoaded = false;
    rerender(tree());
    expect(screen.queryByText(TRIP.name)).not.toBeInTheDocument();
    await act(async () => finish(reply(200, tripFull({ trip: { ...TRIP, name: "Old response" } }))));
    expect(screen.queryByText("Old response")).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(change === "account" || change === "session" ? 3 : 2);
  });

  it("clears the old trip immediately when the trip ID changes", async () => {
    const api = fakeTripApi({
      "GET /api/v1/trips/trip-1": reply(200, tripFull()),
      "GET /api/v1/trips/trip-2": () => new Promise(() => {}),
    });
    vi.stubGlobal("fetch", api);
    const { rerender } = render(<TripProvider tripId={TRIP.id}><Consumer /></TripProvider>);
    await screen.findByText(TRIP.name);
    rerender(<TripProvider tripId="trip-2"><Consumer id="trip-2" /></TripProvider>);
    expect(screen.queryByText(TRIP.name)).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("revalidates stale data on focus without hiding it or duplicating concurrent checks", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const api = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) });
    vi.stubGlobal("fetch", api);
    render(<TripProvider tripId={TRIP.id}><Consumer /></TripProvider>);
    await screen.findByText(TRIP.name);
    fireEvent.focus(window);
    expect(api).toHaveBeenCalledTimes(1);
    now = 61_000;
    await act(async () => {
      fireEvent.focus(window);
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(api).toHaveBeenCalledTimes(2);
    expect(screen.getByText(TRIP.name)).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });

  it("revalidates on navigation after a minute and clears data if access was revoked", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const api = fakeTripApi({ "GET /api/v1/trips/trip-1": reply(200, tripFull()) });
    vi.stubGlobal("fetch", api);
    const { rerender } = render(<TripProvider tripId={TRIP.id}><Consumer /></TripProvider>);
    await screen.findByText(TRIP.name);
    now = 61_000;
    api.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: "Not found" }) } as Response);
    rerender(<TripProvider tripId={TRIP.id}><Consumer key="day-page" /></TripProvider>);
    await screen.findByRole("alert");
    expect(screen.queryByText(TRIP.name)).not.toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });
});

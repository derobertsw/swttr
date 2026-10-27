import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { fakeTripApi, reply, STOWE_STOP, TRIP, tripFull } from "@/test/tripApi";
import type { TripDay, TripFocus } from "@/types/trips";
import OpenTripPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const day = (date: string): TripDay =>
  ({ id: `day-${date}`, trip_id: TRIP.id, date, stop_id: STOWE_STOP.id, activity: "Alpine" }) as TripDay;
const DAYS = [day("2026-10-10"), day("2026-10-11"), day("2026-10-12")];
const PLAN_PATH = "swttr-trip-plan-path:trip-1";

async function open(focus: TripFocus | undefined, status = 200) {
  const trip = tripFull({ stops: [STOWE_STOP], days: DAYS, focus });
  vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1": status === 200 ? reply(200, trip) : reply(status, { error: "Couldn't load the trip. Try again." }) }));
  await act(async () => {
    render(<Suspense fallback={null}><OpenTripPage params={Promise.resolve({ id: TRIP.id })} /></Suspense>);
  });
}

const focusOn = (date: string | null, reason: TripFocus["reason"] = "unfinished"): TripFocus => ({ date, reason, next_step: null });

describe("Opening a trip (#334)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("opens the day the server chose for you, and Plan's own page on a trip that's over", async () => {
    await open(focusOn("2026-10-11"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-11"));
    replace.mockClear();
    await open(focusOn(null, null));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1"));
  });

  it("opens a day this tab picked, unless it's gone from the trip", async () => {
    window.sessionStorage.setItem(PLAN_PATH, "/trips/trip-1/days/2026-10-12");
    await open(focusOn("2026-10-10"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-12"));
    replace.mockClear();
    window.sessionStorage.setItem(PLAN_PATH, "/trips/trip-1/days/2026-10-20");
    await open(focusOn("2026-10-10"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-10"));
  });

  it("doesn't count the day it opened as a pick, so the trip moves on once that day is planned", async () => {
    await open(focusOn("2026-10-10"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-10"));
    // The workspace saves the day it showed, as Plan's last page.
    window.sessionStorage.setItem(PLAN_PATH, "/trips/trip-1/days/2026-10-10");
    replace.mockClear();
    await open(focusOn("2026-10-11"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-11"));
  });

  it("opens today during the trip rather than a day picked earlier that's over", async () => {
    window.sessionStorage.setItem(PLAN_PATH, "/trips/trip-1/days/2026-10-10");
    await open(focusOn("2026-10-11", "today"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-11"));
    replace.mockClear();
    window.sessionStorage.setItem(PLAN_PATH, "/trips/trip-1/days/2026-10-12");
    await open(focusOn("2026-10-11", "today"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-12"));
  });

  it("opens the focus day when All days was Plan's last page, or storage is blocked", async () => {
    window.sessionStorage.setItem(PLAN_PATH, "/trips/trip-1");
    await open(focusOn("2026-10-11"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-11"));
    replace.mockClear();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await open(focusOn("2026-10-12"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/trips/trip-1/days/2026-10-12"));
    vi.restoreAllMocks();
  });

  it("says why when the trip doesn't load, and goes nowhere", async () => {
    await open(undefined, 500);
    expect(await screen.findByText("Couldn't load the trip. Try again.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

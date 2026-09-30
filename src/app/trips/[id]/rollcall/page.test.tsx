import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ORGANIZER, SAM, TRIP, fakeTripApi, reply, tripFull } from "@/test/tripApi";
import RollCallPage from "./page";

// These tests cover the page, not the app chrome around it.
vi.mock("@/components/PageLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Roll call page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has no poke button, since no reminder would be sent", async () => {
    vi.stubGlobal(
      "fetch",
      fakeTripApi({
        "GET /api/v1/trips/trip-1": reply(
          200,
          tripFull({
            members: [ORGANIZER, SAM],
            days: [{ id: "day-1", trip_id: TRIP.id, stop_id: null, date: "2026-10-10", activity: null }],
          })
        ),
      })
    );
    // The page suspends until its params resolve, so rendering is awaited.
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <RollCallPage params={Promise.resolve({ id: TRIP.id })} />
        </Suspense>
      );
    });

    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /poke/i })).not.toBeInTheDocument();
  });
});

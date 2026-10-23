import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLodging } from "@/lib/trip-lodging";
import { fakeTripApi, reply, TRIP, tripFull } from "@/test/tripApi";
import { SPLIT_MEMBERS, SPLIT_TRIP, splitRows } from "@/test/splitStays";
import type { TripMember } from "@/types/trips";
import TripStaysPage from "./page";

let signedIn: string | null = null;
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => signedIn }));

// Alex organizes and Blair has an account; Dana (a managed guest) and Fran (a pending invitation) have none.
const USERS = ["user-1", "user-blair", "user-casey", null, "user-eli", null];
const members: TripMember[] = SPLIT_MEMBERS.map((member, index) => ({ ...member, trip_id: TRIP.id, user_id: USERS[index], invite_token: null, created_at: member.created_at! }));
const rows = splitRows();
const data = tripFull({ trip: SPLIT_TRIP, members,
  lodging: buildLodging(SPLIT_TRIP, rows.stays, rows.assignments, { members: SPLIT_MEMBERS, attendance: rows.attendance, per_member: true }) });

async function renderPage() {
  vi.stubGlobal("fetch", fakeTripApi({
    [`GET /api/v1/trips/${TRIP.id}`]: reply(200, data),
    [`GET /api/v1/trips/${TRIP.id}/drive-estimates`]: reply(200, { days: [], stays: [] }),
  }));
  await act(async () => {
    render(<Suspense fallback={null}><TripStaysPage params={Promise.resolve({ id: TRIP.id })} /></Suspense>);
  });
}

describe("Stays page (#332)", () => {
  afterEach(() => { vi.unstubAllGlobals(); signedIn = null; });

  it("shows no one's nights as yours until the session names you", async () => {
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Stays", level: 1 })).toBeInTheDocument();
    // Dana and Fran have no account either, so they mustn't be taken for the viewer.
    expect(screen.queryByRole("button", { name: "My stays" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your nights" })).not.toBeInTheDocument();
  });

  it("starts a signed-in member on their own nights", async () => {
    signedIn = "user-blair";
    await renderPage();
    expect(await screen.findByRole("button", { name: "My stays" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Your nights" })).toBeInTheDocument();
  });
});

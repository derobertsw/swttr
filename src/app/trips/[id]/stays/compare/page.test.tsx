import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stayWindowChoices } from "@/lib/trip-stay-candidates";
import { fakeTripApi, reply, TRIP } from "@/test/tripApi";
import { splitDriveTrip } from "@/test/driveTrip";
import { PINE, SPLIT_TRIP, VILLAGE } from "@/test/splitStays";
import CompareStaysPage from "./page";

let signedIn: string | null = null;
vi.mock("@/hooks/useUserId", () => ({ useUserId: () => signedIn }));

async function renderPage(search: Record<string, string>) {
  const api = fakeTripApi({
    [`GET /api/v1/trips/${TRIP.id}`]: reply(200, splitDriveTrip()),
    [`GET /api/v1/trips/${TRIP.id}/stay-candidates`]: reply(200, { available: true, candidates: [], ...stayWindowChoices(SPLIT_TRIP) }),
    [`GET /api/v1/trips/${TRIP.id}/stay-candidates/compare`]: reply(503, { error: "Database not configured" }),
  });
  vi.stubGlobal("fetch", api);
  await act(async () => {
    render(<Suspense fallback={null}><CompareStaysPage params={Promise.resolve({ id: TRIP.id })} searchParams={Promise.resolve(search)} /></Suspense>);
  });
  return api;
}

describe("Compare stays page (#213)", () => {
  afterEach(() => { vi.unstubAllGlobals(); signedIn = null; });

  it("opens with the stays and nights its address names", async () => {
    signedIn = "user-1";
    const api = await renderPage({ options: `stay:${VILLAGE.id},stay:${PINE.id}`, first_night: "2026-10-09", checkout: "2026-10-11" });
    expect(await screen.findByRole("heading", { name: "Compare stays", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Village hotel · First in the comparison/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^Pine rental · Second in the comparison/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add a stay to compare" })).toBeInTheDocument();
    // A failed comparison says so and offers to try again, keeping the choice.
    expect(await screen.findByRole("alert")).toHaveTextContent("Database not configured");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(api.mock.calls.some(([url]) => url.includes(`options=stay%3A${VILLAGE.id}%2Cstay%3A${PINE.id}&first_night=2026-10-09&checkout=2026-10-11`))).toBe(true);
  });

  it("lets a member compare but not add options", async () => {
    signedIn = "user-blair";
    await renderPage({});
    expect(await screen.findByRole("heading", { name: "Compare stays", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Options are managed by the organizer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a stay to compare" })).not.toBeInTheDocument();
  });
});

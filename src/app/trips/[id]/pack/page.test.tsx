import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeTripApi, reply, TRIP } from "@/test/tripApi";
import { buildPackingListFromDays } from "@/lib/packingList";
import type { TripDayCoverage, TripPackResponse } from "@/types/trip-coverage";
import PackListPage from "./page";

vi.mock("@/components/PageLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const entry = (date: string, overrides: Partial<TripDayCoverage> = {}): TripDayCoverage => ({
  date, activity: "Alpine", stopName: "Stowe", advice: "unavailable", action: "retry_weather",
  message: "Couldn't load the forecast. Retry weather or plan your kit manually.",
  forecast: { status: "error", availableHours: 0, expectedHours: 16, message: "Couldn't load the forecast. Retry weather or plan your kit manually." },
  ...overrides,
});
const pack = (coverage: TripDayCoverage[]): TripPackResponse => ({
  trip: TRIP, coveredDays: coverage.filter((day) => day.advice === "available").length, totalDays: coverage.length,
  coverage, skipped: [], packingList: buildPackingListFromDays([], new Map(), []), groupGear: [],
});
async function renderPage() {
  await act(async () => { render(<Suspense fallback={null}><PackListPage params={Promise.resolve({ id: TRIP.id })} /></Suspense>); });
}

describe("Trip packing coverage", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("puts unresolved days above packing and links to recovery without asking for existing inputs", async () => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1/pack": reply(200, pack([entry("2026-10-10")])) }));
    await renderPage();
    expect(await screen.findByRole("heading", { name: "Days to review" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retry weather for 2026-10-10" })).toHaveAttribute("href", "/trips/trip-1/days/2026-10-10");
    expect(screen.getByText(/No automatic clothing list/)).toBeInTheDocument();
    expect(screen.queryByText(/assign activities and a base location/)).not.toBeInTheDocument();
  });

  it("shows partial forecasts, manual kits, rest days and approximations separately", async () => {
    const partial = { status: "partial" as const, availableHours: 8, expectedHours: 16, message: "Partial forecast: 8 of 16 daytime hours available." };
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1/pack": reply(200, pack([
      entry("2026-10-10", { advice: "available", message: "General clothing guidance available.", forecast: partial, action: "review_day" }),
      entry("2026-10-11", { advice: "manual", message: "Manual kit saved. Review separately.", action: "plan_manually" }),
      entry("2026-10-12", { advice: "rest", activity: "Rest", message: "Rest day; review personal items manually.", action: "plan_manually" }),
      entry("2026-10-13", { advice: "available", activity: "Climb", approximation: "Climb uses general hiking guidance.", action: "review_day" }),
    ])) }));
    await renderPage();
    expect(await screen.findByText(/General clothing guidance for 2 of 4 days/)).toBeInTheDocument();
    expect(screen.getByText(partial.message)).toBeInTheDocument();
    expect(screen.getByText("Manual kit saved. Review separately.")).toBeInTheDocument();
    expect(screen.getByText("Rest day; review personal items manually.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review manual kit for 2026-10-11" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan kit manually for 2026-10-12" })).toBeInTheDocument();
    expect(screen.getByText("Climb uses general hiking guidance.")).toBeInTheDocument();
  });

  it.each(["unsupported", "unavailable"] as const)("asks to plan a kit for %s days without a saved kit", async (advice) => {
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1/pack": reply(200, pack([
      entry("2026-10-10", { advice, action: "plan_manually" }),
    ])) }));
    await renderPage();
    expect(await screen.findByRole("link", { name: "Plan kit manually for 2026-10-10" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Review manual kit/ })).not.toBeInTheDocument();
  });

  it("retains the last list when regeneration fails and announces the failure", async () => {
    let attempt = 0;
    vi.stubGlobal("fetch", fakeTripApi({ "GET /api/v1/trips/trip-1/pack": () => ++attempt === 1
      ? reply(200, pack([entry("2026-10-10")])) : reply(500, { error: "Database unavailable" }) }));
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "Days to review" });
    await user.click(screen.getByRole("button", { name: "Regenerate pack list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByRole("link", { name: "Retry weather for 2026-10-10" })).toBeInTheDocument();
  });
});

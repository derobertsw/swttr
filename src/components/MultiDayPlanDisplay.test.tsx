import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { POST as buildPackingList } from "@/app/api/packing-list/route";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import type { ForecastHour } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import MultiDayPlanDisplay from "./MultiDayPlanDisplay";

// Signed out: the packing list is built without a wardrobe.
vi.mock("@/lib/auth", () => ({ getAuthUserId: async () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));

const recommendation: Recommendation = {
  torso: { base: [{ name: "Merino base layer" }], mid: [{ name: "Fleece jacket" }], outer: [{ name: "Shell jacket" }] },
  legs: { base: [{ name: "Long underwear" }], outer: [{ name: "Ski pants" }] },
  hands: { base: [], outer: [{ name: "Insulated gloves" }] },
  headNeck: { base: [{ name: "Beanie" }], outer: [] },
};

function makePlan({ durationDays = 2, startHour }: { durationDays?: number; startHour?: number } = {}) {
  const hours: ForecastHour[] = [
    { time: "2026-01-15T12:00", temperature: 30, windSpeed: 8, precipitationProbability: 0 },
    { time: "2026-01-16T09:00", temperature: 28, windSpeed: 8, precipitationProbability: 0 },
  ];
  return buildMultiDayLayerPlan({
    startDate: new Date("2026-01-15T00:00:00"),
    durationDays,
    startHour,
    hourlyForecast: hours,
    getRecommendation: () => recommendation,
  });
}

/** Serves /api/packing-list from the real route, after `failures` failed responses. */
function stubPackingList(failures: Array<"error" | "network"> = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== "/api/packing-list") throw new Error(`Unexpected fetch: ${String(input)}`);
    const failure = failures.shift();
    if (failure === "network") throw new TypeError("Failed to fetch");
    if (failure === "error") return Response.json({ error: "Internal Server Error" }, { status: 500 });
    return buildPackingList(
      new NextRequest("http://localhost/api/packing-list", { method: "POST", body: init?.body as string })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MultiDayPlanDisplay", () => {
  describe("forecast coverage", () => {
    it("lists the days the plan leaves out, and why, before the packing list", async () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ durationDays: 3, startHour: 22 })} />);

      const coverage = screen.getByText("This plan covers 1 of 3 days");
      expect(screen.getByText("Thu, Jan 15.").parentElement).toHaveTextContent(
        "Thu, Jan 15. The start time is after its last daytime hour (21:00)."
      );
      expect(screen.getByText("Sat, Jan 17.").parentElement).toHaveTextContent(
        "Sat, Jan 17. The forecast has no daytime hours for it."
      );
      const packingHeading = screen.getByRole("heading", { name: "Clothing Packing List" });
      expect(coverage.compareDocumentPosition(packingHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      await screen.findByText(/required layer slots/);
    });

    it("says nothing about coverage when every day is covered", async () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      await screen.findByText(/required layer slots/);
      expect(screen.queryByText(/This plan covers/)).not.toBeInTheDocument();
    });
  });

  describe("packing list", () => {
    it("shows loading, not an empty list, until the packing list arrives", async () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      expect(screen.getByRole("status")).toHaveTextContent("Loading packing list...");
      expect(screen.queryByText(/assigned/)).not.toBeInTheDocument();
      expect(screen.queryByText("No specific items mapped yet.")).not.toBeInTheDocument();
      expect(await screen.findByText(/required layer slots/)).toBeInTheDocument();
    });

    it("says the packing list is unavailable when the server fails, and tries again", async () => {
      const fetchMock = stubPackingList(["error"]);
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Packing list unavailable");
      expect(screen.queryByText(/assigned/)).not.toBeInTheDocument();
      expect(screen.queryByText("No specific items mapped yet.")).not.toBeInTheDocument();
      expect(screen.queryByText(/required layer slots/)).not.toBeInTheDocument();
      // The daily plan doesn't depend on the packing list.
      expect(screen.getByRole("heading", { name: "Thu, Jan 15" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText(/required layer slots/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("says the packing list is unavailable when the request doesn't reach the server", async () => {
      stubPackingList(["network"]);
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      expect(await screen.findByRole("alert")).toHaveTextContent("Packing list unavailable");
    });

    it("only offers controls that do something", async () => {
      stubPackingList();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      const seeGaps = await screen.findByRole("button", { name: /^See \d+ gaps$/ });
      for (const name of ["Pack Once", "Per Day", "All", "Only gaps", "Torso"]) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }

      await userEvent.click(seeGaps);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toHaveTextContent("Gaps To Fill");
    });
  });
});

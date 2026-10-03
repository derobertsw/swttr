import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { POST as buildPackingList } from "@/app/api/packing-list/route";
import { getAuthUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { buildMultiDayLayerPlan } from "@/lib/planAhead";
import type { ForecastHour } from "@/types/plan";
import type { Recommendation } from "@/types/recommendations";
import MultiDayPlanDisplay from "./MultiDayPlanDisplay";

// Signed out unless a test says otherwise: the packing list is built without a wardrobe.
vi.mock("@/lib/auth", () => ({ getAuthUserId: vi.fn(async () => null) }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn(() => ({})) }));
vi.mock("@/lib/userWardrobe", () => ({ fetchUserWardrobeItems: vi.fn(async () => []) }));

const MILD: Recommendation = {
  torso: { base: [{ name: "Merino base layer" }], mid: [{ name: "Fleece jacket" }], outer: [{ name: "Shell jacket" }] },
  legs: { base: [{ name: "Long underwear" }], outer: [{ name: "Ski pants" }] },
  hands: { base: [], outer: [{ name: "Insulated gloves" }] },
  headNeck: { base: [{ name: "Beanie" }], outer: [] },
};

/** MILD plus a down vest and a neck gaiter. */
const COLD: Recommendation = {
  ...MILD,
  torso: { ...MILD.torso, mid: [{ name: "Fleece jacket" }, { name: "Down vest" }] },
  headNeck: { base: [{ name: "Beanie" }, { name: "Neck gaiter" }], outer: [] },
};

function hour(time: string, temperature: number): ForecastHour {
  return { time, temperature, windSpeed: 8, precipitationProbability: 0 };
}

/** Two days whose layers are the same all day. */
const STEADY_HOURS = [hour("2026-01-15T12:00", 30), hour("2026-01-16T09:00", 28)];

/**
 * Thu: a cold morning and a milder midday. Fri: as cold as Thu. Sat: milder.
 * Below 20°F after the wind, the guide adds a down vest and a neck gaiter.
 */
const CHANGING_HOURS = [
  hour("2026-01-15T07:00", 20),
  hour("2026-01-15T12:00", 30),
  hour("2026-01-16T09:00", 21),
  hour("2026-01-17T09:00", 32),
];

function makePlan({
  hours = STEADY_HOURS,
  durationDays = 2,
  startHour,
  layers = (temperature: number) => (temperature < 20 ? COLD : MILD),
}: {
  hours?: ForecastHour[];
  durationDays?: number;
  startHour?: number;
  layers?: (effectiveTemperature: number) => Recommendation | null;
} = {}) {
  return buildMultiDayLayerPlan({
    startDate: new Date("2026-01-15T00:00:00"),
    durationDays,
    startHour,
    hourlyForecast: hours,
    getRecommendation: layers,
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

async function openPacking() {
  await userEvent.click(screen.getByRole("tab", { name: "Packing" }));
}

function day(label: string) {
  return screen.getByRole("article", { name: label });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MultiDayPlanDisplay", () => {
  describe("the outing", () => {
    it("shows the activity, place, dates and the hours each day covers", async () => {
      stubPackingList();
      render(
        <MultiDayPlanDisplay
          plan={makePlan({ startHour: 12 })}
          activity="alpine_skiing"
          place="Stowe, Vermont, United States"
        />
      );

      expect(screen.getByRole("heading", { name: "Multi-day layer plan" })).toBeInTheDocument();
      expect(screen.getByText("General guide")).toBeInTheDocument();
      expect(screen.getByText("Alpine Skiing")).toBeInTheDocument();
      expect(screen.getByText("Stowe, Vermont, United States")).toBeInTheDocument();
      expect(screen.getByText("Thu, Jan 15 – Fri, Jan 16")).toBeInTheDocument();
      expect(
        screen.getByText("Layers for 6am to 9pm each day, local time. The first day starts at 12pm.")
      ).toBeInTheDocument();
      await screen.findByRole("tab", { name: "Packing" });
    });

    it("goes back to the outing with Edit outing", async () => {
      stubPackingList();
      const onReset = vi.fn();
      render(<MultiDayPlanDisplay plan={makePlan()} onReset={onReset} />);

      await userEvent.click(screen.getByRole("button", { name: "Edit outing" }));

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("says when there are no general layers for the activity, and still shows each day's forecast", () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ layers: () => null })} activity="running" />);

      expect(screen.getByText("No general layers for Running")).toBeInTheDocument();
      expect(screen.queryByText("General guide")).not.toBeInTheDocument();
      expect(within(day("Thu, Jan 15")).getByText("30°–30°F")).toBeInTheDocument();
      expect(within(day("Thu, Jan 15")).getByText("No general layers for these conditions.")).toBeInTheDocument();
    });
  });

  describe("forecast coverage", () => {
    it("lists the days the plan leaves out, and why, before the daily plan and packing list", () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ durationDays: 3, startHour: 22 })} />);

      const coverage = screen.getByText("This plan covers 1 of 3 days");
      expect(screen.getByText("Thu, Jan 15.").parentElement).toHaveTextContent(
        "Thu, Jan 15. The start time is after its last daytime hour (9pm)."
      );
      expect(screen.getByText("Sat, Jan 17.").parentElement).toHaveTextContent(
        "Sat, Jan 17. The forecast has no daytime hours for it."
      );
      const tabs = screen.getByRole("tablist");
      expect(coverage.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("says nothing about coverage when every day is covered", () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      expect(screen.queryByText(/This plan covers/)).not.toBeInTheDocument();
    });
  });

  describe("daily plan", () => {
    it("shows the first day's whole outfit, with each day's conditions", () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ hours: CHANGING_HOURS, durationDays: 3 })} />);

      expect(screen.getByRole("tab", { name: "Daily plan" })).toHaveAttribute("aria-selected", "true");
      const thursday = day("Thu, Jan 15");
      expect(within(thursday).getByText("20°–30°F")).toBeInTheDocument();
      expect(within(thursday).getByText("Wind up to 8 mph · 0% chance of precipitation")).toBeInTheDocument();
      expect(within(thursday).getByText("For the coldest part of the day.")).toBeInTheDocument();
      expect(within(thursday).getByText("Upper body").nextElementSibling).toHaveTextContent(
        "Merino base layer, Fleece jacket, Down vest, Shell jacket"
      );
      expect(within(thursday).getByText("Hands").nextElementSibling).toHaveTextContent("Insulated gloves");
    });

    it("lists only what changes through the day", () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ hours: CHANGING_HOURS, durationDays: 3 })} />);

      const through = within(day("Thu, Jan 15")).getByRole("region", { name: "Through Thu, Jan 15" });
      // The morning is the day's coldest part, so it has nothing to change.
      expect(within(through).queryByText("Morning")).not.toBeInTheDocument();
      expect(through).toHaveTextContent("Midday · 11am-3pm · 30°–30°F");
      expect(within(through).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Take off Down vest · Upper body mid",
        "Take off Neck gaiter · Head & neck base",
      ]);
    });

    it("leads later days with what changed since the day before, with the whole outfit a tap away", async () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ hours: CHANGING_HOURS, durationDays: 3 })} />);

      const friday = day("Fri, Jan 16");
      expect(within(friday).getByText("Same layers as Thu, Jan 15.")).toBeInTheDocument();

      const saturday = day("Sat, Jan 17");
      expect(within(saturday).getByText("Changes from Fri, Jan 16")).toBeInTheDocument();
      const wear = within(saturday).getByRole("region", { name: "Wear on Sat, Jan 17" });
      expect(within(wear).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Leave out Down vest · Upper body mid",
        "Leave out Neck gaiter · Head & neck base",
      ]);

      const allLayers = within(saturday).getByText("All layers for Sat, Jan 17");
      expect(allLayers.closest("details")).not.toHaveAttribute("open");
      await userEvent.click(allLayers);
      expect(allLayers.closest("details")).toHaveAttribute("open");
      expect(within(saturday).getByText("Upper body").nextElementSibling).toHaveTextContent(
        "Merino base layer, Fleece jacket, Shell jacket"
      );
    });

    it("names the guide's items as the wardrobe items they're mapped to", () => {
      stubPackingList();
      render(
        <MultiDayPlanDisplay
          plan={makePlan({ hours: CHANGING_HOURS, durationDays: 3 })}
          itemMappings={new Map([["torso:mid:Down vest", "Nano Puff vest"]])}
        />
      );

      expect(within(day("Thu, Jan 15")).getByText("Upper body").nextElementSibling).toHaveTextContent(
        "Merino base layer, Fleece jacket, Nano Puff vest, Shell jacket"
      );
      expect(within(day("Sat, Jan 17")).getByText("Nano Puff vest")).toBeInTheDocument();
    });

    it("lists each day's carry items", () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan()} />);

      const carry = within(day("Thu, Jan 15")).getByRole("region", { name: "Carry on Thu, Jan 15" });
      expect(carry).toHaveTextContent("Warm gloves and head insulation");
    });
  });

  describe("packing list", () => {
    it("shows loading, not an empty list, until the packing list arrives", async () => {
      const fetchMock = stubPackingList();
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const serve = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementationOnce(async (...args) => {
        await held;
        return serve(...args);
      });
      render(<MultiDayPlanDisplay plan={makePlan()} />);
      await openPacking();

      expect(screen.getByRole("status")).toHaveTextContent("Loading packing list…");
      expect(screen.queryByRole("region", { name: "Upper body" })).not.toBeInTheDocument();
      expect(screen.queryByText(/not matched/)).not.toBeInTheDocument();

      release();

      expect(await screen.findByRole("region", { name: "Upper body" })).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("lists every item once by body area, then what to carry", async () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan({ hours: CHANGING_HOURS, durationDays: 3 })} />);
      await openPacking();

      const upperBody = await screen.findByRole("region", { name: "Upper body" });
      expect(within(upperBody).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Merino base layerBase",
        "Down vestMid",
        "Fleece jacketMid",
        "Shell jacketOuter",
      ]);
      expect(screen.getByRole("region", { name: "Carry" })).toHaveTextContent("Warm gloves and head insulation");
    });

    it("offers sign-in to match the list to a wardrobe when signed out", async () => {
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan()} />);
      await openPacking();

      await screen.findByRole("region", { name: "Upper body" });
      expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
      expect(screen.queryByText("Not matched to your wardrobe")).not.toBeInTheDocument();
    });

    it("marks what isn't matched to a signed-in user's wardrobe", async () => {
      vi.mocked(getAuthUserId).mockResolvedValueOnce("user_1");
      stubPackingList();
      render(
        <MultiDayPlanDisplay
          plan={makePlan()}
          itemMappings={new Map([["torso:mid:Fleece jacket", "R1 Hoody"]])}
        />
      );
      await openPacking();

      const upperBody = await screen.findByRole("region", { name: "Upper body" });
      expect(screen.getByText("6 of 7 not matched to your wardrobe.")).toBeInTheDocument();
      const hoody = within(upperBody).getByText("R1 Hoody").closest("li")!;
      expect(hoody).toHaveTextContent("Mid · Your item for Fleece jacket");
      expect(within(hoody).queryByText("Not matched to your wardrobe")).not.toBeInTheDocument();
      const shell = within(upperBody).getByText("Shell jacket").closest("li")!;
      expect(within(shell).getByText("Not matched to your wardrobe")).toBeInTheDocument();
    });

    it("says when a signed-in user's wardrobe couldn't be checked", async () => {
      vi.mocked(getAuthUserId).mockResolvedValueOnce("user_1");
      vi.mocked(getSupabase).mockReturnValueOnce(null);
      stubPackingList();
      render(<MultiDayPlanDisplay plan={makePlan()} />);
      await openPacking();

      expect(
        await screen.findByText("Your wardrobe couldn't be checked, so these aren't matched to your items.")
      ).toBeInTheDocument();
      expect(screen.queryByText("Not matched to your wardrobe")).not.toBeInTheDocument();
    });

    it("says the packing list is unavailable when the server fails, and tries again", async () => {
      const fetchMock = stubPackingList(["error"]);
      render(<MultiDayPlanDisplay plan={makePlan()} />);
      await openPacking();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Packing list unavailable");
      expect(screen.queryByRole("region", { name: "Upper body" })).not.toBeInTheDocument();

      await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("region", { name: "Upper body" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("says the packing list is unavailable when the request doesn't reach the server", async () => {
      stubPackingList(["network"]);
      render(<MultiDayPlanDisplay plan={makePlan()} />);
      await openPacking();

      expect(await screen.findByRole("alert")).toHaveTextContent("Packing list unavailable");
    });

    it("keeps the daily plan when the packing list fails", async () => {
      stubPackingList(["error"]);
      render(<MultiDayPlanDisplay plan={makePlan()} />);
      await openPacking();
      await screen.findByRole("alert");

      await userEvent.click(screen.getByRole("tab", { name: "Daily plan" }));

      expect(day("Thu, Jan 15")).toBeInTheDocument();
    });
  });
});

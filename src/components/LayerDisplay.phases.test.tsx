import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { POST as evaluateLayers } from "@/app/api/v1/ensembles/evaluate/route";
import type { BiophysicsRecommendation } from "@/types/biophysics";
import type { AvailableItem, WardrobeItem } from "@/types/wardrobe";
import LayerDisplay from "./LayerDisplay";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "fixture-user", isLoaded: true, isSignedIn: true }),
}));

const touring: BiophysicsRecommendation = {
  conditions: { temperature: "25", wind_speed: "10", exertion: "moderate" },
  ireq: {
    target_range: [0.3, 0.7],
    regional: { min: { torso: 0.2, arms: 0.2, legs: 0.2 }, neutral: { torso: 0.4, arms: 0.4, legs: 0.4 } },
    extremity: { min: { hands: 0.2, head: 0.1 }, neutral: { hands: 0.4, head: 0.2 } },
    downhill_target_range: [0.6, 1.2],
  },
  recommendation: {
    garments: [{ id: "base", name: "Merino base", category: "base_layer", rcl: 0.3, covers_torso: true }],
    handwear: { id: "climb-gloves", name: "Climb gloves", type: "liner", rcl: 0.4 },
    ensemble_properties: { total_clo: 0.4, regional_clo: { torso: 0.3, arms: 0.3, legs: 0 }, evap_potential: 0.3, permeability_index: 0.3 },
    score: 80,
    component_scores: { coldProtection: 80, overheatPrevention: 80, breathability: 80, weatherProtection: 80, weight: 80 },
  },
  descent_handwear: { id: "descent-gloves", name: "Descent gloves", type: "insulated", rcl: 0.8 },
  descent_breakdown: {
    total_clo: 0.9,
    regional_clo: { torso: 1.1, arms: 0.9, legs: 0 },
    regional_ireq: { min: { torso: 0.8, arms: 0.6, legs: 0.5 }, neutral: { torso: 1.2, arms: 1, legs: 0.8 } },
    extremity_ireq: { min: { hands: 0.5, head: 0.3 }, neutral: { hands: 0.8, head: 0.5 } },
  },
  warnings: [],
  guidance: [],
};

const wardrobe: WardrobeItem[] = [touring.recommendation.handwear!, touring.descent_handwear!].map((item) => ({
  id: item.id,
  item_id: item.id,
  item_type: "handwear",
  details: { brand: "Fixture", model_name: item.name, rcl_clo: item.rcl, handwear_type: item.type },
}));
const catalog: AvailableItem[] = [0.4, 1.2, 1.4, 2.4].map((clo) => ({
  id: `fleece-${clo}`,
  type: "garment",
  brand: "Fixture",
  model_name: `Fleece ${clo}`,
  category: "mid_layer_light",
  rcl_torso: clo,
  rcl_clo: clo,
}));

let drawerStyles: HTMLStyleElement;
beforeEach(() => {
  // jsdom has no animation or transform defaults; let the real Vaul drawer
  // finish closing and read a valid transform without emulating its behavior.
  drawerStyles = document.createElement("style");
  drawerStyles.textContent = "[data-vaul-drawer], [data-slot=drawer-overlay] { animation-name: none !important; transform: matrix(1, 0, 0, 1, 0, 0); }";
  document.head.append(drawerStyles);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/wardrobe/gear" && !init?.method) return Response.json({ items: wardrobe });
    if (String(input) === "/api/wardrobe/available") return Response.json({ items: catalog });
    if (String(input) === "/api/v1/ensembles/evaluate") {
      return evaluateLayers(new NextRequest("http://localhost/api/v1/ensembles/evaluate", { method: "POST", body: init?.body as string }));
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  }));
});
afterEach(() => {
  drawerStyles.remove();
  vi.unstubAllGlobals();
});

function renderTouring() {
  render(<LayerDisplay activity="backcountry_skiing" recommendation={null} temperature={25} windspeed={10} biophysicsData={touring} />);
  return userEvent.setup();
}

describe("backcountry phase editing with the real picker", () => {
  it("ranks options using the shown phase's target and names that phase", async () => {
    const user = renderTouring();
    const upperBody = screen.getByRole("region", { name: "Upper body" });
    await user.click(within(upperBody).getByRole("button", { name: "Change upper body" }));
    await user.click(within(upperBody).getByRole("button", { name: "Add mid" }));
    let picker = await screen.findByRole("dialog");
    expect(picker).toHaveAccessibleDescription("Upper body · Climb");
    await waitFor(() => expect(within(picker).getAllByRole("button", { name: /Fleece/ }).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Fleece 0.4"), expect.stringContaining("Fleece 1.2"), expect.stringContaining("Fleece 1.4"),
    ]));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^Descent/ }));
    await user.click(within(upperBody).getByRole("button", { name: "Add mid" }));
    picker = await screen.findByRole("dialog");
    expect(picker).toHaveAccessibleDescription("Upper body · Descent");
    expect(within(picker).getAllByRole("button", { name: /Fleece/ }).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Fleece 1.2"), expect.stringContaining("Fleece 1.4"), expect.stringContaining("Fleece 0.4"),
    ]);
    expect(picker).toHaveTextContent("1.2 clo");
  });

  it("can use the other phase's gloves, keeps duplicates disabled, and undoes just this phase", async () => {
    const user = renderTouring();
    const hands = screen.getByRole("region", { name: "Hands" });
    await user.click(within(hands).getByRole("button", { name: "Change hands" }));
    await user.click(within(hands).getByRole("button", { name: /Climb gloves/ }));
    const picker = await screen.findByRole("dialog");
    await waitFor(() => expect(within(picker).getByRole("button", { name: /Descent gloves/ })).toBeEnabled());
    expect(within(picker).getByRole("button", { name: /Climb gloves/ })).toBeDisabled();
    await user.click(within(picker).getByRole("button", { name: /Descent gloves/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(hands).toHaveTextContent("Descent gloves");
    expect(hands).not.toHaveTextContent("Climb gloves");
    expect(screen.getByRole("region", { name: "Carry" })).toHaveTextContent("Nothing extra to carry");

    await user.click(screen.getByRole("button", { name: "Undo last climb change" }));
    expect(hands).toHaveTextContent("Climb gloves");
    expect(screen.getByRole("region", { name: "Carry" })).toHaveTextContent("Descent gloves");
    await user.click(screen.getByRole("button", { name: /^Descent/ }));
    expect(hands).toHaveTextContent("Descent gloves");
    expect(hands).not.toHaveTextContent("Climb gloves");
    expect(screen.queryByRole("button", { name: /Undo last/ })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST" && init.body?.toString().includes("item_type"))).toBe(false);
  });
});

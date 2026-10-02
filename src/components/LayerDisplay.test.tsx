import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { toast } from "sonner";
import { POST as evaluateLayers } from "@/app/api/v1/ensembles/evaluate/route";
import type { PickerItem } from "@/hooks/useLayerPicker";
import { buildLayersResult, layerDisplayAdvice } from "@/lib/gearUp";
import LayerDisplay from "./LayerDisplay";

// Layer evaluation runs on the server; serve it from the real route handler.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/v1/ensembles/evaluate") throw new Error(`Unexpected fetch: ${String(input)}`);
      return evaluateLayers(
        new NextRequest("http://localhost/api/v1/ensembles/evaluate", { method: "POST", body: init?.body as string })
      );
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Mock Clerk — default to signed-in user
const mockUseAuth = vi.fn(() => ({ userId: "test-user", isLoaded: true, isSignedIn: true }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

// Mock useLayerPicker — no wardrobe items available in tests
const mockReloadPicker = vi.fn();
vi.mock("@/hooks/useLayerPicker", () => ({
  useLayerPicker: () => ({ loading: false, getItems: () => [], reload: mockReloadPicker }),
}));

// Mock LayerPickerDrawer — while open, offers one item that isn't in the wardrobe
const catalogFleece: PickerItem = {
  id: "catalog-fleece",
  name: "Catalog fleece",
  brand: "Test Brand",
  rcl: 0.3,
  nativeLayerType: "mid",
  isInUse: false,
  isOwned: false,
};
vi.mock("@/components/layers/LayerPickerDrawer", () => ({
  LayerPickerDrawer: ({ open, onSelect }: { open: boolean; onSelect: (item: PickerItem) => void }) =>
    open ? <button onClick={() => onSelect(catalogFleece)}>Pick catalog fleece</button> : null,
}));

const mockRecommendation = {
  torso: {
    base: [{ name: "Wool base layer" }],
    mid: [{ name: "Fleece jacket" }],
    outer: [{ name: "Insulated jacket" }],
  },
  legs: {
    base: [{ name: "Thermal pants" }],
    outer: [{ name: "Ski pants" }],
  },
  hands: {
    base: [{ name: "Liner gloves" }],
    outer: [{ name: "Ski gloves" }],
  },
  headNeck: {
    base: [{ name: "Balaclava" }],
    outer: [{ name: "Helmet" }],
  },
};

const defaultProps = {
  recommendation: mockRecommendation,
  temperature: 25,
  windspeed: 10,
};

describe("LayerDisplay", () => {
  describe("rendering", () => {
    it("keeps the conditions on screen when there are no layers", () => {
      render(<LayerDisplay recommendation={null} temperature={25} windspeed={10} />);

      expect(screen.getByText("Wind 10 mph")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Layers aren't available yet" })).toBeInTheDocument();
      expect(screen.queryByText("Detailed Layer Breakdown")).not.toBeInTheDocument();
    });

    it("should render all body part sections", () => {
      render(<LayerDisplay {...defaultProps} />);

      expect(screen.getByText("Torso")).toBeInTheDocument();
      expect(screen.getByText("Legs")).toBeInTheDocument();
      expect(screen.getByText("Hands")).toBeInTheDocument();
      expect(screen.getByText("Head/Neck")).toBeInTheDocument();
    });

    it("should render layer labels correctly", () => {
      render(<LayerDisplay {...defaultProps} />);

      const baseLabels = screen.getAllByText("Base");
      const midLabels = screen.getAllByText("Mid");
      const outerLabels = screen.getAllByText("Outer");

      expect(baseLabels.length).toBeGreaterThan(0);
      expect(midLabels.length).toBeGreaterThan(0);
      expect(outerLabels.length).toBeGreaterThan(0);
    });
  });

  describe("torso layers", () => {
    it("should render torso base layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Wool base layer")).toBeInTheDocument();
    });

    it("should render torso mid layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Fleece jacket")).toBeInTheDocument();
    });

    it("should render torso outer layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Insulated jacket")).toBeInTheDocument();
    });
  });

  describe("legs layers", () => {
    it("should render legs base layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Thermal pants")).toBeInTheDocument();
    });

    it("should render legs outer layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Ski pants")).toBeInTheDocument();
    });
  });

  describe("hands layers", () => {
    it("should render hands base layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Liner gloves")).toBeInTheDocument();
    });

    it("should render hands outer layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Ski gloves")).toBeInTheDocument();
    });
  });

  describe("head/neck layers", () => {
    it("should render head/neck base layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Balaclava")).toBeInTheDocument();
    });

    it("should render head/neck outer layer", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Helmet")).toBeInTheDocument();
    });
  });

  describe("general guidance is read-only", () => {
    it("says a body area needs nothing when the general guide leaves it empty", () => {
      const emptyRecommendation = {
        torso: { base: [], outer: [] },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={emptyRecommendation} temperature={25} windspeed={10} />);

      expect(screen.getAllByText("Nothing needed here at this temperature.")).toHaveLength(4);
      expect(screen.queryByText("Add torso layers for core warmth")).not.toBeInTheDocument();
      expect(screen.queryByText("Base")).not.toBeInTheDocument();
    });

    it("lists only the layer types the general guide fills", () => {
      const noMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={noMidRecommendation} temperature={25} windspeed={10} />);

      expect(screen.getAllByText("Base")).toHaveLength(4);
      expect(screen.getAllByText("Outer")).toHaveLength(4);
      expect(screen.queryByText("Mid")).not.toBeInTheDocument();
    });

    it("offers no way to add, remove or swap general layers", () => {
      render(<LayerDisplay {...defaultProps} biophysicsStatus="auth_required" />);

      expect(screen.queryByRole("button", { name: /^Add (base|mid|outer)$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Fleece jacket"));
      expect(screen.queryByText("Pick catalog fleece")).not.toBeInTheDocument();
      expect(screen.getByText("Fleece jacket")).toBeInTheDocument();
    });
  });

  describe("multiple items in a layer", () => {
    it("should render multiple items separately", () => {
      const multiItemRecommendation = {
        torso: {
          base: [{ name: "Item 1" }, { name: "Item 2" }, { name: "Item 3" }],
          outer: [{ name: "Outer item" }],
        },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={multiItemRecommendation} temperature={25} windspeed={10} />);
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
      expect(screen.getByText("Item 3")).toBeInTheDocument();
    });
  });

  describe("clo value display", () => {
    it("should display clo values on separate lines when present", () => {
      const recommendationWithClo = {
        torso: {
          base: [{ name: "Merino Base", rcl: 0.35 }],
          outer: [{ name: "Shell Jacket", rcl: 0.15 }],
        },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={recommendationWithClo} temperature={25} windspeed={10} />);
      expect(screen.getByText("Merino Base")).toBeInTheDocument();
      expect(screen.getByText("0.35 clo")).toBeInTheDocument();
      expect(screen.getByText("Shell Jacket")).toBeInTheDocument();
      expect(screen.getByText("0.15 clo")).toBeInTheDocument();
    });

    it("should not show clo line when rcl is undefined", () => {
      const recommendationNoClo = {
        torso: {
          base: [{ name: "Generic Base Layer" }],
          outer: [],
        },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={recommendationNoClo} temperature={25} windspeed={10} />);
      expect(screen.getByText("Generic Base Layer")).toBeInTheDocument();
      expect(screen.queryByText(/clo$/)).not.toBeInTheDocument();
    });
  });

  describe("weather display", () => {
    it("should display temperature", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("25")).toBeInTheDocument();
    });

    it("should display wind speed", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("Wind 10 mph")).toBeInTheDocument();
    });

    it("should display different temperature values", () => {
      render(<LayerDisplay {...defaultProps} temperature={-5} />);
      expect(screen.getByText("-5")).toBeInTheDocument();
    });

    it("should display different wind speed values", () => {
      render(<LayerDisplay {...defaultProps} windspeed={35} />);
      expect(screen.getByText("Wind 35 mph")).toBeInTheDocument();
    });
  });

  describe("Be Bold, Start Cold message", () => {
    it("should show message when temperature is below 32", () => {
      render(<LayerDisplay {...defaultProps} temperature={25} />);
      expect(screen.getByText("Be Bold, Start Cold")).toBeInTheDocument();
    });

    it("should show message when temperature is 31", () => {
      render(<LayerDisplay {...defaultProps} temperature={31} />);
      expect(screen.getByText("Be Bold, Start Cold")).toBeInTheDocument();
    });

    it("should not show message when temperature is 32", () => {
      render(<LayerDisplay {...defaultProps} temperature={32} />);
      expect(screen.queryByText("Be Bold, Start Cold")).not.toBeInTheDocument();
    });

    it("should not show message when temperature is above 32", () => {
      render(<LayerDisplay {...defaultProps} temperature={50} />);
      expect(screen.queryByText("Be Bold, Start Cold")).not.toBeInTheDocument();
    });

    it("should show message for very cold temperatures", () => {
      render(<LayerDisplay {...defaultProps} temperature={-10} />);
      expect(screen.getByText("Be Bold, Start Cold")).toBeInTheDocument();
    });
  });

  describe("biophysics-only rendering", () => {
    const mockBiophysicsData = {
      conditions: {
        temperature: "15",
        wind_speed: "10",
        exertion: "moderate" as const,
        precipitation: false,
      },
      ireq: {
        target_range: [1.5, 2.0] as [number, number],
        regional: {
          min: { torso: 1.0, arms: 0.8, legs: 0.9 },
          neutral: { torso: 1.5, arms: 1.2, legs: 1.3 },
        },
        extremity: {
          min: { hands: 0.5, head: 0.4 },
          neutral: { hands: 0.8, head: 0.6 },
        },
      },
      recommendation: {
        garments: [
          {
            id: "garment-1",
            name: "Merino Base Layer",
            category: "base_layer",
            rcl: 0.35,
            covers_torso: true,
            covers_legs: false,
          },
          {
            id: "garment-2",
            name: "Down Puffy",
            category: "insulation_down",
            rcl: 1.2,
            covers_torso: true,
            covers_legs: false,
          },
          {
            id: "garment-3",
            name: "Gore-Tex Shell",
            category: "hard_shell",
            rcl: 0.15,
            covers_torso: true,
            covers_legs: false,
          },
          {
            id: "garment-4",
            name: "Thermal Tights",
            category: "base_layer",
            rcl: 0.25,
            covers_torso: false,
            covers_legs: true,
          },
        ],
        handwear: {
          id: "glove-1",
          name: "Hestra Insulated Gloves",
          type: "insulated",
          rcl: 0.65,
        },
        headwear: {
          helmet: {
            id: "helmet-1",
            name: "Smith Vantage",
            type: "ski_helmet",
            rcl: 0.15,
          },
          head_warmth: {
            id: "beanie-1",
            name: "Merino Beanie",
            type: "beanie",
            rcl: 0.25,
          },
          neck_warmth: {
            id: "gaiter-1",
            name: "Buff Neck Gaiter",
            type: "neck_gaiter",
            rcl: 0.12,
          },
        },
        ensemble_properties: {
          total_clo: 1.7,
          regional_clo: { torso: 1.7, arms: 1.2, legs: 0.25 },
          evap_potential: 0.4,
          permeability_index: 0.3,
        },
        score: 85,
        component_scores: {
          coldProtection: 9,
          overheatPrevention: 8,
          breathability: 8.5,
          weatherProtection: 7.5,
          weight: 7,
        },
      },
      warnings: [],
      guidance: ["Layer up for the chairlift"],
    };

    describe("items not in the wardrobe", () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      /** Answers adds to the wardrobe with `status`, and keeps serving layer evaluation. */
      function stubWardrobeAdd(status: number) {
        const evaluate = vi.mocked(fetch);
        const addRequests: unknown[] = [];
        vi.stubGlobal(
          "fetch",
          vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input) !== "/api/wardrobe/gear") return evaluate(input, init);
            addRequests.push(JSON.parse(init?.body as string));
            return Response.json({}, { status });
          })
        );
        return addRequests;
      }

      function renderAndPickCatalogFleeceForLegs() {
        render(<LayerDisplay recommendation={null} temperature={15} windspeed={10} biophysicsData={mockBiophysicsData} />);
        const legs = screen.getByRole("button", { name: /legs/i }).parentElement!;
        fireEvent.click(within(legs).getByRole("button", { name: "Add mid" }));
        fireEvent.click(screen.getByText("Pick catalog fleece"));
        return { legs, card: screen.getByRole("region", { name: "Not in your wardrobe" }) };
      }

      it("adds a picked catalog item to the outfit, not to the wardrobe", () => {
        const addRequests = stubWardrobeAdd(201);
        const { legs, card } = renderAndPickCatalogFleeceForLegs();

        expect(within(legs).getByText("Catalog fleece")).toHaveTextContent("Not in your wardrobe");
        expect(within(card).getByText("Catalog fleece")).toBeInTheDocument();
        expect(addRequests).toEqual([]);
        expect(toast.info).not.toHaveBeenCalled();
      });

      it("labels the web search for an item as a search", () => {
        stubWardrobeAdd(201);
        const { card } = renderAndPickCatalogFleeceForLegs();

        const search = within(card).getByRole("link", { name: /^Search for this item/ });
        expect(search).toHaveAttribute("href", "https://www.google.com/search?q=Test%20Brand%20Catalog%20fleece");
        expect(search).toHaveAttribute("target", "_blank");
        expect(within(card).queryByText(/buy/i)).not.toBeInTheDocument();
      });

      it("adds the item to the wardrobe only when the user says they own it", async () => {
        const addRequests = stubWardrobeAdd(201);
        const { legs, card } = renderAndPickCatalogFleeceForLegs();

        fireEvent.click(within(card).getByRole("button", { name: /^I own this/ }));

        await waitFor(() =>
          expect(screen.queryByRole("region", { name: "Not in your wardrobe" })).not.toBeInTheDocument()
        );
        expect(addRequests).toEqual([{ item_type: "garment", item_id: "catalog-fleece" }]);
        expect(toast.success).toHaveBeenCalledWith("Catalog fleece added to your wardrobe");
        expect(within(legs).getByText("Catalog fleece")).not.toHaveTextContent("Not in your wardrobe");
        expect(mockReloadPicker).toHaveBeenCalledTimes(1);
      });

      it("lists an item picked for the descent", () => {
        stubWardrobeAdd(201);
        const touringData = {
          ...mockBiophysicsData,
          ireq: { ...mockBiophysicsData.ireq, downhill_target_range: [1.0, 1.6] as [number, number] },
        };
        render(
          <LayerDisplay
            activity="backcountry_skiing"
            recommendation={null}
            temperature={15}
            windspeed={10}
            biophysicsData={touringData}
          />
        );

        fireEvent.click(screen.getByRole("button", { name: "Descent" }));
        const legs = screen.getByRole("button", { name: /legs/i }).parentElement!;
        fireEvent.click(within(legs).getByRole("button", { name: "Add mid" }));
        fireEvent.click(screen.getByText("Pick catalog fleece"));

        const card = screen.getByRole("region", { name: "Not in your wardrobe" });
        expect(within(card).getByText("Catalog fleece")).toBeInTheDocument();
      });

      it("still shows the item as not owned when adding it fails", async () => {
        stubWardrobeAdd(500);
        const { legs, card } = renderAndPickCatalogFleeceForLegs();

        fireEvent.click(within(card).getByRole("button", { name: /^I own this/ }));

        await waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith("Couldn't add Catalog fleece to your wardrobe. Try again.")
        );
        expect(within(legs).getByText("Catalog fleece")).toHaveTextContent("Not in your wardrobe");
        expect(within(card).getByRole("button", { name: /^I own this/ })).toBeEnabled();
        expect(mockReloadPicker).not.toHaveBeenCalled();
      });
    });

    it("should render correctly when recommendation is null but biophysicsData exists", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Should render body part sections
      expect(screen.getByText("Torso")).toBeInTheDocument();
      expect(screen.getByText("Legs")).toBeInTheDocument();
      expect(screen.getByText("Hands")).toBeInTheDocument();
      expect(screen.getByText("Head/Neck")).toBeInTheDocument();

      // Should render weather info
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getByText("Wind 10 mph")).toBeInTheDocument();

      // Personalized layers aren't labeled as general guidance
      expect(screen.queryByText("General guidance")).not.toBeInTheDocument();
    });

    it("should display biophysics garments with their thermal properties (clo values)", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Torso garments
      expect(screen.getAllByText("Merino Base Layer").length).toBeGreaterThan(0);
      expect(screen.getByText("0.35 clo")).toBeInTheDocument();
      expect(screen.getAllByText("Down Puffy").length).toBeGreaterThan(0);
      expect(screen.getByText("1.20 clo")).toBeInTheDocument();
      expect(screen.getAllByText("Gore-Tex Shell").length).toBeGreaterThan(0);
      // Note: 0.15 clo appears twice (Gore-Tex Shell and Smith Vantage helmet)
      expect(screen.getAllByText("0.15 clo").length).toBeGreaterThanOrEqual(1);

      // Legs garments
      expect(screen.getAllByText("Thermal Tights").length).toBeGreaterThan(0);
      // Note: 0.25 clo appears twice (Thermal Tights and Merino Beanie)
      expect(screen.getAllByText("0.25 clo").length).toBeGreaterThanOrEqual(1);
    });

    it("should display handwear with clo value", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.getByText("Hestra Insulated Gloves")).toBeInTheDocument();
      expect(screen.getByText("0.65 clo")).toBeInTheDocument();
    });

    it("should display headwear items as interactive layers", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Headwear items are now rendered as interactive layer items
      expect(screen.getByText("Smith Vantage")).toBeInTheDocument();
      expect(screen.getByText("Merino Beanie")).toBeInTheDocument();
      expect(screen.getByText("Buff Neck Gaiter")).toBeInTheDocument();
    });

    it("should display regional clo progress bars", async () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Torso clo display: target and actual pills
      // Actual = rawSum × ensemble regression coef (0.836 for torso)
      // (0.35 + 1.2 + 0.15) × 0.836 ≈ 1.4
      expect(await screen.findByText("Target 1.5 clo")).toBeInTheDocument();
      expect(screen.getByText("Actual 1.4 clo")).toBeInTheDocument();

      // Legs clo display: target and actual pills
      // Actual = rawSum × ensemble regression coef (0.961 for legs)
      // 0.25 × 0.961 ≈ 0.2
      expect(screen.getByText("Target 1.3 clo")).toBeInTheDocument();
      expect(screen.getByText("Actual 0.2 clo")).toBeInTheDocument();
    });

    it("sends each body part's minimum so shortfalls are measured from it", async () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      await screen.findByText("Target 1.5 clo");
      const [, init] = vi.mocked(fetch).mock.calls[0];
      const { phases: [climb] } = JSON.parse(init?.body as string);
      expect(climb.minTargets).toEqual({ torso: 1.0, legs: 0.9, hands: 0.5, headNeck: 0.4 });
      expect(climb.arms).toMatchObject({ target: 1.2, minTarget: 0.8 });
    });

    it("should render ThermalGauge with target range pill", async () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // ThermalGauge renders full range: "Target min-max clo"
      expect(await screen.findByText("Target 1.5-2.0 clo")).toBeInTheDocument();
    });

    it("should show body-part clo values from biophysics data", async () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // 0.25 × 0.961 ≈ 0.2 (ensemble regression for legs)
      expect(await screen.findByText("Actual 0.2 clo")).toBeInTheDocument();
    });

    it("should show global total clo and risk alert icon from biophysics data", async () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // effectiveTotalClo is now computed from mutable layers with ensemble regression:
      // torso raw 1.7 × 0.836 = 1.42, legs raw 0.25 × 0.961 = 0.24, arms 1.2
      // weighted: 1.42×0.5 + 1.2×0.25 + 0.24×0.25 ≈ 1.1
      expect(await screen.findByText("Actual 1.1 clo")).toBeInTheDocument();
      // Risk details are now behind a popover icon, check the icon is present
      expect(screen.getByLabelText(/Cold Risk/)).toBeInTheDocument();
    });

    it("should show add buttons instead of generic layer suggestion when near target", () => {
      const nearTargetNoMidData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [0.5, 0.7] as [number, number],
          regional: {
            min: { torso: 0.4, arms: 0.1, legs: 0.1 },
            neutral: { torso: 0.6, arms: 0.1, legs: 0.1 },
          },
        },
        recommendation: {
          ...mockBiophysicsData.recommendation,
          garments: [
            {
              id: "torso-base",
              name: "Patagonia Capilene Cool Lightweight",
              category: "base_layer",
              rcl: 0.22,
              covers_torso: true,
              covers_legs: false,
            },
            {
              id: "torso-outer",
              name: "Lululemon Pace Breaker Jacket",
              category: "soft_shell",
              rcl: 0.19,
              covers_torso: true,
              covers_legs: false,
            },
          ],
          handwear: null,
          headwear: null,
          ensemble_properties: {
            ...mockBiophysicsData.recommendation.ensemble_properties,
            total_clo: 0.5,
            regional_clo: { torso: 0.5, arms: 0.1, legs: 0.1 },
          },
        },
        warnings: [],
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={32}
          windspeed={4}
          biophysicsData={nearTargetNoMidData}
        />
      );

      // Verify no generic layer buttons exist — replaced by add buttons
      expect(screen.queryByRole("button", { name: "Use Generic Mid" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Use Generic Outer" })).not.toBeInTheDocument();
    });

    it("should exclude helmet insulation from head/neck clo for xc skiing", async () => {
      render(
        <LayerDisplay
          activity="xc_skiing"
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.queryByText("Helmet")).not.toBeInTheDocument();
      expect(await screen.findByText("Actual 0.4 clo")).toBeInTheDocument();
    });

    it("should display layer labels for biophysics garments", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Should have layer labels for torso
      const baseLabels = screen.getAllByText("Base");
      const midLabels = screen.getAllByText("Mid");
      const outerLabels = screen.getAllByText("Outer");

      expect(baseLabels.length).toBeGreaterThan(0);
      expect(midLabels.length).toBeGreaterThan(0);
      expect(outerLabels.length).toBeGreaterThan(0);
    });

    it("should display biophysics score", async () => {
      const inRangeData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          // Lower target range so effectiveTotalClo (~1.3) falls in range
          target_range: [1.0, 1.5] as [number, number],
          regional: {
            min: { torso: 1.0, arms: 0.8, legs: 0.9 },
            neutral: { torso: 1.45, arms: 1.2, legs: 1.3 },
          },
          extremity: {
            min: { hands: 0.5, head: 0.4 },
            neutral: { hands: 0.85, head: 0.57 },
          },
        },
        recommendation: {
          ...mockBiophysicsData.recommendation,
          garments: [
            ...mockBiophysicsData.recommendation.garments,
            {
              id: "garment-5",
              name: "Insulated Ski Pants",
              category: "insulation_synthetic",
              rcl: 1.1,
              covers_torso: false,
              covers_legs: true,
            },
          ],
          handwear: {
            ...mockBiophysicsData.recommendation.handwear,
            rcl: 0.85,
          },
          ensemble_properties: {
            ...mockBiophysicsData.recommendation.ensemble_properties,
            regional_clo: { torso: 1.7, arms: 1.2, legs: 1.35 },
          },
        },
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={inRangeData}
        />
      );

      // With adjusted garments and target range, effectiveTotalClo is in range
      // and no significant regional deficits → score ≥ 85 → "Optimal"
      expect(await screen.findByText("Optimal")).toBeInTheDocument();
    });

    it("should not show cold risk when the whole-body and body-part gaps stay within display tolerance", async () => {
      const nearTargetData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [1.0, 1.5] as [number, number],
          regional: {
            min: { torso: 1.0, arms: 0.8, legs: 0.2 },
            neutral: { torso: 1.46, arms: 1.23, legs: 0.28 },
          },
          extremity: {
            min: { hands: 0.5, head: 0.4 },
            neutral: { hands: 0.69, head: 0.57 },
          },
        },
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={40}
          windspeed={11}
          biophysicsData={nearTargetData}
        />
      );

      expect(await screen.findByText("Optimal")).toBeInTheDocument();
      expect(screen.queryByLabelText(/Cold Risk/)).not.toBeInTheDocument();
      expect(screen.queryByText("Cold Stress")).not.toBeInTheDocument();
    });

    it("should not show comfort achieved when total clo is in range but a region is under target", async () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect((await screen.findAllByText(/Cold Risk/i)).length).toBeGreaterThan(0);
      expect(screen.queryByText("Comfort Range Achieved")).not.toBeInTheDocument();
    });

    it("should show uphill copy and descent add-on layers for backcountry skiing", () => {
      const touringData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [0.8, 1.3] as [number, number],
          extremity: {
            min: { hands: 0.5, head: 0.4 },
            neutral: { hands: 0.68, head: 0.56 },
          },
          downhill: { min: 1.0, neutral: 1.6 },
          downhill_target_range: [1.0, 1.6] as [number, number],
        },
        pack_items: {
          garments: [
            {
              id: "pack-1",
              name: "Patagonia Nano Puff",
              weight_g: 320,
              rcl_clo: 0.7,
            },
          ],
          total_weight_g: 320,
        },
      };

      render(
        <LayerDisplay
          activity="backcountry_skiing"
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={touringData}
        />
      );

      expect(screen.getAllByText("Climb").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Descent").length).toBeGreaterThan(0);
      // Old descent section removed — descent tab and "In the Pack" summary replace it
      expect(screen.queryByText("Descent Layer Plan")).not.toBeInTheDocument();
      // Pack item visible in climb tab via "In the Pack" summary
      expect(screen.getByText("In the Pack")).toBeInTheDocument();
      expect(screen.getByText("Patagonia Nano Puff")).toBeInTheDocument();
      // Switch to descent tab — pack item now appears as a worn layer
      const descentButtons = screen.getAllByText("Descent");
      const descentTab = descentButtons.find((el) => el.tagName === "BUTTON");
      if (descentTab) fireEvent.click(descentTab);
      expect(screen.getByText("Patagonia Nano Puff")).toBeInTheDocument();
      // Descent tab also always shows pack summary (empty in this case)
      expect(screen.getByText("Nothing extra in the pack.")).toBeInTheDocument();
    });

    it("should show descent overheating risk card when descent clo exceeds target", async () => {
      const overheatedDescentData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [0.8, 1.3] as [number, number],
          downhill: { min: 0.5, neutral: 0.9 },
          downhill_target_range: [0.5, 0.9] as [number, number],
        },
        pack_items: {
          garments: [
            {
              id: "pack-1",
              name: "Patagonia Nano Puff",
              weight_g: 320,
              rcl_clo: 0.7,
            },
          ],
          total_weight_g: 320,
        },
      };

      render(
        <LayerDisplay
          activity="backcountry_skiing"
          recommendation={null}
          temperature={25}
          windspeed={5}
          biophysicsData={overheatedDescentData}
        />
      );

      // Descent: torso raw (1.7+0.7)*0.836=2.01, arms 1.2, legs 0.25*0.961=0.24
      // Full body = 2.01*0.50 + 1.2*0.25 + 0.24*0.25 ≈ 1.37 vs 0.9 max → over by ~0.47
      expect(await screen.findByLabelText(/Descent Overheating Risk/)).toBeInTheDocument();
    });

    it("should show descent cold risk card when descent clo is below target", async () => {
      const coldDescentData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          downhill: { min: 3.0, neutral: 3.5 },
          downhill_target_range: [3.0, 3.5] as [number, number],
        },
        pack_items: {
          garments: [
            {
              id: "pack-1",
              name: "Light Wind Shell",
              weight_g: 120,
              rcl_clo: 0.2,
            },
          ],
          total_weight_g: 120,
        },
      };

      render(
        <LayerDisplay
          activity="backcountry_skiing"
          recommendation={null}
          temperature={0}
          windspeed={15}
          biophysicsData={coldDescentData}
        />
      );

      // Descent: torso raw (1.7+0.2)*0.836=1.59, arms 1.2, legs 0.25*0.961=0.24
      // Full body = 1.59*0.50 + 1.2*0.25 + 0.24*0.25 ≈ 1.16 vs 3.0 min → short by ~1.84
      expect(await screen.findByLabelText(/Descent Cold Risk/)).toBeInTheDocument();
    });

  });

  describe("without a personalized recommendation", () => {
    const scoreLabel = /optimal|comfortable|cold stress|overheating risk/i;

    it("labels static layers as general guidance with no comfort score", () => {
      render(<LayerDisplay {...defaultProps} activity="alpine_skiing" biophysicsStatus="auth_required" />);

      expect(screen.getByRole("heading", { name: "General guidance" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
      expect(screen.getByText("Wool base layer")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: scoreLabel })).not.toBeInTheDocument();
    });

    it("offers a retry when personalized layers failed to load", () => {
      const onRetry = vi.fn();
      render(<LayerDisplay {...defaultProps} biophysicsStatus="unavailable" onRetry={onRetry} />);

      expect(screen.getByText(/personalized layers couldn't load/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("points to the wardrobe when there's no usable gear", () => {
      render(<LayerDisplay {...defaultProps} biophysicsStatus="no_gear" />);
      expect(screen.getByRole("link", { name: /add gear/i })).toHaveAttribute("href", "/wardrobe");
    });

    it("offers no action when the activity has no personalized model", () => {
      render(<LayerDisplay {...defaultProps} activity="hiking_snowshoeing" biophysicsStatus="unsupported" />);

      const notice = screen.getByRole("region", { name: "General guidance" });
      expect(notice).toHaveTextContent(/aren't available for this activity yet/);
      expect(within(notice).queryByRole("link")).not.toBeInTheDocument();
      expect(within(notice).queryByRole("button")).not.toBeInTheDocument();
    });

    it.each(["running", "biking", "backcountry_skiing"])(
      "gives a signed-out %s result the outing and a sign-in path",
      async (activity) => {
        const outing = {
          activity,
          exertion: "moderate" as const,
          place: { id: 1, name: "Stowe", country: "United States", latitude: 44.47, longitude: -72.69 },
          when: { mode: "now" as const },
        };
        const result = await buildLayersResult(outing, { temperature: 25, windSpeed: 10 }, "neutral", async () => ({
          status: "auth_required",
          data: null,
        }));
        render(
          <LayerDisplay
            activity={result.outing.activity}
            {...layerDisplayAdvice(result.advice)}
            temperature={result.weather.temperature}
            windspeed={result.weather.windSpeed}
          />
        );

        expect(screen.getByText("Wind 10 mph")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
      }
    );

    describe("and no static layers", () => {
      const noLayers = { activity: "running", recommendation: null, temperature: 25, windspeed: 10 };

      it("asks a signed-out user to sign in, keeping the outing and its controls", () => {
        render(
          <LayerDisplay
            {...noLayers}
            biophysicsStatus="auth_required"
            onReset={vi.fn()}
            onActivityChange={vi.fn()}
            onWeatherChange={vi.fn()}
          />
        );

        expect(screen.getByRole("heading", { name: "Sign in for Running layers" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/sign-in");
        expect(screen.getByText("Wind 10 mph")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Change weather location, date, or time" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Running" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
        expect(screen.queryByText("Detailed Layer Breakdown")).not.toBeInTheDocument();
      });

      it("offers a retry after a failed request and shows it's retrying", () => {
        const onRetry = vi.fn();
        const { rerender } = render(
          <LayerDisplay {...noLayers} biophysicsStatus="unavailable" onRetry={onRetry} />
        );

        expect(screen.getByRole("heading", { name: "Couldn't load Running layers" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalledTimes(1);

        rerender(<LayerDisplay {...noLayers} biophysicsStatus="unavailable" onRetry={onRetry} weatherLoading />);
        expect(screen.getByRole("button", { name: "Trying again…" })).toBeDisabled();
      });

      it("points a signed-in user without usable gear to the wardrobe", () => {
        render(<LayerDisplay {...noLayers} biophysicsStatus="no_gear" />);

        expect(screen.getByRole("heading", { name: "Add gear for Running layers" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /add gear/i })).toHaveAttribute("href", "/wardrobe");
      });
    });
  });
});

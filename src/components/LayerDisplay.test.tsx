import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LayerDisplay from "./LayerDisplay";

// Mock Clerk — default to signed-in user
const mockUseAuth = vi.fn(() => ({ userId: "test-user", isLoaded: true, isSignedIn: true }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
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
    it("should render null when recommendation is null", () => {
      const { container } = render(<LayerDisplay recommendation={null} temperature={25} windspeed={10} />);
      expect(container.firstChild).toBeNull();
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

  describe("empty layers", () => {
    it("should show add link when all layers are empty", () => {
      const emptyRecommendation = {
        torso: { base: [], outer: [] },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={emptyRecommendation} temperature={25} windspeed={10} />);

      // Should show empty state messages for each body part
      expect(screen.getByText("Add torso layers for core warmth")).toBeInTheDocument();
      expect(screen.getByText("Your legs need protection in these conditions")).toBeInTheDocument();
      expect(screen.getByText("No hand insulation selected")).toBeInTheDocument();
      expect(screen.getByText("Head and neck are exposed to the elements")).toBeInTheDocument();
    });

    it("should show mid layer group with add button when torso mid layer is not present", () => {
      const noMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={noMidRecommendation} temperature={25} windspeed={10} />);
      expect(screen.getAllByText("Mid").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Add mid").length).toBeGreaterThan(0);
    });

    it("should show mid layer group with add button when torso mid layer is an empty array", () => {
      const emptyMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={emptyMidRecommendation} temperature={25} windspeed={10} />);
      expect(screen.getAllByText("Mid").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Add mid").length).toBeGreaterThan(0);
    });

    it("should show add buttons for each layer type when empty", () => {
      const noMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={noMidRecommendation} temperature={25} windspeed={10} />);

      // Should have add buttons for each layer type (base, mid, outer per body part)
      const addButtons = screen.getAllByText(/^Add (base|mid|outer)$/);
      expect(addButtons.length).toBeGreaterThan(0);
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
          thermal: 90,
          moisture: 80,
          protection: 85,
          weight: 75,
          mobility: 70,
        },
      },
      warnings: [],
      guidance: ["Layer up for the chairlift"],
    };

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
    });

    it("should return null when both recommendation AND biophysicsData are null", () => {
      const { container } = render(
        <LayerDisplay
          recommendation={null}
          temperature={25}
          windspeed={10}
          biophysicsData={null}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it("should return null when both recommendation AND biophysicsData are undefined", () => {
      const { container } = render(
        <LayerDisplay
          recommendation={null}
          temperature={25}
          windspeed={10}
          biophysicsData={undefined}
        />
      );
      expect(container.firstChild).toBeNull();
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

    it("should display regional clo progress bars", () => {
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
      expect(screen.getByText("Target 1.5 clo")).toBeInTheDocument();
      expect(screen.getByText("Actual 1.4 clo")).toBeInTheDocument();

      // Legs clo display: target and actual pills
      // Actual = rawSum × ensemble regression coef (0.961 for legs)
      // 0.25 × 0.961 ≈ 0.2
      expect(screen.getByText("Target 1.3 clo")).toBeInTheDocument();
      expect(screen.getByText("Actual 0.2 clo")).toBeInTheDocument();
    });

    it("should show body-part clo values from biophysics data", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // 0.25 × 0.961 ≈ 0.2 (ensemble regression for legs)
      expect(screen.getByText("Actual 0.2 clo")).toBeInTheDocument();
    });

    it("should show global total clo and risk alert icon from biophysics data", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.getByText("You 1.7 clo")).toBeInTheDocument();
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

    it("should exclude helmet insulation from head/neck clo for xc skiing", () => {
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
      expect(screen.getByText("Actual 0.4 clo")).toBeInTheDocument();
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

    it("should display biophysics score", () => {
      const inRangeData = {
        ...mockBiophysicsData,
        recommendation: {
          ...mockBiophysicsData.recommendation,
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

      // Score of 85 should display "Optimal" status via ScoreDisplay component
      expect(screen.getByText("Optimal")).toBeInTheDocument();
    });

    it("should not show comfort achieved when total clo is in range but a region is under target", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.queryByText("Comfort Range Achieved")).not.toBeInTheDocument();
      expect(screen.getAllByText(/Cold Risk/i).length).toBeGreaterThan(0);
    });

    it("should show uphill copy and descent add-on layers for backcountry skiing", () => {
      const touringData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [0.8, 1.3] as [number, number],
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
      expect(screen.queryByText(/Climb Cold Risk/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Descent.*Risk/)).not.toBeInTheDocument();
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

    it("should show descent overheating risk card when descent clo exceeds target", () => {
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
      expect(screen.getByLabelText(/Descent Overheating Risk/)).toBeInTheDocument();
    });

    it("should show descent cold risk card when descent clo is below target", () => {
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
      expect(screen.getByLabelText(/Descent Cold Risk/)).toBeInTheDocument();
    });

  });
});

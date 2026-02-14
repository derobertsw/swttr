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

    it("should show generic mid slot when torso mid layer is not present", () => {
      const noMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={noMidRecommendation} temperature={25} windspeed={10} />);
      expect(screen.getByText("Mid")).toBeInTheDocument();
      expect(screen.getByText("No mid layer selected yet.")).toBeInTheDocument();
    });

    it("should show generic mid slot when torso mid layer is an empty array", () => {
      const emptyMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], mid: [], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={emptyMidRecommendation} temperature={25} windspeed={10} />);
      expect(screen.getByText("Mid")).toBeInTheDocument();
      expect(screen.getByText("No mid layer selected yet.")).toBeInTheDocument();
    });

    it("should allow adding a generic layer for an empty slot", () => {
      const noMidRecommendation = {
        torso: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        legs: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        hands: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
        headNeck: { base: [{ name: "Base layer" }], outer: [{ name: "Outer layer" }] },
      };

      render(<LayerDisplay recommendation={noMidRecommendation} temperature={25} windspeed={10} />);

      fireEvent.click(screen.getByRole("button", { name: "Use Generic Mid" }));

      expect(screen.getByText("Pullover")).toBeInTheDocument();
      expect(screen.getByText("Add your actual gear")).toBeInTheDocument();
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

    it("should display headwear categories with clo values", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Helmet category
      expect(screen.getByText("Helmet")).toBeInTheDocument();
      expect(screen.getByText("Smith Vantage")).toBeInTheDocument();

      // Head warmth category
      expect(screen.getByText("Head")).toBeInTheDocument();
      expect(screen.getByText("Merino Beanie")).toBeInTheDocument();

      // Neck warmth category
      expect(screen.getByText("Neck")).toBeInTheDocument();
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

      // Torso clo display: current / target
      expect(screen.getByText("1.7/1.5 clo")).toBeInTheDocument();

      // Legs clo display: current / target
      expect(screen.getByText("0.3/1.3 clo")).toBeInTheDocument();
    });

    it("should include generic layer clo in the body-part progress bar", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.getByText("0.3/1.3 clo")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Use Generic Outer" }));

      expect(screen.getByText("0.5/1.3 clo")).toBeInTheDocument();
    });

    it("should include generic layer clo in global total clo and thermal summary", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.getByText("You 1.7 clo")).toBeInTheDocument();
      expect(screen.getByText("Significantly under-insulated (+1.1 clo needed).")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Use Generic Outer" }));

      expect(screen.getByText("You 1.9 clo")).toBeInTheDocument();
      expect(screen.getByText(/Significantly under-insulated \(\+0\.[89] clo needed\)\./)).toBeInTheDocument();
    });

    it("should not suggest generic torso layers when torso is already near target", () => {
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

      expect(screen.queryByRole("button", { name: "Use Generic Mid" })).not.toBeInTheDocument();
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
      expect(screen.getByText("0.4/0.6 clo")).toBeInTheDocument();
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
          downhill: { min: 2.1, neutral: 2.6 },
          downhill_target_range: [2.2, 2.8] as [number, number],
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
      expect(screen.getByText("Climb: In target range")).toBeInTheDocument();
      expect(screen.getByText("Descent: In target range")).toBeInTheDocument();
      expect(screen.getByText("You're in range on climb, in range on descent.")).toBeInTheDocument();
      expect(screen.getByText("Current setup: 1.7 clo · Descent with pack: 2.4 clo")).toBeInTheDocument();
      expect(screen.queryByText(/Climb Cold Risk/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Descent.*Risk/)).not.toBeInTheDocument();
      expect(screen.getByText("Descent Layer Plan")).toBeInTheDocument();
      expect(screen.getByText("Patagonia Nano Puff")).toBeInTheDocument();
      expect(screen.getByText("Descent target insulation: 2.2-2.8 clo")).toBeInTheDocument();
      expect(screen.getByText("Total additional packed layer weight: 320 g")).toBeInTheDocument();
    });

    it("should show descent overheating risk card when descent clo exceeds target", () => {
      const overheatedDescentData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          downhill: { min: 1.2, neutral: 1.6 },
          downhill_target_range: [1.2, 1.6] as [number, number],
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

      // total_clo 1.7 + pack 0.7 + no helmet = 2.4 descent clo vs 1.6 max target → over by 0.8
      expect(screen.getByText("Descent Risk")).toBeInTheDocument();
      expect(screen.getByText(/Descent Overheating Risk/)).toBeInTheDocument();
      expect(screen.getByText(/over-insulated/)).toBeInTheDocument();
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

      // total_clo 1.7 + pack 0.2 + no helmet = 1.9 descent clo vs 3.0 min target → short by 1.1
      expect(screen.getAllByText("Descent Risk").length).toBeGreaterThan(0);
      expect(screen.getByText(/Descent Cold Risk/)).toBeInTheDocument();
      expect(screen.getByText(/under-insulated/)).toBeInTheDocument();
    });

    it("should warn and show suggested gear when descent insulation is insufficient", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.includes("/api/wardrobe/available")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "g-down-1",
                  type: "garment",
                  brand: "Arc'teryx",
                  model_name: "Atom Hoody",
                  category: "insulation_synthetic",
                  garment_type: "jacket",
                  rcl_clo: 0.6,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("/api/wardrobe/gear")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ items: [] }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      });



      const descentGapData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [1.5, 2.0] as [number, number],
          regional: {
            min: { torso: 1.0, arms: 0.8, legs: 0.1 },
            neutral: { torso: 1.5, arms: 1.2, legs: 0.2 },
          },
          downhill: { min: 2.6, neutral: 3.0 },
          downhill_target_range: [2.6, 3.0] as [number, number],
        },
        recommendation: {
          ...mockBiophysicsData.recommendation,
          ensemble_properties: {
            ...mockBiophysicsData.recommendation.ensemble_properties,
            total_clo: 1.7,
            regional_clo: { torso: 1.7, arms: 1.2, legs: 0.25 },
          },
        },
        pack_items: {
          garments: [
            {
              id: "pack-2",
              name: "Light Wind Shell",
              weight_g: 120,
              rcl_clo: 0.3,
            },
          ],
          total_weight_g: 120,
        },
        warnings: [],
      };

      try {
        render(
          <LayerDisplay
            activity="backcountry_skiing"
            recommendation={null}
            temperature={15}
            windspeed={10}
            biophysicsData={descentGapData}
          />
        );

        expect(screen.getByText("Descent Warning")).toBeInTheDocument();
        expect(screen.getAllByText("Descent Risk").length).toBeGreaterThan(0);
        expect(screen.getByText("Current: 2.0 clo")).toBeInTheDocument();
        expect(screen.getByText("Descent target: 2.6-3.0 clo (+0.6 needed)")).toBeInTheDocument();
        expect(await screen.findByText("Suggested Gear To Buy")).toBeInTheDocument();
        expect(await screen.findByText("Arc'teryx Atom Hoody")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Add descent layer" })).toHaveAttribute("href", "/wardrobe");
      } finally {
        fetchMock.mockRestore();

      }
    });

    it("should prominently recommend updating wardrobe when insulation is insufficient", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.includes("/api/wardrobe/available")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "g-owned",
                  type: "garment",
                  brand: "Owned",
                  model_name: "Mega Mid",
                  category: "mid_layer_heavy",
                  garment_type: "jacket",
                  rcl_clo: 0.6,
                },
                {
                  id: "g-torso",
                  type: "garment",
                  brand: "Patagonia",
                  model_name: "Nano-Air Hoody",
                  category: "insulation_synthetic",
                  garment_type: "jacket",
                  rcl_clo: 0.55,
                },
                {
                  id: "g-legs",
                  type: "garment",
                  brand: "Craft",
                  model_name: "Thermal Tights",
                  category: "base_layer",
                  garment_type: "pants",
                  rcl_clo: 0.32,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("/api/wardrobe/gear")) {
          return new Response(
            JSON.stringify({
              items: [{ item_id: "g-owned" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(JSON.stringify({ items: [] }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      });



      const insufficientWardrobeData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [1.7, 2.2] as [number, number],
        },
        recommendation: {
          ...mockBiophysicsData.recommendation,
          ensemble_properties: {
            ...mockBiophysicsData.recommendation.ensemble_properties,
            total_clo: 1.1,
          },
        },
        warnings: ["Insufficient overall insulation: 1.1 clo vs 1.7 clo required"],
      };

      try {
        render(
          <LayerDisplay
            recommendation={null}
            temperature={15}
            windspeed={10}
            biophysicsData={insufficientWardrobeData}
          />
        );

        expect(screen.getByText("Improve Wardrobe")).toBeInTheDocument();
        expect(screen.getByText("Insufficient overall insulation: 1.1 clo vs 1.7 clo required")).toBeInTheDocument();
        expect(await screen.findByText("Suggested Gear To Buy")).toBeInTheDocument();
        expect(await screen.findByText("Patagonia Nano-Air Hoody")).toBeInTheDocument();
        expect(screen.queryByText("Craft Thermal Tights")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /show suggestions/i })).toBeInTheDocument();
        expect(screen.queryByText("Owned Mega Mid")).not.toBeInTheDocument();

        const updateLink = screen.getByRole("link", { name: "Update Wardrobe" });
        expect(updateLink).toHaveAttribute("href", "/wardrobe");
      } finally {
        fetchMock.mockRestore();

      }
    });

    it("should prioritize clo-fit over layer category when recommending purchase items", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();

        if (url.includes("/api/wardrobe/available")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "g-overshoot",
                  type: "garment",
                  brand: "WarmCo",
                  model_name: "Heavy Mid",
                  category: "mid_layer_heavy",
                  garment_type: "jacket",
                  rcl_clo: 1.2,
                },
                {
                  id: "g-close",
                  type: "garment",
                  brand: "FitCo",
                  model_name: "Close Match",
                  category: "soft_shell",
                  garment_type: "jacket",
                  rcl_clo: 0.42,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url.includes("/api/wardrobe/gear")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ items: [] }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      });



      const insufficientWardrobeData = {
        ...mockBiophysicsData,
        ireq: {
          ...mockBiophysicsData.ireq,
          target_range: [1.5, 2.0] as [number, number],
        },
        recommendation: {
          ...mockBiophysicsData.recommendation,
          ensemble_properties: {
            ...mockBiophysicsData.recommendation.ensemble_properties,
            total_clo: 1.1,
          },
        },
        warnings: ["Insufficient overall insulation: 1.1 clo vs 1.5 clo required"],
      };

      try {
        render(
          <LayerDisplay
            recommendation={null}
            temperature={20}
            windspeed={5}
            biophysicsData={insufficientWardrobeData}
          />
        );

        expect(await screen.findByText("Suggested Gear To Buy")).toBeInTheDocument();
        expect(await screen.findByText("FitCo Close Match")).toBeInTheDocument();
      } finally {
        fetchMock.mockRestore();

      }
    });

    it("should not show wardrobe gap alert when insulation warning is absent and regional targets are met", () => {
      const noGapData = {
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
          biophysicsData={noGapData}
        />
      );

      expect(screen.queryByText("Improve Wardrobe")).not.toBeInTheDocument();
    });
  });
});

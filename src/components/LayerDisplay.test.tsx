import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LayerDisplay from "./LayerDisplay";

const mockRecommendation = {
  torso: {
    base: ["Wool base layer"],
    mid: ["Fleece jacket"],
    outer: ["Insulated jacket"],
  },
  legs: {
    base: ["Thermal pants"],
    outer: ["Ski pants"],
  },
  hands: {
    base: ["Liner gloves"],
    outer: ["Ski gloves"],
  },
  headNeck: {
    base: ["Balaclava"],
    outer: ["Helmet"],
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

      const baseLabels = screen.getAllByText("Base:");
      const midLabels = screen.getAllByText("Mid:");
      const outerLabels = screen.getAllByText("Outer:");

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
    it("should show wardrobe link when all layers are empty", () => {
      const emptyRecommendation = {
        torso: { base: [], outer: [] },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={emptyRecommendation} temperature={25} windspeed={10} />);

      // Should show "Add X items in wardrobe" links for each body part
      expect(screen.getByText("Add torso items in wardrobe")).toBeInTheDocument();
      expect(screen.getByText("Add legs items in wardrobe")).toBeInTheDocument();
      expect(screen.getByText("Add hands items in wardrobe")).toBeInTheDocument();
      expect(screen.getByText("Add head/neck items in wardrobe")).toBeInTheDocument();
    });

    it("should not show mid layer label when mid is not present", () => {
      const noMidRecommendation = {
        torso: { base: ["Base layer"], outer: ["Outer layer"] },
        legs: { base: ["Base layer"], outer: ["Outer layer"] },
        hands: { base: ["Base layer"], outer: ["Outer layer"] },
        headNeck: { base: ["Base layer"], outer: ["Outer layer"] },
      };

      render(<LayerDisplay recommendation={noMidRecommendation} temperature={25} windspeed={10} />);
      expect(screen.queryByText("Mid:")).not.toBeInTheDocument();
    });

    it("should not show mid layer label when mid is empty array", () => {
      const emptyMidRecommendation = {
        torso: { base: ["Base layer"], mid: [], outer: ["Outer layer"] },
        legs: { base: ["Base layer"], mid: [], outer: ["Outer layer"] },
        hands: { base: ["Base layer"], mid: [], outer: ["Outer layer"] },
        headNeck: { base: ["Base layer"], mid: [], outer: ["Outer layer"] },
      };

      render(<LayerDisplay recommendation={emptyMidRecommendation} temperature={25} windspeed={10} />);
      expect(screen.queryByText("Mid:")).not.toBeInTheDocument();
    });
  });

  describe("multiple items in a layer", () => {
    it("should join multiple items with commas", () => {
      const multiItemRecommendation = {
        torso: {
          base: ["Item 1", "Item 2", "Item 3"],
          outer: ["Outer item"],
        },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={multiItemRecommendation} temperature={25} windspeed={10} />);
      expect(screen.getByText("Item 1, Item 2, Item 3")).toBeInTheDocument();
    });
  });

  describe("weather display", () => {
    it("should display temperature with icon", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("25°F")).toBeInTheDocument();
    });

    it("should display wind speed with icon", () => {
      render(<LayerDisplay {...defaultProps} />);
      expect(screen.getByText("10 mph")).toBeInTheDocument();
    });

    it("should display different temperature values", () => {
      render(<LayerDisplay {...defaultProps} temperature={-5} />);
      expect(screen.getByText("-5°F")).toBeInTheDocument();
    });

    it("should display different wind speed values", () => {
      render(<LayerDisplay {...defaultProps} windspeed={35} />);
      expect(screen.getByText("35 mph")).toBeInTheDocument();
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
      expect(screen.getByText("15°F")).toBeInTheDocument();
      expect(screen.getByText("10 mph")).toBeInTheDocument();
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

      // Torso garments with clo values
      expect(screen.getByText(/Merino Base Layer \(0\.35 clo\)/)).toBeInTheDocument();
      expect(screen.getByText(/Down Puffy \(1\.20 clo\)/)).toBeInTheDocument();
      expect(screen.getByText(/Gore-Tex Shell \(0\.15 clo\)/)).toBeInTheDocument();

      // Legs garments with clo values
      expect(screen.getByText(/Thermal Tights \(0\.25 clo\)/)).toBeInTheDocument();
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

      expect(screen.getByText(/Hestra Insulated Gloves \(0\.65 clo\)/)).toBeInTheDocument();
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
      expect(screen.getByText("Helmet:")).toBeInTheDocument();
      expect(screen.getByText(/Smith Vantage \(0\.15 clo\)/)).toBeInTheDocument();

      // Head warmth category
      expect(screen.getByText("Head:")).toBeInTheDocument();
      expect(screen.getByText(/Merino Beanie \(0\.25 clo\)/)).toBeInTheDocument();

      // Neck warmth category
      expect(screen.getByText("Neck:")).toBeInTheDocument();
      expect(screen.getByText(/Buff Neck Gaiter \(0\.12 clo\)/)).toBeInTheDocument();
    });

    it("should display regional clo targets", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Torso clo display: current / target
      expect(screen.getByText("1.70 / 1.50 clo")).toBeInTheDocument();

      // Legs clo display: current / target
      expect(screen.getByText("0.25 / 1.30 clo")).toBeInTheDocument();
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
      const baseLabels = screen.getAllByText("Base:");
      const midLabels = screen.getAllByText("Mid:");
      const outerLabels = screen.getAllByText("Outer:");

      expect(baseLabels.length).toBeGreaterThan(0);
      expect(midLabels.length).toBeGreaterThan(0);
      expect(outerLabels.length).toBeGreaterThan(0);
    });

    it("should display biophysics score", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      // Score of 85 should display "Excellent" status via ScoreDisplay component
      expect(screen.getByText("Excellent")).toBeInTheDocument();
    });

    it("should display guidance tips when available", () => {
      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={mockBiophysicsData}
        />
      );

      expect(screen.getByText("Tips")).toBeInTheDocument();
      expect(screen.getByText("Layer up for the chairlift")).toBeInTheDocument();
    });

    it("should display warnings when present", () => {
      const biophysicsWithWarnings = {
        ...mockBiophysicsData,
        warnings: ["Insufficient overall insulation for conditions"],
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={biophysicsWithWarnings}
        />
      );

      expect(screen.getByText("Insufficient overall insulation for conditions")).toBeInTheDocument();
    });

    it("should display human-friendly insulation warning with clo values", () => {
      const biophysicsWithCloWarning = {
        ...mockBiophysicsData,
        warnings: ["Insufficient overall insulation: 0.2 clo vs 1.6 clo required"],
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={biophysicsWithCloWarning}
        />
      );

      // Should show human-friendly primary message (>70% deficit)
      expect(screen.getByText("You're significantly under-insulated for these conditions")).toBeInTheDocument();
      // Should show actionable suggestion
      expect(screen.getByText("Add a midlayer and consider warmer base layers")).toBeInTheDocument();
      // Should show technical details in smaller text
      expect(screen.getByText(/Current: 0.2 clo/)).toBeInTheDocument();
      expect(screen.getByText(/Target: 1.6 clo/)).toBeInTheDocument();
    });

    it("should display moderate insulation warning for smaller deficit", () => {
      const biophysicsWithModerateWarning = {
        ...mockBiophysicsData,
        warnings: ["Insufficient overall insulation: 0.8 clo vs 1.5 clo required"],
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={biophysicsWithModerateWarning}
        />
      );

      // Should show moderate message (40-70% deficit)
      expect(screen.getByText("You'll likely feel cold without more layers")).toBeInTheDocument();
      expect(screen.getByText("Add a midlayer to improve warmth")).toBeInTheDocument();
    });

    it("should display mild insulation warning for small deficit", () => {
      const biophysicsWithMildWarning = {
        ...mockBiophysicsData,
        warnings: ["Insufficient overall insulation: 1.3 clo vs 1.5 clo required"],
      };

      render(
        <LayerDisplay
          recommendation={null}
          temperature={15}
          windspeed={10}
          biophysicsData={biophysicsWithMildWarning}
        />
      );

      // Should show mild message (<40% deficit)
      expect(screen.getByText("Consider adding a bit more insulation")).toBeInTheDocument();
      expect(screen.getByText("A light midlayer or warmer base would help")).toBeInTheDocument();
    });
  });
});

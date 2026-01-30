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
    it("should show None when all layers are empty", () => {
      const emptyRecommendation = {
        torso: { base: [], outer: [] },
        legs: { base: [], outer: [] },
        hands: { base: [], outer: [] },
        headNeck: { base: [], outer: [] },
      };

      render(<LayerDisplay recommendation={emptyRecommendation} temperature={25} windspeed={10} />);
      const noneTexts = screen.getAllByText("None");
      expect(noneTexts).toHaveLength(4);
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
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivitySelection from "./ActivitySelection";

// Mock next/navigation for components that use PageLayout -> AppNavigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("ActivitySelection", () => {
  describe("rendering", () => {
    it("should render the carousel", () => {
      render(<ActivitySelection value="running" onChange={vi.fn()} />);
      expect(screen.getByRole("region", { name: "" })).toHaveAttribute(
        "aria-roledescription",
        "carousel"
      );
    });

    it("should render all activity slides", () => {
      render(<ActivitySelection value="running" onChange={vi.fn()} />);
      const slides = screen.getAllByRole("group");
      expect(slides).toHaveLength(6);
    });

    it("should show activity names", () => {
      render(<ActivitySelection value="running" onChange={vi.fn()} />);
      expect(screen.getByText("Running")).toBeInTheDocument();
      expect(screen.getByText("Biking")).toBeInTheDocument();
      expect(screen.getByText("Hiking / Snowshoeing")).toBeInTheDocument();
      expect(screen.getByText("Backcountry Skiing")).toBeInTheDocument();
      expect(screen.getByText("Alpine Skiing")).toBeInTheDocument();
      expect(screen.getByText("XC Skiing")).toBeInTheDocument();
    });

    it("should render pagination dots", () => {
      render(<ActivitySelection value="running" onChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: /select running/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select biking/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select alpine skiing/i })).toBeInTheDocument();
    });
  });

  describe("interaction", () => {
    it("should call onChange when a pagination dot is clicked", async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      render(<ActivitySelection value="running" onChange={mockOnChange} />);

      await user.click(screen.getByRole("button", { name: /select biking/i }));

      expect(mockOnChange).toHaveBeenCalledWith("biking");
    });

    it("should call onChange when clicking on an activity card", async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      render(<ActivitySelection value="running" onChange={mockOnChange} />);

      const slides = screen.getAllByRole("group");
      const bikingSlide = slides[1];
      const card = within(bikingSlide).getByText("Biking").closest("[data-slot='card']");

      await user.click(card!);

      expect(mockOnChange).toHaveBeenCalledWith("biking");
    });
  });

  describe("initial value", () => {
    it("should start at the correct activity based on value prop", () => {
      render(<ActivitySelection value="alpine-skiing" onChange={vi.fn()} />);

      const slides = screen.getAllByRole("group");
      const alpineSlide = slides[4];
      const card = within(alpineSlide).getByText("Alpine Skiing").closest("[data-slot='card']");

      expect(card).toHaveClass("scale-110");
    });

    it("should highlight first activity when value is running", () => {
      render(<ActivitySelection value="running" onChange={vi.fn()} />);

      const slides = screen.getAllByRole("group");
      const runningSlide = slides[0];
      const card = within(runningSlide).getByText("Running").closest("[data-slot='card']");

      expect(card).toHaveClass("scale-110");
    });
  });
});

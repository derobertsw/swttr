import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import ActivitySelection from "./ActivitySelection";

// Mock next/navigation for components that use PageLayout -> AppNavigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("ActivitySelection", () => {
  const renderSelection = (
    overrides?: Partial<ComponentProps<typeof ActivitySelection>>
  ) =>
    render(
      <ActivitySelection
        value="running"
        onChange={vi.fn()}
        exertion="moderate"
        onExertionChange={vi.fn()}
        {...overrides}
      />
    );

  describe("rendering", () => {
    it("should render the carousel", () => {
      renderSelection();
      expect(screen.getByRole("region", { name: /activity carousel/i })).toHaveAttribute(
        "aria-roledescription",
        "carousel"
      );
    });

    it("should render all activity slides", () => {
      renderSelection();
      const slides = screen.getAllByRole("group");
      expect(slides).toHaveLength(6);
    });

    it("should show activity names", () => {
      renderSelection();
      expect(screen.getByRole("radio", { name: /running/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /biking/i })).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /hiking \/ snowshoeing/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /backcountry skiing/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /alpine skiing/i })
      ).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /xc skiing/i })).toBeInTheDocument();
    });

    it("should render pagination dots", () => {
      renderSelection();
      expect(screen.getByRole("button", { name: /select running/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select biking/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /select alpine skiing/i })).toBeInTheDocument();
    });

    it("should render exertion selector", () => {
      renderSelection();
      expect(screen.getByRole("radiogroup", { name: /effort level/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /easy/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /moderate/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /hard/i })).toBeInTheDocument();
      expect(screen.getAllByText("Moderate").length).toBeGreaterThan(0);
    });
  });

  describe("interaction", () => {
    it("should not call onChange on initial render", () => {
      const mockOnChange = vi.fn();
      renderSelection({ onChange: mockOnChange });

      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should call onChange when a pagination dot is clicked", async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      renderSelection({ onChange: mockOnChange });

      await user.click(screen.getByRole("button", { name: /select biking/i }));

      expect(mockOnChange).toHaveBeenCalledWith("biking");
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("should call onChange when clicking on an activity card", async () => {
      const mockOnChange = vi.fn();
      const user = userEvent.setup();
      renderSelection({ onChange: mockOnChange });

      const slides = screen.getAllByRole("group");
      const bikingSlide = slides[1];
      const card = within(bikingSlide).getByRole("radio", { name: /biking/i });

      await user.click(card);

      expect(mockOnChange).toHaveBeenCalledWith("biking");
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("should call onExertionChange when exertion option is clicked", async () => {
      const mockOnExertionChange = vi.fn();
      const user = userEvent.setup();
      renderSelection({ onExertionChange: mockOnExertionChange });

      await user.click(screen.getByRole("radio", { name: /hard/i }));

      expect(mockOnExertionChange).toHaveBeenCalledWith("hard");
    });
  });

  describe("initial value", () => {
    it("should start at the correct activity based on value prop", () => {
      renderSelection({ value: "alpine_skiing" });

      const slides = screen.getAllByRole("group");
      const alpineSlide = slides[4];
      const card = within(alpineSlide).getByRole("radio", { name: /alpine skiing/i });

      expect(card).toHaveClass("scale-110");
    });

    it("should highlight first activity when value is running", () => {
      renderSelection();

      const slides = screen.getAllByRole("group");
      const runningSlide = slides[0];
      const card = within(runningSlide).getByRole("radio", { name: /running/i });

      expect(card).toHaveClass("scale-110");
    });
  });
});

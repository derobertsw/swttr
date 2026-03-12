import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import ActivitySelection from "./ActivitySelection";
import type { ExertionLevel } from "@/lib/biophysics/exertion";

// Mock next/navigation for components that use PageLayout -> AppNavigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("ActivitySelection", () => {
  const ControlledSelection = ({
    value = "running",
    exertion = "moderate",
    onChange = vi.fn(),
    onExertionChange = vi.fn(),
  }: {
    value?: string;
    exertion?: ExertionLevel;
    onChange?: (value: string) => void;
    onExertionChange?: (value: ExertionLevel) => void;
  }) => {
    const [selectedValue, setSelectedValue] = React.useState(value);
    const [selectedExertion, setSelectedExertion] = React.useState(exertion);

    return (
      <ActivitySelection
        value={selectedValue}
        onChange={(nextValue) => {
          setSelectedValue(nextValue);
          onChange(nextValue);
        }}
        exertion={selectedExertion}
        onExertionChange={(nextExertion) => {
          setSelectedExertion(nextExertion);
          onExertionChange(nextExertion);
        }}
      />
    );
  };

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
      const activityGroup = screen.getByRole("radiogroup", { name: /^activity$/i });
      expect(within(activityGroup).getByRole("radio", { name: /running/i })).toBeInTheDocument();
      expect(within(activityGroup).getByRole("radio", { name: /biking/i })).toBeInTheDocument();
      expect(
        within(activityGroup).getByRole("radio", { name: /hiking \/ snowshoeing/i })
      ).toBeInTheDocument();
      expect(
        within(activityGroup).getByRole("radio", { name: /backcountry skiing/i })
      ).toBeInTheDocument();
      expect(
        within(activityGroup).getByRole("radio", { name: /alpine skiing/i })
      ).toBeInTheDocument();
      expect(within(activityGroup).getByRole("radio", { name: /xc skiing/i })).toBeInTheDocument();
    });

    it("should render pagination dots", () => {
      renderSelection();
      expect(screen.getByRole("radiogroup", { name: /activity shortcuts/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /select running/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /select biking/i })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: /select alpine skiing/i })).toBeInTheDocument();
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

      await user.click(screen.getByRole("radio", { name: /select biking/i }));

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

    it("should sync to an updated value prop without echoing onChange", async () => {
      const mockOnChange = vi.fn();
      const { rerender } = renderSelection({ onChange: mockOnChange });

      rerender(
        <ActivitySelection
          value="biking"
          onChange={mockOnChange}
          exertion="moderate"
          onExertionChange={vi.fn()}
        />
      );

      await waitFor(() => {
        const activityGroup = screen.getByRole("radiogroup", { name: /^activity$/i });
        expect(
          within(activityGroup).getByRole("radio", { name: /biking/i })
        ).toHaveAttribute("aria-checked", "true");
      });
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should move focus to the newly selected activity when using arrow keys", async () => {
      const user = userEvent.setup();
      renderSelection();

      const activityGroup = screen.getByRole("radiogroup", { name: /^activity$/i });
      const runningCard = within(activityGroup).getByRole("radio", { name: /running/i });

      await user.tab();
      expect(runningCard).toHaveFocus();

      await user.keyboard("{ArrowRight}");

      const bikingCard = within(activityGroup).getByRole("radio", { name: /biking/i });
      expect(bikingCard).toHaveAttribute("aria-checked", "true");
      expect(bikingCard).toHaveFocus();
    });

    it("should move focus to the newly selected shortcut when using arrow keys", async () => {
      const user = userEvent.setup();
      renderSelection();

      const runningShortcut = screen.getByRole("radio", { name: /select running/i });
      runningShortcut.focus();
      expect(runningShortcut).toHaveFocus();

      await user.keyboard("{ArrowRight}");

      const bikingShortcut = screen.getByRole("radio", { name: /select biking/i });
      expect(bikingShortcut).toHaveAttribute("aria-checked", "true");
      expect(bikingShortcut).toHaveFocus();
    });

    it("should move focus through exertion options with arrow keys", async () => {
      const user = userEvent.setup();
      const mockOnExertionChange = vi.fn();

      render(
        <ControlledSelection onExertionChange={mockOnExertionChange} />
      );

      const moderateButton = screen.getByRole("radio", { name: /moderate/i });
      moderateButton.focus();
      expect(moderateButton).toHaveFocus();

      await user.keyboard("{ArrowRight}");

      const hardButton = screen.getByRole("radio", { name: /hard/i });
      expect(hardButton).toHaveAttribute("aria-checked", "true");
      expect(hardButton).toHaveFocus();
      expect(mockOnExertionChange).toHaveBeenCalledWith("hard");
    });
  });

  describe("initial value", () => {
    it("should start at the correct activity based on value prop", () => {
      renderSelection({ value: "alpine_skiing" });

      const slides = screen.getAllByRole("group");
      const alpineSlide = slides[4];
      const card = within(alpineSlide).getByRole("radio", { name: /alpine skiing/i });

      expect(card).toHaveAttribute("aria-checked", "true");
    });

    it("should highlight first activity when value is running", () => {
      renderSelection();

      const slides = screen.getAllByRole("group");
      const runningSlide = slides[0];
      const card = within(runningSlide).getByRole("radio", { name: /running/i });

      expect(card).toHaveAttribute("aria-checked", "true");
    });
  });
});

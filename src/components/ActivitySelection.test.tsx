import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import ActivitySelection from "./ActivitySelection";
import type { ExertionLevel } from "@/lib/biophysics/exertion";

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

  const renderSelection = (overrides?: Partial<ComponentProps<typeof ActivitySelection>>) =>
    render(
      <ActivitySelection
        value="running"
        onChange={vi.fn()}
        exertion="moderate"
        onExertionChange={vi.fn()}
        {...overrides}
      />
    );

  const activityGroup = () => screen.getByRole("radiogroup", { name: "Activity" });

  it("shows all six activities at once, with the chosen one checked", () => {
    renderSelection({ value: "alpine_skiing" });

    const activities = within(activityGroup()).getAllByRole("radio");
    expect(activities.map((radio) => radio.textContent)).toEqual([
      "Running",
      "Biking",
      "Hiking / Snowshoeing",
      "Backcountry Skiing",
      "Alpine Skiing",
      "XC Skiing",
    ]);
    expect(within(activityGroup()).getByRole("radio", { name: "Alpine Skiing" })).toBeChecked();
    // Only the chosen activity is in the tab order.
    expect(activities.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  });

  it("shows the effort levels with the chosen level's description", () => {
    renderSelection({ exertion: "hard" });

    const effort = screen.getByRole("radiogroup", { name: "Effort" });
    expect(within(effort).getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "Easy",
      "Moderate",
      "Hard",
    ]);
    expect(within(effort).getByRole("radio", { name: "Hard" })).toBeChecked();
    expect(effort).toHaveAccessibleDescription(/./);
  });

  it("calls onChange when another activity is clicked, and not for the chosen one", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderSelection({ onChange });

    await user.click(within(activityGroup()).getByRole("radio", { name: "Running" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(within(activityGroup()).getByRole("radio", { name: "Biking" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("biking");
  });

  it("calls onExertionChange when an effort level is clicked", async () => {
    const onExertionChange = vi.fn();
    const user = userEvent.setup();
    renderSelection({ onExertionChange });

    await user.click(screen.getByRole("radio", { name: "Hard" }));

    expect(onExertionChange).toHaveBeenCalledWith("hard");
  });

  it("follows an updated value without echoing onChange", () => {
    const onChange = vi.fn();
    const { rerender } = renderSelection({ onChange });

    rerender(
      <ActivitySelection value="biking" onChange={onChange} exertion="moderate" onExertionChange={vi.fn()} />
    );

    expect(within(activityGroup()).getByRole("radio", { name: "Biking" })).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("selects and focuses the next activity with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSelection onChange={onChange} />);

    await user.tab();
    expect(within(activityGroup()).getByRole("radio", { name: "Running" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    const biking = within(activityGroup()).getByRole("radio", { name: "Biking" });
    expect(biking).toBeChecked();
    expect(biking).toHaveFocus();

    await user.keyboard("{ArrowUp}{ArrowUp}");
    const xc = within(activityGroup()).getByRole("radio", { name: "XC Skiing" });
    expect(xc).toBeChecked();
    expect(xc).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("xc_skiing");
  });

  it("moves through the effort levels with the arrow keys", async () => {
    const user = userEvent.setup();
    const onExertionChange = vi.fn();
    render(<ControlledSelection onExertionChange={onExertionChange} />);

    screen.getByRole("radio", { name: "Moderate" }).focus();
    await user.keyboard("{ArrowRight}");

    const hard = screen.getByRole("radio", { name: "Hard" });
    expect(hard).toBeChecked();
    expect(hard).toHaveFocus();
    expect(onExertionChange).toHaveBeenCalledWith("hard");
  });
});

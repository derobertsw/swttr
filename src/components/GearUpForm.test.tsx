import { createRef, useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GearUpForm } from "./GearUpForm";
import type { InputMode } from "@/lib/gearUp";
import type { LocationSuggestion } from "@/types/recommendations";

const SYDNEY: LocationSuggestion = {
  id: 2147714,
  name: "Sydney",
  region: "New South Wales",
  country: "Australia",
  latitude: -33.87,
  longitude: 151.21,
  timeZone: "Australia/Sydney",
};

type Props = ComponentProps<typeof GearUpForm>;

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    formRef: createRef(),
    activity: "alpine_skiing",
    onActivityChange: vi.fn(),
    activityInitializing: false,
    exertion: "moderate",
    onExertionChange: vi.fn(),
    location: "",
    locationQuery: "",
    suggestions: [],
    showSuggestions: false,
    selectedLocation: null,
    isSearching: false,
    suggestionRef: createRef(),
    onLocationInputChange: vi.fn(),
    onLocationFocus: vi.fn(),
    onSelectLocation: vi.fn(),
    onDismissSuggestions: vi.fn(),
    locationStatus: "idle",
    onUseMyLocation: vi.fn(),
    onCancelLocating: vi.fn(),
    inputMode: "now",
    onInputModeChange: vi.fn(),
    date: undefined,
    onDateChange: vi.fn(),
    time: "12:00",
    onTimeChange: vi.fn(),
    durationDays: 1,
    onDurationDaysChange: vi.fn(),
    showFieldErrors: false,
    loading: false,
    onSubmit: vi.fn(),
    ...overrides,
  };
}

/** The form with its own Now/Later and day count, like the page keeps them. */
function StatefulForm(overrides: Partial<Props>) {
  const [inputMode, setInputMode] = useState<InputMode>(overrides.inputMode ?? "now");
  const [durationDays, setDurationDays] = useState(overrides.durationDays ?? 1);
  return (
    <GearUpForm
      {...baseProps(overrides)}
      inputMode={inputMode}
      onInputModeChange={setInputMode}
      durationDays={durationDays}
      onDurationDaysChange={setDurationDays}
    />
  );
}

describe("GearUpForm", () => {
  it("asks for activity, effort and place, and for a date only after Later", async () => {
    const user = userEvent.setup();
    render(<StatefulForm />);

    expect(within(screen.getByRole("radiogroup", { name: "Activity" })).getAllByRole("radio")).toHaveLength(6);
    expect(screen.getByRole("radiogroup", { name: "Effort" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Where?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use my location" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Now" })).toBeChecked();
    expect(screen.queryByLabelText("Start time")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my layers" })).toHaveAttribute("type", "submit");

    await user.click(screen.getByRole("radio", { name: "Later" }));

    expect(screen.getByRole("button", { name: /^Start date/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Start time")).toHaveValue("12:00");
    expect(screen.getByRole("radio", { name: "One day" })).toBeChecked();
    expect(screen.getByText(/forecast for the hour you start/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my layers" })).toBeInTheDocument();
  });

  it("builds a plan for two to seven days, keeping the count when Several days is pressed again", async () => {
    const user = userEvent.setup();
    render(<StatefulForm inputMode="later" />);

    await user.click(screen.getByRole("radio", { name: "Several days" }));
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByText(/from 6 am to 9 pm/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build my plan" })).toBeInTheDocument();

    const more = screen.getByRole("button", { name: "More days" });
    for (let i = 0; i < 5; i++) await user.click(more);
    expect(screen.getByText("7 days")).toBeInTheDocument();
    // At the limit, the button stays where focus is and does nothing.
    expect(more).toHaveAttribute("aria-disabled", "true");
    expect(more).toHaveFocus();

    await user.click(screen.getByRole("radio", { name: "Several days" }));
    expect(screen.getByText("7 days")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "One day" }));
    expect(screen.queryByRole("group", { name: "Number of days" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my layers" })).toBeInTheDocument();
  });

  it("selects the next activity and When with the arrow keys", async () => {
    const user = userEvent.setup();
    const onActivityChange = vi.fn();
    render(<StatefulForm onActivityChange={onActivityChange} />);

    await user.click(screen.getByRole("radio", { name: "Now" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Later" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Later" })).toBeChecked();

    screen.getByRole("radio", { name: "Alpine Skiing" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onActivityChange).toHaveBeenCalledWith("xc_skiing");
    expect(screen.getByRole("radio", { name: "XC Skiing" })).toHaveFocus();
  });

  it("says which fields are needed once submitted without them", () => {
    render(<GearUpForm {...baseProps({ inputMode: "later", time: "", showFieldErrors: true })} />);

    expect(screen.getByRole("combobox", { name: "Where?" })).toHaveAccessibleDescription(
      "Search for a place, or use your location."
    );
    expect(screen.getByRole("button", { name: /^Start date/ })).toHaveAccessibleDescription("Choose a start date.");
    expect(screen.getByLabelText("Start time")).toHaveAccessibleDescription("Enter a start time.");
  });

  it("names the request while it loads", () => {
    render(<GearUpForm {...baseProps({ inputMode: "later", durationDays: 3, loading: true })} />);

    expect(screen.getByRole("button", { name: "Building your plan…" })).toHaveAttribute("aria-busy", "true");
  });
});

describe("GearUpForm's start date calendar", () => {
  beforeEach(() => {
    // The device is in New York at 7:30 pm on Thursday, October 1, 2026,
    // when it's 9:30 am on Friday, October 2 in Sydney.
    vi.stubEnv("TZ", "America/New_York");
    vi.setSystemTime(new Date("2026-10-01T23:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const renderLater = (selectedLocation: LocationSuggestion | null) =>
    render(
      <GearUpForm
        {...baseProps({
          inputMode: "later",
          selectedLocation,
          location: selectedLocation ? "Sydney, New South Wales, Australia" : "",
        })}
      />
    );

  it("marks today at the chosen place", async () => {
    const user = userEvent.setup();
    renderLater(SYDNEY);

    await user.click(screen.getByRole("button", { name: "Start date Pick a date" }));

    expect(screen.getByRole("button", { name: /^Today, Friday, October 2nd, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thursday, October 1st, 2026" })).toBeInTheDocument();
  });

  it("marks the device's today until a place is chosen", async () => {
    const user = userEvent.setup();
    renderLater(null);

    await user.click(screen.getByRole("button", { name: "Start date Pick a date" }));

    expect(screen.getByRole("button", { name: /^Today, Thursday, October 1st, 2026/ })).toBeInTheDocument();
  });
});

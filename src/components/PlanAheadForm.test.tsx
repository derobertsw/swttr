import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanAheadForm } from "./PlanAheadForm";
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

function renderForm(selectedLocation: LocationSuggestion | null) {
  render(
    <PlanAheadForm
      date={undefined}
      time="12:00"
      durationDays={1}
      location={selectedLocation ? "Sydney, New South Wales, Australia" : ""}
      locationQuery=""
      suggestions={[]}
      showSuggestions={false}
      selectedLocation={selectedLocation}
      suggestionRef={createRef()}
      onDateChange={vi.fn()}
      onTimeChange={vi.fn()}
      onDurationDaysChange={vi.fn()}
      onSubmit={vi.fn()}
      locationStatus="idle"
      onCancelLocating={vi.fn()}
      onLocationInputChange={vi.fn()}
      onLocationFocus={vi.fn()}
      onSelectLocation={vi.fn()}
    />
  );
}

describe("PlanAheadForm's start date calendar", () => {
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

  it("marks today at the chosen place", async () => {
    const user = userEvent.setup();
    renderForm(SYDNEY);

    await user.click(screen.getByRole("button", { name: /pick start date/i }));

    expect(screen.getByRole("button", { name: /^Today, Friday, October 2nd, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thursday, October 1st, 2026" })).toBeInTheDocument();
  });

  it("marks the device's today until a place is chosen", async () => {
    const user = userEvent.setup();
    renderForm(null);

    await user.click(screen.getByRole("button", { name: /pick start date/i }));

    expect(screen.getByRole("button", { name: /^Today, Thursday, October 1st, 2026/ })).toBeInTheDocument();
  });
});

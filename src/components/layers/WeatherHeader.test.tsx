import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeatherHeader } from "./WeatherHeader";

describe("WeatherHeader", () => {
  it("renders a dedicated rain alert when it is raining", () => {
    const { container } = render(
      <WeatherHeader
        temperature={40}
        windspeed={11}
        precipitation
        precipitationType="rain"
      />
    );

    expect(screen.getByText("Rain right now")).toBeInTheDocument();
    expect(screen.getByText("Wet conditions: shell protection matters.")).toBeInTheDocument();
    expect(screen.getByText("Shell on")).toBeInTheDocument();
    expect(screen.getByText("Wind 11 mph")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-precipitation-state", "rain");
  });

  it("does not render the precipitation alert when conditions are dry", () => {
    const { container } = render(<WeatherHeader temperature={40} windspeed={11} precipitation={false} />);

    expect(screen.queryByText("Rain right now")).not.toBeInTheDocument();
    expect(screen.queryByText("Wet conditions: shell protection matters.")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-precipitation-state", "dry");
  });
});

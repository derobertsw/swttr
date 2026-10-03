import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultHeader } from "./ResultHeader";

describe("ResultHeader", () => {
  it("names the activity, effort and kind of advice", () => {
    render(<ResultHeader activity="xc_skiing" exertion="easy" adviceKind="general" temperature={20} windspeed={5} />);

    expect(screen.getByRole("heading", { name: "Your layers" })).toBeInTheDocument();
    expect(screen.getByText("XC Skiing")).toBeInTheDocument();
    expect(screen.getByText("Easy effort")).toBeInTheDocument();
    expect(screen.getByText("General guide")).toBeInTheDocument();
  });

  it("shows the conditions in one line, with the wind chill when it's colder than the air", () => {
    render(<ResultHeader temperature={20} windspeed={15} />);

    expect(screen.getByText("20°F")).toBeInTheDocument();
    expect(screen.getByText(/Feels like 6°/)).toBeInTheDocument();
    expect(screen.getByText("Wind 15 mph")).toBeInTheDocument();
  });

  it("leaves out feels-like when it matches the air temperature", () => {
    render(<ResultHeader temperature={60} windspeed={15} />);
    expect(screen.queryByText(/Feels like/)).not.toBeInTheDocument();
  });

  it.each([
    ["rain", "Raining now"],
    ["mixed", "Wintry mix now"],
    ["snow", "Snowing now"],
    [undefined, "Precipitation now"],
  ] as const)("says %s is falling now in current conditions", (precipitationType, label) => {
    render(
      <ResultHeader
        temperature={34}
        windspeed={10}
        precipitation
        precipitationType={precipitationType}
        context={{ source: "current" }}
      />
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("says nothing about precipitation when it's dry", () => {
    render(<ResultHeader temperature={40} windspeed={11} precipitation={false} />);
    expect(screen.queryByText(/now$|expected$/)).not.toBeInTheDocument();
  });

  describe("where and when", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("shows a forecast's hour on the place's clock, wherever the device is", () => {
      vi.stubEnv("TZ", "Asia/Tokyo");
      render(
        <ResultHeader
          temperature={41}
          windspeed={9}
          context={{
            source: "forecast",
            place: "Stowe, Vermont, United States",
            forecastTime: "2026-10-08T14:00-04:00",
            timeZone: "America/New_York",
          }}
        />
      );

      expect(screen.getByText("Forecast for Thu, Oct 8, 2:00 PM EDT")).toBeInTheDocument();
      expect(screen.getByText("Stowe, Vermont, United States")).toBeInTheDocument();
    });

    it("says forecast precipitation is expected, not happening now", () => {
      render(
        <ResultHeader
          temperature={40}
          windspeed={11}
          precipitation
          precipitationType="rain"
          context={{ source: "forecast", forecastTime: "2026-10-08T14:00-04:00", timeZone: "America/New_York" }}
        />
      );

      expect(screen.getByText("Rain expected")).toBeInTheDocument();
      expect(screen.queryByText("Raining now")).not.toBeInTheDocument();
    });

    it("labels current conditions at the device's location", () => {
      render(<ResultHeader temperature={40} windspeed={11} context={{ source: "current" }} />);

      expect(screen.getByText("Current conditions")).toBeInTheDocument();
      expect(screen.getByText("Your location")).toBeInTheDocument();
    });
  });

  it("offers Edit outing, the activity and Change place or time when each is supported", async () => {
    const onEditOuting = vi.fn();
    const onEditWeather = vi.fn();
    const onActivityChange = vi.fn(async () => {});
    const user = userEvent.setup();
    render(
      <ResultHeader
        activity="alpine_skiing"
        temperature={30}
        windspeed={5}
        onEditOuting={onEditOuting}
        onEditWeather={onEditWeather}
        onActivityChange={onActivityChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit outing" }));
    await user.click(screen.getByRole("button", { name: "Change place or time" }));
    await user.click(screen.getByRole("button", { name: "Alpine Skiing, change activity" }));
    await user.click(await screen.findByRole("button", { name: "Running" }));

    expect(onEditOuting).toHaveBeenCalledTimes(1);
    expect(onEditWeather).toHaveBeenCalledTimes(1);
    expect(onActivityChange).toHaveBeenCalledWith("running");
  });

  it("shows the activity without controls when nothing can change it", () => {
    render(<ResultHeader activity="running" temperature={30} windspeed={5} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

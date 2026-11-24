import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForecastPointLine, WeatherSourceDetails } from "./WeatherSourceDetails";
import type { WeatherProvenance } from "@/types/weather";

const BASE: WeatherProvenance = { provider: "Open-Meteo", units: { temperature: "fahrenheit", windSpeed: "mph" } };
const RESORT_POINT = { latitude: 43.6047, longitude: -72.8187, label: "Top of K-1 Express Gondola", resortId: "wd-Q14711916", elevationM: 1262, elevationSource: "requested" } as const;

describe("Forecast point with the weather (#7)", () => {
  it("names a resort's point and the elevation it was read at", () => {
    render(<ForecastPointLine point={RESORT_POINT} />);
    expect(screen.getByText("Forecast at Top of K-1 Express Gondola, 1,262 m (4,140 ft)")).toBeInTheDocument();
  });

  it("names a reference point without inventing an elevation", () => {
    render(<ForecastPointLine point={{ latitude: 1, longitude: 2, label: "Resort reference point", elevationSource: "terrain" }} />);
    expect(screen.getByText("Forecast at Resort reference point")).toBeInTheDocument();
  });

  it("adds nothing for an ordinary place", () => {
    const { container } = render(<ForecastPointLine point={{ latitude: 44.47, longitude: -72.69, elevationM: 431, elevationSource: "terrain" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says in the source details where the forecast was read and where its elevation came from", () => {
    const { rerender } = render(<WeatherSourceDetails provenance={{ ...BASE, point: RESORT_POINT }} />);
    expect(screen.getByText(/Forecast point: Top of K-1 Express Gondola, 43.6047, -72.8187, at 1,262 m \(4,140 ft\) \(the resort's mapped elevation\)\./)).toBeInTheDocument();
    rerender(<WeatherSourceDetails provenance={{ ...BASE, point: { latitude: 44.47, longitude: -72.69, elevationM: 431, elevationSource: "terrain" } }} />);
    expect(screen.getByText(/Forecast point: 44.47, -72.69, at 431 m \(1,414 ft\) \(the provider's terrain elevation\)\./)).toBeInTheDocument();
  });
});

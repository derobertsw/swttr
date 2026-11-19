import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExposureLimitDetails } from "./ExposureLimitDetails";
import type { ExposureLimit } from "@/types/biophysics";

const exposure: ExposureLimit = {
  method: "iso11079_dle_selected_ensemble_v1",
  basic_clo: 3.8,
  resultant_clo: 2.7,
  heat_debt_limit_kj_m2: 144,
  minimal: { skin_temp_c: 30, heat_storage_w_m2: 4.1, status: "no_heat_debt", dle_hours: null },
  neutral: { skin_temp_c: 33.7, heat_storage_w_m2: -14, status: "limited", dle_hours: 2.86 },
  outside_iso_range: [],
};

describe("ExposureLimitDetails", () => {
  it("shows each criterion the server reported, without a duration when there is no heat debt", () => {
    render(<ExposureLimitDetails phases={[{ label: "Climb", exposure }]} />);
    expect(screen.getByText("Exposure limit (ISO 11079 DLE)*")).toBeInTheDocument();
    expect(screen.getByText("Climb")).toBeInTheDocument();
    expect(screen.getByText("Not limited by whole-body cooling")).toBeInTheDocument();
    expect(screen.getByText("2.9 h")).toBeInTheDocument();
    expect(screen.getByText(/not\s+a time to a low core temperature, frostbite/)).toBeInTheDocument();
  });

  it("reports long limits as ISO 11079 does and flags extrapolation", () => {
    render(<ExposureLimitDetails phases={[{ exposure: {
      ...exposure,
      neutral: { ...exposure.neutral, status: "more_than_8_hours", dle_hours: 12.4 },
      outside_iso_range: ["metabolic_rate"],
    } }]} />);
    expect(screen.getByText("More than 8 h")).toBeInTheDocument();
    expect(screen.getByText(/outside ISO 11079's range \(metabolic rate\)/)).toBeInTheDocument();
  });

  it("renders nothing without an evaluated outfit", () => {
    const { container } = render(<ExposureLimitDetails phases={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, expect, it } from "vitest";
import { addDaysToDateString, planOutsideForecast } from "./forecastRange";

describe("addDaysToDateString", () => {
  it("crosses month and year ends", () => {
    expect(addDaysToDateString("2026-09-29", 3)).toBe("2026-10-02");
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateString("2026-10-01", -1)).toBe("2026-09-30");
  });
});

describe("planOutsideForecast", () => {
  // A forecast from Sep 27 to Oct 12.
  const outside = (startDate: string, durationDays: number) =>
    planOutsideForecast(startDate, durationDays, "2026-09-27", "2026-10-12");

  it("accepts plans inside the forecast, up to its last day", () => {
    expect(outside("2026-09-27", 7)).toBeNull();
    expect(outside("2026-10-10", 3)).toBeNull();
    expect(outside("2026-10-12", 1)).toBeNull();
  });

  it("says when a plan can start for one that ends after the forecast", () => {
    expect(outside("2026-10-10", 7)).toBe(
      "The forecast for this place covers Sep 27 to Oct 12. A 7-day plan can start from Sep 27 to Oct 6."
    );
  });

  it("says the same for a plan that starts before it", () => {
    expect(outside("2026-09-26", 3)).toBe(
      "The forecast for this place covers Sep 27 to Oct 12. A 3-day plan can start from Sep 27 to Oct 10."
    );
  });

  it("asks for a date in the range for a one-day plan", () => {
    expect(outside("2026-10-13", 1)).toBe("The forecast for this place covers Sep 27 to Oct 12. Pick a date in that range.");
  });

  it("names the only start day when the plan fills the forecast", () => {
    expect(planOutsideForecast("2026-10-02", 3, "2026-10-01", "2026-10-03")).toBe(
      "The forecast for this place covers Oct 1 to Oct 3. A 3-day plan has to start on Oct 1."
    );
  });

  it("asks for a date in the range when the plan is longer than the forecast", () => {
    expect(planOutsideForecast("2026-10-01", 5, "2026-10-01", "2026-10-03")).toBe(
      "The forecast for this place covers Oct 1 to Oct 3. Pick a date in that range."
    );
  });
});

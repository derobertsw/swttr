import { describe, it, expect } from "vitest";
import { selectHeadwearByCategory } from "./extremities";
import type { HeadwearRow } from "./types";

function createHeadwear(overrides: Partial<HeadwearRow>): HeadwearRow {
  return {
    id: overrides.id ?? "id",
    brand: overrides.brand ?? "Brand",
    model_name: overrides.model_name ?? "Model",
    headwear_type: overrides.headwear_type ?? "midweight_beanie",
    rcl_clo: overrides.rcl_clo ?? 0.2,
    covers_ears: overrides.covers_ears,
    covers_neck: overrides.covers_neck,
    covers_face: overrides.covers_face,
    min_temp_active: overrides.min_temp_active,
    min_temp_static: overrides.min_temp_static,
  };
}

describe("selectHeadwearByCategory", () => {
  it("can exclude helmets when requested", () => {
    const helmet = createHeadwear({
      id: "helmet",
      brand: "Smith",
      model_name: "Vantage",
      headwear_type: "ski_helmet",
      rcl_clo: 0.4,
    });
    const beanie = createHeadwear({
      id: "beanie",
      brand: "Smartwool",
      model_name: "Beanie",
      headwear_type: "midweight_beanie",
      rcl_clo: 0.2,
    });

    const result = selectHeadwearByCategory(
      [helmet, beanie],
      -5,
      true,
      { includeHelmet: false }
    );

    expect(result.helmet).toBeNull();
    expect(result.headWarmth?.id).toBe("beanie");
  });
});

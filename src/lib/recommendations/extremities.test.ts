import { describe, it, expect } from "vitest";
import { selectHandwear, selectHeadwearByCategory } from "./extremities";
import type { HandwearRow, HeadwearRow } from "./types";

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

function createHandwear(overrides: Partial<HandwearRow>): HandwearRow {
  return {
    id: overrides.id ?? "id",
    brand: overrides.brand ?? "Brand",
    model_name: overrides.model_name ?? "Model",
    handwear_type: overrides.handwear_type ?? "insulated",
    rcl_clo: overrides.rcl_clo ?? 1.0,
    dexterity_score: overrides.dexterity_score,
    waterproof: overrides.waterproof,
    windproof: overrides.windproof,
    min_temp_active: overrides.min_temp_active,
    min_temp_static: overrides.min_temp_static,
  };
}

describe("selectHandwear", () => {
  it("prefers glove closest to target clo", () => {
    const result = selectHandwear(
      [
        createHandwear({ id: "light", rcl_clo: 0.6 }),
        createHandwear({ id: "target", rcl_clo: 1.0 }),
        createHandwear({ id: "heavy", rcl_clo: 2.7 }),
      ],
      -5,
      true,
      1.1
    );

    expect(result?.id).toBe("target");
  });

  it("penalizes large overshoot when choosing by target", () => {
    const result = selectHandwear(
      [
        createHandwear({ id: "slightly-under", rcl_clo: 1.0 }),
        createHandwear({ id: "slightly-over", rcl_clo: 1.2 }),
      ],
      -5,
      true,
      1.1
    );

    expect(result?.id).toBe("slightly-under");
  });

  it("avoids selecting severely under-target gloves in cold conditions", () => {
    const result = selectHandwear(
      [
        createHandwear({ id: "too-light", rcl_clo: 0.6 }),
        createHandwear({ id: "near-target", rcl_clo: 1.0 }),
        createHandwear({ id: "very-heavy", rcl_clo: 2.7 }),
      ],
      -5,
      true,
      1.1
    );

    expect(result?.id).toBe("near-target");
  });

  it("allows near-threshold gloves when target match is much better", () => {
    const result = selectHandwear(
      [
        createHandwear({ id: "head-ultrafit", rcl_clo: 0.6, min_temp_active: -7 }),
        createHandwear({ id: "norrona-light", rcl_clo: 1.0, min_temp_active: -5 }),
        createHandwear({ id: "fission-sv", rcl_clo: 2.7, min_temp_active: -18 }),
      ],
      -8,
      true,
      1.1
    );

    expect(result?.id).toBe("norrona-light");
  });

  it("still prefers very warm glove in extreme cold despite target mismatch", () => {
    const result = selectHandwear(
      [
        createHandwear({ id: "norrona-light", rcl_clo: 1.0, min_temp_active: -5 }),
        createHandwear({ id: "fission-sv", rcl_clo: 2.7, min_temp_active: -18 }),
      ],
      -20,
      true,
      1.1
    );

    expect(result?.id).toBe("fission-sv");
  });
});

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

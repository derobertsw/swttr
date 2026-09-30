import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const phase = {
  itemClo: { torso: [0.5, 0.7], legs: [0.6], hands: [0.9], headNeck: [0.3] },
  targets: { torso: 1.0, legs: 0.6, hands: 1.0, headNeck: 0.5 },
  arms: { clo: 0.8, target: 0.9 },
  targetRange: [0.8, 1.2],
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v1/ensembles/evaluate", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("POST /api/v1/ensembles/evaluate", () => {
  it("evaluates each phase in order", async () => {
    const response = await post({ phases: [phase, { ...phase, targetRange: [2, 3] }] });
    expect(response.status).toBe(200);
    const { phases } = await response.json();
    expect(phases).toHaveLength(2);
    expect(phases[0].bodyParts.torso.clo).toBeCloseTo(1.2 * 0.836, 10);
    expect(phases[1].decision).toMatchObject({ riskType: "cold" });
  });

  it("measures shortfalls from the minimum targets when sent", async () => {
    const withMinimums = {
      ...phase,
      minTargets: { torso: 0.9, legs: 0.5, hands: 0.8, headNeck: 0.25 },
      arms: { ...phase.arms, minTarget: 0.75 },
    };
    const { phases: [neutralOnly] } = await (await post({ phases: [phase] })).json();
    const { phases: [minimums] } = await (await post({ phases: [withMinimums] })).json();

    expect(neutralOnly.maxExtremityDeficit).toBeCloseTo(0.2, 10);
    expect(minimums.maxExtremityDeficit).toBe(0);
    expect(minimums.maxRegionalDeficit).toBe(0);
  });

  it.each([
    ["malformed JSON", "{"],
    ["no phases", { phases: [] }],
    ["too many phases", { phases: [phase, phase, phase] }],
    ["non-numeric clo", { phases: [{ ...phase, itemClo: { ...phase.itemClo, torso: ["warm"] } }] }],
    ["missing body part", { phases: [{ ...phase, itemClo: { torso: [0.5] } }] }],
    ["bad target range", { phases: [{ ...phase, targetRange: [1] }] }],
    ["arms without clo", { phases: [{ ...phase, arms: { target: 1 } }] }],
    ["non-numeric minimum", { phases: [{ ...phase, minTargets: { torso: "low" } }] }],
    ["non-numeric arm minimum", { phases: [{ ...phase, arms: { clo: 0.8, minTarget: "low" } }] }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });
});

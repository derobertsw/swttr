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

  it.each([
    ["malformed JSON", "{"],
    ["no phases", { phases: [] }],
    ["too many phases", { phases: [phase, phase, phase] }],
    ["non-numeric clo", { phases: [{ ...phase, itemClo: { ...phase.itemClo, torso: ["warm"] } }] }],
    ["missing body part", { phases: [{ ...phase, itemClo: { torso: [0.5] } }] }],
    ["bad target range", { phases: [{ ...phase, targetRange: [1] }] }],
    ["arms without clo", { phases: [{ ...phase, arms: { target: 1 } }] }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });
});

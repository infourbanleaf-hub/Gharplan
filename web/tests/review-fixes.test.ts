import { describe, expect, it } from "vitest";
import { generatePlans, normaliseInput } from "../src/engine/generate";
import { checkLayout } from "../src/engine/edit";
import { defaultInput } from "../src/engine/presets";
import type { PlanInput } from "../src/engine/types";

const twoFloor = (over: Partial<PlanInput> = {}): PlanInput => ({ ...defaultInput(), floors: 2, ...over });

describe("first-floor re-check matches generation", () => {
  it("scores a generated first-floor plan the same when it is re-checked", () => {
    const input = twoFloor({ width: 40, depth: 50 });
    const res = generatePlans(input, { restarts: 400, seed: 20260101 });
    const up = res.layouts.find((l) => l.upper);
    expect(up).toBeDefined();
    expect(checkLayout(up!, normaliseInput(input)).total).toBeCloseTo(up!.scorecard.total, 6);
  }, 120_000);
});

describe("first floor without a staircase", () => {
  it("reports that the first floor cannot be reached", () => {
    const input = twoFloor({ staircase: "external", width: 40, depth: 50 });
    const res = generatePlans(input, { restarts: 200, seed: 20260101 });
    const up = res.layouts.filter((l) => l.upper);
    expect(up.length).toBeGreaterThan(0);
    for (const l of up) {
      const violations = checkLayout(l, normaliseInput(input)).violations;
      expect(violations).toContain("First floor has no staircase to reach it");
    }
  }, 120_000);
});

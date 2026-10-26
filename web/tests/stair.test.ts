import { describe, expect, it } from "vitest";
import { buildFrame } from "../src/engine/frame";
import { buildProgram } from "../src/engine/program";
import { normaliseInput, generatePlans } from "../src/engine/generate";
import { chooseStairPlan } from "../src/engine/stair";
import { defaultInput } from "../src/engine/presets";
import type { PlanInput } from "../src/engine/types";

const twoFloor = (over: Partial<PlanInput> = {}): PlanInput => ({ ...defaultInput(), floors: 2, ...over });

describe("staircase corner", () => {
  it("is 7 by 12 feet and sits inside the interior", () => {
    const input = normaliseInput(twoFloor({ width: 40, depth: 50 }));
    const frame = buildFrame(input);
    const stair = buildProgram(input).rooms.find((r) => r.kind === "stair")!;
    const plan = chooseStairPlan(frame, stair)!;
    expect(plan.rect.w * plan.rect.h).toBe(84);
    expect(plan.rect.x).toBeGreaterThanOrEqual(frame.interior.x - 1e-9);
    expect(plan.rect.x + plan.rect.w).toBeLessThanOrEqual(frame.interior.x + frame.interior.w + 1e-9);
  });

  it("never lands on the front (road) wall", () => {
    const input = normaliseInput(twoFloor({ facing: "S", width: 40, depth: 50 }));
    const frame = buildFrame(input);
    const stair = buildProgram(input).rooms.find((r) => r.kind === "stair")!;
    const plan = chooseStairPlan(frame, stair)!;
    if (!plan.vertical) expect(plan.rect.y).toBeGreaterThan(frame.interior.y);
  });
});

describe("two-floor ground plan", () => {
  it("keeps the staircase at its fixed corner in every layout", () => {
    const input = twoFloor({ width: 40, depth: 50 });
    const res = generatePlans(input, { restarts: 400, seed: 20260101 });
    const frame = buildFrame(normaliseInput(input));
    const plan = chooseStairPlan(frame, buildProgram(normaliseInput(input)).rooms.find((r) => r.kind === "stair")!)!;
    expect(res.layouts.length).toBeGreaterThan(0);
    for (const l of res.layouts) {
      const stair = l.rooms.find((r) => r.kind === "stair")!;
      expect(stair.rect).toEqual(plan.rect);
    }
  }, 120_000);
});

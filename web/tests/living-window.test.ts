import { describe, expect, it } from "vitest";
import { generatePlans, normaliseInput } from "../src/engine/generate";
import { checkLayout } from "../src/engine/edit";
import { defaultInput, ACCEPTANCE_CASES } from "../src/engine/presets";

// A valid plan must have a window in its living room. The rule check and the drawing used to
// disagree about this, so a plan could be reported valid with no living-room window.
function livingWindows(layout: { rooms: { id: string; kind: string }[]; openings: { kind: string; roomId: string }[] }) {
  const living = layout.rooms.find((r) => r.kind === "living")!;
  return layout.openings.filter((o) => o.kind === "window" && o.roomId === living.id).length;
}

describe("living room window", () => {
  it("every plan that passes the rules has a living-room window", () => {
    const inputs = [
      ACCEPTANCE_CASES[0].input,
      ACCEPTANCE_CASES[2].input,
      { ...defaultInput(), width: 20, depth: 30, facing: "N" as const },
      { ...defaultInput(), width: 24, depth: 35, facing: "S" as const, parking: { cars: 1, twoWheelers: 0 } },
    ];
    for (const input of inputs) {
      const res = generatePlans(input, { restarts: 150, seed: 20260101 });
      for (const l of res.layouts) {
        const issues = checkLayout(l, normaliseInput(input)).violations;
        if (issues.length === 0) expect(livingWindows(l)).toBeGreaterThan(0);
      }
    }
  }, 300_000);
});

import { buildFrame } from "../src/engine/frame";
import { livingWindowFits } from "../src/engine/wallplace";

describe("living window placement, as the finding describes", () => {
  const input = normaliseInput({ ...defaultInput(), facing: "N" as const, width: 30, depth: 40 });
  const frame = buildFrame(input);
  // A living room that touches only the front (road) wall, so the door and window must share it.
  const onFront = (w: number) => ({ x: frame.interior.x + 10, y: frame.interior.y, w, h: 12 });

  it("rejects a 10 ft front wall: the door leaves no 4 ft gap for a window", () => {
    expect(livingWindowFits(onFront(10), frame, input, false)).toBe(false);
  });

  it("accepts an 18 ft front wall: a window fits beside the door", () => {
    expect(livingWindowFits(onFront(18), frame, input, false)).toBe(true);
  });
});

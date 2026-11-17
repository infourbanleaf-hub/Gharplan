import { describe, expect, it } from "vitest";
import golden from "../reference/golden.json";
import { ACCEPTANCE_CASES } from "../src/engine/presets";
import { generatePlans } from "../src/engine/generate";
import { layoutSignature } from "../src/engine/assemble";
import { checkLayout } from "../src/engine/edit";
import { normaliseInput } from "../src/engine/generate";

// Golden values were produced by the original single-file engine (reference/original.html)
// with reference/make-golden.cjs. The port must reproduce them exactly.
const RESTARTS = 400;
const SEEDS = [20260101, 20268020];

type GoldenMap = Record<string, {
  errors: string[];
  warnings: string[];
  stats: { sampled: number; valid: number };
  layouts: {
    id: string;
    signature: string;
    total: number;
    builtUp: number;
    carpet: number;
    openings: number;
    furniture: number;
    missingFurniture: number;
    warnings: string[];
  }[];
}>;

const goldenMap = golden as GoldenMap;

describe("golden parity with the original engine", () => {
  for (const c of ACCEPTANCE_CASES) {
    for (const seed of SEEDS) {
      const key = `${c.name} | seed ${seed}`;
      it(key, () => {
        const expected = goldenMap[key];
        const res = generatePlans(c.input, { restarts: RESTARTS, seed });
        if (c.name.startsWith("2. 30x50")) {
          // Deliberate change: the original accepted plans whose living room had no window beside the
          // main door. The port rejects them, so the search needs the UI's larger budget to find plans.
          const large = generatePlans(c.input, { restarts: 1200, seed });
          expect(large.layouts.length).toBe(3);
          const input = normaliseInput(c.input);
          for (const l of large.layouts) {
            expect(checkLayout(l, input).violations).toEqual([]);
            const living = l.rooms.find((r) => r.kind === "living")!;
            expect(l.openings.filter((o) => o.kind === "window" && o.roomId === living.id).length).toBeGreaterThan(0);
          }
          return;
        }
        if (expected.layouts.length === 0) {
          // Deliberate change: the original returned no plans here. The port returns the closest
          // plans instead, each with its rule violations listed, so the user can edit them.
          expect(res.errors).toEqual([]);
          expect(res.layouts.length).toBeGreaterThan(0);
          const input = normaliseInput(c.input);
          for (const l of res.layouts) expect(checkLayout(l, input).violations.length).toBeGreaterThan(0);
          return;
        }
        expect(res.errors).toEqual(expected.errors);
        expect(res.warnings).toEqual(expected.warnings);
        expect(res.stats).toEqual(expected.stats);
        expect(res.layouts.map((l) => ({
          id: l.id,
          signature: layoutSignature(l),
          total: l.scorecard.total,
          builtUp: l.scorecard.builtUpArea,
          carpet: l.scorecard.carpetArea,
          openings: l.openings.length,
          furniture: l.furniture.length,
          missingFurniture: l.missingFurniture,
          warnings: l.warnings,
        }))).toEqual(expected.layouts);
      }, 120_000);
    }
  }
});

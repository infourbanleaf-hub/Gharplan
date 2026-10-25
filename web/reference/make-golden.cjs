// Generates golden output from the ORIGINAL engine (referenc./engine-original.cjs).
// The TypeScript port must reproduce these exactly.
const fs = require("fs");
const path = require("path");
const GP = require("./engine-original.cjs");

const RESTARTS = 400;
const SEEDS = [20260101, 20268020];
const out = {};
for (const c of GP.ACCEPTANCE_CASES) {
  for (const seed of SEEDS) {
    const res = GP.generatePlans(c.input, { restarts: RESTARTS, seed });
    out[`${c.name} | seed ${seed}`] = {
      errors: res.errors,
      warnings: res.warnings,
      stats: res.stats,
      layouts: res.layouts.map((l) => ({
        id: l.id,
        signature: GP.layoutSignature(l),
        total: l.scorecard.total,
        builtUp: l.scorecard.builtUpArea,
        carpet: l.scorecard.carpetArea,
        openings: l.openings.length,
        furniture: l.furniture.length,
        missingFurniture: l.missingFurniture,
        warnings: l.warnings,
      })),
    };
  }
}
fs.writeFileSync(path.join(__dirname, "golden.json"), JSON.stringify(out, null, 2));
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.layouts.length} layouts, sampled ${v.stats.sampled}, valid ${v.stats.valid}`).join("\n"));

// Dev preview: writes one SVG per generated layout for an acceptance case.
// Usage: npx tsx scripts/render-svg.ts <caseIndex 0-3> <outDir> [unit: ftin|m]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generatePlans, ACCEPTANCE_CASES } from '../engine';
import { planScene, sceneToSvg } from '../render';
import type { Unit } from '../engine/units';

const idx = Number(process.argv[2] ?? 0);
const outDir = process.argv[3] ?? 'previews';
const unit = (process.argv[4] ?? 'ftin') as Unit;
const c = ACCEPTANCE_CASES[idx];
const res = generatePlans(c.input, { count: 3, restarts: 600 });
mkdirSync(outDir, { recursive: true });
res.layouts.forEach((l, i) => {
  const file = join(outDir, `case${idx + 1}-${l.id}.svg`);
  writeFileSync(file, sceneToSvg(planScene(l, { unit })));
  console.log(file);
});

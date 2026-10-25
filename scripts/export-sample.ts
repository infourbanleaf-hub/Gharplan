// Dev helper: writes the PDF page HTML and the DXF for one acceptance case's first layout.
// Usage: npx tsx scripts/export-sample.ts <caseIndex 0-3> <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generatePlans, ACCEPTANCE_CASES } from '../engine';
import { layoutToDxf } from '../engine/export/dxf';
import { buildPlanPageHtml } from '../render/planHtml';
import { en } from '../ui/strings';
const exportCopy = en.exportCopy;

const idx = Number(process.argv[2] ?? 0);
const outDir = process.argv[3] ?? 'exports';
mkdirSync(outDir, { recursive: true });
const c = ACCEPTANCE_CASES[idx];
const res = generatePlans(c.input, { count: 1, restarts: 600 });
const l = res.layouts[0];
writeFileSync(join(outDir, `case${idx + 1}.html`), buildPlanPageHtml({
  layout: l, input: c.input, unit: 'ftin', copy: exportCopy, date: new Date().toISOString().slice(0, 10), projectName: c.name,
}));
writeFileSync(join(outDir, `case${idx + 1}.dxf`), layoutToDxf(l));
console.log(join(outDir, `case${idx + 1}.html`));

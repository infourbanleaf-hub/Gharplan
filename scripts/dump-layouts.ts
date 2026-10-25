// Dev helper: writes generated layouts for one acceptance case to JSON (for quick previews).
// Usage: npx tsx scripts/dump-layouts.ts <caseIndex 0-3> <outFile>
import { writeFileSync } from 'node:fs';
import { generatePlans, ACCEPTANCE_CASES } from '../engine';

const idx = Number(process.argv[2] ?? 0);
const out = process.argv[3] ?? 'layouts.json';
const c = ACCEPTANCE_CASES[idx];
const res = generatePlans(c.input, { count: 3, restarts: 600 });
writeFileSync(out, JSON.stringify({ name: c.name, input: c.input, errors: res.errors, warnings: res.warnings, layouts: res.layouts }, null, 2));
console.log(`${c.name}: layouts=${res.layouts.length} errors=${res.errors.length} -> ${out}`);

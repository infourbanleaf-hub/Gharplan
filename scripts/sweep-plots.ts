// Plan counts and missing furniture across a fixed set of plots and programmes.
// Usage: npx tsx scripts/sweep-plots.ts [--restarts 1200] > sweep.csv
// Prints one CSV row per case so runs can be compared over time.
import { generatePlans, defaultInput, ACCEPTANCE_CASES } from '../engine';

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const restarts = arg('restarts', 1200);

const base = defaultInput();
const cases: { name: string; input: ReturnType<typeof defaultInput> }[] = [
  ...ACCEPTANCE_CASES.map((c) => ({ name: c.name, input: c.input })),
  { name: '30x60 2BHK', input: { ...base, width: 30, depth: 60 } },
  { name: '40x50 2BHK', input: { ...base, width: 40, depth: 50 } },
  { name: '45x45 2BHK', input: { ...base, width: 45, depth: 45 } },
  { name: '40x60 2BHK', input: { ...base, width: 40, depth: 60 } },
  { name: '30x40 3BHK', input: { ...base, width: 30, depth: 40, bhk: 3, attachedToilets: [true, true, true, false] } },
];

console.log('case,plans,missingFurniture,restarts');
for (const c of cases) {
  const r = generatePlans(c.input, { count: 3, restarts, seed: 20260101 });
  const missing = r.layouts.reduce((s, l) => s + l.missingFurniture, 0);
  console.log(`"${c.name}",${r.layouts.length},${missing},${restarts}`);
}

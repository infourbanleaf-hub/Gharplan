// Builds the single-file planner page: bundles the engine and inlines it into planner-template.html.
// Usage: node planner/build.mjs   (writes planner/dist/planner.html)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const result = await build({
  entryPoints: [join(root, 'entry-planner.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'GP',
  platform: 'browser',
  write: false,
  logLevel: 'warning',
});
const engine = result.outputFiles[0].text.replace(/<\/script/g, '<\\/script');

const template = readFileSync(join(here, 'planner-template.html'), 'utf8');
if (template.split('/*ENGINE*/').length !== 2) throw new Error('planner-template.html must contain one /*ENGINE*/ placeholder');

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'planner.html'), template.replace('/*ENGINE*/', () => engine));
console.log('wrote planner/dist/planner.html');

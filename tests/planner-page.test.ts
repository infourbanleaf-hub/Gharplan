import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Static checks on the planner page source. The page itself runs in the browser; these catch the
// mistakes that have broken it before: script pointing at a missing element, and stale messages.
const source = readFileSync(new URL('../planner/planner-template.html', import.meta.url), 'utf8');

describe('planner page source', () => {
  it('has exactly one engine placeholder for the build to fill', () => {
    expect(source.split('/*ENGINE*/').length - 1).toBe(1);
  });

  it('every element the script looks up by id exists in the markup', () => {
    const ids = new Set([...source.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    // Rows built by the script (rs-, use-, sb-) are created at run time and are not in the markup.
    const looked = [...source.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]).filter((id) => !/^(rs-|use-|sb-)/.test(id));
    const missing = [...new Set(looked)].filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('shows no open-space input and no hidden open-space percentage', () => {
    expect(source).not.toContain('open-pct');
    expect(source).not.toContain('% you asked for');
    expect(source).not.toContain('Open space left over');
  });

  it('generates with the same search depth as the acceptance tests', () => {
    const restarts = [...source.matchAll(/restarts: (\d+)/g)].map((m) => Number(m[1]));
    expect(restarts.length).toBeGreaterThan(0);
    for (const r of restarts) expect(r).toBeGreaterThanOrEqual(1200);
  });
});

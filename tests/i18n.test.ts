import { describe, it, expect } from 'vitest';
import { en } from '../ui/strings';
import { hi } from '../ui/strings.hi';
import { buildPlanPageHtml } from '../render/planHtml';
import { generatePlans, ACCEPTANCE_CASES } from '../engine';
const planOptionsFor = (t: typeof hi) => ({ labels: t.plan, roomLabels: t.roomNames });

/** Every leaf string in a table, by path. Functions are checked by calling them with dummy args. */
function leaves(obj: Record<string, unknown>, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push([path, v]);
    else if (typeof v === 'function') out.push([path, String((v as (...a: unknown[]) => string)('1', '2'))]);
    else if (v && typeof v === 'object') out.push(...leaves(v as Record<string, unknown>, path));
  }
  return out;
}

describe('languages', () => {
  it('Hindi has a translation for every English string, none empty', () => {
    const enLeaves = new Map(leaves(en as unknown as Record<string, unknown>));
    const hiLeaves = new Map(leaves(hi as unknown as Record<string, unknown>));
    expect([...enLeaves.keys()].sort()).toEqual([...hiLeaves.keys()].sort());
    for (const [path, value] of hiLeaves) expect(value.trim(), path).not.toBe('');
  });

  it('Hindi text is not the English text for most strings', () => {
    const enLeaves = new Map(leaves(en as unknown as Record<string, unknown>));
    const hiLeaves = leaves(hi as unknown as Record<string, unknown>);
    const same = hiLeaves.filter(([p, v]) => enLeaves.get(p) === v).map(([p]) => p);
    // Brand name, numerals and a few loan words may match; anything else is a missing translation.
    expect(same.filter((p) => !['appName', 'errors.badLength', 'rooms.bhk', 'viewer.metres', 'plan.twoWheeler', 'prefs.strict'].includes(p))).toEqual([]);
  });

  it('the Hindi PDF page uses Hindi copy and the Devanagari font stack', () => {
    const c = ACCEPTANCE_CASES[0];
    const layout = generatePlans(c.input, { count: 1, restarts: 300 }).layouts[0];
    const html = buildPlanPageHtml({
      layout, input: c.input, unit: 'ftin', copy: hi.exportCopy, date: '2026-10-23', projectName: 'परीक्षण',
      planOptions: planOptionsFor(hi),
    });
    expect(html).toContain(hi.exportCopy.carpet);
    expect(html).toContain('Noto Sans Devanagari');
    expect(html).toContain(hi.exportCopy.disclaimer);
  }, 60_000);
});

import { describe, it, expect } from 'vitest';
import { generatePlans, ACCEPTANCE_CASES, validatePlotInput, LIMITS } from '../engine';
import { parseFeetInches } from '../engine/units';

describe('input safety', () => {
  it('rejects plots outside the supported range before searching', () => {
    const base = ACCEPTANCE_CASES[0].input;
    const res = generatePlans({ ...base, width: 5000, depth: 3 }, { count: 3, restarts: 600 });
    expect(res.layouts.length).toBe(0);
    expect(res.errors[0]).toContain(`${LIMITS.plotFt.max}`);
  });

  it('rejects non-numeric and infinite sizes', () => {
    const base = ACCEPTANCE_CASES[0].input;
    expect(validatePlotInput({ ...base, width: Number.NaN }).length).toBeGreaterThan(0);
    expect(validatePlotInput({ ...base, depth: Number.POSITIVE_INFINITY }).length).toBeGreaterThan(0);
  });

  it('rejects room sizes outside the supported range', () => {
    const base = ACCEPTANCE_CASES[0].input;
    expect(validatePlotInput({ ...base, roomSizes: { living: { defW: 500 } } }).length).toBeGreaterThan(0);
  });

  it('feet-inches parsing is linear: hostile whitespace-heavy input returns quickly', () => {
    const t = Date.now();
    expect(parseFeetInches('1' + ' '.repeat(5000) + 'x')).toBeNull();
    expect(parseFeetInches('1 ' + '- '.repeat(5000) + '!')).toBeNull();
    expect(Date.now() - t).toBeLessThan(500);
  });

  it('feet-inches parsing refuses very long entries', () => {
    expect(parseFeetInches('1'.repeat(100))).toBeNull();
  });
});

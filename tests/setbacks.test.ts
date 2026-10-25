import { describe, it, expect } from 'vitest';
import { defaultSetbacks, buildFrame } from '../engine/frame';
import { defaultInput } from '../engine/presets';

describe('setbacks from the plot-size table', () => {
  it('30x40 (111 sq m) takes the 100-250 band: front 3 m, rear 1.5 m, no sides', () => {
    const s = defaultSetbacks({ width: 30, depth: 40, roadSide: 'front', cornerSide: 'right' });
    expect(s.front).toBe(10);      // 3 m = 9.84 ft, rounded up to the quarter foot
    expect(s.rear).toBe(5);        // 1.5 m = 4.92 ft
    expect(s.left).toBe(0);
    expect(s.right).toBe(0);
  });
  it('corner plot gets the minimum road-side setback', () => {
    const s = defaultSetbacks({ width: 40, depth: 60, roadSide: 'corner', cornerSide: 'right' });
    expect(s.right).toBe(5);       // 1.5 m minimum on the road side
    expect(s.left).toBe(0);
  });
  it('user overrides win over the table', () => {
    const f = buildFrame({ ...defaultInput(), setbacks: { rear: 8 } });
    expect(f.setbacks.rear).toBe(8);
  });
});

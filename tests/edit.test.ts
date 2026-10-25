import { describe, it, expect, beforeAll } from 'vitest';
import { generatePlans, ACCEPTANCE_CASES, applyRoomEdits, validateLayout, roomLimits, type Layout } from '../engine';

let layout: Layout;
const input = ACCEPTANCE_CASES[0].input;

beforeAll(() => {
  layout = generatePlans(input, { count: 1, restarts: 600 }).layouts[0];
}, 120_000);

describe('room editing', () => {
  it('a generated layout passes validation before any edit', () => {
    expect(validateLayout(layout, input)).toEqual([]);
  });

  it('sizes are clamped to the room limits', () => {
    const living = layout.rooms.find((r) => r.kind === 'living')!;
    const limits = roomLimits(input, living.id)!;
    const big = applyRoomEdits(layout, input, { [living.id]: { w: 99, h: 99 } });
    const r = big.rooms.find((x) => x.id === living.id)!;
    expect(r.rect.w).toBe(limits.maxW);
    expect(r.rect.h).toBe(limits.maxH);
    const small = applyRoomEdits(layout, input, { [living.id]: { w: 1, h: 1 } });
    expect(small.rooms.find((x) => x.id === living.id)!.rect.w).toBe(limits.minW);
  });

  it('growing a room into its neighbours is reported as an overlap', () => {
    const living = layout.rooms.find((r) => r.kind === 'living')!;
    const grown = applyRoomEdits(layout, input, { [living.id]: { w: 14, h: 16 } });
    const issues = validateLayout(grown, input);
    expect(issues.some((i) => i.message.includes('overlaps'))).toBe(true);
  });

  it('a resize that leaves the rooms in place keeps the scorecard consistent', () => {
    const living = layout.rooms.find((r) => r.kind === 'living')!;
    const same = applyRoomEdits(layout, input, { [living.id]: { w: living.rect.w, h: living.rect.h } });
    expect(same.scorecard.carpetArea).toBeCloseTo(layout.scorecard.carpetArea, 3);
    expect(same.scorecard.efficiency).toBeCloseTo(layout.scorecard.efficiency, 3);
  });
});

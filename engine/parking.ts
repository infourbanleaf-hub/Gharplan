import type { Frame, ParkingSlot, PlotInput } from './types';

export const CAR = { along: 18, deep: 9 };
export const TWO_WHEELER = { along: 3, deep: 7 };

/** Frontage span taken by parking when it sits at the given end of the road edge. */
export function parkingSpan(input: PlotInput): number {
  return input.parking.cars * CAR.along + input.parking.twoWheelers * TWO_WHEELER.along;
}

/** Car and two-wheelers sit in the front setback strip, nearest the road, along the frontage. */
export function parkingFor(frame: Frame, input: PlotInput, end: 'left' | 'right', warnings: string[]): ParkingSlot[] {
  const slots: ParkingSlot[] = [];
  const want: { kind: ParkingSlot['kind']; along: number; deep: number }[] = [];
  for (let i = 0; i < input.parking.cars; i++) want.push({ kind: 'car', ...CAR });
  for (let i = 0; i < input.parking.twoWheelers; i++) want.push({ kind: 'two-wheeler', ...TWO_WHEELER });
  if (want.length === 0) return slots;

  const strip = frame.setbacks.front;
  const need = want.reduce((s2, w) => s2 + w.along, 0);
  if (want.some((w) => w.deep > strip)) {
    warnings.push('Front setback is too shallow for car parking; a stilt parking bay is needed and is not placed in the MVP.');
    return slots;
  }
  if (need > frame.width) {
    warnings.push('Plot frontage is too narrow for the requested parking; not placed.');
    return slots;
  }
  const start = end === 'left' ? 0 : frame.width - need;
  let x = start;
  for (const w of want) {
    slots.push({ kind: w.kind, rect: { x, y: 0, w: w.along, h: w.deep } });
    x += w.along;
  }
  return slots;
}


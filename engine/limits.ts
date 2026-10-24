// Input limits. Generation refuses values outside these ranges, so a mistyped or hostile entry
// cannot make the search or the furniture placement run for minutes on a phone.
import type { PlotInput } from './types';

export const LIMITS = {
  plotFt: { min: 10, max: 200 },
  setbackFt: { min: 0, max: 100 },
  roomFt: { min: 2, max: 60 },
  openSpacePct: { min: 0, max: 30 },
} as const;

export function validatePlotInput(input: PlotInput): string[] {
  const errors: string[] = [];
  const inRange = (v: number, r: { min: number; max: number }) => Number.isFinite(v) && v >= r.min && v <= r.max;
  if (!inRange(input.width, LIMITS.plotFt) || !inRange(input.depth, LIMITS.plotFt)) {
    errors.push(`Plot width and depth must be between ${LIMITS.plotFt.min} and ${LIMITS.plotFt.max} ft.`);
  }
  for (const [key, v] of Object.entries(input.setbacks ?? {})) {
    if (v !== undefined && !inRange(v, LIMITS.setbackFt)) errors.push(`Setback ${key} must be between 0 and ${LIMITS.setbackFt.max} ft.`);
  }
  if (input.openSpacePct !== undefined && !inRange(input.openSpacePct, LIMITS.openSpacePct)) {
    errors.push(`Open space must be between 0 and ${LIMITS.openSpacePct.max}% of the built-up area.`);
  }
  for (const [kind, o] of Object.entries(input.roomSizes ?? {})) {
    if (!o) continue;
    for (const v of [o.defW, o.defH, o.minW, o.minH]) {
      if (v !== undefined && !inRange(v, LIMITS.roomFt)) {
        errors.push(`${kind} sizes must be between ${LIMITS.roomFt.min} and ${LIMITS.roomFt.max} ft.`);
        break;
      }
    }
  }
  return [...new Set(errors)];
}

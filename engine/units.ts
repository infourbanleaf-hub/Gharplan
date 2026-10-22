export type Unit = 'ftin' | 'm';

export const FT_PER_M = 3.28084;
export const SQFT_PER_SQM = 10.7639;

export function feetToMetres(ft: number): number {
  return ft / FT_PER_M;
}

export function metresToFeet(m: number): number {
  return m * FT_PER_M;
}

/** Formats a length given in feet. Feet-inches rounds to the nearest inch. */
export function formatLength(ft: number, unit: Unit = 'ftin'): string {
  if (unit === 'm') return `${feetToMetres(ft).toFixed(2)} m`;
  const totalInches = Math.round(ft * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return inches === 0 ? `${feet}'-0"` : `${feet}'-${inches}"`;
}

export function formatArea(sqft: number, unit: Unit = 'ftin'): string {
  if (unit === 'm') return `${(sqft / SQFT_PER_SQM).toFixed(1)} sq m`;
  return `${Math.round(sqft)} sq ft`;
}

/**
 * Parses a feet-inches entry such as 12'-6", 12'6", 12 ft 6 in or 12.5 (feet).
 * Returns feet, or null if the text cannot be parsed.
 */
export function parseFeetInches(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (s === '') return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?\s*(?:-|\s)?\s*(\d+(?:\.\d+)?)?\s*(?:"|in|inch|inches)?$/);
  if (!m) return null;
  const feet = Number(m[1]);
  const inches = m[2] !== undefined ? Number(m[2]) : 0;
  if (inches >= 12) return null;
  return feet + inches / 12;
}

import type { Unit } from "./types";

export const FT_PER_M = 3.28084;
export const SQM_PER_SQFT = 1 / 10.7639;

export function feetToMetres(ft: number): number {
  return ft / FT_PER_M;
}

export function formatLength(ft: number, unit: Unit = "ftin"): string {
  if (unit === "m") return `${feetToMetres(ft).toFixed(2)} m`;
  const totalInches = Math.round(ft * 12);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return inches === 0 ? `${feet}'-0"` : `${feet}'-${inches}"`;
}

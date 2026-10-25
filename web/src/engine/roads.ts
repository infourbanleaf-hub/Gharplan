import type { PlanInput, Side } from "./types";

/** Walls that face a road: always the front, plus the corner side on a corner plot. */
export function roadSidesOf(input: Pick<PlanInput, "roadSide" | "cornerSide">): Side[] {
  const sides: Side[] = ["front"];
  if (input.roadSide === "corner") sides.push(input.cornerSide);
  return sides;
}

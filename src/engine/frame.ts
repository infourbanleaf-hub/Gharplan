import { setbackConfig } from "./config";
import { SQM_PER_SQFT, FT_PER_M } from "./units";
import type { Compass, Frame, NormalisedInput, Point, Rect, Setbacks } from "./types";

export const WALL_EXTERNAL_FT = 0.75;
const HALF_WALL = WALL_EXTERNAL_FT / 2;
const SQ2 = Math.SQRT1_2;

/** Unit vector pointing out of the building front, in world axes (x east, y north). */
export const FACING_VECTOR: Record<Compass, [number, number]> = {
  N: [0, 1],
  NE: [SQ2, SQ2],
  E: [1, 0],
  SE: [SQ2, -SQ2],
  S: [0, -1],
  SW: [-SQ2, -SQ2],
  W: [-1, 0],
  NW: [-SQ2, SQ2],
};

const COMPASS_NAMES = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"] as const;
const COMPASS_VECTORS: Record<Compass, [number, number]> = {
  N: [0, 1],
  NE: [SQ2, SQ2],
  E: [1, 0],
  SE: [SQ2, -SQ2],
  S: [0, -1],
  SW: [-SQ2, -SQ2],
  W: [-1, 0],
  NW: [-SQ2, SQ2],
};

export function compassVector(c: Compass): [number, number] {
  return COMPASS_VECTORS[c];
}

/** Rounds up to the nearest quarter foot, so setbacks never fall short of the bye-law. */
function ceilQuarter(ft: number): number {
  return Math.ceil(ft * 4 - 1e-9) / 4 || 0;
}

export function defaultSetbacks(input: Pick<NormalisedInput, "width" | "depth" | "roadSide" | "cornerSide">): Setbacks {
  const areaSqM = input.width * input.depth * SQM_PER_SQFT;
  const band = setbackConfig.bands.find((b) => b.maxAreaSqM === null || areaSqM <= b.maxAreaSqM)!;
  const sides = band.sideRule === "both"
    ? { left: band.sideM, right: band.sideM }
    : { left: band.sideM, right: 0 };
  if (input.roadSide === "corner") {
    sides[input.cornerSide] = Math.max(sides[input.cornerSide], setbackConfig.cornerRoadSideMinM);
  }
  return {
    front: ceilQuarter(band.frontM * FT_PER_M),
    rear: ceilQuarter(band.rearM * FT_PER_M),
    left: ceilQuarter(sides.left * FT_PER_M),
    right: ceilQuarter(sides.right * FT_PER_M),
  };
}

export function buildFrame(input: NormalisedInput): Frame {
  const defaults = defaultSetbacks(input);
  // Explicit overrides win; an undefined entry replaces the default, as in the original page.
  const setbacks = { ...defaults, ...input.setbacks } as Setbacks;
  const buildable: Rect = {
    x: setbacks.left,
    y: setbacks.front,
    w: input.width - setbacks.left - setbacks.right,
    h: input.depth - setbacks.front - setbacks.rear,
  };
  const interior: Rect = {
    x: buildable.x + HALF_WALL,
    y: buildable.y + HALF_WALL,
    w: buildable.w - 2 * HALF_WALL,
    h: buildable.h - 2 * HALF_WALL,
  };
  const front = FACING_VECTOR[input.facing];
  const inward: [number, number] = [-front[0], -front[1]];
  const right: [number, number] = [inward[1], -inward[0]];
  return { width: input.width, depth: input.depth, setbacks, buildable, interior, facing: input.facing, right, inward };
}

/** Local plan coordinates (origin at the plot's front-left, y up toward the back) to world axes. */
export function localToWorld(px: number, py: number, frame: Frame): Point {
  const dx = px - frame.width / 2;
  const dy = py - frame.depth / 2;
  return {
    x: dx * frame.right[0] + dy * frame.inward[0],
    y: dx * frame.right[1] + dy * frame.inward[1],
  };
}

/** Compass direction of a point in plan, measured from the plot centre. */
export function compassOfPoint(px: number, py: number, frame: Frame): Compass {
  const v = localToWorld(px, py, frame);
  const deg = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  return COMPASS_NAMES[idx] as Compass;
}

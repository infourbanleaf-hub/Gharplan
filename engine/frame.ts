import setbackTable from '../config/setbacks.json';
import type { Compass, Frame, PlotInput, Rect, Setbacks } from './types';
import { FT_PER_M } from './units';

const WALL_EXTERNAL_FT = 0.75;
const HALF_WALL = WALL_EXTERNAL_FT / 2;
const SQM_PER_SQFT = 1 / 10.7639;

const SQ2 = Math.SQRT1_2;
const FACING_VECTOR: Record<Compass, [number, number]> = {
  N: [0, 1], NE: [SQ2, SQ2], E: [1, 0], SE: [SQ2, -SQ2],
  S: [0, -1], SW: [-SQ2, -SQ2], W: [-1, 0], NW: [-SQ2, SQ2],
};

/** Rounds up to the next quarter foot so setbacks never shrink below the table value. */
function ceilQuarter(ft: number): number {
  return (Math.ceil(ft * 4 - 1e-9) / 4) || 0;
}

/** Table-driven default setbacks in feet. Corner plots get a minimum road-side setback. */
export function defaultSetbacks(input: Pick<PlotInput, 'width' | 'depth' | 'roadSide' | 'cornerSide'>): Setbacks {
  const areaSqM = input.width * input.depth * SQM_PER_SQFT;
  const band = setbackTable.bands.find((b) => b.maxAreaSqM === null || areaSqM <= b.maxAreaSqM)!;
  const sides =
    band.sideRule === 'both'
      ? { left: band.sideM, right: band.sideM }
      : { left: band.sideM, right: 0 };
  if (input.roadSide === 'corner') {
    sides[input.cornerSide] = Math.max(sides[input.cornerSide], setbackTable.cornerRoadSideMinM);
  }
  return {
    front: ceilQuarter(band.frontM * FT_PER_M),
    rear: ceilQuarter(band.rearM * FT_PER_M),
    left: ceilQuarter(sides.left * FT_PER_M),
    right: ceilQuarter(sides.right * FT_PER_M),
  };
}

/** Builds the local frame (setback box, room envelope, compass mapping) for one plot. */
export function buildFrame(input: PlotInput): Frame {
  const defaults = defaultSetbacks(input);
  const setbacks: Setbacks = { ...defaults, ...input.setbacks };
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
  // Viewer at the road facing into the plot: their right-hand side is inward rotated clockwise.
  const right: [number, number] = [inward[1], -inward[0]];
  return { width: input.width, depth: input.depth, setbacks, buildable, interior, facing: input.facing, right, inward };
}

/** Compass direction of a local point, measured from the plot centre. */
export function compassOfPoint(px: number, py: number, frame: Frame): Compass {
  const dx = px - frame.width / 2;
  const dy = py - frame.depth / 2;
  const vx = dx * frame.right[0] + dy * frame.inward[0];
  const vy = dx * frame.right[1] + dy * frame.inward[1];
  // Angle in degrees, 0 = East, counter-clockwise.
  const deg = ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360;
  const names: Compass[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  const idx = Math.round(deg / 45) % 8;
  return names[idx];
}

/** Maps a local point to world coordinates (x east, y north), origin at the plot's centre. */
export function localToWorld(px: number, py: number, frame: Frame): { x: number; y: number } {
  const dx = px - frame.width / 2;
  const dy = py - frame.depth / 2;
  return {
    x: dx * frame.right[0] + dy * frame.inward[0],
    y: dx * frame.right[1] + dy * frame.inward[1],
  };
}

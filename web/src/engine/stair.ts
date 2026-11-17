import { compassOfPoint } from "./frame";
import { buildTree, type Item, type LeafNode, type SplitNode, type TreeNode } from "./packing";
import type { Compass, Frame, Rect, RoomSpec } from "./types";

/** Minimum length left beside the staircase in its strip, and minimum depth left for the rest of the plan. */
const MIN_NOTCH_FT = 6;
const MIN_REST_DEPTH_FT = 8;

const VASTU_SCORE: Partial<Record<Compass, number>> = { SW: 3, W: 2, S: 2, SE: 1, NW: 1 };

/**
 * Where the staircase goes: a block at one corner of the rear or side walls. The block runs
 * `bandDepth` across the wall and `stairLength` along it. The strip it sits in is filled with
 * other rooms, so no floor area is lost.
 */
export interface StairPlan {
  /** The strip runs along a side wall (true) or the rear wall (false). */
  vertical: boolean;
  /** The strip is at the low-coordinate side of the plan (left or top of the interior). */
  bandFirst: boolean;
  /** The staircase is at the low end of the strip. */
  stairFirst: boolean;
  /** Footprint of the staircase in plan feet. */
  rect: Rect;
  /** Interior length along the strip. */
  bandLength: number;
  /** Interior depth across the strip. */
  depth: number;
  /** Stair run, across the strip. */
  bandDepth: number;
  /** Stair width, along the strip. */
  stairLength: number;
  compass: Compass;
}

/** Picks the best corner for the staircase, or null when the plot has no room for one. */
export function chooseStairPlan(frame: Frame, stair: RoomSpec): StairPlan | null {
  const I = frame.interior;
  const sw = stair.defW;
  const sd = stair.defH;
  let best: StairPlan | null = null;
  for (const vertical of [false, true]) {
    const L = vertical ? I.h : I.w;
    const D = vertical ? I.w : I.h;
    if (L - sw < MIN_NOTCH_FT || D - sd < MIN_REST_DEPTH_FT) continue;
    for (const bandFirst of [false, true]) {
      // The low-y side of the plan is the front (road) wall, so the rear strip is the only horizontal option there.
      if (!vertical && bandFirst) continue;
      for (const stairFirst of [true, false]) {
        // A side strip whose staircase lands on the front corner would block the entrance.
        if (vertical && stairFirst) continue;
        const rect: Rect = vertical
          ? { x: bandFirst ? I.x : I.x + I.w - sd, y: I.y + I.h - sw, w: sd, h: sw }
          : { x: stairFirst ? I.x : I.x + I.w - sw, y: bandFirst ? I.y : I.y + I.h - sd, w: sw, h: sd };
        const compass = compassOfPoint(rect.x + rect.w / 2, rect.y + rect.h / 2, frame);
        const plan: StairPlan = {
          vertical,
          bandFirst,
          stairFirst,
          rect,
          bandLength: L,
          depth: D,
          bandDepth: sd,
          stairLength: sw,
          compass,
        };
        if (!best || (VASTU_SCORE[compass] ?? 0) > (VASTU_SCORE[best.compass] ?? 0)) best = plan;
      }
    }
  }
  return best;
}

/**
 * The fixed tree for a plan with a staircase: the root splits the plot into the staircase strip
 * and the rest. Inside the strip the staircase is fixed at one end, and the other rooms fill
 * the remainder. The first `bandCount` items go in the strip; the others form the rest.
 */
export function stairTree(
  order: Item[],
  bandCount: number,
  plan: StairPlan,
  stairSpec: RoomSpec,
  rand: () => number,
): TreeNode | null {
  const band = order.slice(0, bandCount);
  const rest = order.slice(bandCount);
  if (band.length === 0 || rest.length === 0) return null;

  const stairLeaf: LeafNode = { spec: stairSpec };
  const L = plan.bandLength;
  const sw = plan.stairLength;
  const bandNode: SplitNode = {
    ratios: [plan.stairFirst ? sw / L : (L - sw) / L],
    longBias: true,
    passage: false,
    axis: plan.vertical ? "y" : "x",
    fixed: true,
    children: plan.stairFirst ? [stairLeaf, buildTree(band, rand)] : [buildTree(band, rand), stairLeaf],
  };
  const share = plan.bandDepth / plan.depth;
  return {
    ratios: [plan.bandFirst ? share : 1 - share],
    longBias: true,
    passage: false,
    axis: plan.vertical ? "x" : "y",
    fixed: true,
    children: plan.bandFirst ? [bandNode, buildTree(rest, rand)] : [buildTree(rest, rand), bandNode],
  };
}

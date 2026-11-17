import { roomDefaults } from "./config";
import { exteriorSides } from "./geometry";
import { parkingFor } from "./parking";
import { roadSidesOf } from "./roads";
import type { Frame, PlanInput, Rect, Side } from "./types";

/** A straight run of wall, from `a` to `b`, in plan feet. */
export interface Segment {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** Free segment of a wall long enough for a door, centred in the widest gap. Null when nothing fits. */
export function placeOnSide(seg: Segment, width: number, blocked: [number, number][] = []): number | null {
  const vertical = seg.a.x === seg.b.x;
  const start = vertical ? Math.min(seg.a.y, seg.b.y) : Math.min(seg.a.x, seg.b.x);
  const end = vertical ? Math.max(seg.a.y, seg.b.y) : Math.max(seg.a.x, seg.b.x);
  let free: [number, number][] = [[start, end]];
  for (const [lo, hi] of blocked) {
    free = free.flatMap(([a, b]): [number, number][] => {
      const parts: [number, number][] = [];
      if (lo > a) parts.push([a, Math.min(b, lo)]);
      if (hi < b) parts.push([Math.max(a, hi), b]);
      return parts.filter(([x, y]) => y > x);
    });
  }
  let best: [number, number] | null = null;
  for (const f of free) {
    if (f[1] - f[0] >= width + 1 && (!best || f[1] - f[0] > best[1] - best[0])) best = f;
  }
  return best ? (best[0] + best[1]) / 2 : null;
}

export function sideSegment(r: Rect, side: Side): Segment {
  switch (side) {
    case "front":
      return { a: { x: r.x, y: r.y }, b: { x: r.x + r.w, y: r.y } };
    case "back":
      return { a: { x: r.x, y: r.y + r.h }, b: { x: r.x + r.w, y: r.y + r.h } };
    case "left":
      return { a: { x: r.x, y: r.y }, b: { x: r.x, y: r.y + r.h } };
    case "right":
      return { a: { x: r.x + r.w, y: r.y }, b: { x: r.x + r.w, y: r.y + r.h } };
  }
}

/** A segment of width `width`, centred at `at` along the segment's axis. */
export function centredSegment(seg: Segment, at: number, width: number): Segment {
  const vertical = seg.a.x === seg.b.x;
  const lo = at - width / 2;
  const hi = at + width / 2;
  return vertical
    ? { a: { x: seg.a.x, y: lo }, b: { x: seg.a.x, y: hi } }
    : { a: { x: lo, y: seg.a.y }, b: { x: hi, y: seg.a.y } };
}


const MAIN_DOOR_FT = roomDefaults.mainDoorWidthFt;
const WINDOW_FT = roomDefaults.windowWidthFt;

/**
 * Where the main door goes on the living room, as the layout places it: on the road wall, clear of
 * the parking. Null when no door fits.
 */
export function mainDoorOn(living: Rect, frame: Frame, input: PlanInput, upper: boolean): { side: Side; at: number } | null {
  if (upper) return null;
  const roadSides = roadSidesOf(input);
  const roadSide = exteriorSides(living, frame.interior)
    .filter((e) => roadSides.includes(e.side))
    .sort((a, b) => b.length - a.length)[0];
  if (!roadSide) return null;
  for (const end of ["left", "right"] as const) {
    const parking = parkingFor(frame, input, end, []);
    const blocked: [number, number][] =
      roadSide.side === "front" ? parking.map((p) => [p.rect.x - 1, p.rect.x + p.rect.w + 1] as [number, number]) : [];
    const at = placeOnSide(sideSegment(living, roadSide.side), MAIN_DOOR_FT, blocked);
    if (at !== null) return { side: roadSide.side, at };
  }
  return null;
}

/**
 * True when the living room has a wall where a window fits once the main door is placed. The
 * rule check and the drawing both use this, so a plan is valid only if its window is drawn.
 */
export function livingWindowFits(living: Rect, frame: Frame, input: PlanInput, upper: boolean): boolean {
  const door = mainDoorOn(living, frame, input, upper);
  return exteriorSides(living, frame.interior).some((e) => {
    const blocked: [number, number][] =
      door && door.side === e.side ? [[door.at - MAIN_DOOR_FT / 2 - 1, door.at + MAIN_DOOR_FT / 2 + 1]] : [];
    return placeOnSide(sideSegment(living, e.side), WINDOW_FT, blocked) !== null;
  });
}

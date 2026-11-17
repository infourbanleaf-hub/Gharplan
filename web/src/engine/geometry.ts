import type { ExteriorSide, Rect, Shared } from "./types";

export const EPS = 1e-6;

export function rectArea(r: Rect): number {
  return r.w * r.h;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  );
}

/** The shared wall between two rects, or null when they only touch at a corner or not at all. */
export function sharedEdge(a: Rect, b: Rect): Shared | null {
  const ayTop = a.y + a.h;
  const axRight = a.x + a.w;
  if (Math.abs(axRight - b.x) < EPS || Math.abs(b.x + b.w - a.x) < EPS) {
    const x = Math.abs(axRight - b.x) < EPS ? axRight : a.x;
    const y1 = Math.max(a.y, b.y);
    const y2 = Math.min(ayTop, b.y + b.h);
    if (y2 - y1 > EPS) return { axis: "v", x, y1, y2, length: y2 - y1 };
  }
  if (Math.abs(ayTop - b.y) < EPS || Math.abs(b.y + b.h - a.y) < EPS) {
    const y = Math.abs(ayTop - b.y) < EPS ? ayTop : a.y;
    const x1 = Math.max(a.x, b.x);
    const x2 = Math.min(axRight, b.x + b.w);
    if (x2 - x1 > EPS) return { axis: "h", y, x1, x2, length: x2 - x1 };
  }
  return null;
}

/** Which outer walls of `outer` the rect `r` touches, with the length of each touching edge. */
export function exteriorSides(r: Rect, outer: Rect): ExteriorSide[] {
  const out: ExteriorSide[] = [];
  if (Math.abs(r.y - outer.y) < EPS) out.push({ side: "front", length: r.w });
  if (Math.abs(r.y + r.h - (outer.y + outer.h)) < EPS) out.push({ side: "back", length: r.w });
  if (Math.abs(r.x - outer.x) < EPS) out.push({ side: "left", length: r.h });
  if (Math.abs(r.x + r.w - (outer.x + outer.w)) < EPS) out.push({ side: "right", length: r.h });
  return out;
}

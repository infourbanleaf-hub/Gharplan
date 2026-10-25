import type { Layout, Opening, Rect, Side } from '../types';
import { WALL_EXTERNAL_FT, WALL_INTERNAL_FT } from '../../render/geometry';

/** A wall piece as an axis-aligned rectangle in local feet, with the openings cut out. */
export interface WallPiece {
  rect: Rect;
}

interface Span {
  lo: number;
  hi: number;
}

/**
 * Wall pieces with door and window gaps removed. Each room contributes its four sides, so an
 * internal wall appears twice; the duplicates are dropped by rounding.
 */
export function wallPieces(layout: Layout): WallPiece[] {
  const pieces = new Map<string, WallPiece>();
  for (const room of layout.rooms) {
    const r = room.rect;
    const sides: Side[] = ['front', 'back', 'left', 'right'];
    for (const side of sides) {
      const external = room.exteriorSides.includes(side);
      const t = external ? WALL_EXTERNAL_FT : WALL_INTERNAL_FT;
      const h = t / 2;
      const horizontal = side === 'front' || side === 'back';
      const at = side === 'front' ? r.y : side === 'back' ? r.y + r.h : side === 'left' ? r.x : r.x + r.w;
      const span: Span = horizontal ? { lo: r.x, hi: r.x + r.w } : { lo: r.y, hi: r.y + r.h };
      const cuts = openingsOn(layout.openings, horizontal, at, span);
      for (const piece of subtract(span, cuts)) {
        // Pieces that reach a room corner run half a wall further, so corners close up.
        const lo = piece.lo <= span.lo + 1e-6 ? piece.lo - h : piece.lo;
        const hi = piece.hi >= span.hi - 1e-6 ? piece.hi + h : piece.hi;
        const rect: Rect = horizontal
          ? { x: lo, y: at - h, w: hi - lo, h: t }
          : { x: at - h, y: lo, w: t, h: hi - lo };
        const key = [rect.x, rect.y, rect.w, rect.h].map((v) => v.toFixed(3)).join(',');
        pieces.set(key, { rect });
      }
    }
  }
  return [...pieces.values()];
}

/** Openings that lie on the given wall line, as spans along it. */
function openingsOn(openings: Opening[], horizontal: boolean, at: number, span: Span): Span[] {
  const out: Span[] = [];
  for (const o of openings) {
    const oHorizontal = Math.abs(o.a.y - o.b.y) < 1e-9;
    if (oHorizontal !== horizontal) continue;
    const line = horizontal ? o.a.y : o.a.x;
    if (Math.abs(line - at) > 1e-6) continue;
    const lo = horizontal ? Math.min(o.a.x, o.b.x) : Math.min(o.a.y, o.b.y);
    const hi = horizontal ? Math.max(o.a.x, o.b.x) : Math.max(o.a.y, o.b.y);
    if (hi < span.lo - 1e-6 || lo > span.hi + 1e-6) continue;
    out.push({ lo: Math.max(lo, span.lo), hi: Math.min(hi, span.hi) });
  }
  return out;
}

/** The parts of `span` that are not covered by any cut. */
function subtract(span: Span, cuts: Span[]): Span[] {
  let parts: Span[] = [span];
  for (const c of cuts) {
    parts = parts.flatMap((p) => {
      const out: Span[] = [];
      if (c.lo > p.lo) out.push({ lo: p.lo, hi: Math.min(c.lo, p.hi) });
      if (c.hi < p.hi) out.push({ lo: Math.max(c.hi, p.lo), hi: p.hi });
      return out.length ? out : [];
    });
  }
  return parts.filter((p) => p.hi - p.lo > 1e-6);
}

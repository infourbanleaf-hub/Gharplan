// Plan renderer. Builds a flat list of drawing primitives (a "scene") from a Layout.
// The scene is platform-neutral: svg.ts turns it into an SVG string, and the app can map
// the same items onto react-native-svg.
import { localToWorld } from '../engine/frame';
import { formatLength, type Unit } from '../engine/units';
import type { Frame, Layout, Opening, PlacedRoom, Rect, Side } from '../engine/types';

export type Pt = { x: number; y: number };

export type Item =
  | { kind: 'polygon'; points: Pt[]; fill: string; stroke?: string; strokeWidth?: number; dash?: string; layer: Layer }
  | { kind: 'polyline'; points: Pt[]; stroke: string; strokeWidth: number; dash?: string; layer: Layer }
  | { kind: 'text'; x: number; y: number; text: string; size: number; fill: string; anchor: 'start' | 'middle' | 'end'; weight?: 'normal' | 'bold'; layer: Layer };

export type Layer = 'plot' | 'rooms' | 'parking' | 'walls' | 'openings' | 'labels' | 'dimensions' | 'north';

export interface Scene {
  width: number;
  height: number;
  items: Item[];
}

export interface PlanOptions {
  unit: Unit;
  showSetbacks: boolean;
  showDimensions: boolean;
  /** Drawing units per foot. The SVG scales to fit its container, so this only sets proportions. */
  scale: number;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  unit: 'ftin',
  showSetbacks: true,
  showDimensions: true,
  scale: 12,
};

export const WALL_EXTERNAL_FT = 0.75;
export const WALL_INTERNAL_FT = 0.375;
export const COLORS = {
  wall: '#3b3f45',
  wallGap: '#ffffff',
  plot: '#8a8f98',
  setback: '#c9584f',
  window: '#3f7fc4',
  door: '#b3262e',
  dimension: '#1f4e8c',
  text: '#1d2026',
  parking: '#777c85',
  parkingFill: '#eceef1',
};

const ROOM_FILL: Record<string, string> = {
  living: '#fdf3d0', dining: '#fde8d0', kitchen: '#e6f5d8', master: '#d9e8fb', bedroom: '#dfeefa',
  guest: '#dfeefa', attachedToilet: '#e8e2f5', commonToilet: '#e8e2f5', puja: '#fbe0ea',
  study: '#eef0d8', store: '#eeeeee', utility: '#e3f1f1', stair: '#f2f2f2', passage: '#ffffff',
};

const ARC_SEGMENTS = 18;

/** Maps local feet to screen units. North is up, origin at the top-left of the drawing. */
export function makeMapper(frame: Frame, scale: number, margin: number) {
  const corners = [
    { x: 0, y: 0 }, { x: frame.width, y: 0 }, { x: frame.width, y: frame.depth }, { x: 0, y: frame.depth },
  ].map((p) => localToWorld(p.x, p.y, frame));
  const minX = Math.min(...corners.map((c) => c.x));
  const maxY = Math.max(...corners.map((c) => c.y));
  const local = (p: Pt): Pt => {
    const w = localToWorld(p.x, p.y, frame);
    return { x: (w.x - minX + margin) * scale, y: (maxY - w.y + margin) * scale };
  };
  const extent = {
    width: (Math.max(...corners.map((c) => c.x)) - minX + 2 * margin) * scale,
    height: (maxY - Math.min(...corners.map((c) => c.y)) + 2 * margin) * scale,
  };
  // North-up: north is the screen top, so the north arrow is fixed in the corner.
  return { local, extent, minX, maxY };
}

function rectPoints(r: Rect): Pt[] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
}

/** Four corners of a wall strip centred on a rectangle edge, extended by half a wall at each end. */
function wallStrip(side: Side, r: Rect, t: number): Pt[] {
  const h = t / 2;
  switch (side) {
    case 'front':
      return [{ x: r.x - h, y: r.y - h }, { x: r.x + r.w + h, y: r.y - h }, { x: r.x + r.w + h, y: r.y + h }, { x: r.x - h, y: r.y + h }];
    case 'back':
      return [{ x: r.x - h, y: r.y + r.h - h }, { x: r.x + r.w + h, y: r.y + r.h - h }, { x: r.x + r.w + h, y: r.y + r.h + h }, { x: r.x - h, y: r.y + r.h + h }];
    case 'left':
      return [{ x: r.x - h, y: r.y - h }, { x: r.x + h, y: r.y - h }, { x: r.x + h, y: r.y + r.h + h }, { x: r.x - h, y: r.y + r.h + h }];
    case 'right':
      return [{ x: r.x + r.w - h, y: r.y - h }, { x: r.x + r.w + h, y: r.y - h }, { x: r.x + r.w + h, y: r.y + r.h + h }, { x: r.x + r.w - h, y: r.y + r.h + h }];
  }
}

/** Walls of a room: each side is external (outer wall) or internal (partition). */
function roomWalls(r: PlacedRoom): { side: Side; t: number }[] {
  const sides: Side[] = ['front', 'back', 'left', 'right'];
  return sides.map((side) => ({ side, t: r.exteriorSides.includes(side) ? WALL_EXTERNAL_FT : WALL_INTERNAL_FT }));
}

function ftin(ft: number, unit: Unit): string {
  return formatLength(ft, unit);
}

/** Wraps a label onto at most two lines at a space. */
function labelLines(label: string): string[] {
  const words = label.split(' ');
  if (words.length === 1) return [label];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

export function planScene(layout: Layout, opts: Partial<PlanOptions> = {}): Scene {
  const o: PlanOptions = { ...DEFAULT_PLAN_OPTIONS, ...opts };
  const frame = layout.frame;
  const margin = 7; // feet of room for dimensions, north arrow and parking
  const { local, extent } = makeMapper(frame, o.scale, margin);
  const items: Item[] = [];
  const poly = (pts: Pt[], fill: string, layer: Layer, extra: Partial<Extract<Item, { kind: 'polygon' }>> = {}) =>
    items.push({ kind: 'polygon', points: pts.map(local), fill, layer, ...extra });
  const line = (pts: Pt[], stroke: string, strokeWidth: number, layer: Layer, dash?: string) =>
    items.push({ kind: 'polyline', points: pts.map(local), stroke, strokeWidth, layer, dash });
  // dyPx is a screen-space offset, so stacked text lines stay vertical whatever the facing.
  const text = (p: Pt, t: string, size: number, fill: string, layer: Layer, anchor: 'start' | 'middle' | 'end' = 'middle', weight?: 'bold', dyPx = 0) => {
    const q = local(p);
    items.push({ kind: 'text', x: q.x, y: q.y + dyPx, text: t, size, fill, anchor, layer, weight });
  };

  // 1. Plot boundary and setback box
  poly(rectPoints({ x: 0, y: 0, w: frame.width, h: frame.depth }), 'none', 'plot', { stroke: COLORS.plot, strokeWidth: 1, dash: '6 4' });
  if (o.showSetbacks) {
    poly(rectPoints(frame.buildable), 'none', 'plot', { stroke: COLORS.setback, strokeWidth: 1, dash: '4 3' });
  }

  // 2. Room fills
  for (const r of layout.rooms) {
    poly(rectPoints(r.rect), ROOM_FILL[r.kind] ?? '#ffffff', 'rooms');
  }

  // 3. Parking in the front setback
  for (const p of layout.parking) {
    poly(rectPoints(p.rect), COLORS.parkingFill, 'parking', { stroke: COLORS.parking, strokeWidth: 1 });
    const c = { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 };
    text(c, p.kind === 'car' ? 'Car' : '2W', 9, COLORS.text, 'parking');
  }

  // 4. Walls, drawn as thick strips so they have real thickness
  for (const r of layout.rooms) {
    for (const w of roomWalls(r)) {
      poly(wallStrip(w.side, r.rect, w.t), COLORS.wall, 'walls');
    }
  }

  // 5. Openings: gap in the wall, then the door leaf and swing arc, or window glazing lines
  for (const op of layout.openings) drawOpening(op, layout, local, items);

  // 6. Room labels and dimensions
  for (const r of layout.rooms) {
    if (r.kind === 'passage') continue;
    const c = { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 };
    const lines = labelLines(r.label);
    const lineGap = 11;
    const firstDy = -((lines.length - 1) * lineGap) / 2;
    lines.forEach((t, i) => text(c, t, 10, COLORS.text, 'labels', 'middle', 'bold', firstDy + i * lineGap));
    if (o.showDimensions) {
      const dims = `${ftin(r.rect.w, o.unit)} x ${ftin(r.rect.h, o.unit)}`;
      text(c, dims, 8, COLORS.dimension, 'dimensions', 'middle', undefined, firstDy + lines.length * lineGap + 2);
    }
  }

  // 7. Plot dimensions along the road and the side
  if (o.showDimensions) {
    const d = 3.2; // feet outside the plot
    line([{ x: 0, y: -d }, { x: frame.width, y: -d }], COLORS.dimension, 1, 'dimensions');
    text({ x: frame.width / 2, y: -d - 0.6 }, ftin(frame.width, o.unit), 10, COLORS.dimension, 'dimensions', 'middle', 'bold');
    line([{ x: frame.width + d, y: 0 }, { x: frame.width + d, y: frame.depth }], COLORS.dimension, 1, 'dimensions');
    text({ x: frame.width + d + 0.6, y: frame.depth / 2 }, ftin(frame.depth, o.unit), 10, COLORS.dimension, 'dimensions', 'start', 'bold');
  }

  // 8. North arrow, always pointing to the top of the drawing
  const na = local({ x: frame.width + 9, y: frame.depth - 2 });
  const naBase = local({ x: frame.width + 9, y: frame.depth - 7 });
  items.push({ kind: 'polyline', points: [naBase, na], stroke: '#000', strokeWidth: 2, layer: 'north' });
  items.push({ kind: 'polygon', points: [na, { x: na.x - 5, y: na.y + 12 }, { x: na.x + 5, y: na.y + 12 }], fill: '#000', layer: 'north' });
  items.push({ kind: 'text', x: na.x, y: na.y - 6, text: 'N', size: 14, fill: '#000', anchor: 'middle', weight: 'bold', layer: 'north' });

  return { width: extent.width, height: extent.height, items };
}

/** Draws one opening onto the scene. */
function drawOpening(op: Opening, layout: Layout, local: (p: Pt) => Pt, items: Item[]) {
  const a = op.a;
  const b = op.b;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -d.y, y: d.x };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Wall thickness: the opening sits in the outer wall if it touches the outside.
  const outer = op.kind === 'mainDoor' || op.kind === 'window' || op.kind === 'ventilator';
  const t = outer ? WALL_EXTERNAL_FT : WALL_INTERNAL_FT;
  const h = t / 2;
  const gap = [
    { x: a.x + n.x * h, y: a.y + n.y * h },
    { x: b.x + n.x * h, y: b.y + n.y * h },
    { x: b.x - n.x * h, y: b.y - n.y * h },
    { x: a.x - n.x * h, y: a.y - n.y * h },
  ];
  items.push({ kind: 'polygon', points: gap.map(local), fill: COLORS.wallGap, layer: 'openings' });

  if (op.kind === 'window' || op.kind === 'ventilator') {
    for (const k of [-0.33, 0, 0.33]) {
      const off = { x: n.x * h * k * 2, y: n.y * h * k * 2 };
      items.push({ kind: 'polyline', points: [{ x: a.x + off.x, y: a.y + off.y }, { x: b.x + off.x, y: b.y + off.y }].map(local), stroke: COLORS.window, strokeWidth: 1.2, layer: 'openings' });
    }
    return;
  }
  if (op.kind === 'opening') return; // open kitchen: gap only

  // Door leaf hinged at `a`, swinging into the room the door opens into.
  const room = layout.rooms.find((r) => r.id === op.roomId);
  const roomCentre = room ? { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 } : mid;
  const side = (roomCentre.x - mid.x) * n.x + (roomCentre.y - mid.y) * n.y >= 0 ? 1 : -1;
  const leafDir = { x: n.x * side, y: n.y * side };
  const leafEnd = { x: a.x + leafDir.x * op.width, y: a.y + leafDir.y * op.width };
  items.push({ kind: 'polyline', points: [a, leafEnd].map(local), stroke: COLORS.door, strokeWidth: 1.4, layer: 'openings' });
  // Arc from the far end of the opening to the leaf tip, centred on the hinge
  const start = Math.atan2(b.y - a.y, b.x - a.x);
  const end = Math.atan2(leafDir.y, leafDir.x);
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const arc: Pt[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const ang = start + (sweep * i) / ARC_SEGMENTS;
    arc.push({ x: a.x + Math.cos(ang) * op.width, y: a.y + Math.sin(ang) * op.width });
  }
  items.push({ kind: 'polyline', points: arc.map(local), stroke: COLORS.door, strokeWidth: 0.8, dash: '3 2', layer: 'openings' });
}

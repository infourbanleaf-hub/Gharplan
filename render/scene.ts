// Plan renderer. Builds a flat list of drawing primitives (a "scene") from a Layout.
// The scene is platform-neutral: svg.ts turns it into an SVG string, and the app can map
// the same items onto react-native-svg.
import { localToWorld } from '../engine/frame';
import { formatLength, type Unit } from '../engine/units';
import type { Frame, Layout, Opening, PlacedRoom, Rect, Side } from '../engine/types';

import { openingGeometry, rectPoints, roomWalls, wallStrip, WALL_EXTERNAL_FT, WALL_INTERNAL_FT, type Pt } from './geometry';
export type { Pt };

export type Item =
  | { kind: 'polygon'; points: Pt[]; fill: string; stroke?: string; strokeWidth?: number; dash?: string; layer: Layer }
  | { kind: 'polyline'; points: Pt[]; stroke: string; strokeWidth: number; dash?: string; layer: Layer }
  | { kind: 'text'; x: number; y: number; text: string; size: number; fill: string; anchor: 'start' | 'middle' | 'end'; weight?: 'normal' | 'bold'; layer: Layer };

export type Layer = 'plot' | 'rooms' | 'parking' | 'furniture' | 'walls' | 'openings' | 'labels' | 'dimensions' | 'north';

export interface Scene {
  width: number;
  height: number;
  items: Item[];
}

export interface PlanLabels {
  car: string;
  twoWheeler: string;
  north: string;
}

export interface PlanOptions {
  unit: Unit;
  showSetbacks: boolean;
  showDimensions: boolean;
  showFurniture: boolean;
  /** Text for the parking and north labels. */
  labels: PlanLabels;
  /** Room names by kind, for translated labels. Engine labels are used where missing. */
  roomLabels?: Partial<Record<string, string>>;
  /** Room to outline in the accent colour (the one being edited). */
  selectedRoomId?: string;
  /** Rooms with validation issues, outlined in red. */
  issueRoomIds?: string[];
  /** Drawing units per foot. The SVG scales to fit its container, so this only sets proportions. */
  scale: number;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  unit: 'ftin',
  showSetbacks: true,
  showDimensions: true,
  showFurniture: true,
  labels: { car: 'Car', twoWheeler: '2W', north: 'N' },
  scale: 12,
};

export { WALL_EXTERNAL_FT, WALL_INTERNAL_FT };
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
  furniture: '#7d838c',
  selected: '#d08a00',
  issue: '#c0392b',
  parkingFill: '#eceef1',
};

const OPEN_FILL = '#f4f8ef';
const ROOM_FILL: Record<string, string> = {
  living: '#fdf3d0', dining: '#fde8d0', kitchen: '#e6f5d8', master: '#d9e8fb', bedroom: '#dfeefa',
  guest: '#dfeefa', attachedToilet: '#e8e2f5', commonToilet: '#e8e2f5', puja: '#fbe0ea',
  study: '#eef0d8', store: '#eeeeee', utility: '#e3f1f1', stair: '#f2f2f2', passage: '#ffffff',
};


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
  // 2b. Open space: left inside the envelope, not a room. Hatched so it reads as unbuilt.
  for (const open of layout.openSpaces) {
    poly(rectPoints(open), OPEN_FILL, 'rooms', { stroke: COLORS.dimension, strokeWidth: 0.6, dash: '3 3' });
  }

  // 3. Parking in the front setback
  for (const p of layout.parking) {
    poly(rectPoints(p.rect), COLORS.parkingFill, 'parking', { stroke: COLORS.parking, strokeWidth: 1 });
    const c = { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 };
    text(c, p.kind === 'car' ? o.labels.car : o.labels.twoWheeler, 9, COLORS.text, 'parking');
  }

  // 4. Furniture: thin grey outlines. Assumed sizes are dashed so they can be checked.
  if (o.showFurniture) {
    for (const f of layout.furniture) {
      poly(rectPoints(f.rect), 'none', 'furniture', {
        stroke: COLORS.furniture,
        strokeWidth: 0.9,
        dash: f.assumed ? '2 2' : undefined,
      });
    }
  }

  // 5. Walls, drawn as thick strips so they have real thickness
  for (const r of layout.rooms) {
    for (const w of roomWalls(r)) {
      poly(wallStrip(w.side, r.rect, w.t), COLORS.wall, 'walls');
    }
  }

  // 6. Openings: gap in the wall, then the door leaf and swing arc, or window glazing lines
  for (const op of layout.openings) drawOpening(op, layout, local, items);

  // 6b. Open space labels
  for (const open of layout.openSpaces) {
    const c = { x: open.x + open.w / 2, y: open.y + open.h / 2 };
    text(c, 'Open', 10, COLORS.dimension, 'labels', 'middle', undefined, 0);
  }

  // 7. Room labels and dimensions
  for (const r of layout.rooms) {
    if (r.kind === 'passage') continue;
    const c = { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 };
    const lines = labelLines(o.roomLabels?.[r.kind] ?? r.label);
    const lineGap = 11;
    const firstDy = -((lines.length - 1) * lineGap) / 2;
    lines.forEach((t, i) => text(c, t, 10, COLORS.text, 'labels', 'middle', 'bold', firstDy + i * lineGap));
    if (o.showDimensions) {
      const dims = `${ftin(r.rect.w, o.unit)} x ${ftin(r.rect.h, o.unit)}`;
      text(c, dims, 8, COLORS.dimension, 'dimensions', 'middle', undefined, firstDy + lines.length * lineGap + 2);
    }
  }

  // 8. Plot dimensions along the road and the side
  if (o.showDimensions) {
    const d = 3.2; // feet outside the plot
    line([{ x: 0, y: -d }, { x: frame.width, y: -d }], COLORS.dimension, 1, 'dimensions');
    text({ x: frame.width / 2, y: -d - 0.6 }, ftin(frame.width, o.unit), 10, COLORS.dimension, 'dimensions', 'middle', 'bold');
    line([{ x: frame.width + d, y: 0 }, { x: frame.width + d, y: frame.depth }], COLORS.dimension, 1, 'dimensions');
    text({ x: frame.width + d + 0.6, y: frame.depth / 2 }, ftin(frame.depth, o.unit), 10, COLORS.dimension, 'dimensions', 'start', 'bold');
  }

  // 9. Highlights for the room being edited and rooms with issues
  for (const r of layout.rooms) {
    if (r.id === o.selectedRoomId) poly(rectPoints(r.rect), 'none', 'labels', { stroke: COLORS.selected, strokeWidth: 3 });
    if (o.issueRoomIds?.includes(r.id)) poly(rectPoints(r.rect), 'none', 'labels', { stroke: COLORS.issue, strokeWidth: 3, dash: '6 3' });
  }

  // 10. North arrow, always pointing to the top of the drawing
  const na = local({ x: frame.width + 9, y: frame.depth - 2 });
  const naBase = local({ x: frame.width + 9, y: frame.depth - 7 });
  items.push({ kind: 'polyline', points: [naBase, na], stroke: '#000', strokeWidth: 2, layer: 'north' });
  items.push({ kind: 'polygon', points: [na, { x: na.x - 5, y: na.y + 12 }, { x: na.x + 5, y: na.y + 12 }], fill: '#000', layer: 'north' });
  items.push({ kind: 'text', x: na.x, y: na.y - 6, text: o.labels.north, size: 14, fill: '#000', anchor: 'middle', weight: 'bold', layer: 'north' });

  return { width: extent.width, height: extent.height, items };
}

/** Draws one opening onto the scene. */
function drawOpening(op: Opening, layout: Layout, local: (p: Pt) => Pt, items: Item[]) {
  const g = openingGeometry(op, layout);
  items.push({ kind: 'polygon', points: g.gap.map(local), fill: COLORS.wallGap, layer: 'openings' });
  for (const line of g.glazing) {
    items.push({ kind: 'polyline', points: line.map(local), stroke: COLORS.window, strokeWidth: 1.2, layer: 'openings' });
  }
  if (g.leaf) items.push({ kind: 'polyline', points: g.leaf.map(local), stroke: COLORS.door, strokeWidth: 1.4, layer: 'openings' });
  if (g.arc) items.push({ kind: 'polyline', points: g.arc.map(local), stroke: COLORS.door, strokeWidth: 0.8, dash: '3 2', layer: 'openings' });
}

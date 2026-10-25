// DXF (AutoCAD R12 ASCII) writer. Coordinates are in millimetres, north-up, origin at the
// plot's south-west corner. Walls are cut at doors and windows. Everything is on named layers.
import { localToWorld } from '../frame';
import { openingGeometry, rectPoints } from '../../render/geometry';
import { wallPieces } from './walls';
import type { Layout, Rect } from '../types';
import type { Pt } from '../../render/geometry';

const MM_PER_FT = 304.8;

const LAYERS: { name: string; colour: number }[] = [
  { name: 'PLOT', colour: 8 },
  { name: 'SETBACK', colour: 1 },
  { name: 'ROOMS', colour: 7 },
  { name: 'WALLS', colour: 7 },
  { name: 'DOORS', colour: 5 },
  { name: 'WINDOWS', colour: 4 },
  { name: 'FURNITURE', colour: 9 },
  { name: 'PARKING', colour: 8 },
  { name: 'TEXT', colour: 7 },
  { name: 'DIMENSIONS', colour: 5 },
  { name: 'NORTH', colour: 7 },
];

export interface DxfOptions {
  /** Text height for room labels, in mm. */
  textHeightMm: number;
}

const DEFAULTS: DxfOptions = { textHeightMm: 150 };

export function layoutToDxf(layout: Layout, opts: Partial<DxfOptions> = {}): string {
  const o = { ...DEFAULTS, ...opts };
  const frame = layout.frame;
  // World origin at the south-west corner of the plot.
  const corners = [{ x: 0, y: 0 }, { x: frame.width, y: 0 }, { x: frame.width, y: frame.depth }, { x: 0, y: frame.depth }]
    .map((p) => localToWorld(p.x, p.y, frame));
  const minX = Math.min(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const mm = (p: Pt): Pt => {
    const w = localToWorld(p.x, p.y, frame);
    return { x: (w.x - minX) * MM_PER_FT, y: (w.y - minY) * MM_PER_FT };
  };

  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), String(value));
  const line = (layer: string, a: Pt, b: Pt) => {
    g(0, 'LINE'); g(8, layer);
    g(10, a.x.toFixed(2)); g(20, a.y.toFixed(2)); g(30, 0);
    g(11, b.x.toFixed(2)); g(21, b.y.toFixed(2)); g(31, 0);
  };
  const polygon = (layer: string, pts: Pt[]) => {
    for (let i = 0; i < pts.length; i++) line(layer, mm(pts[i]), mm(pts[(i + 1) % pts.length]));
  };
  const polyline = (layer: string, pts: Pt[]) => {
    for (let i = 0; i + 1 < pts.length; i++) line(layer, mm(pts[i]), mm(pts[i + 1]));
  };
  const text = (layer: string, at: Pt, height: number, value: string) => {
    const p = mm(at);
    g(0, 'TEXT'); g(8, layer);
    g(10, p.x.toFixed(2)); g(20, p.y.toFixed(2)); g(30, 0);
    g(40, height); g(1, value.replace(/[\r\n]/g, ' ')); g(50, 0);
  };

  // Plot, setback box, rooms
  polygon('PLOT', rectPoints({ x: 0, y: 0, w: frame.width, h: frame.depth }));
  polygon('SETBACK', rectPoints(frame.buildable));
  for (const r of layout.rooms) polygon('ROOMS', rectPoints(r.rect));

  // Walls with gaps
  for (const piece of wallPieces(layout)) polygon('WALLS', rectPoints(piece.rect));

  // Doors and windows
  for (const op of layout.openings) {
    const geo = openingGeometry(op, layout);
    if (op.kind === 'window' || op.kind === 'ventilator') {
      for (const gl of geo.glazing) polyline('WINDOWS', gl);
    } else if (op.kind !== 'opening') {
      if (geo.leaf) polyline('DOORS', geo.leaf);
      if (geo.arc) polyline('DOORS', geo.arc);
    }
  }

  // Furniture and parking
  for (const f of layout.furniture) polygon('FURNITURE', rectPoints(f.rect));
  for (const p of layout.parking) polygon('PARKING', rectPoints(p.rect));

  // Labels and dimensions
  for (const r of layout.rooms) {
    if (r.kind === 'passage') continue;
    const c = centre(r.rect);
    text('TEXT', c, o.textHeightMm / MM_PER_FT, r.label);
    text('DIMENSIONS', { x: c.x, y: c.y - 1.1 }, (o.textHeightMm * 0.7) / MM_PER_FT, `${feetInches(r.rect.w)} x ${feetInches(r.rect.h)}`);
  }
  text('DIMENSIONS', { x: frame.width / 2, y: -3 }, o.textHeightMm / MM_PER_FT, feetInches(frame.width));
  text('DIMENSIONS', { x: frame.width + 3, y: frame.depth / 2 }, o.textHeightMm / MM_PER_FT, feetInches(frame.depth));

  // North arrow: a line pointing to world north, placed past the plot's north-east corner
  const na = mm({ x: frame.width + 8, y: frame.depth - 2 });
  line('NORTH', na, { x: na.x, y: na.y + 3000 });
  text('NORTH', { x: frame.width + 8, y: frame.depth - 6 }, 1, 'N');

  const head: string[] = [];
  const h = (code: number, value: string | number) => head.push(String(code), String(value));
  h(0, 'SECTION'); h(2, 'HEADER');
  h(9, '$ACADVER'); h(1, 'AC1009');
  h(9, '$INSUNITS'); h(70, 4);
  h(9, '$MEASUREMENT'); h(70, 1);
  h(0, 'ENDSEC');
  h(0, 'SECTION'); h(2, 'TABLES');
  h(0, 'TABLE'); h(2, 'LAYER'); h(70, LAYERS.length);
  for (const l of LAYERS) {
    h(0, 'LAYER'); h(2, l.name); h(70, 0); h(62, l.colour); h(6, 'CONTINUOUS');
  }
  h(0, 'ENDTAB');
  h(0, 'ENDSEC');
  h(0, 'SECTION'); h(2, 'ENTITIES');
  const tail = ['0', 'ENDSEC', '0', 'EOF'];
  return [...head, ...out, ...tail].join('\n') + '\n';
}

function centre(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function feetInches(ft: number): string {
  const inch = Math.round(ft * 12);
  return `${Math.floor(inch / 12)}'-${inch % 12}"`;
}

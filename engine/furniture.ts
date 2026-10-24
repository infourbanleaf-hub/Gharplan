// Furniture auto-placement. Runs once per selected layout, after rooms and openings are fixed.
// Items that cannot be placed without breaking a rule are reported, not forced.
import type { Frame, FurnitureItem, Opening, PlacedRoom, PlotInput, Rect, RoomKind, Side } from './types';
import { compassOfPoint } from './frame';
import { overlaps, contains } from './geometry';

const WALL_MARGIN = 0.5; // keep furniture off the wall face
const STEP = 0.5;
const WINDOW_CLEAR_DEPTH = 2;

export interface FurnitureSize {
  label: string;
  /** Long and short side in feet. */
  long: number;
  short: number;
  /** Clearance kept free on the sides that are not against the wall, in feet. */
  clearance: number;
  /** Assumed sizes are not in the brief; they are flagged for review. */
  assumed?: boolean;
}

type Variant = FurnitureSize;

/** Library from brief section 7, largest variant first; placement falls back to smaller ones. */
export const LIBRARY: Partial<Record<RoomKind, { kind: string; variants: Variant[]; against: 'long' | 'short'; wallRule?: 'bed' | 'tv' | 'none' }[]>> = {
  master: [
    { kind: 'bed', variants: [
      { label: 'King bed', long: 6.5, short: 6, clearance: 2.5 },
      { label: 'Queen bed', long: 6.5, short: 5, clearance: 2.5 },
      { label: 'Single bed', long: 6.5, short: 3, clearance: 2.5 },
    ], against: 'short', wallRule: 'bed' },
    { kind: 'wardrobe', variants: [{ label: 'Wardrobe', long: 6, short: 2, clearance: 2.5 }, { label: 'Wardrobe', long: 4, short: 2, clearance: 2.5 }], against: 'long' },
    { kind: 'side-table', variants: [{ label: 'Side table', long: 1.5, short: 1.5, clearance: 0, assumed: true }], against: 'long' },
  ],
  bedroom: [
    { kind: 'bed', variants: [
      { label: 'Queen bed', long: 6.5, short: 5, clearance: 2.5 },
      { label: 'Single bed', long: 6.5, short: 3, clearance: 2.5 },
    ], against: 'short', wallRule: 'bed' },
    { kind: 'wardrobe', variants: [{ label: 'Wardrobe', long: 6, short: 2, clearance: 2.5 }, { label: 'Wardrobe', long: 4, short: 2, clearance: 2.5 }], against: 'long' },
  ],
  guest: [
    { kind: 'bed', variants: [
      { label: 'Queen bed', long: 6.5, short: 5, clearance: 2.5 },
      { label: 'Single bed', long: 6.5, short: 3, clearance: 2.5 },
    ], against: 'short', wallRule: 'bed' },
    { kind: 'wardrobe', variants: [{ label: 'Wardrobe', long: 6, short: 2, clearance: 2.5 }, { label: 'Wardrobe', long: 4, short: 2, clearance: 2.5 }], against: 'long' },
  ],
  living: [
    { kind: 'sofa', variants: [
      { label: '3-seater sofa', long: 7, short: 3, clearance: 2 },
      { label: '2-seater sofa', long: 5, short: 3, clearance: 2 },
    ], against: 'long' },
    { kind: 'tv-unit', variants: [{ label: 'TV unit', long: 6, short: 1.5, clearance: 0 }], against: 'long', wallRule: 'tv' },
    { kind: 'centre-table', variants: [{ label: 'Centre table', long: 3, short: 2, clearance: 0, assumed: true }], against: 'long' },
  ],
  dining: [
    { kind: 'dining-table', variants: [
      { label: '6-seater table', long: 6, short: 3, clearance: 2.5 },
      { label: '4-seater table', long: 4, short: 3, clearance: 2.5 },
    ], against: 'long' },
  ],
  kitchen: [
    { kind: 'platform', variants: [
      { label: 'Kitchen platform', long: 7, short: 2, clearance: 2.5 },
      { label: 'Kitchen platform', long: 5, short: 2, clearance: 2.5 },
    ], against: 'long' },
    { kind: 'fridge', variants: [{ label: 'Fridge', long: 2.5, short: 2.5, clearance: 0 }], against: 'long' },
  ],
  attachedToilet: [
    { kind: 'wc', variants: [{ label: 'WC', long: 2.5, short: 1.5, clearance: 1.5, assumed: true }], against: 'long' },
    { kind: 'basin', variants: [{ label: 'Wash basin', long: 2, short: 1.5, clearance: 1.5, assumed: true }], against: 'long' },
    { kind: 'shower', variants: [{ label: 'Shower', long: 3, short: 3, clearance: 0, assumed: true }], against: 'long' },
  ],
  commonToilet: [
    { kind: 'wc', variants: [{ label: 'WC', long: 2.5, short: 1.5, clearance: 1.5, assumed: true }], against: 'long' },
    { kind: 'basin', variants: [{ label: 'Wash basin', long: 2, short: 1.5, clearance: 1.5, assumed: true }], against: 'long' },
  ],
  puja: [
    { kind: 'mandir', variants: [{ label: 'Mandir unit', long: 3, short: 1.5, clearance: 0, assumed: true }], against: 'long' },
  ],
  study: [
    { kind: 'desk', variants: [{ label: 'Study desk', long: 4, short: 2, clearance: 2.5 }], against: 'long' },
    { kind: 'bookshelf', variants: [{ label: 'Bookshelf', long: 3, short: 1, clearance: 0, assumed: true }], against: 'long' },
  ],
  utility: [
    { kind: 'washer', variants: [{ label: 'Washing machine', long: 2, short: 2, clearance: 1.5, assumed: true }], against: 'long' },
  ],
};

export interface FurnitureResult {
  items: FurnitureItem[];
  warnings: string[];
  /** Number of required items that could not be placed. */
  missing: number;
}

interface Zone {
  roomId: string;
  rect: Rect;
  why: string;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return overlaps(a, b);
}

/** Expands a rectangle by `c` on every side except the one touching the wall. */
function clearanceFor(body: Rect, wall: Side, c: number): Rect {
  if (c <= 0) return body;
  switch (wall) {
    case 'front': return { x: body.x - c, y: body.y, w: body.w + 2 * c, h: body.h + c };
    case 'back': return { x: body.x - c, y: body.y - c, w: body.w + 2 * c, h: body.h + c };
    case 'left': return { x: body.x, y: body.y - c, w: body.w + c, h: body.h + 2 * c };
    case 'right': return { x: body.x - c, y: body.y - c, w: body.w + c, h: body.h + 2 * c };
  }
}

/** Compass direction of a wall, measured from the plot centre at its midpoint. */
function wallCompass(room: Rect, wall: Side, frame: Frame): string {
  const mx = wall === 'left' ? room.x : wall === 'right' ? room.x + room.w : room.x + room.w / 2;
  const my = wall === 'front' ? room.y : wall === 'back' ? room.y + room.h : room.y + room.h / 2;
  return compassOfPoint(mx, my, frame);
}

/** Door swings, door spans and window zones where furniture must not go. */
function zonesFromOpenings(openings: Opening[], rooms: PlacedRoom[]): Zone[] {
  const zones: Zone[] = [];
  for (const o of openings) {
    const horizontal = Math.abs(o.a.y - o.b.y) < 1e-9;
    const lo = horizontal ? Math.min(o.a.x, o.b.x) : Math.min(o.a.y, o.b.y);
    const hi = horizontal ? Math.max(o.a.x, o.b.x) : Math.max(o.a.y, o.b.y);
    const at = horizontal ? o.a.y : o.a.x;
    for (const room of rooms) {
      const r = room.rect;
      const onRoom = horizontal
        ? (Math.abs(at - r.y) < 1e-6 || Math.abs(at - (r.y + r.h)) < 1e-6) && lo >= r.x - 1e-6 && hi <= r.x + r.w + 1e-6
        : (Math.abs(at - r.x) < 1e-6 || Math.abs(at - (r.x + r.w)) < 1e-6) && lo >= r.y - 1e-6 && hi <= r.y + r.h + 1e-6;
      if (!onRoom) continue;
      // Which way is inward for this room?
      const nearLow = horizontal ? Math.abs(at - r.y) < 1e-6 : Math.abs(at - r.x) < 1e-6;
      const isDoor = o.kind === 'door' || o.kind === 'mainDoor' || o.kind === 'opening';
      const isWindow = o.kind === 'window' || o.kind === 'ventilator';
      if (!isDoor && !isWindow) continue;
      if (isWindow && room.id !== o.roomId) continue;
      // Doors keep their full width clear on both sides: the swing and the walk-through.
      const depth = isWindow ? WINDOW_CLEAR_DEPTH : o.width;
      const span = hi - lo;
      const why = isWindow ? 'window' : 'door';
      if (horizontal) {
        zones.push({ roomId: room.id, rect: { x: lo - STEP, y: nearLow ? r.y : r.y + r.h - depth, w: span + 2 * STEP, h: depth }, why });
      } else {
        zones.push({ roomId: room.id, rect: { x: nearLow ? r.x : r.x + r.w - depth, y: lo - STEP, w: depth, h: span + 2 * STEP }, why });
      }
    }
  }
  return zones;
}

function candidatesOnWall(room: Rect, size: FurnitureSize, orient: 'long' | 'short', wall: Side): { body: Rect; wall: Side }[] {
  const along = orient === 'long' ? size.long : size.short;
  const depth = orient === 'long' ? size.short : size.long;
  const out: { body: Rect; wall: Side }[] = [];
  const horizontalWall = wall === 'front' || wall === 'back';
  const alongLen = horizontalWall ? room.w : room.h;
  if (along > alongLen - 2 * WALL_MARGIN + 1e-9) return out;
  const depthLimit = horizontalWall ? room.h : room.w;
  if (depth > depthLimit - 2 * WALL_MARGIN + 1e-9) return out;
  const start = horizontalWall ? room.x : room.y;
  const end = start + alongLen - 2 * WALL_MARGIN - along;
  for (let p = start + WALL_MARGIN; p <= end + 1e-9; p += STEP) {
    if (wall === 'front') out.push({ body: { x: p, y: room.y + WALL_MARGIN, w: along, h: depth }, wall });
    if (wall === 'back') out.push({ body: { x: p, y: room.y + room.h - WALL_MARGIN - depth, w: along, h: depth }, wall });
    if (wall === 'left') out.push({ body: { x: room.x + WALL_MARGIN, y: p, w: depth, h: along }, wall });
    if (wall === 'right') out.push({ body: { x: room.x + room.w - WALL_MARGIN - depth, y: p, w: depth, h: along }, wall });
  }
  return out;
}

const WALLS: Side[] = ['front', 'back', 'left', 'right'];

const FREE_STANDING = new Set(['dining-table', 'centre-table', 'sofa']);

function expand(body: Rect, c: number): Rect {
  return c <= 0 ? body : { x: body.x - c, y: body.y - c, w: body.w + 2 * c, h: body.h + 2 * c };
}

/** Positions anywhere in the room, both orientations, nearest the room centre first. */
function freeCandidates(room: Rect, size: FurnitureSize): Rect[] {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const out: Rect[] = [];
  for (const [w, h] of [[size.long, size.short], [size.short, size.long]]) {
    for (let x = room.x + WALL_MARGIN; x + w <= room.x + room.w - WALL_MARGIN + 1e-9; x += STEP) {
      for (let y = room.y + WALL_MARGIN; y + h <= room.y + room.h - WALL_MARGIN + 1e-9; y += STEP) {
        out.push({ x, y, w, h });
      }
    }
  }
  const dist = (r: Rect) => Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy);
  return out.sort((a, b) => dist(a) - dist(b));
}

export function placeFurniture(rooms: PlacedRoom[], openings: Opening[], frame: Frame, input: PlotInput): FurnitureResult {
  const items: FurnitureItem[] = [];
  const warnings: string[] = [];
  let missing = 0;
  const zones = zonesFromOpenings(openings, rooms);
  let n = 0;

  const placedBodies: { roomId: string; body: Rect }[] = [];
  const placedClearances: Rect[] = [];

  const fits = (body: Rect, clearance: Rect, room: PlacedRoom): boolean => {
    if (!contains(room.rect, body)) return false;
    for (const b of placedBodies) if (rectsOverlap(b.body, body)) return false;
    for (const c of placedClearances) if (rectsOverlap(c, body)) return false;
    // Clearance must stay inside the room.
    if (!contains(room.rect, clearance)) return false;
    for (const b of placedBodies) if (rectsOverlap(b.body, clearance)) return false;
    // Walking clearance may overlap a door swing or window: only the furniture body must stay clear.
    for (const z of zones) if (z.roomId === room.id && rectsOverlap(z.rect, body)) return false;
    return true;
  };

  // Rooms in a fixed order so the master bedroom and living room get first pick.
  const order: PlacedRoom[] = [...rooms].sort((a, b) => rank(a.kind) - rank(b.kind));
  for (const room of order) {
    const templates = LIBRARY[room.kind];
    if (!templates) continue;
    let sofaWall: Side | null = null;

    for (const tpl of templates) {
      let placed = false;
      for (const variant of tpl.variants) {
        if (placed) break;
        // Rank walls: bed headboard prefers S/W under Vastu; TV goes on the wall opposite the sofa.
        const walls = WALLS.map((w) => ({ w, score: wallScore(tpl, room, w, frame, input, sofaWall) }))
          .filter((x) => x.score > -Infinity)
          .sort((a, b) => b.score - a.score);
        for (const { w } of walls) {
          // Try the item both ways: its long side along the wall, or its short side along the wall.
          const orients: ('long' | 'short')[] = [tpl.against, tpl.against === 'long' ? 'short' : 'long'];
          const cands = orients.flatMap((o) => candidatesOnWall(room.rect, variant, o, w));
          for (const c of cands) {
            const clearance = clearanceFor(c.body, c.wall, variant.clearance);
            if (!fits(c.body, clearance, room)) continue;
            n++;
            const item: FurnitureItem = {
              id: `f${n}`,
              roomId: room.id,
              kind: tpl.kind,
              label: variant.label,
              rect: c.body,
              clearance: variant.clearance > 0 ? clearance : null,
              assumed: variant.assumed ?? false,
            };
            items.push(item);
            placedBodies.push({ roomId: room.id, body: c.body });
            if (item.clearance) placedClearances.push(item.clearance);
            if (tpl.kind === 'sofa') sofaWall = w;
            placed = true;
            break;
          }
          if (placed) break;
        }
      }
      // Free-standing fallback: tables are often in the middle of a room. Beds and wardrobes stay against walls.
      if (!placed && FREE_STANDING.has(tpl.kind)) {
        for (const variant of tpl.variants) {
          if (placed) break;
          for (const body of freeCandidates(room.rect, variant)) {
            const clearance = expand(body, variant.clearance);
            if (!fits(body, clearance, room)) continue;
            n++;
            items.push({
              id: `f${n}`, roomId: room.id, kind: tpl.kind, label: variant.label, rect: body,
              clearance: variant.clearance > 0 ? clearance : null, assumed: variant.assumed ?? false,
            });
            placedBodies.push({ roomId: room.id, body });
            if (variant.clearance > 0) placedClearances.push(clearance);
            placed = true;
            break;
          }
        }
      }
      if (!placed && !(tpl.kind === 'tv-unit' && sofaWall === null)) {
        missing++;
        warnings.push(`${room.label}: no room for ${tpl.kind.replace('-', ' ')}`);
      }
    }
  }
  return { items, warnings: [...new Set(warnings)], missing };
}

function rank(kind: RoomKind): number {
  const order: RoomKind[] = ['master', 'living', 'dining', 'bedroom', 'guest', 'kitchen', 'study', 'attachedToilet', 'commonToilet', 'puja', 'utility'];
  const i = order.indexOf(kind);
  return i < 0 ? 99 : i;
}

/** Preference for putting this item on a wall. -Infinity means not allowed. */
function wallScore(
  tpl: { kind: string; wallRule?: 'bed' | 'tv' | 'none' },
  room: PlacedRoom,
  wall: Side,
  frame: Frame,
  input: PlotInput,
  sofaWall: Side | null,
): number {
  if (tpl.kind === 'tv-unit' && sofaWall) {
    const opposite: Record<Side, Side> = { front: 'back', back: 'front', left: 'right', right: 'left' };
    return wall === opposite[sofaWall] ? 1 : -Infinity;
  }
  if (tpl.wallRule === 'bed' && input.vastu !== 'none') {
    const c = wallCompass(room.rect, wall, frame);
    if (c === 'S' || c === 'W' || c === 'SW') return 2;
    if (c === 'SE' || c === 'NW') return 1;
    return 0;
  }
  return 0;
}


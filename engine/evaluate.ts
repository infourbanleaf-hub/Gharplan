import type { Frame, PlacedRoom, PlotInput, RoomSpec, Rect, Scorecard, Side } from './types';
import { roomConfig } from './program';
import { contains, overlaps, rectArea, sharedEdge, exteriorSides } from './geometry';
import { scoreVastu, vastuMean, type RuleScore } from './vastu';
import { parkingFor } from './parking';

const MAX_ASPECT = 2;
const MAX_CIRCULATION = 0.12;
const IDEAL_CIRCULATION_MIN = 0.04;
const WINDOW_FT = 4;
const VENT_FT = 2;
const DOOR_CLEARANCE = 0.5;
const VASTU_FLAG_BELOW = 0.6;
/** A hall or passage may not be a corridor: no longer than this, nor wider than this, nor more than this many times its width. */
const MAX_PASSAGE_FT = 15;
const MAX_PASSAGE_WIDTH_FT = 5;
export const SERVICE_ROOM_KINDS = new Set(['attachedToilet', 'commonToilet', 'utility', 'store', 'puja']);
const MAX_PASSAGE_RATIO = 3;
const MAIN_DOOR_FT = 3.5;

const BEDROOM_KINDS = new Set(['master', 'bedroom', 'guest']);

export interface Candidate {
  rooms: PlacedRoom[];
}

export interface Evaluation {
  valid: boolean;
  violations: string[];
  /** Soft Vastu misses shown to the user as warnings. */
  vastuFlags: string[];
  scorecard: Scorecard;
  vastuRules: RuleScore[];
  total: number;
  /** Door-connection tree: child id -> parent id (living is the root). */
  parent: Map<string, string>;
}

export function isBedroom(kind: string): boolean {
  return BEDROOM_KINDS.has(kind);
}

export function isToilet(kind: string): boolean {
  return kind === 'commonToilet' || kind === 'attachedToilet';
}

/** Two rooms can share a door if their common wall is long enough for the smaller door. */
export function doorable(a: PlacedRoom, b: PlacedRoom, widthOf: (r: PlacedRoom) => number): boolean {
  const edge = sharedEdge(a.rect, b.rect);
  if (!edge) return false;
  const width = Math.min(widthOf(a), widthOf(b));
  return edge.length >= width + DOOR_CLEARANCE;
}

/** The living room may grow at most this far beyond its default in each dimension. */
const LIVING_MAX_GROWTH_FT = 2;
/** Score added for each envelope corner a niche cuts away, so stepped outlines can beat rectangles. */
const STEP_BONUS = 2;
/** Toilets may be at most this multiple of their default area. */
const TOILET_MAX_AREA_FACTOR = 1.5;

const isBedroomOrToilet = (kind: string) => isBedroom(kind) || kind === 'attachedToilet' || kind === 'commonToilet';

/**
 * Which rooms may share a door. A kitchen never opens to a bedroom or a toilet; a common toilet
 * opens only onto the living room or a passage.
 */
export function doorPermitted(a: PlacedRoom, b: PlacedRoom): boolean {
  if (a.kind === 'kitchen' && isBedroomOrToilet(b.kind)) return false;
  if (b.kind === 'kitchen' && isBedroomOrToilet(a.kind)) return false;
  if (a.kind === 'commonToilet' || b.kind === 'commonToilet') {
    const other = a.kind === 'commonToilet' ? b : a;
    return other.kind === 'living' || other.kind === 'passage';
  }
  return true;
}

/** Envelope corners that no room reaches: each one is a niche cut into the outline. */
export function uncoveredCorners(rooms: PlacedRoom[], env: Rect): number {
  const corners = [
    { x: env.x, y: env.y },
    { x: env.x + env.w, y: env.y },
    { x: env.x, y: env.y + env.h },
    { x: env.x + env.w, y: env.y + env.h },
  ];
  const covers = (r: Rect, p: { x: number; y: number }) =>
    p.x >= r.x - 1e-6 && p.x <= r.x + r.w + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.h + 1e-6;
  return corners.filter((p) => !rooms.some((r) => covers(r.rect, p))).length;
}

export function doorWidthOf(r: PlacedRoom, specs: Map<string, RoomSpec>): number {
  if (r.kind === 'passage') return 3.5;
  return specs.get(r.id)?.doorWidth ?? roomConfig(r.kind).doorWidth;
}

/**
 * Checks one candidate against every hard rule and computes its soft scores.
 * A candidate is valid only if `violations` is empty.
 */
export function evaluate(
  cand: Candidate,
  frame: Frame,
  input: PlotInput,
  specs: RoomSpec[],
): Evaluation {
  const violations: string[] = [];
  const specById = new Map(specs.map((s) => [s.id, s]));
  const rooms = cand.rooms;
  const widthOf = (r: PlacedRoom) => doorWidthOf(r, specById);

  // 1. Containment and overlap
  for (const r of rooms) {
    if (!contains(frame.interior, r.rect)) violations.push(`${r.label} lies outside the building envelope`);
  }
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (overlaps(rooms[i].rect, rooms[j].rect)) violations.push(`${rooms[i].label} overlaps ${rooms[j].label}`);
    }
  }

  // 1b. No corridors: a passage that is too long, or too narrow for its length, is rejected.
  for (const r of rooms) {
    if (r.kind !== 'passage') continue;
    const long = Math.max(r.rect.w, r.rect.h);
    const short = Math.min(r.rect.w, r.rect.h);
    if (long > MAX_PASSAGE_FT + 1e-6 || short > MAX_PASSAGE_WIDTH_FT + 1e-6 || long / short > MAX_PASSAGE_RATIO + 1e-6) {
      violations.push(
        `Passage is a corridor (${long.toFixed(1)} ft by ${short.toFixed(1)} ft); a passage must be ${MAX_PASSAGE_FT} ft or less long, ${MAX_PASSAGE_WIDTH_FT} ft or less wide, and at most 1:${MAX_PASSAGE_RATIO}`,
      );
    }
  }

  // 2. Minimum sizes and aspect ratio
  for (const r of rooms) {
    if (r.kind === 'passage') continue;
    const spec = specById.get(r.id)!;
    const short = Math.min(r.rect.w, r.rect.h);
    const long = Math.max(r.rect.w, r.rect.h);
    const relax = r.minRelaxFt ?? 0;
    const minShort = Math.min(spec.minW, spec.minH) - relax;
    const minLong = Math.max(spec.minW, spec.minH) - relax;
    if (short + 1e-6 < minShort || long + 1e-6 < minLong) {
      violations.push(`${r.label} is below minimum size`);
    }
    if (long / short > MAX_ASPECT + 1e-6) violations.push(`${r.label} is narrower than 1:${MAX_ASPECT}`);
  }

  // 3. Every habitable room and toilet needs an outside wall long enough for an opening
  const exterior = new Map<string, { side: Side; length: number }[]>();
  for (const r of rooms) {
    const ext = exteriorSides(r.rect, frame.interior);
    exterior.set(r.id, ext);
    if (r.kind === 'passage') continue;
    const needsWindow = roomConfig(r.kind).habitable;
    const needsVent = isToilet(r.kind) || r.kind === 'utility';
    if (!needsWindow && !needsVent) continue;
    const need = needsWindow ? WINDOW_FT + 1 : VENT_FT + 1;
    const longest = ext.reduce((m, e) => Math.max(m, e.length), 0);
    if (longest < need) {
      violations.push(needsWindow ? `${r.label} has no room for a window on an outer wall` : `${r.label} has no outer wall for a ventilator`);
    }
  }

  // 4. Entrance: living must open onto a road side
  const living = rooms.find((r) => r.kind === 'living');
  const roadSides = roadSidesOf(input);
  const livingRoad = living ? (exterior.get(living.id) ?? []).filter((e) => roadSides.includes(e.side)) : [];
  if (living && livingRoad.length === 0) violations.push('Living room does not face the road (no entrance)');
  if (living && livingRoad.length > 0 && Math.max(...livingRoad.map((e) => e.length)) < MAIN_DOOR_FT + 1) {
    violations.push('Living room road frontage too short for the main door');
  }
  // The main door needs a clear stretch of the living room's road edge that parking does not block.
  const livingOnFront = living ? (exterior.get(living.id) ?? []).some((e) => e.side === 'front') : false;
  if (living && livingOnFront && !mainDoorClear(living.rect, frame, input)) {
    violations.push('Living room has no clear stretch for the main door beside the parking');
  }

  // 5. Connectivity: door tree from the living room
  const parent = new Map<string, string>();
  if (living) {
    const reached = new Set<string>([living.id]);
    const isAttachedToilet = (r: PlacedRoom) => r.kind === 'attachedToilet';
    const linkable = (a: PlacedRoom, b: PlacedRoom) => {
      if (!doorPermitted(a, b)) return false;
      if (isAttachedToilet(a) || isAttachedToilet(b)) {
        const toilet = isAttachedToilet(a) ? a : b;
        const other = toilet === a ? b : a;
        return specById.get(toilet.id)?.attachedTo === other.id && doorable(a, b, widthOf);
      }
      return doorable(a, b, widthOf);
    };

    // Phase 1: reach everything without passing through a bedroom or an attached toilet.
    const queue = [living];
    while (queue.length) {
      const u = queue.shift()!;
      if (isBedroom(u.kind) || isAttachedToilet(u)) continue;
      for (const v of rooms) {
        if (reached.has(v.id) || v.kind === 'attachedToilet') continue;
        if (linkable(u, v)) {
          reached.add(v.id);
          parent.set(v.id, u.id);
          queue.push(v);
        }
      }
    }
    const commonToilets = rooms.filter((r) => r.kind === 'commonToilet');
    for (const t of commonToilets) {
      if (!reached.has(t.id)) violations.push('Common toilet can only be reached through a bedroom');
    }

    // Phase 2: attach bedrooms' own toilets and any rooms only reachable through bedrooms.
    let grew = true;
    while (grew) {
      grew = false;
      for (const v of rooms) {
        if (reached.has(v.id)) continue;
        const from = rooms.find((u) => reached.has(u.id) && linkable(u, v));
        if (from) {
          reached.add(v.id);
          parent.set(v.id, from.id);
          grew = true;
        }
      }
    }
    for (const r of rooms) {
      if (!reached.has(r.id)) violations.push(`${r.label} cannot be reached from the entrance`);
    }
  }

  // 5b. Dining must share a wall with the living room
  const livingHard = rooms.find((r) => r.kind === 'living');
  const diningHard = rooms.find((r) => r.kind === 'dining');
  if (livingHard && diningHard && !sharedEdge(livingHard.rect, diningHard.rect)) {
    violations.push('Dining room must share a wall with the living room');
  }

  // 5b2. The living room stays within default plus LIVING_MAX_GROWTH_FT in each dimension
  const livingSpec = livingHard ? specById.get(livingHard.id) : undefined;
  if (livingHard && livingSpec) {
    const long = Math.max(livingHard.rect.w, livingHard.rect.h);
    const short = Math.min(livingHard.rect.w, livingHard.rect.h);
    const maxLong = Math.max(livingSpec.defW, livingSpec.defH) + LIVING_MAX_GROWTH_FT;
    const maxShort = Math.min(livingSpec.defW, livingSpec.defH) + LIVING_MAX_GROWTH_FT;
    if (long > maxLong + 1e-6 || short > maxShort + 1e-6) {
      violations.push(`Living room is larger than its default plus ${LIVING_MAX_GROWTH_FT} ft`);
    }
  }

  // 5c. Toilets stay within their size cap
  for (const r of rooms) {
    if (r.kind !== 'attachedToilet' && r.kind !== 'commonToilet') continue;
    const spec = specById.get(r.id);
    if (spec && r.area > TOILET_MAX_AREA_FACTOR * spec.defW * spec.defH + 1e-6) {
      violations.push(`${r.label} is larger than ${TOILET_MAX_AREA_FACTOR} times its default size`);
    }
  }

  // 6. Vastu: scored, never a hard rule. Rooms below the 0.6 preference are flagged for the user.
  const vastuRules = scoreVastu(rooms);
  const vastuFlags = vastuRules
    .filter((rule) => rule.score < VASTU_FLAG_BELOW)
    .map((rule) => {
      const r = rooms.find((x) => x.id === rule.roomId)!;
      return `${r.label}: does not meet "${rule.rule}"`;
    });

  const scorecard = scoreCard(cand, frame, input, specById, exterior, vastuRules, parent);
  const total = scorecard.total + STEP_BONUS * uncoveredCorners(rooms, frame.interior);
  return { valid: violations.length === 0, violations, vastuFlags, scorecard, vastuRules, total, parent };
}

/** True if parking at either end of the frontage leaves room for the main door on the living room's front edge. */
function mainDoorClear(living: Rect, frame: Frame, input: PlotInput): boolean {
  const edgeFrom = living.x;
  const edgeTo = living.x + living.w;
  if (edgeTo - edgeFrom < MAIN_DOOR_FT + 1) return false;
  for (const end of ['left', 'right'] as const) {
    const slots = parkingFor(frame, input, end, []);
    const blocked = slots.map((p) => [p.rect.x - 1, p.rect.x + p.rect.w + 1] as const);
    // Largest free run of the edge after removing the blocked spans.
    let free = [[edgeFrom, edgeTo]] as [number, number][];
    for (const [lo, hi] of blocked) {
      free = free.flatMap(([a, b]): [number, number][] => [
        ...(lo > a ? [[a, Math.min(b, lo)] as [number, number]] : []),
        ...(hi < b ? [[Math.max(a, hi), b] as [number, number]] : []),
      ]);
    }
    if (free.some(([a, b]) => b - a >= MAIN_DOOR_FT + 1)) return true;
  }
  return false;
}

/** The room a room opens from, according to the door tree built during evaluation. */
function accessParent(parent: Map<string, string>, roomId: string, rooms: PlacedRoom[]): PlacedRoom | null {
  const id = parent.get(roomId);
  return id ? rooms.find((r) => r.id === id) ?? null : null;
}

function roadSidesOf(input: PlotInput): Side[] {
  const sides: Side[] = ['front'];
  if (input.roadSide === 'corner') {
    // Local left/right map to the 'left'/'right' sides in exteriorSides().
    sides.push(input.cornerSide);
  }
  return sides;
}

function scoreCard(
  cand: Candidate,
  frame: Frame,
  input: PlotInput,
  specById: Map<string, RoomSpec>,
  exterior: Map<string, { side: Side; length: number }[]>,
  vastuRules: RuleScore[],
  parent: Map<string, string>,
): Scorecard {
  const rooms = cand.rooms;
  const builtUp = rectArea(frame.buildable);
  const plotArea = frame.width * frame.depth;
  const carpet = rooms.reduce((s, r) => s + clearArea(r, exterior.get(r.id) ?? []), 0);
  const passage = rooms
    .filter((r) => r.kind === 'passage')
    .reduce((s, r) => s + clearArea(r, exterior.get(r.id) ?? []), 0);
  const circRatio = passage / builtUp;

  // Sizes: each room against its default area, capped at 1.
  // Sizes: each room against its default area (capped at 1), less a penalty for growing past its maximum.
  const sized = rooms.filter((r) => r.kind !== 'passage');
  const sizes = sized.reduce((s, r) => {
    const spec = specById.get(r.id)!;
    const maxW = spec.defW + 2;
    const maxH = spec.defH + 2;
    const over = Math.min(
      Math.max(0, r.rect.w - maxW) + Math.max(0, r.rect.h - maxH),
      Math.max(0, r.rect.w - maxH) + Math.max(0, r.rect.h - maxW),
    );
    // Service rooms are penalised harder for growing: spare space should go to the habitable rooms.
    const serviceRoom = SERVICE_ROOM_KINDS.has(r.kind);
    return s + Math.min(1, rectArea(r.rect) / (spec.defW * spec.defH)) * Math.max(0, 1 - over / (serviceRoom ? 1.5 : 4));
  }, 0) / Math.max(1, sized.length);

  // Ventilation: habitable rooms and toilets want openings on two different walls.
  const ventRooms = rooms.filter((r) => roomConfig(r.kind).habitable || isToilet(r.kind) || r.kind === 'utility');
  const vent = ventRooms.reduce((s, r) => {
    const sides = new Set((exterior.get(r.id) ?? []).map((e) => e.side)).size;
    return s + (sides >= 2 ? 1 : sides === 1 ? 0.6 : 0);
  }, 0) / Math.max(1, ventRooms.length);

  // Circulation: a hall of 4-12% of built-up area is ideal; none is acceptable; past 12% is penalised.
  const circScore = circRatio > MAX_CIRCULATION
    ? clamp01(1 - (circRatio - MAX_CIRCULATION) * 5)
    : circRatio >= IDEAL_CIRCULATION_MIN ? 1 : 0.6 + (circRatio / IDEAL_CIRCULATION_MIN) * 0.4;

  // Access: bedrooms opened from the hall or living room (not from another bedroom).
  const beds = rooms.filter((r) => isBedroom(r.kind));
  const bedAccess = beds.length === 0 ? 1 : beds.filter((b) => {
    const from = accessParent(parent, b.id, rooms);
    return from !== null && (from.kind === 'passage' || from.kind === 'living');
  }).length / beds.length;

  // Zoning: bedrooms away from the road side; wet rooms clustered; dining next to living.
  const roadSides = roadSidesOf(input);
  const bedsOffRoad = beds.length === 0 ? 1 : beds.filter((b) => !(exterior.get(b.id) ?? []).some((e) => roadSides.includes(e.side))).length / beds.length;
  const wetRooms = rooms.filter((r) => r.kind === 'commonToilet' || r.kind === 'attachedToilet' || r.kind === 'utility');
  const wetClustered = wetRooms.length <= 1 ? 1 : wetRooms.filter((w) => wetRooms.some((o) => o !== w && sharedEdge(w.rect, o.rect))).length / wetRooms.length;
  const livingRoom = rooms.find((r) => r.kind === 'living');
  const diningRoom = rooms.find((r) => r.kind === 'dining');
  const diningNextToLiving = !diningRoom || !livingRoom ? 1 : sharedEdge(diningRoom.rect, livingRoom.rect) ? 1 : 0;
  const zoning = (bedsOffRoad + wetClustered + diningNextToLiving) / 3;

  // Kitchen next to dining
  const kitchen = rooms.find((r) => r.kind === 'kitchen');
  const dining = rooms.find((r) => r.kind === 'dining');
  const kitchenDining = !dining || !kitchen ? 1 : sharedEdge(kitchen.rect, dining.rect)?.length ? 1 : 0;

  // Open plan: living/dining/kitchen sharing a long wall
  const openTrio = rooms.filter((r) => ['living', 'dining', 'kitchen'].includes(r.kind));
  let openPairs = 0;
  for (let i = 0; i < openTrio.length; i++) {
    for (let j = i + 1; j < openTrio.length; j++) {
      if ((sharedEdge(openTrio[i].rect, openTrio[j].rect)?.length ?? 0) >= 4) openPairs++;
    }
  }
  const openScore = Math.min(1, openPairs / 2);

  const vastu = vastuMean(vastuRules);

  // Weights by priority. Vastu only counts when it is required.
  const w = {
    size: 0.15, vent: 0.15, circ: 0.12, kd: 0.08, open: 0.08, access: 0.14, zoning: 0.12,
    vastu: input.vastu === 'strict' ? 0.3 : input.vastu === 'moderate' ? 0.15 : 0,
  };
  if (input.priority === 'size') w.size *= 1.8;
  if (input.priority === 'ventilation') w.vent *= 1.8;
  if (input.priority === 'openSpace') w.open *= 2.5;
  const parts: [number, number][] = [
    [w.size, sizes],
    [w.vent, vent],
    [w.circ, circScore],
    [w.kd, kitchenDining],
    [w.open, openScore],
    [w.access, bedAccess],
    [w.zoning, zoning],
  ];
  if (vastu !== null) parts.push([w.vastu, vastu]);
  const wsum = parts.reduce((s, [wt]) => s + wt, 0);
  const total = (parts.reduce((s, [wt, v]) => s + wt * v, 0) / wsum) * 100;

  return {
    carpetArea: carpet,
    builtUpArea: builtUp,
    groundCoverage: builtUp / plotArea,
    efficiency: (carpet / builtUp) * 100,
    circulation: circRatio * 100,
    vastu: vastu === null ? null : vastu * 100,
    ventilation: vent * 100,
    sizes: sizes * 100,
    total,
  };
}

const WALL_EXTERNAL_HALF = 0.375; // half of a 9" outer wall
const WALL_INTERNAL_HALF = 0.1875; // half of a 4.5" partition

/**
 * Clear floor area of a room: its centreline rectangle minus half of each wall on its sides.
 * Carpet area is the sum of these, so it matches what a room actually measures on site.
 */
export function clearArea(r: PlacedRoom, exterior: { side: Side }[]): number {
  const ext = new Set(exterior.map((e) => e.side));
  const dx = (ext.has('left') ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF) + (ext.has('right') ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF);
  const dy = (ext.has('front') ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF) + (ext.has('back') ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF);
  return Math.max(0, r.rect.w - dx) * Math.max(0, r.rect.h - dy);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

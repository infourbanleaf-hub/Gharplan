import roomDefaults from '../config/room-defaults.json';
// Basic room editing. A room keeps its top-left corner and takes a new width and height,
// clamped to its limits. Nothing else moves: the layout is re-checked and every broken rule is
// returned so the user can see what to fix.
import { buildProgram } from './program';
import { normaliseInput } from './generate';
import { clearArea } from './evaluate';
import { scoreVastu, vastuMean } from './vastu';
import { exteriorSides, overlaps, contains, sharedEdge } from './geometry';
import { compassOfPoint } from './frame';
import type { Layout, PlacedRoom, PlotInput, Rect, RoomSpec, Side } from './types';

export interface RoomEdit {
  w: number;
  h: number;
}

export interface RoomLimits {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

export interface ValidationIssue {
  roomId?: string;
  message: string;
}

const MAX_GROWTH = 2; // feet beyond the default size
const ASPECT = 2;
const WINDOW_FT = 4;
const VENT_FT = 2;

function specsFor(input: PlotInput): Map<string, RoomSpec> {
  return new Map(buildProgram(normaliseInput(input)).rooms.map((s) => [s.id, s]));
}

/** Allowed width and height for one room, in feet. */
export function roomLimits(input: PlotInput, roomId: string): RoomLimits | null {
  const spec = specsFor(input).get(roomId);
  if (!spec) return null;
  return { minW: spec.minW, minH: spec.minH, maxW: spec.defW * roomDefaults.sizeVariation.maxFactor, maxH: spec.defH * roomDefaults.sizeVariation.maxFactor };
}

/** Returns a copy of the layout with the edited rooms resized and every derived value refreshed. */
export function applyRoomEdits(layout: Layout, input: PlotInput, edits: Record<string, RoomEdit>): Layout {
  const rooms: PlacedRoom[] = layout.rooms.map((r) => {
    const e = edits[r.id];
    const limits = roomLimits(input, r.id);
    if (!e || !limits) return r;
    const w = clamp(e.w, limits.minW, limits.maxW);
    const h = clamp(e.h, limits.minH, limits.maxH);
    return { ...r, rect: { x: r.rect.x, y: r.rect.y, w, h } };
  });
  return refresh({ ...layout, rooms }, input);
}

/** Recomputes sides, compass, Vastu and the scorecard metrics from the room rectangles. */
function refresh(layout: Layout, input: PlotInput): Layout {
  const frame = layout.frame;
  const rooms = layout.rooms.map((r) => {
    const ext = exteriorSides(r.rect, frame.interior);
    const cx = r.rect.x + r.rect.w / 2;
    const cy = r.rect.y + r.rect.h / 2;
    return { ...r, area: r.rect.w * r.rect.h, exteriorSides: ext.map((e) => e.side), compass: compassOfPoint(cx, cy, frame) };
  });
  const builtUp = frame.buildable.w * frame.buildable.h;
  const exteriorOf = new Map(rooms.map((r) => [r.id, exteriorSides(r.rect, frame.interior)]));
  const carpet = rooms.reduce((s, r) => s + clearArea(r, exteriorOf.get(r.id) ?? []), 0);
  const passage = rooms.filter((r) => r.kind === 'passage').reduce((s, r) => s + clearArea(r, exteriorOf.get(r.id) ?? []), 0);
  const specs = specsFor(input);
  const sized = rooms.filter((r) => r.kind !== 'passage');
  const sizes = sized.reduce((s, r) => {
    const sp = specs.get(r.id);
    return s + (sp ? Math.min(1, r.rect.w * r.rect.h / (sp.defW * sp.defH)) : 1);
  }, 0) / Math.max(1, sized.length);
  const rules = scoreVastu(rooms);
  const vastu = vastuMean(rules);
  const ventRooms = rooms.filter((r) => r.kind !== 'passage' && (specs.get(r.id)?.habitable || r.kind.includes('Toilet') || r.kind === 'utility'));
  const vent = ventRooms.reduce((s, r) => {
    const n = new Set((exteriorOf.get(r.id) ?? []).map((e) => e.side)).size;
    return s + (n >= 2 ? 1 : n === 1 ? 0.6 : 0);
  }, 0) / Math.max(1, ventRooms.length);
  return {
    ...layout,
    rooms,
    vastuRules: rules,
    scorecard: {
      ...layout.scorecard,
      carpetArea: carpet,
      efficiency: (carpet / builtUp) * 100,
      circulation: (passage / builtUp) * 100,
      vastu: vastu === null ? null : vastu * 100,
      ventilation: vent * 100,
      sizes: sizes * 100,
    },
  };
}

/**
 * Checks the layout against the same rules generation uses, plus the consequences of a resize:
 * doors and windows that no longer sit on their wall, furniture that no longer fits.
 */
export function validateLayout(layout: Layout, input: PlotInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const frame = layout.frame;
  const specs = specsFor(input);
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  const name = (id: string) => byId.get(id)?.label ?? id;

  for (const r of layout.rooms) {
    if (!contains(frame.interior, r.rect)) issues.push({ roomId: r.id, message: `${r.label} is outside the building envelope` });
    const sp = specs.get(r.id);
    if (sp && r.kind !== 'passage') {
      const short = Math.min(r.rect.w, r.rect.h);
      const long = Math.max(r.rect.w, r.rect.h);
      if (short + 1e-6 < Math.min(sp.minW, sp.minH) || long + 1e-6 < Math.max(sp.minW, sp.minH)) {
        issues.push({ roomId: r.id, message: `${r.label} is below its minimum size` });
      }
      if (long / short > ASPECT + 1e-6) issues.push({ roomId: r.id, message: `${r.label} is narrower than 1:${ASPECT}` });
    }
    const ext = exteriorSides(r.rect, frame.interior);
    const longest = ext.reduce((m, e) => Math.max(m, e.length), 0);
    const needsWindow = sp?.habitable ?? false;
    const needsVent = r.kind === 'commonToilet' || r.kind === 'attachedToilet' || r.kind === 'utility';
    if (needsWindow && longest < WINDOW_FT + 1) issues.push({ roomId: r.id, message: `${r.label} has no outer wall left for a window` });
    if (needsVent && longest < VENT_FT + 1) issues.push({ roomId: r.id, message: `${r.label} has no outer wall left for a ventilator` });
  }

  for (let i = 0; i < layout.rooms.length; i++) {
    for (let j = i + 1; j < layout.rooms.length; j++) {
      const a = layout.rooms[i];
      const b = layout.rooms[j];
      if (overlaps(a.rect, b.rect)) issues.push({ roomId: a.id, message: `${a.label} overlaps ${b.label}` });
    }
  }

  for (const o of layout.openings) {
    if (o.kind === 'door' || o.kind === 'opening') {
      if (!o.otherRoomId) continue;
      const a = byId.get(o.roomId);
      const b = byId.get(o.otherRoomId);
      if (!a || !b) continue;
      const edge = sharedEdge(a.rect, b.rect);
      if (!edge || edge.length < o.width) {
        issues.push({ roomId: o.roomId, message: `Door between ${name(o.roomId)} and ${name(o.otherRoomId)} no longer fits on the shared wall` });
      }
    } else if (o.kind === 'window' || o.kind === 'ventilator') {
      const r = byId.get(o.roomId);
      if (!r) continue;
      const onOuter = exteriorSides(r.rect, frame.interior).some((e) => segmentOn(o, r.rect, e.side));
      if (!onOuter) issues.push({ roomId: o.roomId, message: `${o.kind === 'window' ? 'Window' : 'Ventilator'} in ${r.label} is no longer on an outer wall` });
    }
  }

  for (const r of layout.rooms) {
    const inside = layout.furniture.filter((f) => f.roomId === r.id);
    for (const f of inside) {
      if (!contains(r.rect, f.rect)) issues.push({ roomId: r.id, message: `${f.label} no longer fits in ${r.label}` });
    }
  }
  for (let i = 0; i < layout.furniture.length; i++) {
    for (let j = i + 1; j < layout.furniture.length; j++) {
      const a = layout.furniture[i];
      const b = layout.furniture[j];
      if (overlaps(a.rect, b.rect)) issues.push({ roomId: a.roomId, message: `${a.label} overlaps ${b.label}` });
    }
  }

  return dedupe(issues);
}

/** True if an opening lies along the given side of a room. */
function segmentOn(o: { a: { x: number; y: number }; b: { x: number; y: number } }, r: Rect, side: Side): boolean {
  const eps = 1e-6;
  if (side === 'front' || side === 'back') {
    const y = side === 'front' ? r.y : r.y + r.h;
    return Math.abs(o.a.y - y) < eps && Math.abs(o.b.y - y) < eps && Math.min(o.a.x, o.b.x) >= r.x - eps && Math.max(o.a.x, o.b.x) <= r.x + r.w + eps;
  }
  const x = side === 'left' ? r.x : r.x + r.w;
  return Math.abs(o.a.x - x) < eps && Math.abs(o.b.x - x) < eps && Math.min(o.a.y, o.b.y) >= r.y - eps && Math.max(o.a.y, o.b.y) <= r.y + r.h + eps;
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.roomId ?? ''}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

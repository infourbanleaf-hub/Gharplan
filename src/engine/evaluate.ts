import { roomConfig } from "./program";
import { roadSidesOf } from "./roads";
import { parkingFor } from "./parking";
import { clamp01 } from "./math";
import {
  EPS,
  contains,
  exteriorSides,
  overlaps,
  rectArea,
  sharedEdge,
} from "./geometry";
import { scoreVastu, vastuMean } from "./vastu";
import type {
  Candidate,
  CandidateRoom,
  ExteriorSide,
  Frame,
  NormalisedInput,
  RoomKind,
  RoomSpec,
  Scorecard,
  VastuRule,
} from "./types";

export const MAX_ASPECT = 2;
export const MAX_CIRCULATION = 0.12;
const IDEAL_CIRCULATION_MIN = 0.04;
const WINDOW_FT = 4;
const VENT_FT = 2;
const DOOR_CLEARANCE = 0.5;
export const VASTU_FLAG_BELOW = 0.6;
const MAX_PASSAGE_FT = 15;
const MAX_PASSAGE_WIDTH_FT = 5;
const MAX_PASSAGE_RATIO = 3;
export const MAIN_DOOR_FT = 3.5;
const PASSAGE_DOOR_FT = 3.5;
const SERVICE_ROOM_KINDS = new Set<RoomKind>(["attachedToilet", "commonToilet", "utility", "store", "puja"]);
const BEDROOM_KINDS = new Set<RoomKind>(["master", "bedroom", "guest"]);

export function isBedroom(kind: RoomKind): boolean {
  return BEDROOM_KINDS.has(kind);
}

export function isToilet(kind: RoomKind): boolean {
  return kind === "commonToilet" || kind === "attachedToilet";
}

export function isServiceRoom(kind: RoomKind): boolean {
  return SERVICE_ROOM_KINDS.has(kind);
}

export function doorWidthOf(r: CandidateRoom, specs: Map<string, RoomSpec>): number {
  if (r.kind === "passage") return PASSAGE_DOOR_FT;
  return specs.get(r.id)?.doorWidth ?? roomConfig(r.kind).doorWidth;
}

function doorable(a: CandidateRoom, b: CandidateRoom, widthOf: (r: CandidateRoom) => number): boolean {
  const edge = sharedEdge(a.rect, b.rect);
  if (!edge) return false;
  const width = Math.min(widthOf(a), widthOf(b));
  return edge.length >= width + DOOR_CLEARANCE;
}

export interface Evaluation {
  valid: boolean;
  violations: string[];
  vastuFlags: string[];
  scorecard: Scorecard;
  vastuRules: VastuRule[];
  total: number;
  /** Child room id to the id of the room it is reached through. */
  parent: Map<string, string>;
}

/** Checks a candidate against the rules and scores it. */
export function evaluate(
  cand: Candidate,
  frame: Frame,
  input: NormalisedInput,
  specs: RoomSpec[],
): Evaluation {
  const violations: string[] = [];
  const specById = new Map(specs.map((s) => [s.id, s]));
  const rooms = cand.rooms;
  const widthOf = (r: CandidateRoom) => doorWidthOf(r, specById);

  for (const r of rooms) {
    if (!contains(frame.interior, r.rect)) violations.push(`${r.label} lies outside the building envelope`);
  }
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (overlaps(rooms[i].rect, rooms[j].rect)) violations.push(`${rooms[i].label} overlaps ${rooms[j].label}`);
    }
  }
  const openShare = (input.openSpacePct ?? 0) / 100;
  const roomsArea = rooms.reduce((s, r) => s + rectArea(r.rect), 0);
  if (roomsArea > rectArea(frame.buildable) * (1 - openShare) + 1e-6) {
    violations.push(
      `Rooms cover more than ${100 - (input.openSpacePct ?? 0)}% of the built-up area; leave ${input.openSpacePct ?? 0}% open`,
    );
  }
  for (const r of rooms) {
    if (r.kind !== "passage") continue;
    const long = Math.max(r.rect.w, r.rect.h);
    const short = Math.min(r.rect.w, r.rect.h);
    if (long > MAX_PASSAGE_FT + 1e-6 || short > MAX_PASSAGE_WIDTH_FT + 1e-6 || long / short > MAX_PASSAGE_RATIO + 1e-6) {
      violations.push(
        `Passage is a corridor (${long.toFixed(1)} ft by ${short.toFixed(1)} ft); a passage must be ${MAX_PASSAGE_FT} ft or less long, ${MAX_PASSAGE_WIDTH_FT} ft or less wide, and at most 1:${MAX_PASSAGE_RATIO}`,
      );
    }
  }
  for (const r of rooms) {
    if (r.kind === "passage") continue;
    const spec = specById.get(r.id)!;
    const short = Math.min(r.rect.w, r.rect.h);
    const long = Math.max(r.rect.w, r.rect.h);
    const minShort = Math.min(spec.minW, spec.minH);
    const minLong = Math.max(spec.minW, spec.minH);
    if (short + 1e-6 < minShort || long + 1e-6 < minLong) {
      violations.push(`${r.label} is below minimum size`);
    }
    if (long / short > MAX_ASPECT + 1e-6) violations.push(`${r.label} is narrower than 1:${MAX_ASPECT}`);
  }

  const exterior = new Map<string, ExteriorSide[]>();
  for (const r of rooms) {
    const ext = exteriorSides(r.rect, frame.interior);
    exterior.set(r.id, ext);
    if (r.kind === "passage") continue;
    const needsWindow = roomConfig(r.kind).habitable;
    const needsVent = isToilet(r.kind) || r.kind === "utility";
    if (!needsWindow && !needsVent) continue;
    const need = needsWindow ? WINDOW_FT + 1 : VENT_FT + 1;
    const longest = ext.reduce((m, e) => Math.max(m, e.length), 0);
    if (longest < need) {
      violations.push(
        needsWindow ? `${r.label} has no room for a window on an outer wall` : `${r.label} has no outer wall for a ventilator`,
      );
    }
  }

  const living = rooms.find((r) => r.kind === "living");
  const roadSides = roadSidesOf(input);
  const livingRoad = living ? (exterior.get(living.id) ?? []).filter((e) => roadSides.includes(e.side)) : [];
  if (living && livingRoad.length === 0) violations.push("Living room does not face the road (no entrance)");
  if (living && livingRoad.length > 0 && Math.max(...livingRoad.map((e) => e.length)) < MAIN_DOOR_FT + 1) {
    violations.push("Living room road frontage too short for the main door");
  }
  const livingOnFront = living ? (exterior.get(living.id) ?? []).some((e) => e.side === "front") : false;
  if (living && livingOnFront && !mainDoorClear(living.rect, frame, input)) {
    violations.push("Living room has no clear stretch for the main door beside the parking");
  }

  // Access: a breadth-first walk from the living room. Bedrooms are leaves; attached toilets hang off their bedroom.
  const parent = new Map<string, string>();
  if (living) {
    const reached = new Set<string>([living.id]);
    const isAttachedToilet = (r: CandidateRoom) => r.kind === "attachedToilet";
    const linkable = (a: CandidateRoom, b: CandidateRoom): boolean => {
      if (isAttachedToilet(a) || isAttachedToilet(b)) {
        const toilet = isAttachedToilet(a) ? a : b;
        const other = toilet === a ? b : a;
        return specById.get(toilet.id)?.attachedTo === other.id && doorable(a, b, widthOf);
      }
      return doorable(a, b, widthOf);
    };
    const queue: CandidateRoom[] = [living];
    while (queue.length) {
      const u = queue.shift()!;
      if (isBedroom(u.kind) || isAttachedToilet(u)) continue;
      for (const v of rooms) {
        if (reached.has(v.id) || v.kind === "attachedToilet") continue;
        if (linkable(u, v)) {
          reached.add(v.id);
          parent.set(v.id, u.id);
          queue.push(v);
        }
      }
    }
    for (const t of rooms.filter((r) => r.kind === "commonToilet")) {
      if (!reached.has(t.id)) violations.push("Common toilet can only be reached through a bedroom");
    }
    // Second pass: rooms reachable only through a bedroom or an attached toilet.
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

  const vastuRules = scoreVastu(rooms);
  const vastuFlags = vastuRules
    .filter((rule) => rule.score < VASTU_FLAG_BELOW)
    .map((rule) => {
      const r = rooms.find((x) => x.id === rule.roomId)!;
      return `${r.label}: does not meet "${rule.rule}"`;
    });
  const scorecard = scoreCard(cand, frame, input, specById, exterior, vastuRules, parent);
  return { valid: violations.length === 0, violations, vastuFlags, scorecard, vastuRules, total: scorecard.total, parent };
}

/** True when the living room has a clear run of wall for the main door, beside any parking. */
export function mainDoorClear(
  living: { x: number; w: number },
  frame: Frame,
  input: NormalisedInput,
): boolean {
  const edgeFrom = living.x;
  const edgeTo = living.x + living.w;
  if (edgeTo - edgeFrom < MAIN_DOOR_FT + 1) return false;
  for (const end of ["left", "right"] as const) {
    const slots = parkingFor(frame, input, end, []);
    const blocked = slots.map((p) => [p.rect.x - 1, p.rect.x + p.rect.w + 1] as const);
    let free: [number, number][] = [[edgeFrom, edgeTo]];
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

function scoreCard(
  cand: Candidate,
  frame: Frame,
  input: NormalisedInput,
  specById: Map<string, RoomSpec>,
  exterior: Map<string, ExteriorSide[]>,
  vastuRules: VastuRule[],
  parent: Map<string, string>,
): Scorecard {
  const rooms = cand.rooms;
  const builtUp = rectArea(frame.buildable);
  const plotArea = frame.width * frame.depth;
  const carpet = rooms.reduce((s, r) => s + clearArea(r, exterior.get(r.id) ?? []), 0);
  const passage = rooms
    .filter((r) => r.kind === "passage")
    .reduce((s, r) => s + clearArea(r, exterior.get(r.id) ?? []), 0);
  const circRatio = passage / builtUp;

  // Sizes: how close each room is to its default, penalised for going too far over.
  const sized = rooms.filter((r) => r.kind !== "passage");
  const sizes =
    sized.reduce((s, r) => {
      const spec = specById.get(r.id)!;
      const maxW = spec.defW + 2;
      const maxH = spec.defH + 2;
      const over = Math.min(
        Math.max(0, r.rect.w - maxW) + Math.max(0, r.rect.h - maxH),
        Math.max(0, r.rect.w - maxH) + Math.max(0, r.rect.h - maxW),
      );
      const serviceRoom = isServiceRoom(r.kind);
      return (
        s +
        Math.min(1, rectArea(r.rect) / (spec.defW * spec.defH)) * Math.max(0, 1 - over / (serviceRoom ? 1.5 : 4))
      );
    }, 0) / Math.max(1, sized.length);

  // Ventilation: habitable and wet rooms with two outer walls score full marks.
  const ventRooms = rooms.filter((r) => roomConfig(r.kind).habitable || isToilet(r.kind) || r.kind === "utility");
  const vent =
    ventRooms.reduce((s, r) => {
      const sides = new Set((exterior.get(r.id) ?? []).map((e) => e.side)).size;
      return s + (sides >= 2 ? 1 : sides === 1 ? 0.6 : 0);
    }, 0) / Math.max(1, ventRooms.length);

  const circScore =
    circRatio > MAX_CIRCULATION
      ? clamp01(1 - (circRatio - MAX_CIRCULATION) * 5)
      : circRatio >= IDEAL_CIRCULATION_MIN
        ? 1
        : 0.6 + (circRatio / IDEAL_CIRCULATION_MIN) * 0.4;

  const beds = rooms.filter((r) => isBedroom(r.kind));
  const bedAccess =
    beds.length === 0
      ? 1
      : beds.filter((b) => {
          const from = accessParent(parent, b.id, rooms);
          return from !== null && (from.kind === "passage" || from.kind === "living");
        }).length / beds.length;

  const roadSides = roadSidesOf(input);
  const bedsOffRoad =
    beds.length === 0
      ? 1
      : beds.filter((b) => !(exterior.get(b.id) ?? []).some((e) => roadSides.includes(e.side))).length / beds.length;
  const wetRooms = rooms.filter((r) => r.kind === "commonToilet" || r.kind === "attachedToilet" || r.kind === "utility");
  const wetClustered =
    wetRooms.length <= 1
      ? 1
      : wetRooms.filter((w) => wetRooms.some((o) => o !== w && sharedEdge(w.rect, o.rect))).length / wetRooms.length;
  const livingRoom = rooms.find((r) => r.kind === "living");
  const diningRoom = rooms.find((r) => r.kind === "dining");
  const diningNextToLiving =
    !diningRoom || !livingRoom ? 1 : sharedEdge(diningRoom.rect, livingRoom.rect) ? 1 : 0;
  const zoning = (bedsOffRoad + wetClustered + diningNextToLiving) / 3;

  const kitchen = rooms.find((r) => r.kind === "kitchen");
  const dining = rooms.find((r) => r.kind === "dining");
  const kitchenDining = !dining || !kitchen ? 1 : sharedEdge(kitchen.rect, dining.rect)?.length ? 1 : 0;

  const openTrio = rooms.filter((r) => r.kind === "living" || r.kind === "dining" || r.kind === "kitchen");
  let openPairs = 0;
  for (let i = 0; i < openTrio.length; i++) {
    for (let j = i + 1; j < openTrio.length; j++) {
      if ((sharedEdge(openTrio[i].rect, openTrio[j].rect)?.length ?? 0) >= 4) openPairs++;
    }
  }
  const openScore = Math.min(1, openPairs / 2);

  const vastu = vastuMean(vastuRules);
  const w = {
    size: 0.15,
    vent: 0.15,
    circ: 0.12,
    kd: 0.08,
    open: 0.08,
    access: 0.14,
    zoning: 0.12,
    vastu: input.vastu === "strict" ? 0.3 : input.vastu === "moderate" ? 0.15 : 0,
  };
  if (input.priority === "size") w.size *= 1.8;
  if (input.priority === "ventilation") w.vent *= 1.8;
  if (input.priority === "openSpace") w.open *= 2.5;

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

const WALL_EXTERNAL_HALF = 0.375;
const WALL_INTERNAL_HALF = 0.1875;

/** Floor area left after the half-wall thickness on each side is taken off. */
export function clearArea(r: { rect: { w: number; h: number } }, exterior: ExteriorSide[]): number {
  const ext = new Set(exterior.map((e) => e.side));
  const dx = (ext.has("left") ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF) + (ext.has("right") ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF);
  const dy = (ext.has("front") ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF) + (ext.has("back") ? WALL_EXTERNAL_HALF : WALL_INTERNAL_HALF);
  return Math.max(0, r.rect.w - dx) * Math.max(0, r.rect.h - dy);
}

export function accessParent(parent: Map<string, string>, roomId: string, rooms: CandidateRoom[]): CandidateRoom | null {
  const id = parent.get(roomId);
  return id ? (rooms.find((r) => r.id === id) ?? null) : null;
}

export { EPS };

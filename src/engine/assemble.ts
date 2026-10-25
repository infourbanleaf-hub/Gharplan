import { roomDefaults } from "./config";
import { exteriorSides, sharedEdge } from "./geometry";
import { doorWidthOf, isServiceRoom, isToilet } from "./evaluate";
import { parkingFor } from "./parking";
import { placeFurniture } from "./furniture";
import { PREFERRED_ZONES } from "./vastu";
import { compassOfPoint, compassVector } from "./frame";
import { roadSidesOf } from "./roads";
import { shuffle } from "./rng";
import type { Evaluation } from "./evaluate";
import type {
  Candidate,
  CandidateRoom,
  Frame,
  Layout,
  NormalisedInput,
  Opening,
  PlanInput,
  Rect,
  RoomSpec,
  Shared,
  Side,
} from "./types";
import type { Item, PackedLeaf } from "./packing";

export const MAX_GROWTH_FT = 2;
const MAIN_DOOR_FT = roomDefaults.mainDoorWidthFt;
const OPEN_KITCHEN_FT = roomDefaults.openKitchenWidthFt;
const WINDOW_FT = roomDefaults.windowWidthFt;
const VENT_FT = roomDefaults.ventilatorWidthFt;

export interface Segment {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** Turns packed leaves into a candidate: rooms with their outer walls and compass direction, plus open space. */
export function toCandidate(leaves: PackedLeaf[], frame: Frame): Candidate {
  let passageNo = 0;
  const openSpaces = leaves.filter((leaf) => leaf.open).map((leaf) => leaf.rect);
  const rooms: CandidateRoom[] = leaves
    .filter((leaf) => !leaf.open)
    .map((leaf) => {
      const rect = leaf.rect;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const base = leaf.spec
        ? {
            id: leaf.spec.id,
            kind: leaf.spec.kind,
            label: leaf.spec.label,
            habitable: leaf.spec.habitable,
            attachedTo: leaf.spec.attachedTo,
          }
        : { id: `passage-${++passageNo}`, kind: "passage" as const, label: "Passage", habitable: false };
      return {
        ...base,
        rect,
        area: rect.w * rect.h,
        exteriorSides: exteriorSides(rect, frame.interior).map((e) => e.side),
        compass: compassOfPoint(cx, cy, frame),
      };
    });
  return { rooms, openSpaces };
}

/** Share of rooms that moved between two candidates; used to keep returned plans distinct. */
export function difference(a: Candidate, b: Candidate): number {
  const byId = new Map(b.rooms.map((r) => [r.id, r.rect]));
  let moved = 0;
  for (const r of a.rooms) {
    const o = byId.get(r.id);
    if (!o) {
      moved++;
      continue;
    }
    if (
      Math.abs(o.x - r.rect.x) > 0.5 ||
      Math.abs(o.y - r.rect.y) > 0.5 ||
      Math.abs(o.w - r.rect.w) > 0.5 ||
      Math.abs(o.h - r.rect.h) > 0.5
    ) {
      moved++;
    }
  }
  return moved / a.rooms.length;
}

/** Each bedroom is grouped with its attached toilet, so they are placed together. */
function bundlesOf(items: Item[]): Item[][] {
  const bundles: Item[][] = [];
  for (const it of items) {
    if (it.spec.kind === "attachedToilet") continue;
    const att = items.find((x) => x.spec.kind === "attachedToilet" && x.spec.attachedTo === it.spec.id);
    bundles.push(att ? [it, att] : [it]);
  }
  return bundles;
}

export function orderItems(items: Item[], rand: () => number): Item[] {
  const shuffled = shuffle(bundlesOf(items), rand);
  const living = shuffled.findIndex((b) => b[0].spec.kind === "living");
  if (living > 0 && rand() < 0.5) {
    const [b] = shuffled.splice(living, 1);
    shuffled.unshift(b);
  }
  return shuffled.flat();
}

/** Orders bundles by their preferred zone's position relative to the front, so zones stack roughly as Vastu suggests. */
export function orderItemsZoned(items: Item[], frame: Frame, rand: () => number): Item[] {
  const bundles = bundlesOf(items);
  const keyOf = (bundle: Item[]): number => {
    const zones = bundle.flatMap((it) => PREFERRED_ZONES[it.spec.kind] ?? []);
    if (zones.length === 0) return 0;
    const v = zones.reduce(
      (acc, c) => {
        const [wx, wy] = compassVector(c);
        return [acc[0] + wx / zones.length, acc[1] + wy / zones.length];
      },
      [0, 0],
    );
    const lx = v[0] * frame.right[0] + v[1] * frame.right[1];
    const ly = v[0] * frame.inward[0] + v[1] * frame.inward[1];
    return lx + ly + (rand() - 0.5) * 0.3;
  };
  return bundles
    .map((b) => ({ b, k: keyOf(b) }))
    .sort((a, b) => a.k - b.k)
    .flatMap((x) => x.b);
}

export function oversizeCost(cand: Candidate, specs: RoomSpec[]): number {
  const byId = new Map(specs.map((x) => [x.id, x]));
  let total = 0;
  for (const r of cand.rooms) {
    const sp = byId.get(r.id);
    if (!sp) continue;
    const maxW = sp.defW + MAX_GROWTH_FT;
    const maxH = sp.defH + MAX_GROWTH_FT;
    const over = Math.min(
      Math.max(0, r.rect.w - maxW) + Math.max(0, r.rect.h - maxH),
      Math.max(0, r.rect.w - maxH) + Math.max(0, r.rect.h - maxW),
    );
    total += over * (isServiceRoom(r.kind) ? 3 : 0.5);
  }
  return total;
}

export function serviceOversize(cand: Candidate, specs: RoomSpec[]): number {
  const byId = new Map(specs.map((x) => [x.id, x]));
  let total = 0;
  for (const r of cand.rooms) {
    const sp = byId.get(r.id);
    if (!sp || !isServiceRoom(r.kind)) continue;
    const maxW = sp.defW + MAX_GROWTH_FT;
    const maxH = sp.defH + MAX_GROWTH_FT;
    total += Math.min(
      Math.max(0, r.rect.w - maxW) + Math.max(0, r.rect.h - maxH),
      Math.max(0, r.rect.w - maxH) + Math.max(0, r.rect.h - maxW),
    );
  }
  return total;
}

/** Under strict Vastu, penalises any Vastu rule scoring under 0.6. */
export function vastuDeficit(ev: Evaluation, input: Pick<PlanInput, "vastu">): number {
  if (input.vastu !== "strict") return 0;
  return ev.vastuRules.reduce((sum, r) => sum + Math.max(0, 0.6 - r.score) * 10, 0);
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

function edgeSegment(e: Shared): Segment {
  return e.axis === "v"
    ? { a: { x: e.x, y: e.y1 }, b: { x: e.x, y: e.y2 } }
    : { a: { x: e.x1, y: e.y }, b: { x: e.x2, y: e.y } };
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

/** Builds the full layout for one candidate: doors, windows, parking, furniture and warnings. */
export function assembleLayout(
  id: string,
  seed: number,
  cand: Candidate,
  ev: Evaluation,
  frame: Frame,
  input: NormalisedInput,
  specs: RoomSpec[],
  warnings: string[],
  doorShifts: Map<string, number> = new Map(),
): Layout {
  const specById = new Map(specs.map((s) => [s.id, s]));
  const rooms = cand.rooms;
  const widthOf = (r: CandidateRoom) => doorWidthOf(r, specById);
  const openings: Opening[] = [];
  const living = rooms.find((r) => r.kind === "living")!;
  const roadSides = roadSidesOf(input);
  const roadCandidates = exteriorSides(living.rect, frame.interior).filter((e) => roadSides.includes(e.side));
  const roadSide = roadCandidates.sort((a, b) => b.length - a.length)[0];
  const layoutWarnings = [...warnings];
  let parking = [] as ReturnType<typeof parkingFor>;
  let mainDoorCenter: { side: Side; at: number } | null = null;
  for (const end of ["left", "right"] as const) {
    parking = parkingFor(frame, input, end, layoutWarnings);
    mainDoorCenter = null;
    if (!roadSide) break;
    const seg = sideSegment(living.rect, roadSide.side);
    const blockedByParking: [number, number][] =
      roadSide.side === "front" ? parking.map((p) => [p.rect.x - 1, p.rect.x + p.rect.w + 1] as [number, number]) : [];
    const at = placeOnSide(seg, MAIN_DOOR_FT, blockedByParking);
    if (at !== null) {
      mainDoorCenter = { side: roadSide.side, at };
      break;
    }
  }
  if (roadSide) {
    if (mainDoorCenter) {
      const seg = sideSegment(living.rect, mainDoorCenter.side);
      openings.push({
        kind: "mainDoor",
        width: MAIN_DOOR_FT,
        ...centredSegment(seg, mainDoorCenter.at, MAIN_DOOR_FT),
        roomId: living.id,
      });
    } else {
      layoutWarnings.push("Main door cannot be placed clear of the parking on this frontage.");
    }
  }

  // Doors between rooms. Each door sits in the middle of the shared wall, nudged by the search's shift.
  for (const [childId, parentId] of ev.parent) {
    const child = rooms.find((r) => r.id === childId)!;
    const parent = rooms.find((r) => r.id === parentId)!;
    const edge = sharedEdge(child.rect, parent.rect);
    if (!edge) continue;
    const width = Math.min(widthOf(child), widthOf(parent));
    const open =
      (child.kind === "kitchen" && input.rooms.kitchenOpen) || (parent.kind === "kitchen" && input.rooms.kitchenOpen);
    const w = open ? OPEN_KITCHEN_FT : width;
    const lo = edge.axis === "v" ? edge.y1 : edge.x1;
    const hi = edge.axis === "v" ? edge.y2 : edge.x2;
    const mid = (lo + hi) / 2;
    const slack = Math.max(0, (hi - lo - w) / 2 - 0.25);
    const at = Math.min(hi - w / 2 - 0.25, Math.max(lo + w / 2 + 0.25, mid + (doorShifts.get(child.id) ?? 0) * slack));
    openings.push({
      kind: open ? "opening" : "door",
      width: w,
      ...centredSegment(edgeSegment(edge), at, w),
      roomId: child.id,
      otherRoomId: parent.id,
    });
  }

  // Windows and ventilators on each outer wall.
  for (const r of rooms) {
    if (r.kind === "passage" || r.kind === "stair" || r.kind === "puja" || r.kind === "store") continue;
    const habitable = specById.get(r.id)?.habitable ?? false;
    const width = habitable ? WINDOW_FT : VENT_FT;
    if (!habitable && !isToilet(r.kind) && r.kind !== "utility") continue;
    const kind = habitable ? "window" : "ventilator";
    for (const ext of exteriorSides(r.rect, frame.interior)) {
      const seg = sideSegment(r.rect, ext.side);
      const blocked: [number, number][] =
        mainDoorCenter && r.kind === "living" && mainDoorCenter.side === ext.side
          ? [[mainDoorCenter.at - MAIN_DOOR_FT / 2 - 1, mainDoorCenter.at + MAIN_DOOR_FT / 2 + 1]]
          : [];
      const at = placeOnSide(seg, width, blocked);
      if (at === null) continue;
      openings.push({ kind, width, ...centredSegment(seg, at, width), roomId: r.id });
    }
  }

  if (input.vastu !== "none") layoutWarnings.push(...ev.vastuFlags);
  const furniture = placeFurniture(rooms, openings, frame, input);
  layoutWarnings.push(...furniture.warnings);
  return {
    id,
    seed,
    frame,
    rooms,
    openSpaces: cand.openSpaces ?? [],
    openings,
    parking,
    furniture: furniture.items,
    missingFurniture: furniture.missing,
    scorecard: ev.scorecard,
    vastuRules: ev.vastuRules,
    warnings: [...new Set(layoutWarnings)],
  };
}

/** Fingerprint of a layout's room rectangles; equal signatures mean identical plans. */
export function layoutSignature(l: Pick<Layout, "rooms">): string {
  return l.rooms.map((r) => `${r.id}:${r.rect.x},${r.rect.y},${r.rect.w},${r.rect.h}`).join("|");
}

export function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

import roomDefaults from '../config/room-defaults.json';
import { buildFrame, compassOfPoint } from './frame';
import { buildProgram } from './program';
import { evaluate, doorWidthOf, isToilet, SERVICE_ROOM_KINDS, type Candidate, type Evaluation } from './evaluate';
import { exteriorSides, sharedEdge, type SharedEdge } from './geometry';
import { mulberry32, shuffle } from './rng';
import { preferenceScore, PREFERRED_ZONES } from './vastu';
import { compassVector } from './frame';
import { parkingFor } from './parking';
import { validatePlotInput } from './limits';
import { placeFurniture } from './furniture';
import type {
  Frame, GenerationResult, Layout, Opening, ParkingSlot, PlacedRoom, PlotInput, Rect, RoomSpec, Side,
} from './types';

const PASSAGE_FT = roomDefaults.passageWidthFt;
const WINDOW_FT = roomDefaults.windowWidthFt;
const VENT_FT = roomDefaults.ventilatorWidthFt;
const MAIN_DOOR_FT = roomDefaults.mainDoorWidthFt;
const OPEN_KITCHEN_FT = roomDefaults.openKitchenWidthFt;
const PASSAGE_PROBABILITY = 0.2;
const MIN_SLICE_FT = 3;
const MIN_DISTINCT = 0.35;
const FURNITURE_SHORTLIST = 60;
/** Feet a room may grow beyond its default in each dimension (matches the room limits in engine/edit.ts). */
export const MAX_GROWTH_FT = 2;
/** Search restarts for each fixed plan template. */
const TEMPLATE_RESTARTS = 80;
const MISSING_FURNITURE_COST = 6;

export interface GenerateOptions {
  count?: number;
  /** Number of independent search restarts. */
  restarts?: number;
  seed?: number;
}

export interface Item {
  spec: RoomSpec;
  weight: number;
}

export interface Leaf {
  rect: Rect;
  spec?: RoomSpec;
}

/** Input defaults so callers can pass only what they changed. */
export function normaliseInput(input: PlotInput): PlotInput {
  const attached = Array.from({ length: input.bhk }, (_, i) => input.attachedToilets[i] ?? i === 0);
  return { ...input, attachedToilets: attached };
}

export function generatePlans(rawInput: PlotInput, opts: GenerateOptions = {}): GenerationResult {
  const input = normaliseInput(rawInput);
  const limitErrors = validatePlotInput(input);
  if (limitErrors.length > 0) return { layouts: [], errors: limitErrors, warnings: [], stats: { sampled: 0, valid: 0 } };
  const count = opts.count ?? 3;
  const restarts = opts.restarts ?? 400;
  const seed = opts.seed ?? 20260101;
  const errors: string[] = [];
  const warnings: string[] = [];

  const frame = buildFrame(input);
  const program = buildProgram(input);
  warnings.push(...program.warnings);

  if (frame.interior.w <= 0 || frame.interior.h <= 0) {
    return { layouts: [], errors: ['Setbacks leave no buildable area on this plot.'], warnings, stats: { sampled: 0, valid: 0 } };
  }

  const items = allocate(program.rooms, frame.interior);
  const minNeeded = program.rooms.reduce((s, r) => s + r.minW * r.minH, 0);
  const interiorArea = frame.interior.w * frame.interior.h;
  if (minNeeded > interiorArea) {
    errors.push(
      `Plot is too small for this programme: rooms need about ${Math.round(minNeeded)} sq ft, ` +
        `but the building envelope is ${Math.round(interiorArea)} sq ft. Reduce rooms or enlarge the plot.`,
    );
    return { layouts: [], errors, warnings, stats: { sampled: 0, valid: 0 } };
  }

  const penalty = vastuPenalty(frame, input);
  // Zone-first starts are optional (strict Vastu only): a small gain, measured over three seeds.
  const zoned = input.vastu === 'strict' && input.zoneFirst === true;
  const rand = mulberry32(seed);
  const valid: { cand: Candidate; ev: Evaluation; seed: number }[] = [];
  let sampled = 0;

  // Each restart is a short hill-climb over the room order. Cost = size penalty + hard violations.
  const evaluateOrder = (order: Item[], structSeed: number, chainSeed: number) => {
    const { leaves, pen } = optimise(buildTree(order, mulberry32(structSeed)), frame.interior, mulberry32(chainSeed), penalty);
    if (pen > 0) return { cost: INFEASIBLE_COST + pen, cand: null as Candidate | null, ev: null as Evaluation | null };
    const cand = toCandidate(leaves, frame);
    const ev = evaluate(cand, frame, input, program.rooms);
    const invalid = ev.violations.length > 0 ? INFEASIBLE_COST : 0;
    return { cost: invalid + ev.violations.length * 5 + vastuDeficit(ev, input) + oversizeCost(cand, program.rooms), cand, ev };
  };

  for (let r = 0; r < restarts; r++) {
    sampled++;
    const restartRand = mulberry32(Math.floor(rand() * 2 ** 31));
    const structSeed = Math.floor(restartRand() * 2 ** 31);
    const chainSeed = Math.floor(restartRand() * 2 ** 31);
    let order = zoned && restartRand() < 0.5 ? orderItemsZoned(items, frame, restartRand) : orderItems(items, restartRand);
    let cur = evaluateOrder(order, structSeed, chainSeed);
    for (let step = 0; step < CHAIN_STEPS && cur.cost > 0; step++) {
      const next = order.slice();
      const i = Math.floor(restartRand() * next.length);
      const j = Math.floor(restartRand() * next.length);
      [next[i], next[j]] = [next[j], next[i]];
      const trial = evaluateOrder(next, structSeed, chainSeed + step + 1);
      if (trial.cost <= cur.cost) {
        order = next;
        cur = trial;
      }
    }
    if (cur.cand && cur.ev && cur.ev.valid) {
      valid.push({ cand: cur.cand, ev: cur.ev, seed: structSeed });
    }
  }

  valid.sort((a, b) => b.ev.total - a.ev.total);

  // Furniture fit decides between close candidates: missing items cost points.
  const shortlist = valid.slice(0, FURNITURE_SHORTLIST).map((v, i) => {
    const build = (shifts: Map<string, number>) => assembleLayout(`L${i + 1}`, v.seed, v.cand, v.ev, frame, input, program.rooms, warnings, shifts);
    const layout = fitDoors(build, [...v.ev.parent.keys()]);
    const adjusted = v.ev.total - MISSING_FURNITURE_COST * layout.missingFurniture - oversizeCost(v.cand, program.rooms);
    return { layout, cand: v.cand, adjusted };
  });
  shortlist.sort((a, b) => b.adjusted - a.adjusted);
  // Prefer plans where no toilet or service room exceeds its maximum; fall back to the rest only if needed.
  const sizeOk = (c: Candidate) => serviceOversize(c, program.rooms) === 0;
  const chosen: typeof shortlist = [];
  for (const pool of [shortlist.filter((v) => sizeOk(v.cand)), shortlist.filter((v) => !sizeOk(v.cand))]) {
    for (const v of pool) {
      if (chosen.length >= count) break;
      if (chosen.every((p) => difference(p.cand, v.cand) >= MIN_DISTINCT)) chosen.push(v);
    }
  }
  if (chosen.length === 0) {
    errors.push('No valid layout found for these inputs. Try relaxing Vastu to Moderate, or change room choices.');
  } else if (chosen.length < count) {
    warnings.push(`Only ${chosen.length} distinct valid layout${chosen.length === 1 ? '' : 's'} found for these inputs.`);
  }
  const layouts: Layout[] = chosen.map((c, i) => ({ ...c.layout, id: `L${i + 1}` }));
  return { layouts, errors, warnings: unique(warnings), stats: { sampled, valid: valid.length } };
}

/** Area weight for each room: defaults scaled to fill the envelope, clamped to min and default+2 ft. */
export function allocate(rooms: RoomSpec[], interior: Rect): Item[] {
  const interiorArea = interior.w * interior.h;
  const defTotal = rooms.reduce((s, r) => s + r.defW * r.defH, 0);
  const k = interiorArea / defTotal;
  return rooms.map((spec) => {
    const lo = spec.minW * spec.minH;
    const hi = (spec.defW + 2) * (spec.defH + 2);
    const weight = Math.min(hi, Math.max(lo, spec.defW * spec.defH * k));
    return { spec, weight };
  });
}

export interface LeafNode {
  spec: RoomSpec;
}

/** A cut of a rectangle into strips. `ratios` holds all but the last strip's share. */
export interface SplitNode {
  ratios: number[];
  longBias: boolean;
  /** Fixed cut axis (template layouts). Overrides longBias when set. */
  axis?: 'x' | 'y';
  passage: boolean;
  children: TreeNode[];
}

export type TreeNode = LeafNode | SplitNode;

function isLeaf(n: TreeNode): n is LeafNode {
  return 'spec' in n;
}

/** Builds a random slicing structure over the ordered rooms. Sizes are set later by optimise(). */
export function buildTree(items: Item[], rand: () => number): TreeNode {
  if (items.length === 1) return { spec: items[0].spec };
  const n = items.length;
  const groups = 2 + (n >= 3 && rand() < 0.5 ? 1 : 0);
  const cuts = pickCuts(items, groups, rand);
  const bounds = [0, ...cuts, n];
  const total = items.reduce((s2, it) => s2 + it.weight, 0);
  const ratios: number[] = [];
  const children: TreeNode[] = [];
  for (let g = 0; g < groups; g++) {
    const part = items.slice(bounds[g], bounds[g + 1]);
    children.push(buildTree(part, rand));
    if (g < groups - 1) ratios.push(part.reduce((s2, it) => s2 + it.weight, 0) / total);
  }
  return {
    ratios,
    longBias: rand() < 0.85,
    passage: groups === 2 && n >= 3 && rand() < PASSAGE_PROBABILITY,
    children,
  };
}

/** Lays the tree out inside `rect`. Returns the total constraint penalty (0 means every room fits). */
export type LeafPenalty = (spec: RoomSpec, rect: Rect) => number;

export function realize(node: TreeNode, rect: Rect, out: Leaf[], penaltyOf: LeafPenalty = leafPenalty): number {
  if (isLeaf(node)) {
    out.push({ rect, spec: node.spec });
    return penaltyOf(node.spec, rect);
  }
  const alongX = node.axis ? node.axis === 'x' : rect.w >= rect.h ? node.longBias : !node.longBias;
  const span = (alongX ? rect.w : rect.h) - (node.passage ? PASSAGE_FT : 0);
  const shares = [...node.ratios, 1 - node.ratios.reduce((a, b) => a + b, 0)];
  let pen = 0;
  let offset = 0;
  const last = node.children.length - 1;
  let used = 0; // room strips only; the passage is not part of `span`
  for (let g = 0; g < node.children.length; g++) {
    // Sizes are multiples of 1/16 ft so shared walls line up exactly; the last strip takes the remainder.
    let size = g === last ? span - used : quantise(shares[g] * span);
    used += size;
    if (size < MIN_SLICE_FT) {
      pen += (MIN_SLICE_FT - size) * 10;
      size = Math.max(size, 0.5);
    }
    const sub: Rect = alongX
      ? { x: rect.x + offset, y: rect.y, w: size, h: rect.h }
      : { x: rect.x, y: rect.y + offset, w: rect.w, h: size };
    pen += realize(node.children[g], sub, out, penaltyOf);
    offset += size;
    if (node.passage && g === 0) {
      const pr: Rect = alongX
        ? { x: rect.x + offset, y: rect.y, w: PASSAGE_FT, h: rect.h }
        : { x: rect.x, y: rect.y + offset, w: rect.w, h: PASSAGE_FT };
      out.push({ rect: pr });
      offset += PASSAGE_FT;
    }
  }
  return pen;
}

function quantise(ft: number): number {
  return Math.round(ft * 16) / 16;
}

/**
 * Slides internal doors toward either end of their shared wall, one at a time, and keeps each
 * shift that leaves more furniture placed. Only runs on layouts that will be shown.
 */
function fitDoors(build: (shifts: Map<string, number>) => Layout, childIds: string[]): Layout {
  let shifts = new Map<string, number>();
  let best = build(shifts);
  for (let pass = 0; pass < 2; pass++) {
    for (const id of childIds) {
      for (const k of [-1, 0, 1]) {
        if ((shifts.get(id) ?? 0) === k) continue;
        const trial = new Map(shifts).set(id, k);
        const layout = build(trial);
        if (layout.missingFurniture < best.missingFurniture) {
          best = layout;
          shifts = trial;
        }
      }
    }
  }
  return best;
}

/** Feet that rooms exceed their maximum size, summed. Discourages oversized rooms without blocking a plan. */
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
    total += over * (SERVICE_ROOM_KINDS.has(r.kind) ? 3 : 0.5);
  }
  return total;
}

/** Feet that toilets, utility, store and puja exceed their maximum (zero when all are within it). */
export function serviceOversize(cand: Candidate, specs: RoomSpec[]): number {
  const byId = new Map(specs.map((x) => [x.id, x]));
  let total = 0;
  for (const r of cand.rooms) {
    const sp = byId.get(r.id);
    if (!sp || !SERVICE_ROOM_KINDS.has(r.kind)) continue;
    const maxW = sp.defW + MAX_GROWTH_FT;
    const maxH = sp.defH + MAX_GROWTH_FT;
    total += Math.min(
      Math.max(0, r.rect.w - maxW) + Math.max(0, r.rect.h - maxH),
      Math.max(0, r.rect.w - maxH) + Math.max(0, r.rect.h - maxW),
    );
  }
  return total;
}

/** Strict Vastu: how far rooms fall short of the 0.6 preference, summed. Zero when not strict. */
function vastuDeficit(ev: Evaluation, input: PlotInput): number {
  if (input.vastu !== 'strict') return 0;
  return ev.vastuRules.reduce((sum, r) => sum + Math.max(0, 0.6 - r.score) * 10, 0);
}

/** Size-only penalty used by the search. Vastu is handled by the cost of feasible layouts. */
export function vastuPenalty(_frame: Frame, _input: PlotInput): LeafPenalty {
  return leafPenalty;
}

/** How far a room is from its minimum size and 1:2 aspect limit, in feet. */
function leafPenalty(spec: RoomSpec, rect: Rect): number {
  const short = Math.min(rect.w, rect.h);
  const long = Math.max(rect.w, rect.h);
  const minShort = Math.min(spec.minW, spec.minH);
  const minLong = Math.max(spec.minW, spec.minH);
  const aspect = long / short;
  return (
    Math.max(0, minShort - short) * 3 +
    Math.max(0, minLong - long) * 3 +
    Math.max(0, aspect - roomDefaults.maxAspect) * 10
  );
}

function collectSplits(node: TreeNode, out: SplitNode[] = []): SplitNode[] {
  if (!isLeaf(node)) {
    out.push(node);
    node.children.forEach((c) => collectSplits(c, out));
  }
  return out;
}

const OPTIMISE_STEPS = 300;
const CHAIN_STEPS = 25;
/** Any state that fails sizes or hard rules ranks above every state that passes them. */
const INFEASIBLE_COST = 1000;

/**
 * Hill-climbs the strip shares of one structure until every room meets its size limits.
 * Returns the layout leaves and the remaining penalty (0 = feasible).
 */
export function optimise(
  tree: TreeNode,
  rect: Rect,
  rand: () => number,
  penaltyOf: LeafPenalty = leafPenalty,
  steps = OPTIMISE_STEPS,
): { leaves: Leaf[]; pen: number } {
  const splits = collectSplits(tree);
  let pen = realize(tree, rect, [], penaltyOf);
  let bestPen = pen;
  const best = splits.map((n) => n.ratios.slice());
  // Simulated annealing on the strip shares: occasionally accept a worse state to escape plateaus.
  for (let step = 0; step < steps && bestPen > 0 && splits.length > 0; step++) {
    const temperature = 3 * (1 - step / steps) + 0.05;
    const node = splits[Math.floor(rand() * splits.length)];
    if (node.ratios.length === 0) continue;
    const i = Math.floor(rand() * node.ratios.length);
    const old = node.ratios[i];
    const scale = 0.02 + 0.15 * (1 - step / steps);
    node.ratios[i] = Math.min(0.9, Math.max(0.03, old + (rand() + rand() + rand() - 1.5) * scale));
    if (node.ratios.reduce((a, b) => a + b, 0) > 0.97) {
      node.ratios[i] = old;
      continue;
    }
    const p2 = realize(tree, rect, [], penaltyOf);
    if (p2 <= pen || rand() < Math.exp(-(p2 - pen) / temperature)) {
      pen = p2;
      if (pen < bestPen) {
        bestPen = pen;
        splits.forEach((n, k) => (best[k] = n.ratios.slice()));
      }
    } else {
      node.ratios[i] = old;
    }
  }
  splits.forEach((n, k) => (n.ratios = best[k]));
  const leaves: Leaf[] = [];
  pen = realize(tree, rect, leaves, penaltyOf);
  return { leaves, pen };
}

/**
 * Picks groups - 1 cut points so each group carries roughly an equal share of the weight
 * (with jitter). This stops a strip from being made of only tiny rooms.
 */
function pickCuts(items: Item[], groups: number, rand: () => number): number[] {
  const total = items.reduce((s2, it) => s2 + it.weight, 0);
  const cumulative: number[] = [];
  let acc = 0;
  for (const it of items) {
    acc += it.weight / total;
    cumulative.push(acc);
  }
  const cuts: number[] = [];
  let minIndex = 1;
  for (let g = 1; g < groups; g++) {
    const target = g / groups + (rand() - 0.5) * 0.24;
    let best = -1;
    for (let k = minIndex; k <= items.length - (groups - g); k++) {
      if (best < 0 || Math.abs(cumulative[k - 1] - target) < Math.abs(cumulative[best - 1] - target)) best = k;
    }
    if (best < 0) return [];
    cuts.push(best);
    minIndex = best + 1;
  }
  return cuts;
}

/**
 * Zone-first split order (strict Vastu only). Bundles whose rooms want the low-left part of the
 * plot (in local frame) go first, so the first strips land where those rooms belong. Rooms with
 * no zone rule keep a neutral position. The search then refines from there.
 */
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
  return bundles.map((b) => ({ b, k: keyOf(b) })).sort((a, b) => a.k - b.k).flatMap((x) => x.b);
}

function bundlesOf(items: Item[]): Item[][] {
  const bundles: Item[][] = [];
  for (const it of items) {
    if (it.spec.kind === 'attachedToilet') continue;
    const att = items.find((x) => x.spec.kind === 'attachedToilet' && x.spec.attachedTo === it.spec.id);
    bundles.push(att ? [it, att] : [it]);
  }
  return bundles;
}

/**
 * Random split order. A bedroom and its attached toilet stay next to each other in the
 * order, and the living room is sometimes put first so it lands on an outer edge.
 */
export function orderItems(items: Item[], rand: () => number): Item[] {
  const bundles: Item[][] = [];
  for (const it of items) {
    if (it.spec.kind === 'attachedToilet') continue;
    const att = items.find((x) => x.spec.kind === 'attachedToilet' && x.spec.attachedTo === it.spec.id);
    bundles.push(att ? [it, att] : [it]);
  }
  const shuffled = shuffle(bundles, rand);
  const living = shuffled.findIndex((b) => b[0].spec.kind === 'living');
  if (living > 0 && rand() < 0.5) {
    const [b] = shuffled.splice(living, 1);
    shuffled.unshift(b);
  }
  return shuffled.flat();
}

export function toCandidate(leaves: Leaf[], frame: Frame): Candidate {
  let passageNo = 0;
  const rooms: PlacedRoom[] = leaves.map((leaf) => {
    const rect = leaf.rect;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const base = leaf.spec
      ? { id: leaf.spec.id, kind: leaf.spec.kind, label: leaf.spec.label, habitable: leaf.spec.habitable, attachedTo: leaf.spec.attachedTo }
      : { id: `passage-${++passageNo}`, kind: 'passage' as const, label: 'Passage', habitable: false };
    return {
      ...base,
      rect,
      area: rect.w * rect.h,
      exteriorSides: exteriorSides(rect, frame.interior).map((e) => e.side),
      compass: compassOfPoint(cx, cy, frame),
    };
  });
  return { rooms };
}

/** Fraction of rooms whose rectangle moved by more than half a foot. */
function difference(a: Candidate, b: Candidate): number {
  const byId = new Map(b.rooms.map((r) => [r.id, r.rect]));
  let moved = 0;
  for (const r of a.rooms) {
    const o = byId.get(r.id);
    if (!o) {
      moved++;
      continue;
    }
    if (
      Math.abs(o.x - r.rect.x) > 0.5 || Math.abs(o.y - r.rect.y) > 0.5 ||
      Math.abs(o.w - r.rect.w) > 0.5 || Math.abs(o.h - r.rect.h) > 0.5
    ) moved++;
  }
  return moved / a.rooms.length;
}

function assembleLayout(
  id: string,
  seed: number,
  cand: Candidate,
  ev: Evaluation,
  frame: Frame,
  input: PlotInput,
  specs: RoomSpec[],
  warnings: string[],
  doorShifts: Map<string, number> = new Map(),
): Layout {
  const specById = new Map(specs.map((s) => [s.id, s]));
  const rooms = cand.rooms;
  const widthOf = (r: PlacedRoom) => doorWidthOf(r, specById);
  const openings: Opening[] = [];

  // Main door on the road-facing side of the living room. Parking sits at one end of the
  // frontage; try the left end first and use the right end if the door has no clear spot.
  const living = rooms.find((r) => r.kind === 'living')!;
  const roadSides: Side[] = input.roadSide === 'corner' ? ['front', input.cornerSide] : ['front'];
  const roadCandidates = exteriorSides(living.rect, frame.interior).filter((e) => roadSides.includes(e.side));
  const roadSide = roadCandidates.sort((a, b) => b.length - a.length)[0];
  const layoutWarnings: string[] = [...warnings];
  let parking: ParkingSlot[] = [];
  let mainDoorCenter: { side: Side; at: number } | null = null;
  for (const end of ['left', 'right'] as const) {
    parking = parkingFor(frame, input, end, layoutWarnings);
    mainDoorCenter = null;
    if (!roadSide) break;
    const seg = sideSegment(living.rect, roadSide.side);
    const blockedByParking: [number, number][] = roadSide.side === 'front'
      ? parking.map((p): [number, number] => [p.rect.x - 1, p.rect.x + p.rect.w + 1])
      : [];
    const at = placeOnSide(seg, MAIN_DOOR_FT, blockedByParking);
    if (at !== null) {
      mainDoorCenter = { side: roadSide.side, at };
      break;
    }
  }
  if (roadSide) {
    if (mainDoorCenter) {
      const seg = sideSegment(living.rect, mainDoorCenter.side);
      openings.push({ kind: 'mainDoor', width: MAIN_DOOR_FT, ...centredSegment(seg, mainDoorCenter.at, MAIN_DOOR_FT), roomId: living.id });
    } else {
      layoutWarnings.push('Main door cannot be placed clear of the parking on this frontage.');
    }
  }

  // Internal doors along the door tree found by the evaluator
  for (const [childId, parentId] of ev.parent) {
    const child = rooms.find((r) => r.id === childId)!;
    const parent = rooms.find((r) => r.id === parentId)!;
    const edge = sharedEdge(child.rect, parent.rect);
    if (!edge) continue;
    const width = Math.min(widthOf(child), widthOf(parent));
    const open = (child.kind === 'kitchen' && input.rooms.kitchenOpen) || (parent.kind === 'kitchen' && input.rooms.kitchenOpen);
    const w = open ? OPEN_KITCHEN_FT : width;
    const lo = edge.axis === 'v' ? edge.y1 : edge.x1;
    const hi = edge.axis === 'v' ? edge.y2 : edge.x2;
    // Centred by default; a shift slides the door toward one end of the shared wall.
    const mid = (lo + hi) / 2;
    const slack = Math.max(0, (hi - lo - w) / 2 - 0.25);
    const at = Math.min(hi - w / 2 - 0.25, Math.max(lo + w / 2 + 0.25, mid + (doorShifts.get(child.id) ?? 0) * slack));
    const seg = edgeSegment(edge);
    openings.push({
      kind: open ? 'opening' : 'door',
      width: w,
      ...centredSegment(seg, at, w),
      roomId: child.id,
      otherRoomId: parent.id,
    });
  }

  // Windows and ventilators on each outer wall of habitable rooms and toilets
  for (const r of rooms) {
    if (r.kind === 'passage' || r.kind === 'stair' || r.kind === 'puja' || r.kind === 'store') continue;
    const habitable = specById.get(r.id)?.habitable ?? false;
    const width = habitable ? WINDOW_FT : VENT_FT;
    if (!habitable && !isToilet(r.kind) && r.kind !== 'utility') continue;
    const kind = habitable ? 'window' : 'ventilator';
    for (const ext of exteriorSides(r.rect, frame.interior)) {
      const seg = sideSegment(r.rect, ext.side);
      const blocked: [number, number][] =
        mainDoorCenter && r.kind === 'living' && mainDoorCenter.side === ext.side
          ? [[mainDoorCenter.at - MAIN_DOOR_FT / 2 - 1, mainDoorCenter.at + MAIN_DOOR_FT / 2 + 1]]
          : [];
      const at = placeOnSide(seg, width, blocked);
      if (at === null) continue;
      openings.push({ kind, width, ...centredSegment(seg, at, width), roomId: r.id });
    }
  }

  if (input.vastu !== 'none') layoutWarnings.push(...ev.vastuFlags);
  const furniture = placeFurniture(rooms, openings, frame, input);
  layoutWarnings.push(...furniture.warnings);
  return {
    id,
    seed,
    frame,
    rooms,
    openings,
    parking,
    furniture: furniture.items,
    missingFurniture: furniture.missing,
    scorecard: ev.scorecard,
    vastuRules: ev.vastuRules,
    warnings: unique(layoutWarnings),
  };
}

function sideSegment(r: Rect, side: Side): { a: { x: number; y: number }; b: { x: number; y: number } } {
  switch (side) {
    case 'front':
      return { a: { x: r.x, y: r.y }, b: { x: r.x + r.w, y: r.y } };
    case 'back':
      return { a: { x: r.x, y: r.y + r.h }, b: { x: r.x + r.w, y: r.y + r.h } };
    case 'left':
      return { a: { x: r.x, y: r.y }, b: { x: r.x, y: r.y + r.h } };
    case 'right':
      return { a: { x: r.x + r.w, y: r.y }, b: { x: r.x + r.w, y: r.y + r.h } };
  }
}

function edgeSegment(e: SharedEdge): { a: { x: number; y: number }; b: { x: number; y: number } } {
  return e.axis === 'v'
    ? { a: { x: e.x, y: e.y1 }, b: { x: e.x, y: e.y2 } }
    : { a: { x: e.x1, y: e.y }, b: { x: e.x2, y: e.y } };
}

/** Opening endpoints centred at `at` along the segment, `width` long. */
function centredSegment(
  seg: { a: { x: number; y: number }; b: { x: number; y: number } },
  at: number,
  width: number,
): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const vertical = seg.a.x === seg.b.x;
  const lo = at - width / 2;
  const hi = at + width / 2;
  return vertical
    ? { a: { x: seg.a.x, y: lo }, b: { x: seg.a.x, y: hi } }
    : { a: { x: lo, y: seg.a.y }, b: { x: hi, y: seg.a.y } };
}

/** Centre of the largest free stretch along a wall, or null if nothing fits. Clearance: 1 ft beside an opening. */
function placeOnSide(
  seg: { a: { x: number; y: number }; b: { x: number; y: number } },
  width: number,
  blocked: [number, number][] = [],
): number | null {
  const vertical = seg.a.x === seg.b.x;
  const start = vertical ? Math.min(seg.a.y, seg.b.y) : Math.min(seg.a.x, seg.b.x);
  const end = vertical ? Math.max(seg.a.y, seg.b.y) : Math.max(seg.a.x, seg.b.x);
  let free: [number, number][] = [[start, end]];
  for (const [lo, hi] of blocked) {
    free = free.flatMap(([a, b]) => {
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

/** Pairwise distinctness helper, exported for tests. */
export function layoutSignature(l: Layout): string {
  return l.rooms.map((r) => `${r.id}:${r.rect.x},${r.rect.y},${r.rect.w},${r.rect.h}`).join('|');
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

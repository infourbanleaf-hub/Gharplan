import { roomDefaults } from "./config";
import type { Rect, RoomSpec } from "./types";

export const PASSAGE_FT = roomDefaults.passageWidthFt;
export const PASSAGE_ALLOWANCE_FT = 10;
export const ROOM_FILL_TARGET = 1;
export const MIN_OPEN_FT = 3;
export const MIN_SLICE_FT = 3;
export const STAGGER_PROBABILITY = 0.15;
export const STAGGER_DEPTHS_FT = [2, 3, 4, 5];
export const PASSAGE_PROBABILITY = 0.2;
export const OPTIMISE_STEPS = 300;
export const CHAIN_STEPS = 25;

export interface Stagger {
  side: "left" | "right" | "back";
  ft: number;
}

export interface LeafNode {
  spec: RoomSpec;
  stagger?: Stagger;
}

export interface SplitNode {
  ratios: number[];
  longBias: boolean;
  passage: boolean;
  children: TreeNode[];
  axis?: "x" | "y";
  /** Fixed splits keep their ratios; the optimiser leaves them alone (used for the staircase). */
  fixed?: boolean;
}

export type TreeNode = LeafNode | SplitNode;

export interface Item {
  spec: RoomSpec;
  weight: number;
}

export interface PackedLeaf {
  rect: Rect;
  spec?: RoomSpec;
  open?: boolean;
}

export type PenaltyFn = (spec: RoomSpec, rect: Rect) => number;

export interface Strip {
  rest: Rect;
  strip?: Rect;
}

export function isLeaf(n: TreeNode): n is LeafNode {
  return "spec" in n;
}

/** Target area per room: its default area scaled to the buildable area, clamped to its size range. */
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

function pickCuts(items: Item[], groups: number, rand: () => number): number[] {
  const total = items.reduce((s, it) => s + it.weight, 0);
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

/** Recursively splits the room list into a slicing tree. */
export function buildTree(items: Item[], rand: () => number): TreeNode {
  if (items.length === 1) {
    const leaf: LeafNode = { spec: items[0].spec };
    if (rand() < STAGGER_PROBABILITY) {
      const sides: Stagger["side"][] = ["left", "right", "back"];
      leaf.stagger = {
        side: sides[Math.floor(rand() * sides.length)],
        ft: STAGGER_DEPTHS_FT[Math.floor(rand() * STAGGER_DEPTHS_FT.length)],
      };
    }
    return leaf;
  }
  const n = items.length;
  const groups = 2 + (n >= 3 && rand() < 0.5 ? 1 : 0);
  const cuts = pickCuts(items, groups, rand);
  const bounds = [0, ...cuts, n];
  const total = items.reduce((s, it) => s + it.weight, 0);
  const ratios: number[] = [];
  const children: TreeNode[] = [];
  for (let g = 0; g < groups; g++) {
    const part = items.slice(bounds[g], bounds[g + 1]);
    children.push(buildTree(part, rand));
    if (g < groups - 1) ratios.push(part.reduce((s, it) => s + it.weight, 0) / total);
  }
  return {
    ratios,
    longBias: rand() < 0.85,
    passage: groups === 2 && n >= 3 && rand() < PASSAGE_PROBABILITY,
    children,
  };
}

export function quantise(ft: number): number {
  return Math.round(ft * 16) / 16;
}

/** Shifts a leaf in from one envelope edge, to break up a flush row of rooms. */
export function applyStagger(rect: Rect, stagger: Stagger, env: Rect): Rect {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const out = { ...rect };
  if (stagger.side === "left" && near(rect.x, env.x)) {
    out.x += stagger.ft;
    out.w -= stagger.ft;
  } else if (stagger.side === "right" && near(rect.x + rect.w, env.x + env.w)) {
    out.w -= stagger.ft;
  } else if (stagger.side === "back" && near(rect.y + rect.h, env.y + env.h)) {
    out.h -= stagger.ft;
  } else {
    return rect;
  }
  if (out.w < 1 || out.h < 1) return rect;
  return { x: quantise(out.x), y: quantise(out.y), w: quantise(out.w), h: quantise(out.h) };
}

/** Lays a tree out inside `rect`. Returns the penalty for rooms that are too small or too thin. */
export function realize(
  node: TreeNode,
  rect: Rect,
  out: PackedLeaf[],
  penaltyOf: PenaltyFn = leafPenalty,
  envelope?: Rect,
): number {
  if (isLeaf(node)) {
    const staggered = node.stagger && envelope ? applyStagger(rect, node.stagger, envelope) : rect;
    const cap = capOf(node.spec);
    const placed = clampKeepingCorner(staggered, cap.w, cap.h);
    out.push({ rect: placed, spec: node.spec });
    for (const spare of spareAround(staggered, placed)) out.push({ rect: spare, open: true });
    return penaltyOf(node.spec, placed);
  }
  const alongX = node.axis ? node.axis === "x" : rect.w >= rect.h ? node.longBias : !node.longBias;
  const span = (alongX ? rect.w : rect.h) - (node.passage ? PASSAGE_FT : 0);
  const shares = [...node.ratios, 1 - node.ratios.reduce((a, b) => a + b, 0)];
  let pen = 0;
  let offset = 0;
  const last = node.children.length - 1;
  let used = 0;
  for (let g = 0; g < node.children.length; g++) {
    let size = g === last ? span - used : quantise(shares[g] * span);
    used += size;
    if (size < MIN_SLICE_FT) {
      pen += (MIN_SLICE_FT - size) * 10;
      size = Math.max(size, 0.5);
    }
    const sub: Rect = alongX
      ? { x: rect.x + offset, y: rect.y, w: size, h: rect.h }
      : { x: rect.x, y: rect.y + offset, w: rect.w, h: size };
    pen += realize(node.children[g], sub, out, penaltyOf, envelope);
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

/** Default penalty: rooms below their minimum or too narrow for the aspect rule. */
export function leafPenalty(spec: RoomSpec, rect: Rect): number {
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

export function capOf(r: RoomSpec): { w: number; h: number } {
  const toilet = r.kind === "attachedToilet" || r.kind === "commonToilet";
  return toilet ? { w: r.defW + 1, h: r.defH + 1 } : { w: r.defW * 1.15, h: r.defH * 1.15 };
}

/** Clamps a rect to a room's cap while keeping its top-left corner fixed. */
export function clampKeepingCorner(r: Rect, w: number, h: number): Rect {
  const longCap = Math.max(w, h);
  const shortCap = Math.min(w, h);
  const wide = r.w >= r.h;
  return {
    x: r.x,
    y: r.y,
    w: Math.min(r.w, wide ? longCap : shortCap),
    h: Math.min(r.h, wide ? shortCap : longCap),
  };
}

export function spareAround(outer: Rect, inner: Rect): Rect[] {
  const spare: Rect[] = [];
  if (outer.w - inner.w > 0.5) spare.push({ x: inner.x + inner.w, y: outer.y, w: outer.w - inner.w, h: outer.h });
  if (outer.h - inner.h > 0.5) spare.push({ x: outer.x, y: inner.y + inner.h, w: inner.w, h: outer.h - inner.h });
  return spare;
}

/** Reserves a strip along the back of the plot for open space, when there is spare area for it. */
export function reserveOpenStrip(interior: Rect, rooms: RoomSpec[], openSpacePct: number): Strip {
  const area = interior.w * interior.h;
  const roomsDefault = rooms.reduce((sum, r) => (r.kind === "passage" ? sum : sum + r.defW * r.defH), 0);
  const want = roomsDefault * ROOM_FILL_TARGET + PASSAGE_FT * PASSAGE_ALLOWANCE_FT;
  const spare = Math.max(area - want, (area * openSpacePct) / 100);
  const tallest = Math.max(0, ...rooms.map((r) => r.defH));
  const depth = Math.min(interior.h - tallest, Math.floor((spare / interior.w) * 2) / 2);
  if (depth < MIN_OPEN_FT) return { rest: interior };
  return {
    rest: { x: interior.x, y: interior.y, w: interior.w, h: interior.h - depth },
    strip: { x: interior.x, y: interior.y + interior.h - depth, w: interior.w, h: depth },
  };
}

export function collectSplits(node: TreeNode, out: SplitNode[] = []): SplitNode[] {
  if (!isLeaf(node)) {
    if (!node.fixed) out.push(node);
    node.children.forEach((c) => collectSplits(c, out));
  }
  return out;
}

function touchesEnvelope(r: Rect, env: Rect): boolean {
  const eps = 1e-6;
  return (
    Math.abs(r.x - env.x) < eps ||
    Math.abs(r.y - env.y) < eps ||
    Math.abs(r.x + r.w - (env.x + env.w)) < eps ||
    Math.abs(r.y + r.h - (env.y + env.h)) < eps
  );
}

const INTERIOR_SPARE_COST = 0.05;

function layoutCost(tree: TreeNode, rect: Rect, penaltyOf: PenaltyFn, envelope: Rect): { pen: number; cost: number } {
  const out: PackedLeaf[] = [];
  const pen = realize(tree, rect, out, penaltyOf, envelope);
  let spare = 0;
  for (const l of out) {
    if (l.open && !touchesEnvelope(l.rect, envelope)) spare += l.rect.w * l.rect.h;
  }
  return { pen, cost: pen + spare * INTERIOR_SPARE_COST };
}


/** Simulated annealing over the split ratios of a tree. Stops early once the penalty is zero. */
export function optimise(
  tree: TreeNode,
  rect: Rect,
  rand: () => number,
  penaltyOf: PenaltyFn = leafPenalty,
  steps = OPTIMISE_STEPS,
  envelope: Rect = rect,
): { leaves: PackedLeaf[]; pen: number } {
  const splits = collectSplits(tree);
  let state = layoutCost(tree, rect, penaltyOf, envelope);
  let bestCost = state.cost;
  const best = splits.map((n) => n.ratios.slice());
  for (let step = 0; step < steps && bestCost > 0 && splits.length > 0; step++) {
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
    const next = layoutCost(tree, rect, penaltyOf, envelope);
    if (next.cost <= state.cost || rand() < Math.exp(-(next.cost - state.cost) / temperature)) {
      state = next;
      if (state.cost < bestCost) {
        bestCost = state.cost;
        splits.forEach((n, k) => (best[k] = n.ratios.slice()));
      }
    } else {
      node.ratios[i] = old;
    }
  }
  splits.forEach((n, k) => (n.ratios = best[k]));
  const leaves: PackedLeaf[] = [];
  const pen = realize(tree, rect, leaves, penaltyOf, envelope);
  return { leaves, pen };
}

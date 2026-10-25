import { buildFrame } from "./frame";
import { buildProgram } from "./program";
import { evaluate, type Evaluation } from "./evaluate";
import { mulberry32 } from "./rng";
import { validatePlotInput } from "./limits";
import {
  OPTIMISE_STEPS,
  CHAIN_STEPS,
  allocate,
  buildTree,
  leafPenalty,
  optimise,
  reserveOpenStrip,
  type PackedLeaf,
} from "./packing";
import {
  assembleLayout,
  difference,
  oversizeCost,
  orderItems,
  orderItemsZoned,
  serviceOversize,
  toCandidate,
  unique,
  vastuDeficit,
} from "./assemble";
import type {
  Candidate,
  Frame,
  GenerateOptions,
  GenerateResult,
  Layout,
  NormalisedInput,
  PlanInput,
  RoomSpec,
} from "./types";
import type { Item } from "./packing";

const MIN_DISTINCT = 0.35;
const FURNITURE_SHORTLIST = 60;
const MISSING_FURNITURE_COST = 6;
const INFEASIBLE_COST = 1e3;
/** Candidates with at most this many violations are kept as fallbacks when no valid plan is found. */
const NEAR_VIOLATIONS = 2;
const NEAR_KEEP = 200;
const CLOSEST_COUNT = 3;

export function normaliseInput(input: PlanInput): NormalisedInput {
  const attached = Array.from({ length: input.bhk }, (_, i) => input.attachedToilets[i] ?? i === 0);
  return { ...input, attachedToilets: attached };
}

interface Scored {
  cand: Candidate;
  ev: Evaluation;
  seed: number;
}

/** Tries each door shift for every room in the layout, keeping the shift that leaves the fewest pieces of furniture missing. */
function fitDoors(build: (shifts: Map<string, number>) => Layout, childIds: string[]): Layout {
  let shifts = new Map(childIds.map((id) => [id, -1]));
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

/** Generates up to `count` distinct valid layouts for the input. Deterministic for a given seed. */
export function generatePlans(rawInput: PlanInput, opts: GenerateOptions = {}): GenerateResult {
  const input = normaliseInput(rawInput);
  const limitErrors = validatePlotInput(input);
  if (limitErrors.length > 0) return { layouts: [], errors: limitErrors, warnings: [], stats: { sampled: 0, valid: 0 } };

  const count = opts.count ?? 3;
  const restarts = opts.restarts ?? 400;
  const seed = opts.seed ?? 20260101;
  const errors: string[] = [];
  const warnings: string[] = [];
  const frame: Frame = buildFrame(input);
  const program = buildProgram(input);
  warnings.push(...program.warnings);
  if (frame.interior.w <= 0 || frame.interior.h <= 0) {
    return { layouts: [], errors: ["Setbacks leave no buildable area on this plot."], warnings, stats: { sampled: 0, valid: 0 } };
  }

  const rooms: RoomSpec[] = program.rooms;
  const items = allocate(rooms, frame.interior);
  const minNeeded = rooms.reduce((s, r) => s + r.minW * r.minH, 0);
  const interiorArea = frame.interior.w * frame.interior.h;
  if (minNeeded > interiorArea) {
    errors.push(
      `Plot is too small for this programme: rooms need about ${Math.round(minNeeded)} sq ft, but the building envelope is ${Math.round(interiorArea)} sq ft. Reduce rooms or enlarge the plot.`,
    );
    return { layouts: [], errors, warnings, stats: { sampled: 0, valid: 0 } };
  }

  const reserved = reserveOpenStrip(frame.interior, rooms, input.openSpacePct ?? 0);
  const packed = { rest: frame.interior, strip: undefined as undefined | { x: number; y: number; w: number; h: number } };
  const zoned = input.vastu === "strict" && input.zoneFirst === true;
  const rand = mulberry32(seed);
  const valid: Scored[] = [];
  const near: (Scored & { violations: number })[] = [];
  let sampled = 0;

  const evaluateOrder = (
    order: Item[],
    structSeed: number,
    chainSeed: number,
    split: { rest: typeof frame.interior; strip?: typeof frame.interior },
  ): { cost: number; cand: Candidate | null; ev: Evaluation | null } => {
    const { leaves, pen } = optimise(
      buildTree(order, mulberry32(structSeed)),
      split.rest,
      mulberry32(chainSeed),
      leafPenalty,
      OPTIMISE_STEPS,
      frame.interior,
    );
    if (split.strip) leaves.push({ rect: split.strip, open: true } as PackedLeaf);
    if (pen > 0) return { cost: INFEASIBLE_COST + pen, cand: null, ev: null };
    const cand = toCandidate(leaves, frame);
    const ev = evaluate(cand, frame, input, rooms);
    if (ev.violations.length > 0 && ev.violations.length <= NEAR_VIOLATIONS) {
      near.push({ cand, ev, seed: structSeed, violations: ev.violations.length });
      if (near.length > NEAR_KEEP) near.splice(0, near.length - NEAR_KEEP);
    }
    const invalid = ev.violations.length > 0 ? INFEASIBLE_COST : 0;
    return {
      cost: invalid + ev.violations.length * 5 + vastuDeficit(ev, input) + oversizeCost(cand, rooms),
      cand,
      ev,
    };
  };

  for (let r = 0; r < restarts; r++) {
    sampled++;
    const restartRand = mulberry32(Math.floor(rand() * 2 ** 31));
    const structSeed = Math.floor(restartRand() * 2 ** 31);
    const chainSeed = Math.floor(restartRand() * 2 ** 31);
    let order: Item[] =
      zoned && restartRand() < 0.5 ? orderItemsZoned(items, frame, restartRand) : orderItems(items, restartRand);
    const split = reserved.strip && restartRand() < 0.75 ? reserved : packed;
    let cur = evaluateOrder(order, structSeed, chainSeed, split);
    for (let step = 0; step < CHAIN_STEPS && cur.cost > 0; step++) {
      const next = order.slice();
      const i = Math.floor(restartRand() * next.length);
      const j = Math.floor(restartRand() * next.length);
      [next[i], next[j]] = [next[j], next[i]];
      const trial = evaluateOrder(next, structSeed, chainSeed + step + 1, split);
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
  const shortlist = valid.slice(0, FURNITURE_SHORTLIST).map((v, i) => {
    const build = (shifts: Map<string, number>) =>
      assembleLayout(`L${i + 1}`, v.seed, v.cand, v.ev, frame, input, rooms, warnings, shifts);
    const layout = fitDoors(build, [...v.ev.parent.keys()]);
    const adjusted = v.ev.total - MISSING_FURNITURE_COST * layout.missingFurniture - oversizeCost(v.cand, rooms);
    return { layout, cand: v.cand, adjusted };
  });
  shortlist.sort((a, b) => b.adjusted - a.adjusted);

  // Plans that keep service rooms near their size come first; the rest only fill gaps.
  const sizeOk = (c: Candidate) => serviceOversize(c, rooms) === 0;
  const chosen: typeof shortlist = [];
  for (const pool of [shortlist.filter((v) => sizeOk(v.cand)), shortlist.filter((v) => !sizeOk(v.cand))]) {
    for (const v of pool) {
      if (chosen.length >= count) break;
      if (chosen.every((p) => difference(p.cand, v.cand) >= MIN_DISTINCT)) chosen.push(v);
    }
  }
  if (chosen.length === 0 && near.length > 0) {
    // No valid plan: return the closest candidates. Each one lists its violations, so it can be edited by hand.
    const closest = pickClosest(near, CLOSEST_COUNT);
    const layouts = closest.map((c, i) =>
      assembleLayout(`L${i + 1}`, c.seed, c.cand, c.ev, frame, input, rooms, warnings, new Map()),
    );
    warnings.push(
      "No fully valid plan was found for these inputs. The closest plans are shown; each lists its rule violations.",
    );
    return { layouts, errors, warnings: unique(warnings), stats: { sampled, valid: valid.length } };
  }
  if (chosen.length === 0) {
    errors.push("No valid layout found for these inputs. Try relaxing Vastu to Moderate, or change room choices.");
  } else if (chosen.length < count) {
    warnings.push(`Only ${chosen.length} distinct valid layout${chosen.length === 1 ? "" : "s"} found for these inputs.`);
  }
  const layouts = chosen.map((c, i) => ({ ...c.layout, id: `L${i + 1}` }));
  return { layouts, errors, warnings: unique(warnings), stats: { sampled, valid: valid.length } };
}

/** Fewest violations first, then the best score; keeps only plans that differ from each other. */
function pickClosest<T extends Scored & { violations: number }>(near: T[], count: number): T[] {
  const sorted = [...near].sort((a, b) => a.violations - b.violations || b.ev.total - a.ev.total);
  const chosen: T[] = [];
  for (const c of sorted) {
    if (chosen.length >= count) break;
    if (chosen.every((p) => difference(p.cand, c.cand) >= MIN_DISTINCT)) chosen.push(c);
  }
  return chosen;
}

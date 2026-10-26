import { assembleLayout } from "./assemble";
import { compassOfPoint } from "./frame";
import { exteriorSides } from "./geometry";
import { evaluate } from "./evaluate";
import { buildProgram } from "./program";
import type { Candidate, CandidateRoom, Frame, Layout, NormalisedInput, Rect } from "./types";

export interface EditResult {
  layout: Layout;
  /** Rule violations for the current geometry. Empty means the plan is valid. */
  violations: string[];
  vastuFlags: string[];
  total: number;
}

/** Rebuilds the derived fields (area, outer walls, compass) for rooms whose rectangles have changed. */
export function candidateFromRooms(rooms: CandidateRoom[], openSpaces: Rect[], frame: Frame): Candidate {
  return {
    openSpaces,
    rooms: rooms.map((r) => ({
      ...r,
      area: r.rect.w * r.rect.h,
      exteriorSides: exteriorSides(r.rect, frame.interior).map((e) => e.side),
      compass: compassOfPoint(r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2, frame),
    })),
  };
}

/**
 * Re-runs the rules on edited rooms and re-places doors, windows, parking and furniture,
 * so the drawing always matches the rules. Open spaces are not moved.
 */
export function reassemble(layout: Layout, rooms: CandidateRoom[], input: NormalisedInput): EditResult {
  const frame = layout.frame;
  const program = buildProgram(input, layout.upper ? "first" : "ground");
  const cand = candidateFromRooms(rooms, layout.openSpaces, frame);
  const ev = evaluate(cand, frame, input, program.rooms, !!layout.upper);
  const next = assembleLayout(layout.id, layout.seed, cand, ev, frame, input, program.rooms, program.warnings, new Map(), !!layout.upper);
  return { layout: next, violations: ev.violations, vastuFlags: ev.vastuFlags, total: ev.total };
}

/** The rule check for a layout as it stands, without re-placing anything. */
export function checkLayout(layout: Layout, input: NormalisedInput): Omit<EditResult, "layout"> {
  const frame = layout.frame;
  const program = buildProgram(input, layout.upper ? "first" : "ground");
  const cand = candidateFromRooms(layout.rooms, layout.openSpaces, frame);
  const ev = evaluate(cand, frame, input, program.rooms, !!layout.upper);
  return { violations: ev.violations, vastuFlags: ev.vastuFlags, total: ev.total };
}

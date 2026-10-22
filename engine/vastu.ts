import type { Compass, PlacedRoom, RoomKind } from './types';
import { sharedEdge } from './geometry';

export interface RuleScore {
  roomId: string;
  rule: string;
  score: number;
}

/** Per-room Vastu preferences. Score 1 = ideal, lower = acceptable or wrong. */
const PREFERENCE: Partial<Record<RoomKind, { rule: string; score: (c: Compass) => number }>> = {
  master: {
    rule: 'Master bedroom in SW',
    score: (c) => (c === 'SW' ? 1 : c === 'W' || c === 'S' ? 0.5 : 0),
  },
  kitchen: {
    rule: 'Kitchen in SE (NW fallback)',
    score: (c) => (c === 'SE' ? 1 : c === 'NW' ? 0.6 : c === 'E' || c === 'S' ? 0.4 : 0),
  },
  puja: {
    rule: 'Puja in NE',
    score: (c) => (c === 'NE' ? 1 : c === 'N' || c === 'E' ? 0.6 : 0),
  },
  commonToilet: {
    rule: 'Toilet in NW or W, never NE',
    score: toiletScore,
  },
  attachedToilet: {
    rule: 'Toilet in NW or W, never NE',
    score: toiletScore,
  },
  stair: {
    rule: 'Staircase in S, SW or W',
    score: (c) => (c === 'S' || c === 'SW' || c === 'W' ? 1 : 0),
  },
};

function toiletScore(c: Compass): number {
  if (c === 'NW' || c === 'W') return 1;
  if (c === 'N' || c === 'S') return 0.6;
  if (c === 'NE') return 0;
  return 0.3;
}

/**
 * Scores every room against its Vastu preference, plus the rule that a puja room
 * must not share a wall with a toilet.
 */
export function scoreVastu(rooms: PlacedRoom[]): RuleScore[] {
  const out: RuleScore[] = [];
  for (const r of rooms) {
    const pref = PREFERENCE[r.kind];
    if (pref) out.push({ roomId: r.id, rule: pref.rule, score: pref.score(r.compass) });
  }
  const puja = rooms.find((r) => r.kind === 'puja');
  if (puja) {
    const touchesToilet = rooms.some(
      (r) => (r.kind === 'commonToilet' || r.kind === 'attachedToilet') && sharedEdge(puja.rect, r.rect) !== null,
    );
    out.push({ roomId: puja.id, rule: 'Puja not adjoining a toilet', score: touchesToilet ? 0 : 1 });
  }
  return out;
}

/** Preference score for one room kind at one compass point, or null if the kind has no rule. */
export function preferenceScore(kind: RoomKind, compass: Compass): number | null {
  const pref = PREFERENCE[kind];
  return pref ? pref.score(compass) : null;
}

export function vastuMean(rules: RuleScore[]): number | null {
  if (rules.length === 0) return null;
  return rules.reduce((sum, r) => sum + r.score, 0) / rules.length;
}

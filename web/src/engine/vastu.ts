import { sharedEdge } from "./geometry";
import type { Compass, CandidateRoom, RoomKind, VastuRule } from "./types";

interface Preference {
  rule: string;
  score: (c: Compass) => number;
}

function toiletScore(c: Compass): number {
  if (c === "NW" || c === "W") return 1;
  if (c === "N" || c === "S") return 0.6;
  if (c === "NE") return 0;
  return 0.3;
}

const PREFERENCE: Partial<Record<RoomKind, Preference>> = {
  master: {
    rule: "Master bedroom in SW",
    score: (c) => (c === "SW" ? 1 : c === "W" || c === "S" ? 0.5 : 0),
  },
  kitchen: {
    rule: "Kitchen in SE (NW fallback)",
    score: (c) => (c === "SE" ? 1 : c === "NW" ? 0.6 : c === "E" || c === "S" ? 0.4 : 0),
  },
  puja: {
    rule: "Puja in NE",
    score: (c) => (c === "NE" ? 1 : c === "N" || c === "E" ? 0.6 : 0),
  },
  commonToilet: {
    rule: "Toilet in NW or W, never NE",
    score: toiletScore,
  },
  attachedToilet: {
    rule: "Toilet in NW or W, never NE",
    score: toiletScore,
  },
  stair: {
    rule: "Staircase in S, SW or W",
    score: (c) => (c === "S" || c === "SW" || c === "W" ? 1 : 0),
  },
};

/** Zones each room type prefers, used to order rooms when zoning first. */
export const PREFERRED_ZONES: Partial<Record<RoomKind, Compass[]>> = {
  master: ["SW"],
  kitchen: ["SE", "NW"],
  puja: ["NE"],
  commonToilet: ["NW", "W"],
  attachedToilet: ["NW", "W"],
  stair: ["S", "SW", "W"],
};

export function scoreVastu(rooms: CandidateRoom[]): VastuRule[] {
  const out: VastuRule[] = [];
  for (const r of rooms) {
    const pref = PREFERENCE[r.kind];
    if (pref) out.push({ roomId: r.id, rule: pref.rule, score: pref.score(r.compass) });
  }
  const puja = rooms.find((r) => r.kind === "puja");
  if (puja) {
    const touchesToilet = rooms.some(
      (r) => (r.kind === "commonToilet" || r.kind === "attachedToilet") && sharedEdge(puja.rect, r.rect) !== null,
    );
    out.push({ roomId: puja.id, rule: "Puja not adjoining a toilet", score: touchesToilet ? 0 : 1 });
  }
  return out;
}

/** Mean Vastu score, or null when the plan has no Vastu-scored rooms. */
export function vastuMean(rules: VastuRule[]): number | null {
  if (rules.length === 0) return null;
  return rules.reduce((sum, r) => sum + r.score, 0) / rules.length;
}

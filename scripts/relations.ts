// Dev measure: how well layouts follow the reference relationships (access, zoning, wet clusters).
import { generatePlans, ACCEPTANCE_CASES, type Layout, type PlacedRoom } from '../engine';
import { sharedEdge } from '../engine/geometry';

const BED = ['master', 'bedroom', 'guest'];
const WET = ['attachedToilet', 'commonToilet', 'utility'];

export function relations(l: Layout) {
  const byId = new Map(l.rooms.map((r) => [r.id, r]));
  const beds = l.rooms.filter((r) => BED.includes(r.kind));
  // Bedrooms reached through the hall or living room, not through another bedroom
  const viaHall = beds.filter((b) => {
    const p = l.rooms.find((x) => l.openings.some((o) => o.roomId === b.id && o.otherRoomId === x.id && (o.kind === 'door' || o.kind === 'opening')));
    return !!p && (p.kind === 'passage' || p.kind === 'living');
  }).length;
  const wet = l.rooms.filter((r) => WET.includes(r.kind));
  const wetTouching = wet.filter((w) => wet.some((o) => o !== w && sharedEdge(w.rect, o.rect))).length;
  const living = l.rooms.find((r) => r.kind === 'living');
  const dining = l.rooms.find((r) => r.kind === 'dining');
  const diningLiving = !!(living && dining && sharedEdge(living.rect, dining.rect));
  const bedsOnRoad = beds.filter((b) => b.exteriorSides.includes('front')).length;
  const passages = l.rooms.filter((r) => r.kind === 'passage').length;
  return {
    circulationPct: l.scorecard.circulation,
    bedroomsViaHall: beds.length ? viaHall / beds.length : 1,
    wetClustered: wet.length ? wetTouching / wet.length : 1,
    diningLiving: diningLiving ? 1 : 0,
    bedsOnRoadSide: bedsOnRoad,
    passages,
    byId,
  } as const;
}

if (process.argv[1]?.endsWith('relations.ts')) {
  const rows: string[] = [];
  for (const c of ACCEPTANCE_CASES) {
    const r = generatePlans(c.input, { count: 3, restarts: 600 });
    for (const l of r.layouts) {
      const m = relations(l);
      rows.push(`${c.name.slice(0, 12).padEnd(12)} ${l.id} circ ${m.circulationPct.toFixed(1)}% hall ${m.bedroomsViaHall.toFixed(2)} wet ${m.wetClustered.toFixed(2)} dl ${m.diningLiving} bedRoad ${m.bedsOnRoadSide} passages ${m.passages} score ${l.scorecard.total.toFixed(0)}`);
    }
  }
  console.log(rows.join('\n'));
}

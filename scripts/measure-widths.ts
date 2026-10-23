import { generatePlans, defaultInput } from '../engine';
import { relations } from './relations';
const mk = (width: number, depth: number, bhk: 2 | 3) => ({ ...defaultInput(), width, depth, facing: 'N' as const, bhk, vastu: 'moderate' as const,
  attachedToilets: [true, true, false, false], rooms: { ...defaultInput().rooms, commonToilet: true, dining: true },
  setbacks: { front: 4, rear: 4, left: 0, right: 0 }, parking: { cars: 1 as const, twoWheelers: 0 as const } });
for (const [label, input] of [['22x60 2BHK', mk(22, 60, 2)], ['27x54 2BHK', mk(27, 54, 2)], ['30x50 2BHK', mk(30, 50, 2)]] as const) {
  const t = Date.now();
  const r = generatePlans(input, { count: 3, restarts: 600 });
  console.log(label, 'layouts', r.layouts.length, 'errors', r.errors.length, 'ms', Date.now() - t);
  for (const l of r.layouts) {
    const m = relations(l);
    console.log('  ', l.id, 'circ', m.circulationPct.toFixed(1) + '%', 'hall', m.bedroomsViaHall.toFixed(2), 'wet', m.wetClustered.toFixed(2), 'dl', m.diningLiving, 'bedRoad', m.bedsOnRoadSide, 'score', l.scorecard.total.toFixed(0), 'missing', l.missingFurniture);
  }
}

import { clearArea } from '../evaluate';
import { SQFT_PER_SQM } from '../units';
import type { Layout } from '../types';

export interface AreaRow {
  id: string;
  label: string;
  carpetSqFt: number;
  carpetSqM: number;
}

export interface AreaStatement {
  rows: AreaRow[];
  carpetSqFt: number;
  builtUpSqFt: number;
  groundCoveragePct: number;
  efficiencyPct: number;
  circulationPct: number;
}

/**
 * Room-wise carpet areas (clear floor area) and the totals for the area statement.
 * Passages are listed too, since they count towards carpet area.
 */
export function areaStatement(layout: Layout): AreaStatement {
  const rows: AreaRow[] = layout.rooms.map((r) => {
    const sqft = clearArea(r, r.exteriorSides.map((side) => ({ side })));
    return { id: r.id, label: r.label, carpetSqFt: sqft, carpetSqM: sqft / SQFT_PER_SQM };
  });
  const carpet = rows.reduce((s, r) => s + r.carpetSqFt, 0);
  const passage = rows.filter((r) => layout.rooms.find((x) => x.id === r.id)?.kind === 'passage').reduce((s, r) => s + r.carpetSqFt, 0);
  const builtUp = layout.frame.buildable.w * layout.frame.buildable.h;
  const plot = layout.frame.width * layout.frame.depth;
  return {
    rows,
    carpetSqFt: carpet,
    builtUpSqFt: builtUp,
    groundCoveragePct: (builtUp / plot) * 100,
    efficiencyPct: (carpet / builtUp) * 100,
    circulationPct: (passage / builtUp) * 100,
  };
}

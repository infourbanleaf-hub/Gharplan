// Builds the PDF page as HTML: title block, plan, area statement and disclaimer.
// The HTML is printed to PDF by expo-print on the phone, or by the browser on the web.
import { planScene, sceneToSvg, type PlanOptions } from './index';
import { areaStatement } from '../engine/export/areas';
import { formatLength, formatArea, type Layout, type PlotInput, type Unit } from '../engine';

export interface ExportCopy {
  title: string;
  projectName: string;
  date: string;
  plot: string;
  facing: string;
  floors: string;
  roomWise: string;
  room: string;
  carpet: string;
  total: string;
  builtUp: string;
  coverage: string;
  efficiency: string;
  circulation: string;
  disclaimer: string;
  layout: string;
  sqFt: string;
}

export interface PlanPageInput {
  layout: Layout;
  input: PlotInput;
  unit: Unit;
  copy: ExportCopy;
  /** Options for the plan drawing: translated labels and room names. */
  planOptions?: Partial<PlanOptions>;
  /** Date text shown in the title block. */
  date: string;
  projectName: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildPlanPageHtml(p: PlanPageInput): string {
  const { layout, input, unit, copy } = p;
  const svg = sceneToSvg(planScene(layout, { unit, showSetbacks: true, showDimensions: true, showFurniture: true, ...p.planOptions }));
  const stmt = areaStatement(layout);
  const area = (sqft: number) => (unit === 'm' ? formatArea(sqft, 'm') : `${Math.round(sqft)} ${copy.sqFt}`);
  const rows = stmt.rows
    .map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${esc(area(r.carpetSqFt))}</td></tr>`)
    .join('');
  const plot = `${formatLength(input.width, unit)} x ${formatLength(input.depth, unit)}`;
  const facing = `${input.facing}${input.roadSide === 'corner' ? ' (corner plot)' : ''}`;
  const floors = input.floors === 1 ? 'Ground' : 'G + 1';

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>${esc(copy.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Roboto, 'Noto Sans', 'Noto Sans Devanagari', Arial, sans-serif; color: #1d2026; font-size: 11px; }
  .page { display: flex; flex-direction: column; height: 186mm; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f6f5c; padding-bottom: 4px; }
  .head h1 { font-size: 18px; margin: 0; color: #1f6f5c; }
  .meta { display: grid; grid-template-columns: repeat(5, auto); gap: 2px 14px; margin-top: 6px; }
  .meta b { color: #5f6670; font-weight: 400; margin-right: 4px; }
  .body { display: flex; gap: 12px; flex: 1; min-height: 0; margin-top: 8px; }
  .plan { flex: 3; min-width: 0; border: 1px solid #d9dde3; display: flex; align-items: center; justify-content: center; }
  .plan svg { width: 100%; height: 100%; }
  .side { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 8px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #e6e9ee; }
  th { background: #f1f4f2; font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  .totals td { font-weight: 700; }
  .stats div { display: flex; justify-content: space-between; padding: 2px 0; }
  .disclaimer { font-size: 9px; color: #5f6670; border-top: 1px solid #d9dde3; padding-top: 4px; margin-top: 6px; }
</style></head>
<body><div class="page">
  <div class="head">
    <div>
      <h1>${esc(copy.title)} · ${esc(p.projectName)}</h1>
      <div class="meta">
        <div><b>${esc(copy.date)}</b>${esc(p.date)}</div>
        <div><b>${esc(copy.plot)}</b>${esc(plot)}</div>
        <div><b>${esc(copy.facing)}</b>${esc(facing)}</div>
        <div><b>${esc(copy.floors)}</b>${esc(floors)}</div>
        <div><b>${esc(copy.layout)}</b>${esc(layout.id)}</div>
      </div>
    </div>
  </div>
  <div class="body">
    <div class="plan">${svg}</div>
    <div class="side">
      <table>
        <tr><th>${esc(copy.roomWise)}</th><th class="num">${esc(copy.carpet)}</th></tr>
        ${rows}
        <tr class="totals"><td>${esc(copy.total)}</td><td class="num">${esc(area(stmt.carpetSqFt))}</td></tr>
      </table>
      <div class="stats">
        <div><span>${esc(copy.builtUp)}</span><span>${esc(area(stmt.builtUpSqFt))}</span></div>
        <div><span>${esc(copy.coverage)}</span><span>${stmt.groundCoveragePct.toFixed(0)}%</span></div>
        <div><span>${esc(copy.efficiency)}</span><span>${stmt.efficiencyPct.toFixed(0)}%</span></div>
        <div><span>${esc(copy.circulation)}</span><span>${stmt.circulationPct.toFixed(1)}%</span></div>
      </div>
      <div class="disclaimer">${esc(copy.disclaimer)}</div>
    </div>
  </div>
</div></body></html>`;
}

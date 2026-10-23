import { describe, it, expect, beforeAll } from 'vitest';
import { generatePlans, ACCEPTANCE_CASES, type Layout } from '../engine';
import { areaStatement } from '../engine/export/areas';
import { layoutToDxf } from '../engine/export/dxf';
import { wallPieces } from '../engine/export/walls';
import { buildPlanPageHtml } from '../render/planHtml';
import { exportCopy } from '../ui/strings';

let layout: Layout;
beforeAll(() => {
  layout = generatePlans(ACCEPTANCE_CASES[0].input, { count: 1, restarts: 600 }).layouts[0];
}, 120_000);

describe('area statement', () => {
  it('room-wise carpet adds up to the scorecard carpet area', () => {
    const stmt = areaStatement(layout);
    expect(stmt.rows.length).toBe(layout.rooms.length);
    const sum = stmt.rows.reduce((s, r) => s + r.carpetSqFt, 0);
    expect(sum).toBeCloseTo(layout.scorecard.carpetArea, 6);
    expect(stmt.carpetSqFt).toBeCloseTo(layout.scorecard.carpetArea, 6);
  });

  it('built-up and coverage match the plot and setbacks', () => {
    const stmt = areaStatement(layout);
    expect(stmt.builtUpSqFt).toBeCloseTo(layout.scorecard.builtUpArea, 6);
    expect(stmt.groundCoveragePct).toBeCloseTo(layout.scorecard.groundCoverage * 100, 6);
  });
});

describe('wall pieces', () => {
  it('leave a gap at every door: no wall piece covers a door centre', () => {
    const pieces = wallPieces(layout);
    expect(pieces.length).toBeGreaterThan(0);
    for (const o of layout.openings.filter((x) => x.kind === 'door' || x.kind === 'mainDoor')) {
      const mx = (o.a.x + o.b.x) / 2;
      const my = (o.a.y + o.b.y) / 2;
      const covered = pieces.some((p) =>
        mx > p.rect.x + 1e-6 && mx < p.rect.x + p.rect.w - 1e-6 && my > p.rect.y + 1e-6 && my < p.rect.y + p.rect.h - 1e-6,
      );
      expect(covered, `door at ${mx.toFixed(2)},${my.toFixed(2)} is walled over`).toBe(false);
    }
  });
});

describe('DXF export', () => {
  let dxf = '';
  let lines: string[] = [];
  beforeAll(() => {
    dxf = layoutToDxf(layout);
    lines = dxf.trimEnd().split('\n');
  });

  it('is a well-formed R12 file: code/value pairs, sections and EOF', () => {
    expect(lines.length % 2).toBe(0);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('$INSUNITS');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    const sections = lines.filter((_, i) => i % 2 === 1 && lines[i - 1] === '0');
    expect(sections.filter((v) => v === 'ENDSEC').length).toBe(3);
  });

  it('defines every layer and draws on them', () => {
    for (const name of ['PLOT', 'SETBACK', 'ROOMS', 'WALLS', 'DOORS', 'WINDOWS', 'FURNITURE', 'TEXT', 'DIMENSIONS']) {
      expect(dxf).toContain(`LAYER\n2\n${name}`);
    }
    expect(dxf).toContain('2\nWALLS');
  });

  it('writes room labels as text and coordinates in millimetres', () => {
    expect(dxf).toContain('1\nLiving');
    const xs = lines.filter((_, i) => lines[i - 1] === '10').map(Number);
    const maxX = Math.max(...xs);
    // Plot is 30-40 ft: the drawing should be roughly 9-12 m across, not feet
    expect(maxX).toBeGreaterThan(5000);
    expect(maxX).toBeLessThan(20000);
  });
});

describe('PDF page', () => {
  let html = '';
  beforeAll(() => {
    html = buildPlanPageHtml({
      layout, input: ACCEPTANCE_CASES[0].input, unit: 'ftin', copy: exportCopy, date: '2026-10-23', projectName: 'Test',
    });
  });

  it('contains the plan, the area statement, and the disclaimer', () => {
    expect(html).toContain('<svg');
    expect(html).toContain(exportCopy.disclaimer);
    expect(html).toContain('Total carpet area');
    for (const r of layout.rooms.filter((x) => x.kind !== 'passage')) expect(html).toContain(r.label);
  });

  it('shows metres when asked', () => {
    const metric = buildPlanPageHtml({
      layout, input: ACCEPTANCE_CASES[0].input, unit: 'm', copy: exportCopy, date: '2026-10-23', projectName: 'Test',
    });
    expect(metric).toMatch(/sq m/);
  });
});

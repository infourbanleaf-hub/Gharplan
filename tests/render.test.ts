import { describe, it, expect, beforeAll } from 'vitest';
import { generatePlans, ACCEPTANCE_CASES, type Layout } from '../engine';
import { planScene, sceneToSvg, type Item, type Scene } from '../render';

let layout: Layout;
let scene: Scene;

beforeAll(() => {
  layout = generatePlans(ACCEPTANCE_CASES[0].input, { count: 1, restarts: 600 }).layouts[0];
  scene = planScene(layout);
}, 120_000);

const texts = (s: Scene) => s.items.filter((i): i is Extract<Item, { kind: 'text' }> => i.kind === 'text');

describe('plan scene', () => {
  it('draws a wall strip for every side of every room', () => {
    const walls = scene.items.filter((i) => i.kind === 'polygon' && i.layer === 'walls');
    expect(walls.length).toBe(layout.rooms.length * 4);
  });

  it('draws every door leaf and swing arc', () => {
    const doors = layout.openings.filter((o) => o.kind === 'door' || o.kind === 'mainDoor');
    const arcs = scene.items.filter((i) => i.kind === 'polyline' && i.layer === 'openings' && i.points.length === 19);
    expect(arcs.length).toBe(doors.length);
  });

  it('keeps the plot and the north arrow inside the drawing', () => {
    const plot = scene.items.find((i) => i.kind === 'polygon' && i.layer === 'plot' && i.fill === 'none' && i.stroke === '#8a8f98');
    expect(plot).toBeDefined();
    const xs = (plot as Extract<Item, { kind: 'polygon' }>).points.map((p) => p.x);
    const ys = (plot as Extract<Item, { kind: 'polygon' }>).points.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(scene.width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(scene.height);
    const north = texts(scene).find((t) => t.text === 'N');
    expect(north).toBeDefined();
    expect(north!.y).toBeLessThan(Math.min(...ys));
  });

  it('shows dimensions in feet-inches by default and in metres when asked', () => {
    const ftin = texts(scene).some((t) => t.text.includes(`'`));
    expect(ftin).toBe(true);
    const metric = texts(planScene(layout, { unit: 'm' })).some((t) => t.text.endsWith(' m'));
    expect(metric).toBe(true);
  });

  it('hides setback lines when turned off', () => {
    const withSetback = scene.items.filter((i) => i.kind === 'polygon' && 'stroke' in i && i.stroke === '#c9584f');
    const without = planScene(layout, { showSetbacks: false }).items.filter((i) => i.kind === 'polygon' && 'stroke' in i && i.stroke === '#c9584f');
    expect(withSetback.length).toBe(1);
    expect(without.length).toBe(0);
  });

  it('serialises to an SVG document with a viewBox', () => {
    const svg = sceneToSvg(scene);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${scene.width.toFixed(2)} ${scene.height.toFixed(2)}"`);
    expect(svg).toContain('>Living<');
  });
});

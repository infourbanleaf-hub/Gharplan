import { describe, expect, it } from "vitest";
import { formatLength, feetToMetres } from "../src/engine/units";
import { mulberry32, shuffle } from "../src/engine/rng";
import { validatePlotInput, LIMITS } from "../src/engine/limits";
import { defaultSetbacks, buildFrame, compassOfPoint } from "../src/engine/frame";
import { sharedEdge, exteriorSides, overlaps, contains } from "../src/engine/geometry";
import { buildProgram } from "../src/engine/program";
import { generatePlans, normaliseInput } from "../src/engine/generate";
import { defaultInput } from "../src/engine/presets";
import { planScene } from "../src/render/scene";
import { sceneToSvg } from "../src/render/svg";
import { ACCEPTANCE_CASES } from "../src/engine/presets";
import type { PlanInput } from "../src/engine/types";

describe("units", () => {
  it("formats feet and inches", () => {
    expect(formatLength(30)).toBe("30'-0\"");
    expect(formatLength(14.5)).toBe("14'-6\"");
  });
  it("formats metres", () => {
    expect(formatLength(10, "m")).toBe("3.05 m");
    expect(feetToMetres(3.28084)).toBeCloseTo(1, 6);
  });
});

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("shuffle keeps every item", () => {
    const out = shuffle([1, 2, 3, 4, 5], mulberry32(7));
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("limits", () => {
  it("accepts a plot in range", () => {
    expect(validatePlotInput(defaultInput())).toEqual([]);
  });
  it("rejects a plot outside the range", () => {
    const errs = validatePlotInput({ ...defaultInput(), width: 5 });
    expect(errs).toContain(`Plot width and depth must be between ${LIMITS.plotFt.min} and ${LIMITS.plotFt.max} ft.`);
  });
  it("rejects open space above 100%", () => {
    expect(validatePlotInput({ ...defaultInput(), openSpacePct: 120 }).length).toBe(1);
  });
});

describe("setbacks and frame", () => {
  it("uses the smallest bye-law band for a small plot", () => {
    // 20 x 30 ft is about 56 sq m, so the first band applies: 3 m front (9.84 ft, rounded up to 10 ft), no sides.
    const sb = defaultSetbacks({ ...defaultInput(), width: 20, depth: 30 });
    expect(sb.front).toBe(10);
    expect(sb.left).toBe(0);
    expect(sb.right).toBe(0);
  });
  it("gives a corner side at least the corner minimum", () => {
    const sb = defaultSetbacks({ ...defaultInput(), width: 40, depth: 60, roadSide: "corner", cornerSide: "right" });
    expect(sb.right).toBeGreaterThanOrEqual(1.5 * 3.28084 - 0.01);
  });
  it("buildable area sits inside the plot", () => {
    const frame = buildFrame({ ...defaultInput(), setbacks: { front: 5, rear: 5, left: 3, right: 3 } });
    expect(contains({ x: 0, y: 0, w: frame.width, h: frame.depth }, frame.buildable)).toBe(true);
  });
  it("compass of a point in front of the house is the facing direction", () => {
    const frame = buildFrame({ ...defaultInput(), facing: "N" });
    // Front wall is at y = 0 in plan, so a point just outside it is toward the road.
    expect(compassOfPoint(frame.width / 2, -1, frame)).toBe("N");
  });
});

describe("geometry", () => {
  it("finds the shared wall of two side-by-side rooms", () => {
    const e = sharedEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 2, w: 5, h: 6 });
    expect(e).not.toBeNull();
    expect(e!.axis).toBe("v");
    expect(e!.length).toBeCloseTo(6);
  });
  it("returns null for rooms that only touch at a corner", () => {
    expect(sharedEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBeNull();
  });
  it("detects overlap and not edge-touching", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
  it("reports exterior sides", () => {
    const outer = { x: 0, y: 0, w: 20, h: 20 };
    const sides = exteriorSides({ x: 0, y: 0, w: 10, h: 10 }, outer).map((e) => e.side).sort();
    expect(sides).toEqual(["front", "left"]);
  });
});

describe("programme", () => {
  it("adds one attached toilet per bedroom flagged in the input", () => {
    const p = buildProgram(normaliseInput({ ...defaultInput(), bhk: 2, attachedToilets: [true, true] }));
    expect(p.rooms.filter((r) => r.kind === "attachedToilet")).toHaveLength(2);
  });
  it("puts living rooms on the ground floor and bedrooms on the first floor", () => {
    const input = normaliseInput({ ...defaultInput(), floors: 2, bhk: 2 });
    const ground = buildProgram(input, "ground").rooms.map((r) => r.kind);
    const first = buildProgram(input, "first").rooms.map((r) => r.kind);
    expect(ground).toContain("living");
    expect(ground).not.toContain("master");
    expect(first).toContain("master");
    expect(first).not.toContain("living");
    expect(ground).toContain("stair");
    expect(first).toContain("stair");
  });
});

describe("generatePlans edge cases", () => {
  it("returns an error for a plot too small for the programme", () => {
    const tiny: PlanInput = { ...defaultInput(), width: 10, depth: 10, bhk: 4, rooms: { ...defaultInput().rooms, study: true } };
    const res = generatePlans(tiny, { restarts: 20, seed: 1 });
    expect(res.layouts).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThan(0);
  });
  it("returns the input range error without searching", () => {
    const res = generatePlans({ ...defaultInput(), width: 500 }, { restarts: 20, seed: 1 });
    expect(res.stats.sampled).toBe(0);
    expect(res.errors.length).toBe(1);
  });
  it("is deterministic for the same seed", () => {
    const a = generatePlans(ACCEPTANCE_CASES[0].input, { restarts: 60, seed: 5 });
    const b = generatePlans(ACCEPTANCE_CASES[0].input, { restarts: 60, seed: 5 });
    expect(a.layouts.map((l) => l.scorecard.total)).toEqual(b.layouts.map((l) => l.scorecard.total));
  });
});

describe("rendering", () => {
  it("produces an SVG with a plot outline and layers", () => {
    const res = generatePlans(ACCEPTANCE_CASES[0].input, { restarts: 400, seed: 20260101 });
    expect(res.layouts.length).toBeGreaterThan(0);
    const svg = sceneToSvg(planScene(res.layouts[0]));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('data-layer="walls"');
    expect(svg).toContain('data-layer="openings"');
  });
  it("escapes text in room labels", () => {
    const res = generatePlans(ACCEPTANCE_CASES[0].input, { restarts: 400, seed: 20260101 });
    expect(res.layouts.length).toBeGreaterThan(0);
    const svg = sceneToSvg(planScene(res.layouts[0], { labels: { car: "<Car>", twoWheeler: "2W", north: "N" } }));
    // Case 1 has one car, so the parking label is drawn and must be escaped.
    expect(svg).toContain("&lt;Car&gt;");
    expect(svg).not.toContain("<Car>");
  });
});

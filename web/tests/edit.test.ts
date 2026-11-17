import { describe, expect, it } from "vitest";
import { generatePlans, normaliseInput } from "../src/engine/generate";
import { ACCEPTANCE_CASES } from "../src/engine/presets";
import { checkLayout, reassemble } from "../src/engine/edit";
import { planMapper } from "../src/render/scene";
import { buildFrame } from "../src/engine/frame";
import { GRID_FT, MIN_ROOM_FT, moveRoom, resizeRoom, setRoomRect, snap } from "../src/edit/ops";
import type { CandidateRoom } from "../src/engine/types";

const input = normaliseInput(ACCEPTANCE_CASES[0].input);
const generated = generatePlans(ACCEPTANCE_CASES[0].input, { restarts: 400, seed: 20260101 }).layouts[0];

const room = (over: Partial<CandidateRoom> = {}): CandidateRoom => ({
  id: "r",
  kind: "bedroom",
  label: "Bedroom",
  habitable: true,
  rect: { x: 10, y: 10, w: 10, h: 10 },
  area: 100,
  exteriorSides: [],
  compass: "N",
  ...over,
});

describe("plan mapper", () => {
  it("maps plan feet to pixels and back", () => {
    const frame = buildFrame(input);
    const m = planMapper(frame);
    for (const p of [
      { x: 0, y: 0 },
      { x: 12.5, y: 7.25 },
      { x: frame.width, y: frame.depth },
    ]) {
      const back = m.toPlan(m.local(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });
});

describe("edit operations", () => {
  it("snaps to half a foot", () => {
    expect(snap(10.3)).toBe(10.5);
    expect(snap(10.2)).toBe(10);
    expect(GRID_FT).toBe(0.5);
  });
  it("moves a room to the snapped position", () => {
    expect(moveRoom(room(), 3.1, 4.9).rect).toMatchObject({ x: 3, y: 5, w: 10, h: 10 });
  });
  it("resizes from the east and keeps the minimum size", () => {
    expect(resizeRoom(room(), "e", 15).rect.w).toBe(5);
    expect(resizeRoom(room(), "e", 10).rect.w).toBe(MIN_ROOM_FT);
  });
  it("resizes from the west without moving the opposite edge", () => {
    const r = resizeRoom(room(), "w", 14).rect;
    expect(r.x + r.w).toBe(20);
    expect(r.w).toBe(6);
  });
  it("resizes from the north and south", () => {
    expect(resizeRoom(room(), "s", 25).rect.h).toBe(15);
    const n = resizeRoom(room(), "n", 5).rect;
    expect(n.y + n.h).toBe(20);
  });
  it("sets typed values with the same snapping and minimum", () => {
    expect(setRoomRect(room(), { x: 1.2, y: 2, w: 0, h: 7.7 }).rect).toEqual({ x: 1, y: 2, w: MIN_ROOM_FT, h: 7.5 });
  });
});

describe("rule re-check", () => {
  it("a generated plan has no violations", () => {
    expect(checkLayout(generated, input).violations).toEqual([]);
  });

  it("re-assembling unchanged rooms keeps the plan valid and keeps its openings", () => {
    const res = reassemble(generated, generated.rooms, input);
    expect(res.violations).toEqual([]);
    expect(res.layout.openings.length).toBeGreaterThan(0);
    expect(res.layout.rooms.length).toBe(generated.rooms.length);
  });

  it("moving a room onto another reports an overlap", () => {
    const living = generated.rooms.find((r) => r.kind === "living")!;
    const master = generated.rooms.find((r) => r.kind === "master")!;
    const rooms = generated.rooms.map((r) => (r.id === living.id ? { ...r, rect: { ...master.rect } } : r));
    const res = reassemble(generated, rooms, input);
    expect(res.violations.some((v) => v.includes("overlaps"))).toBe(true);
  });

  it("re-derives outer walls and compass for a moved room", () => {
    const frame = generated.frame;
    const r = generated.rooms.find((x) => x.kind === "living")!;
    const shifted = { ...r, rect: { ...r.rect, x: frame.interior.x, y: frame.interior.y } };
    const res = reassemble(generated, generated.rooms.map((x) => (x.id === r.id ? shifted : x)), input);
    const updated = res.layout.rooms.find((x) => x.id === r.id)!;
    expect(updated.exteriorSides).toContain("left");
    expect(updated.area).toBeCloseTo(shifted.rect.w * shifted.rect.h, 6);
  });
});

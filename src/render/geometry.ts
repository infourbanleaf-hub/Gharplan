import type { Layout, Opening, Point, Rect, Side } from "../engine/types";

export const WALL_EXTERNAL_FT = 0.75;
export const WALL_INTERNAL_FT = 0.375;
const ARC_SEGMENTS = 18;

export function rectPoints(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

/** The thick wall band on one side of a rect. External walls are thicker than internal ones. */
export function wallStrip(side: Side, r: Rect, t: number): Point[] {
  const h = t / 2;
  switch (side) {
    case "front":
      return [
        { x: r.x - h, y: r.y - h },
        { x: r.x + r.w + h, y: r.y - h },
        { x: r.x + r.w + h, y: r.y + h },
        { x: r.x - h, y: r.y + h },
      ];
    case "back":
      return [
        { x: r.x - h, y: r.y + r.h - h },
        { x: r.x + r.w + h, y: r.y + r.h - h },
        { x: r.x + r.w + h, y: r.y + r.h + h },
        { x: r.x - h, y: r.y + r.h + h },
      ];
    case "left":
      return [
        { x: r.x - h, y: r.y - h },
        { x: r.x + h, y: r.y - h },
        { x: r.x + h, y: r.y + r.h + h },
        { x: r.x - h, y: r.y + r.h + h },
      ];
    case "right":
      return [
        { x: r.x + r.w - h, y: r.y - h },
        { x: r.x + r.w + h, y: r.y - h },
        { x: r.x + r.w + h, y: r.y + r.h + h },
        { x: r.x + r.w - h, y: r.y + r.h + h },
      ];
  }
}

export interface OpeningGeometry {
  gap: Point[];
  glazing: Point[][];
  leaf: Point[] | null;
  arc: Point[] | null;
}

/** Shapes for one opening: the gap in the wall, window glazing lines, and the door leaf and swing arc. */
export function openingGeometry(op: Opening, layout: Layout): OpeningGeometry {
  const a = op.a;
  const b = op.b;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -d.y, y: d.x };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const outer = op.kind === "mainDoor" || op.kind === "window" || op.kind === "ventilator";
  const h = (outer ? WALL_EXTERNAL_FT : WALL_INTERNAL_FT) / 2;
  const gap: Point[] = [
    { x: a.x + n.x * h, y: a.y + n.y * h },
    { x: b.x + n.x * h, y: b.y + n.y * h },
    { x: b.x - n.x * h, y: b.y - n.y * h },
    { x: a.x - n.x * h, y: a.y - n.y * h },
  ];
  const out: OpeningGeometry = { gap, glazing: [], leaf: null, arc: null };
  if (op.kind === "window" || op.kind === "ventilator") {
    for (const k of [-0.33, 0, 0.33]) {
      const off = { x: n.x * h * k * 2, y: n.y * h * k * 2 };
      out.glazing.push([
        { x: a.x + off.x, y: a.y + off.y },
        { x: b.x + off.x, y: b.y + off.y },
      ]);
    }
    return out;
  }
  if (op.kind === "opening") return out;
  const room = layout.rooms.find((r) => r.id === op.roomId);
  const roomCentre = room ? { x: room.rect.x + room.rect.w / 2, y: room.rect.y + room.rect.h / 2 } : mid;
  const side = (roomCentre.x - mid.x) * n.x + (roomCentre.y - mid.y) * n.y >= 0 ? 1 : -1;
  const leafDir = { x: n.x * side, y: n.y * side };
  out.leaf = [a, { x: a.x + leafDir.x * op.width, y: a.y + leafDir.y * op.width }];
  const start = Math.atan2(b.y - a.y, b.x - a.x);
  const end = Math.atan2(leafDir.y, leafDir.x);
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const arc: Point[] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const ang = start + (sweep * i) / ARC_SEGMENTS;
    arc.push({ x: a.x + Math.cos(ang) * op.width, y: a.y + Math.sin(ang) * op.width });
  }
  out.arc = arc;
  return out;
}

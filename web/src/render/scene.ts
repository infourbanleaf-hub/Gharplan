import { formatLength } from "../engine/units";
import type { Frame, Layout, Point, Rect, RoomKind, Side, Unit } from "../engine/types";
import { localToWorld } from "../engine/frame";
import { openingGeometry, rectPoints, wallStrip, WALL_EXTERNAL_FT, WALL_INTERNAL_FT } from "./geometry";

export type Layer = "plot" | "rooms" | "parking" | "furniture" | "walls" | "openings" | "labels" | "dimensions" | "north";

export type SceneItem =
  | { kind: "polygon"; points: Point[]; fill: string; layer: Layer; stroke?: string; strokeWidth?: number; dash?: string }
  | { kind: "polyline"; points: Point[]; stroke: string; strokeWidth: number; layer: Layer; dash?: string; fill?: undefined }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      fill: string;
      anchor: "start" | "middle" | "end";
      layer: Layer;
      weight?: "bold";
    };

export interface Scene {
  width: number;
  height: number;
  items: SceneItem[];
}

export interface PlanOptions {
  unit: Unit;
  showSetbacks: boolean;
  showDimensions: boolean;
  showFurniture: boolean;
  labels: { car: string; twoWheeler: string; north: string };
  roomLabels?: Partial<Record<RoomKind, string>>;
  selectedRoomId?: string;
  issueRoomIds?: string[];
  scale: number;
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  unit: "ftin",
  showSetbacks: true,
  showDimensions: true,
  showFurniture: true,
  labels: { car: "Car", twoWheeler: "2W", north: "N" },
  scale: 12,
};

export const COLORS = {
  wall: "#3b3f45",
  wallGap: "#ffffff",
  plot: "#8a8f98",
  setback: "#c9584f",
  window: "#3f7fc4",
  door: "#b3262e",
  dimension: "#1f4e8c",
  text: "#1d2026",
  parking: "#777c85",
  furniture: "#7d838c",
  selected: "#d08a00",
  issue: "#c0392b",
  parkingFill: "#eceef1",
};

export const OPEN_FILL = "#f4f8ef";

export const ROOM_FILL: Partial<Record<RoomKind, string>> = {
  living: "#fdf3d0",
  dining: "#fde8d0",
  kitchen: "#e6f5d8",
  master: "#d9e8fb",
  bedroom: "#dfeefa",
  guest: "#dfeefa",
  attachedToilet: "#e8e2f5",
  commonToilet: "#e8e2f5",
  puja: "#fbe0ea",
  study: "#eef0d8",
  store: "#eeeeee",
  utility: "#e3f1f1",
  stair: "#f2f2f2",
  passage: "#ffffff",
};

/** Maps plan coordinates (feet, origin at front-left) to SVG pixels, with a margin on every side. */
/**
 * Maps plan coordinates (feet, origin at front-left) to scene pixels, with a margin on every side.
 * `toPlan` is the inverse, used to turn pointer positions back into plan feet.
 */
export function planMapper(frame: Frame, scale = DEFAULT_PLAN_OPTIONS.scale, margin = 7) {
  const corners = [
    { x: 0, y: 0 },
    { x: frame.width, y: 0 },
    { x: frame.width, y: frame.depth },
    { x: 0, y: frame.depth },
  ].map((p) => localToWorld(p.x, p.y, frame));
  const minX = Math.min(...corners.map((c) => c.x));
  const maxY = Math.max(...corners.map((c) => c.y));
  const local = (p: Point): Point => {
    const w = localToWorld(p.x, p.y, frame);
    return { x: (w.x - minX + margin) * scale, y: (maxY - w.y + margin) * scale };
  };
  // The frame's right and inward vectors are orthonormal, so the inverse is the transpose.
  const toPlan = (px: Point): Point => {
    const wx = px.x / scale + minX - margin;
    const wy = maxY + margin - px.y / scale;
    return {
      x: wx * frame.right[0] + wy * frame.right[1] + frame.width / 2,
      y: wx * frame.inward[0] + wy * frame.inward[1] + frame.depth / 2,
    };
  };
  const extent = {
    width: (Math.max(...corners.map((c) => c.x)) - minX + 2 * margin) * scale,
    height: (maxY - Math.min(...corners.map((c) => c.y)) + 2 * margin) * scale,
  };
  return { local, toPlan, extent };
}

/** Splits a long label into two lines at the middle word. */
function labelLines(label: string): string[] {
  const words = label.split(" ");
  if (words.length === 1) return [label];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/** Builds the drawing for one layout: plot, rooms, walls, openings, furniture, labels, dimensions and north arrow. */
export function planScene(layout: Layout, opts: Partial<PlanOptions> = {}): Scene {
  const o: PlanOptions = { ...DEFAULT_PLAN_OPTIONS, ...opts };
  const frame = layout.frame;
  const margin = 7;
  const { local, extent } = planMapper(frame, o.scale, margin);
  const items: SceneItem[] = [];
  const poly = (pts: Rect | Point[], fill: string, layer: Layer, extra: Partial<SceneItem & { kind: "polygon" }> = {}) => {
    const list = Array.isArray(pts) ? pts : rectPoints(pts);
    items.push({ kind: "polygon", points: list.map(local), fill, layer, ...extra } as SceneItem);
  };
  const line = (pts: Point[], stroke: string, strokeWidth: number, layer: Layer, dash?: string) =>
    items.push({ kind: "polyline", points: pts.map(local), stroke, strokeWidth, layer, dash });
  const text = (p: Point, t: string, size: number, fill: string, layer: Layer, anchor: "start" | "middle" | "end" = "middle", weight?: "bold", dyPx = 0) => {
    const q = local(p);
    items.push({ kind: "text", x: q.x, y: q.y + dyPx, text: t, size, fill, anchor, layer, weight });
  };

  poly({ x: 0, y: 0, w: frame.width, h: frame.depth }, "none", "plot", { stroke: COLORS.plot, strokeWidth: 1, dash: "6 4" });
  if (o.showSetbacks) {
    poly(frame.buildable, "none", "plot", { stroke: COLORS.setback, strokeWidth: 1, dash: "4 3" });
  }
  for (const r of layout.rooms) poly(r.rect, ROOM_FILL[r.kind] ?? "#ffffff", "rooms");
  for (const open of layout.openSpaces) {
    poly(open, OPEN_FILL, "rooms", { stroke: COLORS.dimension, strokeWidth: 0.6, dash: "3 3" });
  }
  for (const p of layout.parking) {
    poly(p.rect, COLORS.parkingFill, "parking", { stroke: COLORS.parking, strokeWidth: 1 });
    const c = { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 };
    text(c, p.kind === "car" ? o.labels.car : o.labels.twoWheeler, 9, COLORS.text, "parking");
  }
  if (o.showFurniture) {
    for (const f of layout.furniture) {
      poly(f.rect, "none", "furniture", { stroke: COLORS.furniture, strokeWidth: 0.9, dash: f.assumed ? "2 2" : undefined });
    }
  }
  for (const r of layout.rooms) {
    const sides: Side[] = ["front", "back", "left", "right"];
    for (const side of sides) {
      const t = r.exteriorSides.includes(side) ? WALL_EXTERNAL_FT : WALL_INTERNAL_FT;
      poly(wallStrip(side, r.rect, t), COLORS.wall, "walls");
    }
  }
  for (const op of layout.openings) drawOpening(op, layout, local, items);
  for (const open of layout.openSpaces) {
    text({ x: open.x + open.w / 2, y: open.y + open.h / 2 }, "Open", 10, COLORS.dimension, "labels");
  }
  for (const r of layout.rooms) {
    if (r.kind === "passage") continue;
    const c = { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 };
    const lines = labelLines(o.roomLabels?.[r.kind] ?? r.label);
    const lineGap = 11;
    const firstDy = (-(lines.length - 1) * lineGap) / 2;
    lines.forEach((t, i) => text(c, t, 10, COLORS.text, "labels", "middle", "bold", firstDy + i * lineGap));
    if (o.showDimensions) {
      const dims = `${formatLength(r.rect.w, o.unit)} x ${formatLength(r.rect.h, o.unit)}`;
      text(c, dims, 8, COLORS.dimension, "dimensions", "middle", undefined, firstDy + lines.length * lineGap + 2);
    }
  }
  if (o.showDimensions) {
    const d = 3.2;
    line([{ x: 0, y: -d }, { x: frame.width, y: -d }], COLORS.dimension, 1, "dimensions");
    text({ x: frame.width / 2, y: -d - 0.6 }, formatLength(frame.width, o.unit), 10, COLORS.dimension, "dimensions", "middle", "bold");
    line([{ x: frame.width + d, y: 0 }, { x: frame.width + d, y: frame.depth }], COLORS.dimension, 1, "dimensions");
    text({ x: frame.width + d + 0.6, y: frame.depth / 2 }, formatLength(frame.depth, o.unit), 10, COLORS.dimension, "dimensions", "start", "bold");
  }
  for (const r of layout.rooms) {
    if (r.id === o.selectedRoomId) poly(r.rect, "none", "labels", { stroke: COLORS.selected, strokeWidth: 3 });
    if (o.issueRoomIds?.includes(r.id)) poly(r.rect, "none", "labels", { stroke: COLORS.issue, strokeWidth: 3, dash: "6 3" });
  }
  const na = local({ x: frame.width + 9, y: frame.depth - 2 });
  const naBase = local({ x: frame.width + 9, y: frame.depth - 7 });
  items.push({ kind: "polyline", points: [naBase, na], stroke: "#000", strokeWidth: 2, layer: "north" });
  items.push({ kind: "polygon", points: [na, { x: na.x - 5, y: na.y + 12 }, { x: na.x + 5, y: na.y + 12 }], fill: "#000", layer: "north" });
  items.push({ kind: "text", x: na.x, y: na.y - 6, text: o.labels.north, size: 14, fill: "#000", anchor: "middle", weight: "bold", layer: "north" });
  return { width: extent.width, height: extent.height, items };
}

function drawOpening(op: Layout["openings"][number], layout: Layout, local: (p: Point) => Point, items: SceneItem[]): void {
  const g = openingGeometry(op, layout);
  items.push({ kind: "polygon", points: g.gap.map(local), fill: COLORS.wallGap, layer: "openings" });
  for (const seg of g.glazing) {
    items.push({ kind: "polyline", points: seg.map(local), stroke: COLORS.window, strokeWidth: 1.2, layer: "openings" });
  }
  if (g.leaf) items.push({ kind: "polyline", points: g.leaf.map(local), stroke: COLORS.door, strokeWidth: 1.4, layer: "openings" });
  if (g.arc) items.push({ kind: "polyline", points: g.arc.map(local), stroke: COLORS.door, strokeWidth: 0.8, dash: "3 2", layer: "openings" });
}

import { compassOfPoint } from "./frame";
import type { Compass, Frame, Rect } from "./types";

export type Wall = "front" | "back" | "left" | "right";

/** Compass direction of the midpoint of one wall of a rect. */
export function wallCompassOf(room: Rect, wall: Wall, frame: Frame): Compass {
  const mx = wall === "left" ? room.x : wall === "right" ? room.x + room.w : room.x + room.w / 2;
  const my = wall === "front" ? room.y : wall === "back" ? room.y + room.h : room.y + room.h / 2;
  return compassOfPoint(mx, my, frame);
}

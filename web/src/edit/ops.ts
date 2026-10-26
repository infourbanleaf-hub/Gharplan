import type { CandidateRoom, Rect } from "../engine/types";

/** Edits snap to half a foot, the same grid the generator uses for room sizes. */
export const GRID_FT = 0.5;
/** Smallest room the editor allows; the engine's own minimum is 2 ft. */
export const MIN_ROOM_FT = 2;

export type Edge = "n" | "s" | "e" | "w";

export function snap(v: number): number {
  return Math.round(v / GRID_FT) * GRID_FT;
}

export function moveRoom(room: CandidateRoom, x: number, y: number): CandidateRoom {
  return { ...room, rect: { ...room.rect, x: snap(x), y: snap(y) } };
}

/** Moves one edge of a room to `pos` (plan feet, along that axis), keeping it at least MIN_ROOM_FT. */
export function resizeRoom(room: CandidateRoom, edge: Edge, pos: number): CandidateRoom {
  const r: Rect = { ...room.rect };
  switch (edge) {
    case "e":
      r.w = Math.max(MIN_ROOM_FT, snap(pos - r.x));
      break;
    case "w": {
      const right = r.x + r.w;
      const left = Math.min(snap(pos), right - MIN_ROOM_FT);
      r.x = left;
      r.w = right - left;
      break;
    }
    case "s":
      r.h = Math.max(MIN_ROOM_FT, snap(pos - r.y));
      break;
    case "n": {
      const bottom = r.y + r.h;
      const top = Math.min(snap(pos), bottom - MIN_ROOM_FT);
      r.y = top;
      r.h = bottom - top;
      break;
    }
  }
  return { ...room, rect: r };
}

/** Sets a room's rectangle from typed values, snapped and clamped to the minimum size. */
export function setRoomRect(room: CandidateRoom, rect: Rect): CandidateRoom {
  return {
    ...room,
    rect: {
      x: snap(rect.x),
      y: snap(rect.y),
      w: Math.max(MIN_ROOM_FT, snap(rect.w)),
      h: Math.max(MIN_ROOM_FT, snap(rect.h)),
    },
  };
}

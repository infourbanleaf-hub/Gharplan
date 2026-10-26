import { roomDefaults } from "./config";
import type { NormalisedInput, RoomKind, RoomSizeOverride, RoomSpec } from "./types";

const TOILET_KINDS = new Set<RoomKind>(["attachedToilet", "commonToilet"]);
const TOILET_TOL_FT = 1;

/** Two-floor plans are generated one floor at a time. Single-floor plans use `undefined`. */
export type Floor = "ground" | "first";

function spec(
  id: string,
  kind: RoomKind,
  overrides: NormalisedInput["roomSizes"],
  attachedTo?: string,
): RoomSpec {
  const c = roomDefaults.rooms[kind];
  const o: RoomSizeOverride = overrides?.[kind] ?? {};
  const defW = o.defW ?? c.defW;
  const defH = o.defH ?? c.defH;
  return {
    id,
    kind,
    label: c.label,
    // Toilets: default within 1 ft each way.
    minW: o.minW ?? (TOILET_KINDS.has(kind) ? defW - TOILET_TOL_FT : c.minW),
    minH: o.minH ?? (TOILET_KINDS.has(kind) ? defH - TOILET_TOL_FT : c.minH),
    defW,
    defH,
    doorWidth: c.doorWidth,
    habitable: c.habitable,
    attachedTo,
  };
}

export interface Programme {
  rooms: RoomSpec[];
  warnings: string[];
}

/**
 * The rooms a layout must contain. Single-floor plans get every room. Two-floor plans split
 * them: the ground floor takes the living, dining, kitchen and service rooms; the first floor
 * takes the bedrooms and their bathrooms. Both floors get the staircase.
 */
export function buildProgram(input: NormalisedInput, floor?: Floor): Programme {
  const twoFloor = input.floors === 2;
  const upper = twoFloor && floor === "first";
  const warnings: string[] = [];
  const rooms: RoomSpec[] = [];

  if (!upper) {
    rooms.push(spec("living", "living", input.roomSizes));
    if (input.rooms.dining) rooms.push(spec("dining", "dining", input.roomSizes));
    rooms.push(spec("kitchen", "kitchen", input.roomSizes));
  }
  if (!twoFloor || upper) {
    const bedroomCount = input.bhk;
    for (let i = 0; i < bedroomCount; i++) {
      const isMaster = i === 0;
      const id = isMaster ? "master" : `bed${i + 1}`;
      rooms.push(spec(id, isMaster ? "master" : "bedroom", input.roomSizes));
      if (input.attachedToilets[i]) {
        rooms.push(spec(`toilet-${id}`, "attachedToilet", input.roomSizes, id));
      }
    }
  }
  if (!twoFloor || upper) {
    if (input.rooms.guestBedroom) rooms.push(spec("guest", "guest", input.roomSizes));
  }
  if (!upper) {
    if (input.rooms.commonToilet) rooms.push(spec("toilet-common", "commonToilet", input.roomSizes));
    if (input.rooms.puja) rooms.push(spec("puja", "puja", input.roomSizes));
    if (input.rooms.study) rooms.push(spec("study", "study", input.roomSizes));
    if (input.rooms.store) rooms.push(spec("store", "store", input.roomSizes));
    if (input.rooms.utility) rooms.push(spec("utility", "utility", input.roomSizes));
  }
  if (twoFloor && input.staircase === "internal") rooms.push(spec("stair", "stair", input.roomSizes));

  if (twoFloor && input.staircase === "external" && !upper) {
    warnings.push("External staircase is not placed in the MVP; it is reserved for a future rental unit.");
  }
  if (input.rooms.balcony && !upper) {
    warnings.push("Balcony is not placed in the MVP yet.");
  }
  if (input.elderlyGroundBedroom && twoFloor && !upper) {
    warnings.push("The elderly ground-floor bedroom option is not supported yet; its bedroom is on the first floor.");
  }
  return { rooms, warnings };
}

export function roomConfig(kind: RoomKind) {
  return roomDefaults.rooms[kind];
}

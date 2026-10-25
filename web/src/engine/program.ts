import { roomDefaults } from "./config";
import type { NormalisedInput, RoomKind, RoomSizeOverride, RoomSpec } from "./types";

const TOILET_KINDS = new Set<RoomKind>(["attachedToilet", "commonToilet"]);
const TOILET_TOL_FT = 1;

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

/** Turns the plot input into the list of rooms the layout must contain. */
export function buildProgram(input: NormalisedInput): Programme {
  const warnings: string[] = [];
  const rooms: RoomSpec[] = [];
  rooms.push(spec("living", "living", input.roomSizes));
  if (input.rooms.dining) rooms.push(spec("dining", "dining", input.roomSizes));
  rooms.push(spec("kitchen", "kitchen", input.roomSizes));
  const bedroomCount = input.bhk;
  for (let i = 0; i < bedroomCount; i++) {
    const isMaster = i === 0;
    const id = isMaster ? "master" : `bed${i + 1}`;
    rooms.push(spec(id, isMaster ? "master" : "bedroom", input.roomSizes));
    if (input.attachedToilets[i]) {
      rooms.push(spec(`toilet-${id}`, "attachedToilet", input.roomSizes, id));
    }
  }
  if (input.rooms.guestBedroom) rooms.push(spec("guest", "guest", input.roomSizes));
  if (input.rooms.commonToilet) rooms.push(spec("toilet-common", "commonToilet", input.roomSizes));
  if (input.rooms.puja) rooms.push(spec("puja", "puja", input.roomSizes));
  if (input.rooms.study) rooms.push(spec("study", "study", input.roomSizes));
  if (input.rooms.store) rooms.push(spec("store", "store", input.roomSizes));
  if (input.rooms.utility) rooms.push(spec("utility", "utility", input.roomSizes));
  if (input.floors === 2 && input.staircase === "internal") rooms.push(spec("stair", "stair", input.roomSizes));
  if (input.floors === 2 && input.staircase === "external") {
    warnings.push("External staircase is not placed in the MVP; it is reserved for a future rental unit.");
  }
  if (input.rooms.balcony) {
    warnings.push("Balcony is not placed in the MVP yet.");
  }
  if (input.floors === 2) {
    warnings.push("First floor is not generated yet; the ground floor is shown with the staircase reserved.");
  }
  if (input.elderlyGroundBedroom && input.floors === 2) {
    warnings.push("The elderly ground-floor bedroom rule is enforced once the first floor is generated.");
  }
  return { rooms, warnings };
}

export function roomConfig(kind: RoomKind) {
  return roomDefaults.rooms[kind];
}

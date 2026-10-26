export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type Side = "front" | "back" | "left" | "right";
export type Unit = "ftin" | "m";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomKind =
  | "living"
  | "dining"
  | "kitchen"
  | "master"
  | "bedroom"
  | "guest"
  | "attachedToilet"
  | "commonToilet"
  | "puja"
  | "study"
  | "store"
  | "utility"
  | "stair"
  | "passage";

export interface RoomConfig {
  label: string;
  defW: number;
  defH: number;
  minW: number;
  minH: number;
  doorWidth: number;
  habitable: boolean;
  bedroom: boolean;
  source?: string;
  minSource?: string;
}

export interface RoomSizeOverride {
  defW?: number;
  defH?: number;
  minW?: number;
  minH?: number;
}

export interface RoomFlags {
  dining: boolean;
  kitchenOpen: boolean;
  puja: boolean;
  study: boolean;
  guestBedroom: boolean;
  store: boolean;
  utility: boolean;
  balcony: boolean;
  commonToilet: boolean;
}

export interface Setbacks {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface PlanInput {
  width: number;
  depth: number;
  facing: Compass;
  roadSide: "front" | "corner";
  cornerSide: "left" | "right";
  setbacks?: Partial<Setbacks>;
  openSpacePct?: number;
  floors: 1 | 2;
  parking: { cars: number; twoWheelers: number };
  staircase: "internal" | "external";
  bhk: number;
  attachedToilets: boolean[];
  rooms: RoomFlags;
  elderlyGroundBedroom: boolean;
  vastu: "none" | "moderate" | "strict";
  priority: "size" | "ventilation" | "openSpace";
  zoneFirst?: boolean;
  roomSizes?: Partial<Record<RoomKind, RoomSizeOverride>>;
}

/** A normalised input has one attached-toilet flag per bedroom. */
export type NormalisedInput = PlanInput & { attachedToilets: boolean[] };

export interface Frame {
  width: number;
  depth: number;
  setbacks: Setbacks;
  buildable: Rect;
  interior: Rect;
  facing: Compass;
  right: [number, number];
  inward: [number, number];
}

/** A room spec from the programme: its size range and door width. */
export interface RoomSpec {
  id: string;
  kind: RoomKind;
  label: string;
  minW: number;
  minH: number;
  defW: number;
  defH: number;
  doorWidth: number;
  habitable: boolean;
  attachedTo?: string;
}

/** The wall two rooms share: a vertical run at x, or a horizontal run at y. */
export type Shared =
  | { axis: "v"; x: number; y1: number; y2: number; length: number }
  | { axis: "h"; y: number; x1: number; x2: number; length: number };

export interface ExteriorSide {
  side: Side;
  length: number;
}

export interface CandidateRoom {
  id: string;
  kind: RoomKind;
  label: string;
  habitable: boolean;
  attachedTo?: string;
  rect: Rect;
  area: number;
  exteriorSides: Side[];
  compass: Compass;
}

export type PlacedRoom = CandidateRoom;

export interface Candidate {
  rooms: CandidateRoom[];
  openSpaces: Rect[];
}

export interface VastuRule {
  roomId: string;
  rule: string;
  score: number;
}

export interface Scorecard {
  carpetArea: number;
  builtUpArea: number;
  groundCoverage: number;
  efficiency: number;
  circulation: number;
  vastu: number | null;
  ventilation: number;
  sizes: number;
  total: number;
}

export interface ParkingSlot {
  kind: "car" | "two-wheeler";
  rect: Rect;
}

export interface Opening {
  kind: "door" | "mainDoor" | "opening" | "window" | "ventilator";
  width: number;
  a: Point;
  b: Point;
  roomId: string;
  otherRoomId?: string;
}

export interface FurnitureItem {
  id: string;
  roomId: string;
  kind: string;
  label: string;
  rect: Rect;
  clearance: Rect | null;
  assumed: boolean;
}

export interface Layout {
  id: string;
  /** Set on two-floor plans: "Ground floor" or "First floor". */
  floorLabel?: string;
  /** True for first-floor layouts, which have no entrance. */
  upper?: boolean;
  seed: number;
  frame: Frame;
  rooms: CandidateRoom[];
  openSpaces: Rect[];
  openings: Opening[];
  parking: ParkingSlot[];
  furniture: FurnitureItem[];
  missingFurniture: number;
  scorecard: Scorecard;
  vastuRules: VastuRule[];
  warnings: string[];
}

export interface GenerateResult {
  layouts: Layout[];
  errors: string[];
  warnings: string[];
  stats: { sampled: number; valid: number };
}

export interface GenerateOptions {
  count?: number;
  restarts?: number;
  seed?: number;
}

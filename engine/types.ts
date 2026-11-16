// Shared data model for the GharPlan engine.
// All engine geometry is in FEET, in a "local" frame:
//   x grows to the viewer's right when standing at the road and looking into the plot,
//   y = 0 is the road (front) edge and grows into the plot.
// `Frame` maps the local frame to compass/world directions for Vastu and rendering.

export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type VastuMode = 'strict' | 'moderate' | 'none';
export type Priority = 'size' | 'openSpace' | 'ventilation';
export type CornerSide = 'left' | 'right';
export type Side = 'front' | 'back' | 'left' | 'right';

export type RoomKind =
  | 'living' | 'dining' | 'kitchen'
  | 'master' | 'bedroom' | 'guest' | 'attachedToilet' | 'commonToilet'
  | 'puja' | 'study' | 'store' | 'utility' | 'stair' | 'passage';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Setbacks {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export interface PlotInput {
  /** Frontage width in feet (the side facing the road). */
  width: number;
  /** Depth in feet, perpendicular to the road. */
  depth: number;
  facing: Compass;
  roadSide: 'front' | 'corner';
  /** Which local side also faces a road when roadSide is 'corner'. */
  cornerSide: CornerSide;
  /** Optional overrides in feet; anything omitted comes from the setback table. */
  setbacks?: Partial<Setbacks>;
  /** Share of the built-up footprint left open inside the walls (courtyard, light well), in percent. */
  openSpacePct?: number;
  floors: 1 | 2;
  parking: { cars: 0 | 1; twoWheelers: 0 | 1 | 2 };
  staircase: 'internal' | 'external';
  bhk: 1 | 2 | 3 | 4;
  /** One entry per bedroom, master first. Length must be >= bhk. */
  attachedToilets: boolean[];
  rooms: {
    dining: boolean;
    kitchenOpen: boolean;
    puja: boolean;
    study: boolean;
    guestBedroom: boolean;
    store: boolean;
    utility: boolean;
    balcony: boolean;
    commonToilet: boolean;
  };
  elderlyGroundBedroom: boolean;
  /** Optional per-room size overrides in feet. Anything omitted uses the defaults in config. */
  roomSizes?: Partial<Record<RoomKind, RoomSizeOverride>>;
  vastu: VastuMode;
  /** Optional, strict Vastu only: start the search from zone-sorted room orders. */
  zoneFirst?: boolean;
  priority: Priority;
}

export interface RoomSizeOverride {
  defW?: number;
  defH?: number;
  minW?: number;
  minH?: number;
}

/** Derived geometry for one plot + setback combination. All in local feet. */
export interface Frame {
  width: number;
  depth: number;
  setbacks: Setbacks;
  /** Setback box: the area the building may occupy (walls included). */
  buildable: Rect;
  /** Room envelope: buildable box inset by half the external wall (wall centrelines). */
  interior: Rect;
  facing: Compass;
  /** World unit vector of local +x (viewer's right when standing at the road). */
  right: [number, number];
  /** World unit vector of local +y (into the plot, i.e. away from the road). */
  inward: [number, number];
}

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
  /** For attached toilets: the id of the bedroom they open from. */
  attachedTo?: string;
}

export interface PlacedRoom extends Omit<RoomSpec, 'defW' | 'defH' | 'minW' | 'minH' | 'doorWidth'> {
  rect: Rect;
  area: number;
  /** Which sides of the room lie on the exterior (outer wall) line. */
  exteriorSides: Side[];
  /** Compass direction of the room centre from the plot centre. */
  compass: Compass;
}

export type OpeningKind = 'mainDoor' | 'door' | 'opening' | 'window' | 'ventilator';

export interface Opening {
  kind: OpeningKind;
  width: number;
  /** Segment in local feet. */
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Room the opening belongs to (window) or the room a door opens into. */
  roomId: string;
  /** For doors: the room on the other side. */
  otherRoomId?: string;
}

export interface ParkingSlot {
  kind: 'car' | 'two-wheeler';
  rect: Rect;
}

export interface Scorecard {
  carpetArea: number;
  builtUpArea: number;
  groundCoverage: number;
  /** Carpet / built-up, percent. */
  efficiency: number;
  /** Passage area / built-up, percent. */
  circulation: number;
  /** 0-100, or null when Vastu is not required. */
  vastu: number | null;
  /** 0-100. */
  ventilation: number;
  /** 0-100, room sizes against defaults. */
  sizes: number;
  total: number;
}

export interface FurnitureItem {
  id: string;
  roomId: string;
  kind: string;
  label: string;
  rect: Rect;
  /** Area that must stay clear for use (e.g. in front of a wardrobe). */
  clearance: Rect | null;
  /** True when the size is not in the brief and should be checked. */
  assumed: boolean;
}

export interface Layout {
  id: string;
  seed: number;
  frame: Frame;
  rooms: PlacedRoom[];
  /** Open space left inside the envelope where rooms were kept to their size cap (courtyard, light well). */
  openSpaces: Rect[];
  openings: Opening[];
  parking: ParkingSlot[];
  furniture: FurnitureItem[];
  /** Required furniture items that did not fit. */
  missingFurniture: number;
  scorecard: Scorecard;
  vastuRules: { roomId: string; rule: string; score: number }[];
  warnings: string[];
}

export interface GenerationResult {
  layouts: Layout[];
  errors: string[];
  warnings: string[];
  stats: { sampled: number; valid: number };
}

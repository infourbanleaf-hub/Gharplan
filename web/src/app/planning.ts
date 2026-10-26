import { buildFrame } from "../engine/frame";
import { buildProgram } from "../engine/program";
import { normaliseInput } from "../engine/generate";
import { defaultInput } from "../engine/presets";
import { roomDefaults } from "../engine/config";
import type { PlanInput, RoomFlags, RoomKind, RoomSizeOverride, Setbacks } from "../engine/types";

/** One row of the room-size table. `flag` is the programme switch the row controls. */
export interface RowDef {
  key: RoomKind;
  label: string;
  mandatory?: boolean;
  flag?: keyof RoomFlags;
  needsBhk?: number;
  needsStair?: boolean;
}

export const ROWS: RowDef[] = [
  { key: "living", label: "Living", mandatory: true },
  { key: "master", label: "Master bedroom", mandatory: true },
  { key: "kitchen", label: "Kitchen", mandatory: true },
  { key: "dining", label: "Dining", flag: "dining" },
  { key: "bedroom", label: "Bedroom", needsBhk: 2 },
  { key: "attachedToilet", label: "Attached toilet", mandatory: true },
  { key: "commonToilet", label: "Common toilet", flag: "commonToilet" },
  { key: "guest", label: "Guest bedroom", flag: "guestBedroom" },
  { key: "study", label: "Study", flag: "study" },
  { key: "puja", label: "Puja", flag: "puja" },
  { key: "store", label: "Store", flag: "store" },
  { key: "utility", label: "Utility", flag: "utility" },
  { key: "stair", label: "Staircase", needsStair: true },
];

/** Optional rooms dropped first when the programme does not fit. */
export const DROP_ORDER: RoomKind[] = ["utility", "store", "puja", "study", "guest", "commonToilet"];

export interface RowState {
  include: boolean;
  defW: number | null;
  defH: number | null;
}

export type Rows = Record<string, RowState>;

/** The plot and programme controls, as the form holds them. Blank setbacks use the mode's default. */
export interface PlotForm {
  width: number;
  depth: number;
  facing: PlanInput["facing"];
  roadSide: PlanInput["roadSide"];
  cornerSide: PlanInput["cornerSide"];
  floors: 1 | 2;
  staircase: PlanInput["staircase"];
  setbackMode: "zero" | "table";
  setbacks: { front: number | null; rear: number | null; left: number | null; right: number | null };
  bhk: number;
  vastu: PlanInput["vastu"];
  cars: number;
  wheelers: number;
  /** Open space as a percentage of the buildable area. */
  openSpacePct: number;
  /** Multiplier on the room sizes filled from the plot (1 is the default). */
  sizeScale: number;
}

export const OPEN_SPACE_PCT = 5;

export const DEFAULT_FORM: PlotForm = {
  width: 30,
  depth: 40,
  facing: "N",
  roadSide: "front",
  cornerSide: "right",
  floors: 1,
  staircase: "internal",
  setbackMode: "zero",
  setbacks: { front: null, rear: null, left: null, right: null },
  bhk: 2,
  vastu: "moderate",
  cars: 0,
  wheelers: 0,
  openSpacePct: OPEN_SPACE_PCT,
  sizeScale: 1,
};

export const OPEN_SPACE_RANGE = { min: 0, max: 20 } as const;
export const SIZE_SCALE_RANGE = { min: 0.8, max: 1.2 } as const;
const MAX_VARIATION = 1.15;
const TOILET_KEYS: RoomKind[] = ["attachedToilet", "commonToilet"];

export function setbacksOf(form: PlotForm): Partial<Setbacks> {
  const out: Partial<Setbacks> = {};
  for (const side of ["front", "rear", "left", "right"] as const) {
    const v = form.setbacks[side];
    if (v !== null && v >= 0) out[side] = v;
    else if (form.setbackMode === "zero") out[side] = 0;
  }
  return out;
}

/** Plot and programme only: no room switches or sizes yet. */
export function baseInput(form: PlotForm): PlanInput {
  return {
    ...defaultInput(),
    width: form.width,
    depth: form.depth,
    facing: form.facing,
    roadSide: form.roadSide,
    cornerSide: form.cornerSide,
    setbacks: setbacksOf(form),
    openSpacePct: form.openSpacePct,
    bhk: form.bhk,
    vastu: form.vastu,
    floors: form.floors,
    staircase: form.staircase,
    parking: { cars: form.cars, twoWheelers: form.wheelers },
  };
}

/** Engine input for the form, with room switches and sizes taken from the table. */
export function buildEngineInput(form: PlotForm, rows: Rows): PlanInput {
  const rooms: RoomFlags = { ...defaultInput().rooms };
  const roomSizes: Partial<Record<RoomKind, RoomSizeOverride>> = {};
  for (const row of ROWS) {
    const state = rows[row.key];
    if (row.flag) rooms[row.flag] = state.include;
    if (!state.include || !state.defW || !state.defH) continue;
    if (state.defW > 0 && state.defH > 0) roomSizes[row.key] = { defW: state.defW, defH: state.defH };
  }
  return { ...baseInput(form), rooms, roomSizes };
}

/** The form that matches a sample plot. Room switches are applied separately, through rowsWithFlags. */
export function formFromInput(input: PlanInput): PlotForm {
  return {
    ...DEFAULT_FORM,
    width: input.width,
    depth: input.depth,
    facing: input.facing,
    roadSide: input.roadSide,
    cornerSide: input.cornerSide,
    floors: input.floors,
    staircase: input.staircase,
    bhk: input.bhk,
    vastu: input.vastu,
    cars: input.parking.cars,
    wheelers: input.parking.twoWheelers,
    openSpacePct: input.openSpacePct ?? OPEN_SPACE_PCT,
  };
}

/** Smallest size the engine accepts: toilets 1 ft under their default, other rooms at the config minimum. */
export function minOf(key: RoomKind, defW: number, defH: number): { w: number; h: number } {
  if (TOILET_KEYS.includes(key)) return { w: defW - 1, h: defH - 1 };
  return { w: roomDefaults.rooms[key].minW, h: roomDefaults.rooms[key].minH };
}

function includedByDefault(row: RowDef, form: PlotForm): boolean {
  if (row.mandatory) return true;
  if (row.needsBhk) return form.bhk >= row.needsBhk;
  if (row.needsStair) return form.floors === 2 && form.staircase === "internal";
  return !!(row.flag && defaultInput().rooms[row.flag]);
}

/** Picks which rooms to include and sizes them to use the buildable area. */
export function fillFromPlot(form: PlotForm): { rows: Rows; note: string } {
  const frame = buildFrame(normaliseInput(baseInput(form)));
  const buildable = frame.buildable.w * frame.buildable.h;
  const target = buildable * Math.min(0.92, 1 - form.openSpacePct / 100);
  const include: Record<string, boolean> = {};
  for (const row of ROWS) include[row.key] = includedByDefault(row, form);

  const minArea = () =>
    ROWS.reduce((sum, r) => {
      if (!include[r.key]) return sum;
      const m = minOf(r.key, roomDefaults.rooms[r.key].defW, roomDefaults.rooms[r.key].defH);
      return sum + m.w * m.h;
    }, 0);

  const dropped: RoomKind[] = [];
  for (const key of DROP_ORDER) {
    if (minArea() <= target) break;
    if (include[key]) {
      include[key] = false;
      dropped.push(key);
    }
  }

  const dims = (key: RoomKind, scale: number) => {
    const cfg = roomDefaults.rooms[key];
    const w = Math.round(cfg.defW * scale * 2) / 2;
    const h = Math.round(cfg.defH * scale * 2) / 2;
    const m = minOf(key, w, h);
    return { w: Math.max(w, m.w), h: Math.max(h, m.h) };
  };
  const areaAt = (scale: number) =>
    ROWS.reduce((sum, r) => {
      if (!include[r.key]) return sum;
      const d = dims(r.key, scale);
      return sum + d.w * d.h;
    }, 0);

  const defaultArea = areaAt(1);
  const scale = Math.min(MAX_VARIATION, Math.sqrt(target / defaultArea)) * form.sizeScale;
  const used = areaAt(scale);
  const minimum = minArea();
  let note =
    minimum > buildable
      ? "Does not fit even after leaving optional rooms out."
      : used > target
        ? "Fits only at the smallest sizes, which leaves little open space."
        : `Sized to about ${Math.round((used / buildable) * 100)}% of the buildable area.`;
  if (dropped.length) note += ` Left out to fit: ${dropped.join(", ")}.`;

  const rows: Rows = {};
  for (const row of ROWS) {
    if (include[row.key]) {
      const d = dims(row.key, scale);
      rows[row.key] = { include: true, defW: d.w, defH: d.h };
    } else {
      rows[row.key] = { include: false, defW: null, defH: null };
    }
  }
  return { rows, note };
}

export interface Feasibility {
  tone: "" | "warn" | "err";
  verdict: string;
  openArea: number | null;
  openAreaPct: { ofBuildable: number; ofPlot: number } | null;
}

/** Whether the rooms in the table fit the buildable area, and how much open area they leave. */
export function sizesFeasibility(form: PlotForm, rows: Rows): Feasibility {
  const frame = buildFrame(normaliseInput(baseInput(form)));
  const plotArea = form.width * form.depth;
  const buildable = frame.buildable.w * frame.buildable.h;
  let need = 0;
  let needMin = 0;
  let count = 0;
  for (const row of ROWS) {
    const s = rows[row.key];
    if (!s.include || !s.defW || !s.defH) continue;
    count++;
    need += s.defW * s.defH;
    const m = minOf(row.key, s.defW, s.defH);
    needMin += m.w * m.h;
  }
  const open = buildable - need;
  if (count === 0) return { tone: "warn", verdict: "Add at least one room to check feasibility.", openArea: null, openAreaPct: null };
  if (needMin > buildable) {
    return {
      tone: "err",
      verdict: `Not feasible. At their minimum sizes these ${count} rooms need ${Math.round(needMin)} sq ft, but the buildable area is ${Math.round(buildable)} sq ft. Reduce sizes or untick a room.`,
      openArea: null,
      openAreaPct: null,
    };
  }
  const openPct = {
    ofBuildable: Math.max(0, Math.round((open / buildable) * 100)),
    ofPlot: Math.max(0, Math.round((open / plotArea) * 100)),
  };
  if (need > buildable) {
    return {
      tone: "warn",
      verdict: `Tight. These sizes need ${Math.round(need)} sq ft against ${Math.round(buildable)} sq ft buildable. Feasible only if the rooms are sized down toward their minimums.`,
      openArea: Math.max(0, Math.round(open)),
      openAreaPct: openPct,
    };
  }
  return {
    tone: "",
    verdict: `Feasible. These ${count} rooms use ${Math.round(need)} sq ft of the ${Math.round(buildable)} sq ft buildable area.`,
    openArea: Math.max(0, Math.round(open)),
    openAreaPct: openPct,
  };
}

export interface SpaceCheck {
  plotArea: number;
  buildable: number;
  buildablePct: number;
  programmeNeed: number;
  tone: "" | "warn" | "err";
  verdict: string;
}

/** Plot-level check: does the programme at default sizes fit the buildable area? */
export function spaceCheck(form: PlotForm): SpaceCheck {
  const input = normaliseInput(baseInput(form));
  const frame = buildFrame(input);
  const program = buildProgram(input);
  const plotArea = form.width * form.depth;
  const buildable = frame.buildable.w * frame.buildable.h;
  let need = 0;
  let needMin = 0;
  for (const r of program.rooms) {
    if (r.kind === "passage") continue;
    need += r.defW * r.defH;
    needMin += r.minW * r.minH;
  }
  let tone: SpaceCheck["tone"] = "";
  let verdict = "Fits at default sizes.";
  if (needMin > buildable) {
    tone = "err";
    verdict = `Does not fit. At their minimum sizes the rooms need ${Math.round(needMin)} sq ft, but the buildable area is ${Math.round(buildable)} sq ft. Remove a room or enlarge the plot.`;
  } else if (need > buildable) {
    tone = "warn";
    verdict = `Tight. Rooms fit only near their minimum sizes (need ${Math.round(need)} sq ft at default, ${Math.round(buildable)} sq ft buildable).`;
  }
  return {
    plotArea,
    buildable,
    buildablePct: Math.round((buildable / plotArea) * 100),
    programmeNeed: need,
    tone,
    verdict,
  };
}

/** Setback placeholder values: the bye-law table in table mode, otherwise zero. */
export function setbackHints(form: PlotForm): Setbacks {
  // Built without typed setbacks, so the frame uses the bye-law defaults.
  const table = buildFrame(normaliseInput({ ...baseInput(form), setbacks: undefined })).setbacks;
  return form.setbackMode === "table" ? table : { front: 0, rear: 0, left: 0, right: 0 };
}

/** Table rows for a sample plot, with its room switches applied on top of the plot fill. */
export function rowsWithFlags(rows: Rows, flags: RoomFlags): Rows {
  const out: Rows = { ...rows };
  for (const row of ROWS) {
    if (!row.flag) continue;
    const on = flags[row.flag];
    if (on && !out[row.key].include) {
      const cfg = roomDefaults.rooms[row.key];
      out[row.key] = { include: true, defW: cfg.defW, defH: cfg.defH };
    } else if (!on && !row.mandatory) {
      out[row.key] = { include: false, defW: null, defH: null };
    }
  }
  return out;
}

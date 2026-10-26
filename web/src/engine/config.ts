import roomDefaultsJson from "../config/room-defaults.json";
import setbacksJson from "../config/setbacks.json";
import type { RoomConfig, RoomKind } from "./types";

interface RoomDefaults {
  source: string;
  rooms: Record<RoomKind, RoomConfig>;
  windowWidthFt: number;
  ventilatorWidthFt: number;
  mainDoorWidthFt: number;
  openKitchenWidthFt: number;
  wallExternalFt: number;
  passageWidthFt: number;
  maxAspect: number;
  maxCirculationRatio: number;
}

export interface SetbackBand {
  maxAreaSqM: number | null;
  frontM: number;
  rearM: number;
  sideM: number;
  sideRule: "both" | "oneSide";
}

export interface SetbackConfig {
  source: string;
  cornerRoadSideMinM: number;
  bands: SetbackBand[];
}

export const roomDefaults = roomDefaultsJson as RoomDefaults;
export const setbackConfig = setbacksJson as SetbackConfig;

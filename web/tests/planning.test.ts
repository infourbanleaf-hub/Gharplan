import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM,
  buildEngineInput,
  fillFromPlot,
  formFromInput,
  rowsWithFlags,
  setbacksOf,
  sizesFeasibility,
  spaceCheck,
  type Rows,
} from "../src/app/planning";
import { ACCEPTANCE_CASES, defaultInput } from "../src/engine/presets";

describe("fillFromPlot", () => {
  it("includes mandatory rooms and sizes them to the plot", () => {
    const { rows, note } = fillFromPlot(DEFAULT_FORM);
    expect(rows.living.include).toBe(true);
    expect(rows.master.include).toBe(true);
    expect(rows.kitchen.include).toBe(true);
    expect(rows.living.defW).toBeGreaterThan(0);
    expect(note).toMatch(/Sized to about \d+%/);
  });

  it("drops optional rooms when the programme does not fit", () => {
    const tight = { ...DEFAULT_FORM, width: 20, depth: 20, bhk: 3 };
    const { rows, note } = fillFromPlot(tight);
    expect(rows.study.include).toBe(false);
    expect(note).toContain("Left out to fit");
  });

  it("includes the staircase only for an internal stair on two floors", () => {
    expect(fillFromPlot({ ...DEFAULT_FORM, floors: 2 }).rows.stair.include).toBe(true);
    expect(fillFromPlot({ ...DEFAULT_FORM, floors: 2, staircase: "external" }).rows.stair.include).toBe(false);
    expect(fillFromPlot(DEFAULT_FORM).rows.stair.include).toBe(false);
  });

  it("includes the bedroom row only for 2 BHK and above", () => {
    expect(fillFromPlot({ ...DEFAULT_FORM, bhk: 1 }).rows.bedroom.include).toBe(false);
    expect(fillFromPlot({ ...DEFAULT_FORM, bhk: 2 }).rows.bedroom.include).toBe(true);
  });
});

describe("buildEngineInput", () => {
  it("passes only included rooms' sizes and flags to the engine", () => {
    const { rows } = fillFromPlot(DEFAULT_FORM);
    const input = buildEngineInput(DEFAULT_FORM, { ...rows, study: { include: false, defW: 8, defH: 10 } });
    expect(input.roomSizes?.study).toBeUndefined();
    expect(input.rooms.study).toBe(false);
    expect(input.roomSizes?.living).toBeDefined();
  });

  it("ignores rows that are included but have no size", () => {
    const rows: Rows = { ...fillFromPlot(DEFAULT_FORM).rows, puja: { include: true, defW: null, defH: null } };
    const input = buildEngineInput(DEFAULT_FORM, rows);
    expect(input.roomSizes?.puja).toBeUndefined();
  });
});

describe("setbacksOf", () => {
  it("uses zero for blank sides in zero mode", () => {
    expect(setbacksOf({ ...DEFAULT_FORM, setbacks: { front: 5, rear: null, left: null, right: null } })).toEqual({
      front: 5,
      rear: 0,
      left: 0,
      right: 0,
    });
  });
  it("leaves blank sides to the bye-law table in table mode", () => {
    expect(
      setbacksOf({ ...DEFAULT_FORM, setbackMode: "table", setbacks: { front: 5, rear: null, left: null, right: null } }),
    ).toEqual({ front: 5 });
  });
});

describe("feasibility and space check", () => {
  it("reports a plot too small for its minimum sizes as not feasible", () => {
    const { rows } = fillFromPlot(DEFAULT_FORM);
    const tiny = { ...DEFAULT_FORM, width: 12, depth: 12 };
    expect(sizesFeasibility(tiny, rows).tone).toBe("err");
  });
  it("reports a comfortable plot as feasible with open area", () => {
    const { rows } = fillFromPlot(DEFAULT_FORM);
    const f = sizesFeasibility(DEFAULT_FORM, rows);
    expect(f.tone).toBe("");
    expect(f.openArea).not.toBeNull();
  });
  it("space check marks a too-small plot as not fitting", () => {
    expect(spaceCheck({ ...DEFAULT_FORM, width: 12, depth: 12, bhk: 4 }).tone).toBe("err");
  });
});

describe("sample plots", () => {
  it("maps a sample input to the matching form", () => {
    const f = formFromInput(ACCEPTANCE_CASES[3].input);
    expect(f.roadSide).toBe("corner");
    expect(f.cornerSide).toBe("right");
    expect(f.bhk).toBe(4);
    expect(f.width).toBe(40);
  });
  it("applies a sample's room switches on top of the plot fill", () => {
    const f = formFromInput(ACCEPTANCE_CASES[1].input);
    const rows = rowsWithFlags(fillFromPlot(f).rows, ACCEPTANCE_CASES[1].input.rooms);
    expect(rows.puja.include).toBe(true);
    expect(rows.puja.defW).toBeGreaterThan(0);
  });
  it("keeps the engine defaults for the base input", () => {
    expect(defaultInput().vastu).toBe("moderate");
  });
});

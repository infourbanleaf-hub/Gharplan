import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { generatePlans } from "../src/engine/generate";
import { ACCEPTANCE_CASES } from "../src/engine/presets";
import { layoutToDxf } from "../src/export/dxf";
import { layoutsToPdf } from "../src/export/pdf";
import { layoutToSvg } from "../src/export";

const OUT = process.env.EXPORT_OUT_DIR;

describe("exports", () => {
  const res = generatePlans(ACCEPTANCE_CASES[0].input, { restarts: 400, seed: 20260101 });

  it("writes an R12 DXF with layers and entities", () => {
    const dxf = layoutToDxf(res.layouts[0], "ftin");
    expect(dxf.startsWith("0\nSECTION")).toBe(true);
    expect(dxf).toContain("$INSUNITS\n70\n2");
    expect(dxf).toContain("POLYLINE");
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(`${OUT}/plan.dxf`, dxf);
    }
  });

  it("uses metric units in DXF when asked", () => {
    const dxf = layoutToDxf(res.layouts[0], "m");
    expect(dxf).toContain("$INSUNITS\n70\n6");
  });

  it("writes an SVG", () => {
    const svg = layoutToSvg(res.layouts[0], "ftin");
    expect(svg.startsWith("<svg")).toBe(true);
    if (OUT) writeFileSync(`${OUT}/plan.svg`, svg);
  });

  it("writes a PDF with one page per plan", async () => {
    const bytes = await layoutsToPdf(res.layouts, "ftin");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    if (OUT) writeFileSync(`${OUT}/plans.pdf`, bytes);
  });
});

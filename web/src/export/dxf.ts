import { planScene, type SceneItem } from "../render/scene";
import type { Layout, Point, Unit } from "../engine/types";

// The scene is drawn in pixels at 12 per foot (the default). Sizes such as the north arrow
// and text are fixed in pixels, so the scene is always built at that scale and converted here.
const PX_PER_FT = 12;
const FT_TO_M = 0.3048;

/** Returns the scene for a layout at the default scale (12 pixels per foot). */
export function planSceneForExport(layout: Layout, unit: Unit) {
  return planScene(layout, { unit });
}

function group(code: number, value: string | number): string {
  return `${code}\n${value}`;
}

/** Scene pixels to output units. DXF is y-up; the scene is y-down, so y is negated. */
function pointGroups(p: Point, factor: number, codeX = 10, codeY = 20): string[] {
  return [
    group(codeX, ((p.x / PX_PER_FT) * factor).toFixed(4)),
    group(codeY, ((-p.y / PX_PER_FT) * factor).toFixed(4)),
  ];
}

function polylineEntity(layer: string, points: Point[], closed: boolean, factor: number): string[] {
  const out: string[] = [
    group(0, "POLYLINE"),
    group(8, layer),
    group(66, 1),
    group(10, 0),
    group(20, 0),
    group(70, closed ? 1 : 0),
  ];
  for (const p of points) {
    out.push(group(0, "VERTEX"), group(8, layer), ...pointGroups(p, factor));
  }
  out.push(group(0, "SEQEND"), group(8, layer));
  return out;
}

function textEntity(item: Extract<SceneItem, { kind: "text" }>, factor: number): string[] {
  const halign = item.anchor === "middle" ? 1 : item.anchor === "end" ? 2 : 0;
  // SVG text y is the baseline, so vertical justification stays at baseline.
  const height = (item.size / PX_PER_FT) * factor;
  return [
    group(0, "TEXT"),
    group(8, item.layer),
    ...pointGroups(item, factor),
    group(40, height.toFixed(4)),
    group(1, item.text.replace(/[\r\n]/g, " ")),
    group(72, halign),
    group(11, ((item.x / PX_PER_FT) * factor).toFixed(4)),
    group(21, ((-item.y / PX_PER_FT) * factor).toFixed(4)),
    group(73, 0),
  ];
}

/** Writes a layout as an AutoCAD R12 DXF file, one layer per drawing layer. */
export function layoutToDxf(layout: Layout, unit: Unit): string {
  const scene = planSceneForExport(layout, unit);
  const factor = unit === "m" ? FT_TO_M : 1;
  const layers = [...new Set(scene.items.map((it) => it.layer))];
  const lines: string[] = [];
  const push = (...xs: string[]) => lines.push(...xs);

  push(group(0, "SECTION"), group(2, "HEADER"));
  push(group(9, "$ACADVER"), group(1, "AC1009"));
  push(group(9, "$INSUNITS"), group(70, unit === "m" ? 6 : 2));
  push(group(9, "$MEASUREMENT"), group(70, unit === "m" ? 1 : 0));
  push(group(0, "ENDSEC"));

  push(group(0, "SECTION"), group(2, "TABLES"));
  push(group(0, "TABLE"), group(2, "LAYER"), group(70, layers.length));
  for (const layer of layers) {
    push(group(0, "LAYER"), group(2, layer), group(70, 0), group(62, 7), group(6, "CONTINUOUS"));
  }
  push(group(0, "ENDTAB"), group(0, "ENDSEC"));

  push(group(0, "SECTION"), group(2, "ENTITIES"));
  for (const it of scene.items) {
    if (it.kind === "polygon") {
      lines.push(...polylineEntity(it.layer, it.points, true, factor));
    } else if (it.kind === "polyline") {
      lines.push(...polylineEntity(it.layer, it.points, false, factor));
    } else {
      lines.push(...textEntity(it, factor));
    }
  }
  push(group(0, "ENDSEC"), group(0, "EOF"));
  return lines.join("\n") + "\n";
}

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { planScene, type SceneItem } from "../render/scene";
import { formatLength } from "../engine/units";
import type { Layout, Unit } from "../engine/types";

// A3 landscape in points.
const PAGE_W = 1191;
const PAGE_H = 842;
const MARGIN = 36;
const HEADER_H = 96;

function hexToRgb(hex: string | undefined) {
  if (!hex || hex === "none") return undefined;
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function dashArray(dash: string | undefined): number[] | undefined {
  return dash ? dash.split(/\s+/).map(Number) : undefined;
}

function pathOf(points: { x: number; y: number }[], closed: boolean): string {
  const [first, ...rest] = points;
  const head = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  const body = rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return closed ? `${head} ${body} Z` : `${head} ${body}`;
}

/** Draws one layout's scene onto a page, fitted and centred below a header with the plan's stats. */
function drawPlan(page: PDFPage, font: PDFFont, layout: Layout, unit: Unit): void {
  const scene = planScene(layout, { unit });
  const areaW = PAGE_W - 2 * MARGIN;
  const areaH = PAGE_H - 2 * MARGIN - HEADER_H;
  const s = Math.min(areaW / scene.width, areaH / scene.height);
  const ox = MARGIN + (areaW - scene.width * s) / 2;
  const oy = MARGIN + HEADER_H + (areaH - scene.height * s) / 2;
  // Scene coordinates are y-down from the top; PDF is y-up from the bottom.
  const toPdfY = (y: number) => PAGE_H - (oy + y * s);
  const toPdfX = (x: number) => ox + x * s;

  for (const it of scene.items) {
    drawItem(page, font, it, s, ox, oy, toPdfX, toPdfY);
  }

  const sc = layout.scorecard;
  const plotArea = layout.frame.width * layout.frame.depth;
  const title = `${layout.floorLabel ?? "Plan"} ${layout.id}`;
  const stats = `Plot ${Math.round(plotArea)} sq ft   Built-up ${Math.round(sc.builtUpArea)} sq ft   Carpet ${Math.round(sc.carpetArea)} sq ft   Score ${Math.round(sc.total)}`;
  const size = `Plot ${formatLength(layout.frame.width, unit)} x ${formatLength(layout.frame.depth, unit)}`;
  page.drawText(title, { x: MARGIN, y: PAGE_H - MARGIN - 16, size: 16, font, color: rgb(0.1, 0.12, 0.1) });
  page.drawText(`${size}   ${stats}`, { x: MARGIN, y: PAGE_H - MARGIN - 36, size: 10, font, color: rgb(0.35, 0.38, 0.35) });
  const notes = layout.warnings.slice(0, 2).join("  ");
  if (notes) {
    page.drawText(notes.slice(0, 180), { x: MARGIN, y: MARGIN / 2, size: 8, font, color: rgb(0.55, 0.35, 0) });
  }
}

function drawItem(
  page: PDFPage,
  font: PDFFont,
  it: SceneItem,
  s: number,
  ox: number,
  oy: number,
  toPdfX: (x: number) => number,
  toPdfY: (y: number) => number,
): void {
  if (it.kind === "polygon" || it.kind === "polyline") {
    const points = it.points.map((p) => ({ x: p.x, y: p.y }));
    const closed = it.kind === "polygon";
    const fill = it.kind === "polygon" ? hexToRgb(it.fill) : undefined;
    const stroke = hexToRgb(it.stroke);
    // drawSvgPath takes its origin at the top-left of the page and uses y-down path coordinates.
    const absolute = points.map((p) => ({ x: ox + p.x * s, y: oy + p.y * s }));
    page.drawSvgPath(pathOf(absolute, closed), {
      x: 0,
      y: PAGE_H,
      color: fill,
      borderColor: stroke,
      borderWidth: it.strokeWidth ?? 0,
      borderDashArray: dashArray(it.dash),
    });
    return;
  }
  const tx = toPdfX(it.x);
  const ty = toPdfY(it.y);
  const size = Math.max(4, it.size * 0.9);
  const width = font.widthOfTextAtSize(it.text, size);
  const x = it.anchor === "middle" ? tx - width / 2 : it.anchor === "end" ? tx - width : tx;
  page.drawText(it.text, { x, y: ty, size, font, color: hexToRgb(it.fill) ?? rgb(0, 0, 0) });
}

/** Writes one A3 landscape page per layout. */
export async function layoutsToPdf(layouts: Layout[], unit: Unit): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const layout of layouts) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    drawPlan(page, font, layout, unit);
  }
  return doc.save();
}

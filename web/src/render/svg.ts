import type { Point } from "../engine/types";
import type { Scene, SceneItem } from "./scene";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pts = (p: Point[]) => p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(" ");

function itemToSvg(it: SceneItem): string {
  switch (it.kind) {
    case "polygon": {
      const stroke = it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.strokeWidth ?? 1}"` : "";
      const dash = it.dash ? ` stroke-dasharray="${it.dash}"` : "";
      return `<polygon points="${pts(it.points)}" fill="${it.fill}"${stroke}${dash} data-layer="${it.layer}"/>`;
    }
    case "polyline": {
      const dash = it.dash ? ` stroke-dasharray="${it.dash}"` : "";
      return `<polyline points="${pts(it.points)}" fill="none" stroke="${it.stroke}" stroke-width="${it.strokeWidth}" stroke-linecap="round"${dash} data-layer="${it.layer}"/>`;
    }
    case "text": {
      const weight = it.weight === "bold" ? ' font-weight="700"' : "";
      return `<text x="${it.x.toFixed(2)}" y="${it.y.toFixed(2)}" font-size="${it.size}" fill="${it.fill}" text-anchor="${it.anchor}" font-family="Roboto, 'Noto Sans', 'Noto Sans Devanagari', Arial, sans-serif"${weight} data-layer="${it.layer}">${esc(it.text)}</text>`;
    }
  }
}

/** The drawing elements of a scene, without the enclosing svg element. */
export function sceneBody(scene: Scene): string {
  return scene.items.map(itemToSvg).join("\n");
}

export function sceneToSvg(scene: Scene): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width.toFixed(2)} ${scene.height.toFixed(2)}" width="100%" style="background:#ffffff">
${sceneBody(scene)}
</svg>
`;
}

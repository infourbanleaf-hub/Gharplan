import type { Item, Scene } from './scene';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pts = (p: { x: number; y: number }[]) => p.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');

function itemToSvg(it: Item): string {
  switch (it.kind) {
    case 'polygon': {
      const stroke = it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.strokeWidth ?? 1}"` : '';
      const dash = it.dash ? ` stroke-dasharray="${it.dash}"` : '';
      return `<polygon points="${pts(it.points)}" fill="${it.fill}"${stroke}${dash} data-layer="${it.layer}"/>`;
    }
    case 'polyline': {
      const dash = it.dash ? ` stroke-dasharray="${it.dash}"` : '';
      return `<polyline points="${pts(it.points)}" fill="none" stroke="${it.stroke}" stroke-width="${it.strokeWidth}" stroke-linecap="round"${dash} data-layer="${it.layer}"/>`;
    }
    case 'text': {
      const weight = it.weight === 'bold' ? ' font-weight="700"' : '';
      return `<text x="${it.x.toFixed(2)}" y="${it.y.toFixed(2)}" font-size="${it.size}" fill="${it.fill}" text-anchor="${it.anchor}" font-family="Roboto, Arial, sans-serif"${weight} data-layer="${it.layer}">${esc(it.text)}</text>`;
    }
  }
}

/** Serialises a scene to a standalone SVG document that scales to its container. */
export function sceneToSvg(scene: Scene): string {
  const body = scene.items.map(itemToSvg).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width.toFixed(2)} ${scene.height.toFixed(2)}" width="100%" style="background:#ffffff">\n${body}\n</svg>\n`;
}

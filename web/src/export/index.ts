import { planScene } from "../render/scene";
import { sceneToSvg } from "../render/svg";
import type { Layout, Unit } from "../engine/types";

export { layoutToDxf } from "./dxf";

export function layoutToSvg(layout: Layout, unit: Unit): string {
  return sceneToSvg(planScene(layout, { unit }));
}

/** Triggers a browser download of the given content. */
export function downloadFile(name: string, content: string | Uint8Array, type: string): void {
  // Copy binary content into a fresh buffer so it is a valid BlobPart.
  const data = typeof content === "string" ? content : new Uint8Array(content);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

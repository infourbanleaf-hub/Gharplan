// Export actions. On Android the files go to the system share sheet; on the web they download
// (PDF opens the browser print dialog, which can save as PDF).
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { buildPlanPageHtml } from '../render/planHtml';
import { layoutToDxf } from '../engine/export/dxf';
import type { Layout, PlotInput, Unit } from '../engine';
import { exportCopy } from './strings';

export function projectName(input: PlotInput): string {
  return `${input.width}x${input.depth} ${input.facing}, ${input.bhk}BHK`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileBase(layout: Layout): string {
  return `gharplan-${layout.id}`;
}

export function pdfHtml(layout: Layout, input: PlotInput, unit: Unit): string {
  return buildPlanPageHtml({ layout, input, unit, copy: exportCopy, date: today(), projectName: projectName(input) });
}

function webDownload(name: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPdf(layout: Layout, input: PlotInput, unit: Unit): Promise<void> {
  const html = pdfHtml(layout, input, unit);
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up blocked');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `${fileBase(layout)}.pdf` });
}

export async function exportDxf(layout: Layout): Promise<void> {
  const dxf = layoutToDxf(layout);
  if (Platform.OS === 'web') {
    webDownload(`${fileBase(layout)}.dxf`, 'application/dxf', dxf);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${fileBase(layout)}.dxf`;
  await FileSystem.writeAsStringAsync(uri, dxf, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, { mimeType: 'application/dxf', dialogTitle: `${fileBase(layout)}.dxf` });
}

/** Captures the on-screen plan as a PNG and shares it. `captureUri` is provided by the viewer. */
export async function shareImage(layout: Layout, captureUri: () => Promise<string>, svgFallback: string): Promise<void> {
  if (Platform.OS === 'web') {
    // The browser cannot capture the view as an image here, so the vector plan is downloaded instead.
    webDownload(`${fileBase(layout)}.svg`, 'image/svg+xml', svgFallback);
    return;
  }
  const uri = await captureUri();
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `${fileBase(layout)}.png` });
}

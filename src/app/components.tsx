import { useEffect } from "react";
import { ROWS, type Rows, type RowState } from "./planning";
import type { Layout, RoomKind, Unit } from "../engine/types";
import { layoutToSvg } from "../export";

interface NumFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export function NumField({ label, value, onChange, min, max, step = 0.5, placeholder }: NumFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}

interface RoomTableProps {
  rows: Rows;
  onToggle: (key: RoomKind) => void;
  onSize: (key: RoomKind, field: "defW" | "defH", value: number | null) => void;
}

export function RoomTable({ rows, onToggle, onSize }: RoomTableProps) {
  const total = ROWS.reduce((sum, row) => {
    const s = rows[row.key];
    return sum + (s?.include && s.defW && s.defH ? s.defW * s.defH : 0);
  }, 0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>In plan</th>
            <th>Room</th>
            <th>Width (ft)</th>
            <th>Depth (ft)</th>
            <th>Area (sq ft)</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const s: RowState = rows[row.key] ?? { include: false, defW: null, defH: null };
            const area = s.include && s.defW && s.defH ? Math.round(s.defW * s.defH) : null;
            const mandatory = !!row.mandatory;
            return (
              <tr key={row.key} className={mandatory ? "must" : undefined}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Include ${row.label}`}
                    checked={s.include}
                    disabled={mandatory}
                    onChange={() => onToggle(row.key)}
                  />
                </td>
                <td>{row.label}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    aria-label={`${row.label} width`}
                    value={s.include && s.defW !== null ? s.defW : ""}
                    disabled={!s.include}
                    onChange={(e) => onSize(row.key, "defW", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    aria-label={`${row.label} depth`}
                    value={s.include && s.defH !== null ? s.defH : ""}
                    disabled={!s.include}
                    onChange={(e) => onSize(row.key, "defH", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </td>
                <td>{area ?? "–"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={4}>Total</th>
            <th>{Math.round(total)} sq ft</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface PlanCardProps {
  layout: Layout;
  unit: Unit;
  onEnlarge: (layout: Layout) => void;
  onExportSvg: (layout: Layout) => void;
  onExportDxf: (layout: Layout) => void;
}

export function PlanCard({ layout, unit, onEnlarge, onExportSvg, onExportDxf }: PlanCardProps) {
  const sc = layout.scorecard;
  const plotArea = layout.frame.width * layout.frame.depth;
  const svg = layoutToSvg(layout, unit);
  return (
    <article className="card plan">
      <h2>Plan {layout.id}</h2>
      <div className="stats">
        Plot <b>{Math.round(plotArea)} sq ft</b> · Built-up <b>{Math.round(sc.builtUpArea)} sq ft</b> · Carpet{" "}
        <b>{Math.round(sc.carpetArea)} sq ft</b> · Score <b>{Math.round(sc.total)}</b>
      </div>
      <div
        className="zoomable"
        role="button"
        tabIndex={0}
        aria-label={`Enlarge plan ${layout.id}`}
        onClick={() => onEnlarge(layout)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEnlarge(layout);
          }
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {layout.warnings.slice(0, 4).map((w) => (
        <div key={w} className="hint">
          {w}
        </div>
      ))}
      <div className="row">
        <button type="button" onClick={() => onExportSvg(layout)}>
          Download SVG
        </button>
        <button type="button" onClick={() => onExportDxf(layout)}>
          Download DXF
        </button>
      </div>
    </article>
  );
}

interface LightboxProps {
  title: string;
  svg: string;
  onClose: () => void;
}

export function Lightbox({ title, svg, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="lightbox-panel" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-bar">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { planMapper, planScene } from "../render/scene";
import { sceneBody } from "../render/svg";
import { resizeRoom, moveRoom, setRoomRect, snap, type Edge } from "../edit/ops";
import type { CandidateRoom, Layout, Point, Rect, Unit } from "../engine/types";

export interface EditCheck {
  violations: string[];
  vastuFlags: string[];
  total: number;
}

interface EditorProps {
  layout: Layout;
  unit: Unit;
  check: EditCheck;
  selectedId: string | null;
  canUndo: boolean;
  changed: boolean;
  onSelect: (id: string | null) => void;
  onRooms: (rooms: CandidateRoom[]) => void;
  onUndo: () => void;
  onReset: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

interface Drag {
  kind: "move" | "resize";
  edge?: Edge;
  roomId: string;
  start: Point;
  orig: CandidateRoom;
}

const HANDLE_FT = 0.9;

/** Interactive plan: drag a room to move it, drag an edge handle to resize, snapping to half a foot. */
export function Editor({
  layout,
  unit,
  check,
  selectedId,
  canUndo,
  changed,
  onSelect,
  onRooms,
  onUndo,
  onReset,
  onSave,
  onDiscard,
}: EditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<Rect | null>(null);

  const scene = useMemo(() => planScene(layout, { unit, selectedRoomId: selectedId ?? undefined }), [layout, unit, selectedId]);
  const body = useMemo(() => sceneBody(scene), [scene]);
  const mapper = useMemo(() => planMapper(layout.frame), [layout.frame]);
  const selected = layout.rooms.find((r) => r.id === selectedId) ?? null;

  /** Converts a pointer event to plan feet. */
  const toPlan = (e: ReactPointerEvent | PointerEvent): Point => {
    const svg = svgRef.current!;
    const box = svg.getBoundingClientRect();
    const px = {
      x: ((e.clientX - box.left) * scene.width) / box.width,
      y: ((e.clientY - box.top) * scene.height) / box.height,
    };
    return mapper.toPlan(px);
  };

  const beginDrag = (e: ReactPointerEvent<SVGElement>, roomId: string, kind: "move" | "resize", edge?: Edge) => {
    e.stopPropagation();
    const room = layout.rooms.find((r) => r.id === roomId);
    if (!room) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    onSelect(roomId);
    dragRef.current = { kind, edge, roomId, start: toPlan(e), orig: room };
    setGhost(room.rect);
  };

  const moveDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toPlan(e);
    if (d.kind === "move") {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      setGhost(moveRoom(d.orig, d.orig.rect.x + dx, d.orig.rect.y + dy).rect);
    } else {
      const pos = d.edge === "e" || d.edge === "w" ? p.x : p.y;
      setGhost(resizeRoom(d.orig, d.edge!, pos).rect);
    }
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const rect = ghost;
    setGhost(null);
    if (!d || !rect) return;
    const same =
      rect.x === d.orig.rect.x && rect.y === d.orig.rect.y && rect.w === d.orig.rect.w && rect.h === d.orig.rect.h;
    if (same) return;
    onRooms(layout.rooms.map((r) => (r.id === d.roomId ? { ...r, rect } : r)));
  };

  /** Typed values for the selected room. Empty fields are ignored until they hold a number. */
  const typeRect = (key: keyof Rect, value: string) => {
    if (!selected || value === "") return;
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const next = { ...selected.rect, [key]: n };
    onRooms(layout.rooms.map((r) => (r.id === selected.id ? setRoomRect(r, next) : r)));
  };

  const cornersOf = (r: Rect) => {
    const a = mapper.local({ x: r.x, y: r.y });
    const b = mapper.local({ x: r.x + r.w, y: r.y + r.h });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  };

  const handles = (r: Rect): { edge: Edge; cx: number; cy: number }[] => {
    const midX = r.x + r.w / 2;
    const midY = r.y + r.h / 2;
    return [
      { edge: "w" as const, p: { x: r.x, y: midY } },
      { edge: "e" as const, p: { x: r.x + r.w, y: midY } },
      { edge: "n" as const, p: { x: midX, y: r.y } },
      { edge: "s" as const, p: { x: midX, y: r.y + r.h } },
    ].map(({ edge, p }) => {
      const q = mapper.local(p);
      return { edge, cx: q.x, cy: q.y };
    });
  };

  const handleSize = mapper.local({ x: HANDLE_FT, y: 0 }).x - mapper.local({ x: 0, y: 0 }).x;

  return (
    <section className="card editor" aria-labelledby="editor-h">
      <div className="row">
        <h2 id="editor-h">Edit plan {layout.id}</h2>
        <span className="hint">{changed ? "Unsaved changes" : "No changes yet"}</span>
      </div>
      <p className="hint">
        Drag a room to move it, or drag its edge to resize. Edits snap to half a foot. Doors, windows and furniture are
        re-placed after each change.
      </p>
      <div className="editor-grid">
        <div className="editor-canvas">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            width="100%"
            style={{ background: "#fff", borderRadius: 8, touchAction: "none", userSelect: "none" }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerDown={() => onSelect(null)}
          >
            <g dangerouslySetInnerHTML={{ __html: body }} />
            {layout.rooms.map((r) => {
              const c = cornersOf(r.rect);
              return (
                <rect
                  key={r.id}
                  x={c.x}
                  y={c.y}
                  width={c.w}
                  height={c.h}
                  fill="rgba(0,0,0,0)"
                  style={{ cursor: "move" }}
                  data-room={r.id}
                  onPointerDown={(e) => beginDrag(e, r.id, "move")}
                />
              );
            })}
            {selected && (
              <g>
                {(() => {
                  const c = cornersOf(selected.rect);
                  return (
                    <rect x={c.x} y={c.y} width={c.w} height={c.h} fill="none" stroke="#d08a00" strokeWidth={3} pointerEvents="none" />
                  );
                })()}
                {handles(selected.rect).map((h) => (
                  <rect
                    key={h.edge}
                    x={h.cx - handleSize / 2}
                    y={h.cy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#ffffff"
                    stroke="#d08a00"
                    strokeWidth={2}
                    style={{ cursor: h.edge === "e" || h.edge === "w" ? "ew-resize" : "ns-resize" }}
                    data-handle={h.edge}
                    onPointerDown={(e) => beginDrag(e, selected.id, "resize", h.edge)}
                  />
                ))}
              </g>
            )}
            {ghost && (
              <rect
                {...cornersOf(ghost)}
                fill="rgba(31,107,79,0.12)"
                stroke="#1f6b4f"
                strokeDasharray="4 3"
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
          </svg>
        </div>

        <aside className="editor-side">
          <div className="checks" aria-live="polite">
            <div>
              Score <b>{Math.round(check.total)}</b>
            </div>
            {check.violations.length === 0 ? (
              <div className="ok">No rule violations.</div>
            ) : (
              <ul className="err-list">
                {check.violations.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
            {check.vastuFlags.length > 0 && (
              <ul className="warn-list">
                {check.vastuFlags.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
          </div>

          {selected ? (
            <fieldset className="room-fields">
              <legend>{selected.label}</legend>
              {(["x", "y", "w", "h"] as const).map((k) => (
                <label key={k} className="field">
                  <span>{{ x: "Left (ft)", y: "Top (ft)", w: "Width (ft)", h: "Depth (ft)" }[k]}</span>
                  <input
                    type="number"
                    step={0.5}
                    min={k === "w" || k === "h" ? 2 : undefined}
                    value={snap(selected.rect[k])}
                    onChange={(e) => typeRect(k, e.target.value)}
                  />
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="hint">Select a room to edit its size and position.</p>
          )}

          <div className="row">
            <button type="button" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
            <button type="button" onClick={onReset} disabled={!changed}>
              Reset to generated
            </button>
          </div>
          <div className="row">
            <button type="button" className="primary" onClick={onSave} disabled={!changed}>
              Save changes
            </button>
            <button type="button" onClick={onDiscard}>
              Close editor
            </button>
          </div>
          {changed && check.violations.length > 0 && (
            <p className="hint">
              Saving keeps {check.violations.length} rule violation{check.violations.length === 1 ? "" : "s"} on this plan.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

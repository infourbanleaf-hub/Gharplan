import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlanClient, type PlanClient } from "../engine/client";
import { layoutSignature } from "../engine/assemble";
import { ACCEPTANCE_CASES } from "../engine/presets";
import type { CandidateRoom, Compass, Layout, NormalisedInput, PlanInput, RoomKind, Unit } from "../engine/types";
import { checkLayout, reassemble } from "../engine/edit";
import { normaliseInput } from "../engine/generate";
import { Editor, type EditCheck } from "./Editor";
import { downloadFile, layoutToDxf, layoutToSvg } from "../export";
import {
  DEFAULT_FORM,
  OPEN_SPACE_RANGE,
  SIZE_SCALE_RANGE,
  ROWS,
  buildEngineInput,
  fillFromPlot,
  formFromInput,
  rowsWithFlags,
  setbackHints,
  sizesFeasibility,
  spaceCheck,
  type PlotForm,
  type Rows,
} from "./planning";
import { Lightbox, NumField, PlanCard, RoomTable, SiteDiagram, SliderField } from "./components";
import { roomDefaults } from "../engine/config";

const BASE_SEED = 20260101;
const COMPASS: Compass[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

interface Message {
  tone: "warn" | "err";
  text: string;
}

/** An open editing session. `draft` is the plan being changed; `original` is the generated plan. */
interface Editing {
  original: Layout;
  draft: Layout;
  check: EditCheck;
  history: Layout[];
  input: NormalisedInput;
  selectedId: string | null;
}

export function App() {
  const [form, setForm] = useState<PlotForm>(DEFAULT_FORM);
  const [analysed, setAnalysed] = useState(false);
  const [rows, setRows] = useState<Rows>({});
  const [fillNote, setFillNote] = useState("");
  const [units, setUnits] = useState<Unit>("ftin");
  const [plans, setPlans] = useState<Layout[]>([]);
  const [status, setStatus] = useState<{ tone: "" | "err"; text: string }>({ tone: "", text: "" });
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState("");
  const [zoom, setZoom] = useState<Layout | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // The rule input each plan was generated from, so the editor can re-check it.
  const inputs = useRef(new WeakMap<Layout, NormalisedInput>());

  // The worker is created on first use and terminated on unmount.
  const clientRef = useRef<PlanClient | null>(null);
  const searchCount = useRef(0);
  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = createPlanClient();
    return clientRef.current;
  }, []);
  useEffect(() => {
    return () => {
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, []);

  const space = useMemo(() => spaceCheck(form), [form]);
  const hints = useMemo(() => setbackHints(form), [form]);
  const feas = analysed ? sizesFeasibility(form, rows) : null;

  const applyFill = (next: PlotForm) => {
    const { rows: filled, note } = fillFromPlot(next);
    setRows(filled);
    setFillNote(note);
  };

  /** Geometry changes re-fill the room sizes once the plot has been analysed, as in the original page. */
  const changeGeometry = (patch: Partial<PlotForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (analysed) applyFill(next);
  };

  const changeForm = (patch: Partial<PlotForm>) => setForm((f) => ({ ...f, ...patch }));

  const analyse = (f: PlotForm = form): Rows => {
    const { rows: filled, note } = fillFromPlot(f);
    setRows(filled);
    setFillNote(`Analysed. ${note}`);
    setAnalysed(true);
    return filled;
  };

  const runSearch = async (f: PlotForm, r: Rows, more: boolean) => {
    setEditing(null);
    const current = more ? plans : [];
    const keys = new Set(current.map(layoutSignature));
    const count = more ? searchCount.current + 1 : 1;
    searchCount.current = count;
    setBusy(true);
    setMessages([]);
    setStatus({ tone: "", text: "Searching. This can take up to a minute." });
    try {
      const res = await getClient().generate(buildEngineInput(f, r), {
        count: 3,
        restarts: 1200,
        seed: BASE_SEED + count * 7919,
      });
      const added: Layout[] = [];
      for (const l of res.layouts) {
        const key = layoutSignature(l);
        if (keys.has(key)) continue;
        keys.add(key);
        added.push(l);
      }
      // Number each floor separately: ground floor L1, L2, ...; first floor U1, U2, ...
      let ground = 0;
      let first = 0;
      const next = [...current, ...added].map((l) => ({ ...l, id: l.upper ? `U${++first}` : `L${++ground}` }));
      const normal = normaliseInput(buildEngineInput(f, r));
      for (const l of next) inputs.current.set(l, normal);
      setPlans(next);
      setMessages([
        ...res.errors.map((text) => ({ tone: "err" as const, text })),
        ...res.warnings.map((text) => ({ tone: "warn" as const, text })),
      ]);
      if (!next.length && res.errors.length) {
        setStatus({ tone: "err", text: "No plans to show." });
      } else if (more) {
        setStatus({
          tone: "",
          text: `${added.length ? `${added.length} new plan${added.length === 1 ? "" : "s"} added. ` : "No new plans in this search. "}${next.length} in total.`,
        });
      } else {
        setStatus({ tone: "", text: `${next.length} plan${next.length === 1 ? "" : "s"} so far.` });
      }
    } catch (e) {
      setStatus({ tone: "err", text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = (more: boolean) => {
    if (more) {
      void runSearch(form, rows, true);
      return;
    }
    const r = analysed ? rows : analyse();
    void runSearch(form, r, false);
  };

  const loadSample = (input: PlanInput, name: string) => {
    const f = formFromInput(input);
    setForm(f);
    const { rows: filled, note } = fillFromPlot(f);
    const withFlags = rowsWithFlags(filled, input.rooms);
    setRows(withFlags);
    setFillNote(`Sample: ${name}. ${note}`);
    setAnalysed(true);
    void runSearch(f, withFlags, false);
  };

  const toggleRoom = (key: RoomKind) => {
    const row = ROWS.find((r) => r.key === key);
    if (!row || row.mandatory) return;
    setRows((prev) => {
      const s = prev[key];
      if (s.include) return { ...prev, [key]: { include: false, defW: null, defH: null } };
      const cfg = roomDefaults.rooms[key];
      return { ...prev, [key]: { include: true, defW: s.defW ?? cfg.defW, defH: s.defH ?? cfg.defH } };
    });
  };

  const sizeRoom = (key: RoomKind, field: "defW" | "defH", value: number | null) => {
    setRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const startEdit = (l: Layout) => {
    const input = inputs.current.get(l) ?? normaliseInput(buildEngineInput(form, rows));
    setEditing({ original: l, draft: l, check: checkLayout(l, input), history: [], input, selectedId: null });
  };

  const editRooms = (rooms: CandidateRoom[]) => {
    if (!editing) return;
    const res = reassemble(editing.draft, rooms, editing.input);
    setEditing({
      ...editing,
      history: [...editing.history, editing.draft],
      draft: res.layout,
      check: { violations: res.violations, vastuFlags: res.vastuFlags, total: res.total },
    });
  };

  const undoEdit = () => {
    if (!editing || editing.history.length === 0) return;
    const prev = editing.history[editing.history.length - 1];
    setEditing({
      ...editing,
      history: editing.history.slice(0, -1),
      draft: prev,
      check: checkLayout(prev, editing.input),
    });
  };

  const resetEdit = () => {
    if (!editing) return;
    setEditing({ ...editing, draft: editing.original, history: [], check: checkLayout(editing.original, editing.input) });
  };

  const saveEdit = () => {
    if (!editing) return;
    inputs.current.set(editing.draft, editing.input);
    setPlans((prev) => prev.map((p) => (p.id === editing.draft.id ? editing.draft : p)));
    setEditing(null);
    const issues = checkLayout(editing.draft, editing.input).violations.length;
    setStatus({
      tone: issues ? "err" : "",
      text: issues
        ? `Plan ${editing.draft.id} saved with ${issues} rule violation${issues === 1 ? "" : "s"}.`
        : `Plan ${editing.draft.id} saved with your changes.`,
    });
  };

  const exportSvg = (l: Layout) => downloadFile(`plan-${l.id}.svg`, layoutToSvg(l, units), "image/svg+xml");
  const exportDxf = (l: Layout) => downloadFile(`plan-${l.id}.dxf`, layoutToDxf(l, units), "application/dxf");
  const exportPdf = async () => {
    // Loaded on demand: the PDF library is large and most visits never export a PDF.
    const { layoutsToPdf } = await import("../export/pdf");
    const bytes = await layoutsToPdf(plans, units);
    downloadFile("gharplan-plans.pdf", bytes, "application/pdf");
  };

  const copyFeedback = async () => {
    try {
      await navigator.clipboard.writeText(feedback);
      setCopied("Copied.");
    } catch {
      setCopied("Select the text and copy it.");
    }
  };

  return (
    <main>
      <header>
        <h1>GharPlan Planner</h1>
        <p>Rule-based house layouts for Indian plots. Pick a sample or enter your own plot, then generate.</p>
      </header>

      <section className="card" aria-labelledby="inputs-h">
        <h2 id="inputs-h">Plot and programme</h2>
        <div className="chips" role="group" aria-label="Sample plots">
          {ACCEPTANCE_CASES.map((c) => (
            <button key={c.name} type="button" onClick={() => loadSample(c.input, c.name)} disabled={busy}>
              {c.name.replace(/^\d+\.\s*/, "")}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <NumField label="Frontage (ft)" value={form.width} min={10} max={200} onChange={(v) => v !== null && changeGeometry({ width: v })} />
          <NumField label="Depth (ft)" value={form.depth} min={10} max={200} onChange={(v) => v !== null && changeGeometry({ depth: v })} />
          <label className="field">
            <span>Facing</span>
            <select value={form.facing} onChange={(e) => changeGeometry({ facing: e.target.value as Compass })}>
              {COMPASS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Road</span>
            <select value={form.roadSide} onChange={(e) => changeGeometry({ roadSide: e.target.value as PlotForm["roadSide"] })}>
              <option value="front">Front only</option>
              <option value="corner">Corner plot</option>
            </select>
          </label>
          {form.roadSide === "corner" && (
            <label className="field">
              <span>Corner side</span>
              <select value={form.cornerSide} onChange={(e) => changeGeometry({ cornerSide: e.target.value as PlotForm["cornerSide"] })}>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>Floors</span>
            <select value={form.floors} onChange={(e) => changeGeometry({ floors: Number(e.target.value) as 1 | 2 })}>
              <option value={1}>1 (ground)</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label className="field">
            <span>Staircase</span>
            <select value={form.staircase} onChange={(e) => changeGeometry({ staircase: e.target.value as PlotForm["staircase"] })}>
              <option value="internal">Internal</option>
              <option value="external">External</option>
            </select>
          </label>
          <label className="field">
            <span>Setbacks</span>
            <select value={form.setbackMode} onChange={(e) => changeGeometry({ setbackMode: e.target.value as PlotForm["setbackMode"] })}>
              <option value="zero">Zero (default)</option>
              <option value="table">Bye-law table</option>
            </select>
          </label>
          {(["front", "rear", "left", "right"] as const).map((side) => (
            <SliderField
              key={side}
              label={`Setback ${side}`}
              value={form.setbacks[side] ?? hints[side]}
              min={0}
              max={30}
              step={0.5}
              format={(v) => `${v} ft`}
              onChange={(v) => changeGeometry({ setbacks: { ...form.setbacks, [side]: v } })}
            />
          ))}
          <SliderField
            label="Open space"
            value={form.openSpacePct}
            min={OPEN_SPACE_RANGE.min}
            max={OPEN_SPACE_RANGE.max}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => changeGeometry({ openSpacePct: v })}
          />
          <SliderField
            label="Room sizes"
            value={form.sizeScale}
            min={SIZE_SCALE_RANGE.min}
            max={SIZE_SCALE_RANGE.max}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => changeGeometry({ sizeScale: v })}
          />
          <label className="field">
            <span>Bedrooms</span>
            <select value={form.bhk} onChange={(e) => changeGeometry({ bhk: Number(e.target.value) })}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} BHK
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Vastu</span>
            <select value={form.vastu} onChange={(e) => changeForm({ vastu: e.target.value as PlotForm["vastu"] })}>
              <option value="none">None</option>
              <option value="moderate">Moderate</option>
              <option value="strict">Strict</option>
            </select>
          </label>
          <label className="field">
            <span>Cars</span>
            <select value={form.cars} onChange={(e) => changeForm({ cars: Number(e.target.value) })}>
              <option value={0}>0</option>
              <option value={1}>1</option>
            </select>
          </label>
          <label className="field">
            <span>Two-wheelers</span>
            <select value={form.wheelers} onChange={(e) => changeForm({ wheelers: Number(e.target.value) })}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </div>
        <SiteDiagram form={form} />
        <div className="row">
          <button type="button" className="primary" onClick={() => analyse()}>
            Analyse plot and programme
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="space-h">
        <h2 id="space-h">Space check</h2>
        <div className="stats-block">
          <div>
            Plot area: <b>{Math.round(space.plotArea)} sq ft</b>
          </div>
          <div>
            Buildable area after setbacks: <b>{Math.round(space.buildable)} sq ft</b> ({space.buildablePct}% of plot)
          </div>
          <div>
            Programme at default sizes: <b>{Math.round(space.programmeNeed)} sq ft</b>
          </div>
          <div className={space.tone}>{space.verdict}</div>
        </div>
      </section>

      {analysed && (
        <section className="card" aria-labelledby="sizes-h">
          <h2 id="sizes-h">Room sizes (ft)</h2>
          <p className="hint">
            Filled from the plot size and programme. Each room is at least its engine minimum (toilets 1 ft under their
            size) and at most +15% per side, and rooms may be rotated. Must-have rooms stay in the plan.
          </p>
          <div className="row">
            <button type="button" onClick={() => applyFill(form)}>
              Fill from plot size
            </button>
            <span className="hint">{fillNote}</span>
          </div>
          <RoomTable rows={rows} onToggle={toggleRoom} onSize={sizeRoom} />
          {feas && (
            <div className="feas" aria-live="polite">
              <div className={feas.tone}>{feas.verdict}</div>
              {feas.openArea !== null && feas.openAreaPct && (
                <div className="open-area">
                  Possible open area: <b>about {feas.openArea} sq ft</b> ({feas.openAreaPct.ofBuildable}% of buildable,{" "}
                  {feas.openAreaPct.ofPlot}% of plot).
                </div>
              )}
            </div>
          )}
          <p className="hint">Plot inputs above are in feet. Units below change plan labels and exports.</p>
        </section>
      )}

      {analysed && (
        <section className="card" aria-labelledby="gen-h">
          <h2 id="gen-h">Generate plans</h2>
          <p className="hint">Uses the plot, programme, setbacks and room sizes above.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => onGenerate(false)} disabled={busy}>
              Generate plans
            </button>
            <button type="button" onClick={() => onGenerate(true)} disabled={busy || plans.length === 0}>
              More plans
            </button>
            <fieldset className="units">
              <legend className="sr-only">Units</legend>
              <label>
                <input type="radio" name="units" checked={units === "ftin"} onChange={() => setUnits("ftin")} /> Feet and inches
              </label>
              <label>
                <input type="radio" name="units" checked={units === "m"} onChange={() => setUnits("m")} /> Metres
              </label>
            </fieldset>
          </div>
          <p className="hint">
            More plans keeps the plans already shown and adds new ones. After changing the plot or rooms, press Generate
            plans to start a new list.
          </p>
        </section>
      )}

      {(status.text || messages.length > 0) && (
        <section className="card" aria-live="polite">
          <div className={status.tone}>{status.text}</div>
          {messages.map((m, i) => (
            <div key={i} className={m.tone}>
              {m.text}
            </div>
          ))}
          {plans.length > 0 && (
            <div className="row">
              <button type="button" onClick={() => void exportPdf()}>
                Download all plans as PDF
              </button>
            </div>
          )}
        </section>
      )}

      {editing && (
        <Editor
          layout={editing.draft}
          unit={units}
          check={editing.check}
          selectedId={editing.selectedId}
          canUndo={editing.history.length > 0}
          changed={editing.draft !== editing.original}
          onSelect={(id) => setEditing((e) => (e ? { ...e, selectedId: id } : e))}
          onRooms={editRooms}
          onUndo={undoEdit}
          onReset={resetEdit}
          onSave={saveEdit}
          onDiscard={() => setEditing(null)}
        />
      )}

      <section className="plans" aria-label="Generated plans">
        {plans.map((l) => (
          <PlanCard
            key={layoutSignature(l) + l.id}
            layout={l}
            unit={units}
            issueCount={checkLayout(l, inputs.current.get(l) ?? normaliseInput(buildEngineInput(form, rows))).violations.length}
            onEnlarge={setZoom}
            onEdit={startEdit}
            onExportSvg={exportSvg}
            onExportDxf={exportDxf}
          />
        ))}
      </section>

      <section className="card" aria-labelledby="fb-h">
        <h2 id="fb-h">Feedback</h2>
        <p className="hint">Note what to change (room sizes, placement, a rule). Copy it and send it back.</p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="For example: kitchen should face the road; toilets too big."
        />
        <div className="row">
          <button type="button" onClick={() => void copyFeedback()}>
            Copy feedback
          </button>
          <span className="hint" aria-live="polite">
            {copied}
          </span>
        </div>
      </section>

      {zoom && <Lightbox title={`Plan ${zoom.id}`} svg={layoutToSvg(zoom, units)} onClose={() => setZoom(null)} />}
    </main>
  );
}

# GharPlan engine

Rule-based house layout generator for Indian plots. Phase 1 is the TypeScript port of the
engine from the GharPlan Planner artifact.

## Layout

- `src/engine/`: pure plan logic (frame, programme, packing, evaluation, furniture, generation).
- `src/render/`: plan drawing to a scene and SVG. No DOM dependencies.
- `src/engine/generate.worker.ts`, `src/engine/client.ts`: runs generation off the main thread.
- `src/config/`: room sizes and setback bands, as in the original.
- `tests/`: unit tests, and golden parity tests against the original engine.
- `reference/`: the original page, a Node copy of its engine, and the golden output.

## Commands

    npm install
    npm run typecheck
    npm test

## Parity

`tests/golden.test.ts` checks the four acceptance plots at two seeds against output from the
original engine: plan signatures, scores, areas, furniture and warnings. All 8 pass.

To regenerate the golden file after an intended change to the rules:

    node reference/make-golden.cjs

Only do this when the change to the rules is deliberate. Otherwise the parity test is the
thing that catches accidental drift.

## Known behaviour carried over from the original

- Acceptance case 4 (40x60 corner, 4 BHK, study, guest, strict Vastu) returns no layouts at
  400 restarts. The port keeps this behaviour.
- Two-floor plans are ground floor only, with warnings.

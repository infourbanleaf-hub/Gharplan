# GharPlan engine (step 1)

Rule-based house layout engine for the GharPlan trial. This step covers the data model,
the generation engine and its acceptance tests. The renderer, input wizard, furniture and
export come in later steps.

## Layout

```
config/          setback bands and room defaults (JSON, editable)
engine/
  types.ts       data model (PlotInput, Layout, Opening, Scorecard ...)
  frame.ts       setbacks, buildable box, facing -> compass mapping
  program.ts     user choices -> list of rooms
  generate.ts    search over room order and sizes; top-3 diverse selection
  evaluate.ts    hard rules, connectivity, soft scores
  vastu.ts       Vastu preferences per room
  parking.ts     car / two-wheeler placement in the front setback
  units.ts       feet-inches and metres formatting and parsing
tests/           acceptance cases from brief section 11, unit tests
scripts/         dev helpers (layout dump, Pillow preview)
previews/        generated plan images
```

## Conventions

- Geometry is in feet. `x` runs to the viewer's right when standing at the road,
  `y = 0` is the road edge. `Frame` maps this to compass directions for Vastu.
- Room rectangles are wall centrelines. Carpet area is measured to the clear face of each
  wall (9" external, 4.5" internal). Built-up area is the setback box.
- Setbacks are rounded up to the next quarter foot so they never fall below the table value.
- Room sizes are scaled from the defaults to fill the envelope, between each room's minimum
  and default + 2 ft.

## Hard rules (a layout is valid only if all hold)

- No room outside the building envelope; no overlapping rooms.
- Rooms meet minimum sizes and are no narrower than 1:2 (passages excepted).
- Habitable rooms and toilets have an outer wall long enough for a window or ventilator.
- Living room opens onto a road side, with clear room for the main door beside the parking.
- Every room is reachable from the living room by a door.
- Common toilet is reachable without passing through a bedroom; attached toilets open
  from their own bedroom only.

## Soft scores (ranked, shown on the scorecard)

Room size, cross-ventilation, circulation (passages under 12% of built-up), kitchen next to
dining, open plan, Vastu. Weights change with the priority and Vastu settings.

Vastu is never a hard rule. Under strict Vastu, any room scoring below 0.6 against its
preferred zone is listed as a warning on that layout, and strict mode weighs Vastu more
heavily when ranking.

## Status against the brief's acceptance cases

| Case | Result |
|---|---|
| 1. 30x40 east, 2BHK, Vastu moderate, 1 car | 3 valid layouts |
| 2. 30x50 north, 3BHK, puja, elderly ground-floor bedroom | 3 valid layouts |
| 3. 20x45 west, 2BHK, no Vastu, 2 two-wheelers | 3 valid layouts |
| 4. 40x60 corner south, 4BHK + study + guest, strict Vastu | 3 valid layouts, each with Vastu misses flagged (trial decision) |

Case 4 is the weakest. Under strict Vastu the layouts score 25–40 on Vastu and list
2–3 misses each (master SW, kitchen SE, toilets NW/W). The search does not yet reach
layouts that meet every Vastu zone. A zone-first placement would fix this and is the next
improvement if testers need strict compliance.

## Assumptions to confirm

- Setback table values are used as given; a corner plot's road-side setback is at least
  1.5 m. Verify with the local authority.
- Attached toilets default on for the master bedroom only.
- Minimum sizes not stated in the brief (common toilet, study, store, utility, staircase)
  are marked `minSource: assumed` in `config/room-defaults.json`.
- Balcony and external staircase are not placed yet and are reported as warnings.
- First floor is not generated; the staircase is reserved on the ground floor.
- Parking is placed at one end of the front setback, car long side along the frontage.

## Run

```
npm install
npm test                                  # units, setbacks, acceptance cases
npx tsx scripts/dump-layouts.ts 0 out.json  # dump the generated layouts for case 1
python3 scripts/draw_plan.py out.json out.png
```

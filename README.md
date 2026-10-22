# GharPlan

Rule-based house layout generator for the GharPlan trial. The app is an Expo (React Native)
project at the repo root. Engine, renderer and UI share one codebase.

- Step 1: layout engine (`engine/`) and acceptance tests
- Step 2: plan renderer (`render/`)
- Step 3: input wizard, results and plan viewer (`App.tsx`, `ui/`)
- Step 4: furniture auto-placement (`engine/furniture.ts`). Editing and export come later.

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

## Furniture

`engine/furniture.ts` places the brief's furniture library in each selected layout, after the
rooms and openings are fixed. Rules:

- Nothing sits in a door swing or a window's 2 ft clearance; a door keeps its full width clear
  on both sides.
- Beds and wardrobes keep 2'-6" clear on the sides that are not against the wall.
- Beds are against a wall, headboard on the wall, preferring S or W when Vastu applies.
- The TV unit goes on the wall opposite the sofa.
- Tables may sit free in the room; beds and wardrobes stay against walls.
- Items that cannot be placed are reported as "no room for ..." and counted. Layouts with fewer
  missing items rank higher among close candidates.

Sizes marked `assumed` in the library (WC, basin, shower, mandir, side table, centre table,
bookshelf, washing machine) are not in the brief. They are drawn dashed on the plan.

Fit on the acceptance cases: about three-quarters of the required items are placed, up from
about two-thirds before the door-shift step. Doors between rooms slide along their shared wall
to free up furniture space, and the best shift is kept for each layout shown. The most common
miss is a wardrobe in a small bedroom, where a door or window and the 2'-6" clearance take the
wall. Furniture fit is part of the final ranking, not yet of the search itself.

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
- Furniture sizes not in the brief are marked assumed in `engine/furniture.ts`.
- Balcony and external staircase are not placed yet and are reported as warnings.
- First floor is not generated; the staircase is reserved on the ground floor.
- Parking is placed at one end of the front setback, car long side along the frontage.

## Run

```
npm install
npm test                                    # engine, renderer and acceptance cases
npm run web                                 # app in the browser (phone-width layout)
npm run android                             # app on an Android device or emulator (Expo Go)
npm run export:web                          # static web build in dist/
npx tsx scripts/render-svg.ts 0 previews    # SVG plans for acceptance case 1
```

The app has no login. Saved plans live in AsyncStorage on the device. The layout search takes
several seconds, so the app shows a loading screen while it runs.

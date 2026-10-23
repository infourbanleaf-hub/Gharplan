# GharPlan

Rule-based house layout generator for the GharPlan trial. The app is an Expo (React Native)
project at the repo root. Engine, renderer and UI share one codebase.

- Step 1: layout engine (`engine/`) and acceptance tests
- Step 2: plan renderer (`render/`)
- Step 3: input wizard, results and plan viewer (`App.tsx`, `ui/`)
- Step 4: furniture auto-placement (`engine/furniture.ts`)
- Step 5: basic room editing and re-validation (`engine/edit.ts`, `ui/Viewer.tsx`)
- Step 6: export (`render/planHtml.ts` for the PDF page, `engine/export/` for DXF and the area statement, `ui/export.ts` for the actions)

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

## Room editing

In the viewer, pick a room and change its width and height. A room keeps its top-left corner
and is clamped to its minimum size and its default plus 2 ft. Nothing else moves. The layout is
re-checked with the same rules as generation, plus the effects of the change: overlaps, doors
that no longer sit on a shared wall, windows that lost their outer wall, and furniture that no
longer fits. Each problem is listed in red and the room is outlined on the plan.

Edits are not optimised: the app points out what to fix, and the user moves the rest.

## Export

- **PDF:** one A4 landscape page with a title block, the plan with furniture and dimensions,
  the room-wise carpet area statement with totals, built-up area, coverage, efficiency, and the
  disclaimer. On Android it is printed with expo-print and shared; on the web the browser print
  dialog opens, and "Save as PDF" gives the file.
- **DXF:** AutoCAD R12, millimetres, north-up, on named layers (PLOT, SETBACK, ROOMS, WALLS,
  DOORS, WINDOWS, FURNITURE, PARKING, TEXT, DIMENSIONS, NORTH). Walls are cut at doors and windows.
  Checked with ezdxf: no audit errors.
- **Image:** the plan as PNG on Android (captured from the screen). On the web the vector plan is
  downloaded as SVG instead.
- **DWG:** not produced. DWG is proprietary; DXF opens in AutoCAD and most CAD tools. A DWG step
  needs a converter such as the ODA File Converter, run on the server or the desktop.

Exports use the layout as edited in the viewer.

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

## Relationships between spaces

Layouts are ranked on how well spaces relate, based on the reference plans: bedrooms reached from
the hall or living room, dining next to living, wet rooms clustered, bedrooms away from the road,
and a hall of 4-12% of built-up area. Measured on the acceptance cases (`scripts/relations.ts`),
bedrooms reached from the hall or living room rise from 0.30 to 0.54 on average, and dining next
to living from 0.50 to 0.58.

Open: the search still rarely produces a hall. A hall needs the bedrooms to stack along a 30 ft
frontage, and that doesn't fit the minimum bedroom sizes on the 30 ft plots. A hall plan needs
wider plots (34-40 ft in the references) or a different generator, such as templates for each
plot width. That is the next design step.

## Corridors

A passage or hall may not be a corridor: it can be at most 20 ft long and no more than six times
its width. Layouts that break this are rejected, so a long strip like the 3.5 ft x 38 ft hall
in the first template review can't be chosen. The 20 ft limit follows the Groot Parys passages
(4-7 m long); see RULES.md.

The fixed plan templates from the reference plans were removed, because their halls were all
corridors under this rule. Halls are now optional and short. Bedrooms usually open off the living
room, which the hall score counts as access.

Next design step: make the living room the hub, as in the 27x54 reference (a central living
space with bedrooms opening off it on both sides). That needs a template that fits the living room
at 10 ft or more, and the living room is the hard part on 27-30 ft plots. This needs agreement
before building.

## Room sizes

Defaults are the reference sizes in `config/room-defaults.json`. Minimums are the floors the
search may shrink to; they were kept at the earlier values because the reference-size minimums
(for example living 14x15 ft) leave no feasible layout on a 30x40 plot. See RULES.md.

Each room grows at most 2 ft beyond its default in each dimension. Toilets, utility, store and
puja are service rooms, and they are held tighter:
- In the search, a service room over its limit adds a strong cost, and habitable rooms add a smaller one.
- In the final choice, plans with every service room within its limit are preferred. A plan with an
  oversized service room is used only if there aren't enough compliant ones.

Result on the acceptance cases with 600 restarts: toilets have a median of 45 sq ft. Case 4 (40x60,
4BHK) still has one plan with a 146 sq ft toilet, because too few compliant plans were found. With
2000 restarts that case gives three plans with toilets within about 2 ft of their limits, but the
search takes about three times as long.

## Soft scores (ranked, shown on the scorecard)

Room size, cross-ventilation, circulation (passages under 12% of built-up), kitchen next to
dining, open plan, Vastu. Weights change with the priority and Vastu settings.

Vastu is never a hard rule.

Optional zone-first search (strict Vastu only, off by default): the search starts from room
orders that place each room toward its Vastu zone. Measured over three seeds on acceptance case 4:
mean Vastu score 56.7 against 53.6 without it, and 1.56 flags per layout against 1.78. The gain is
small, so it stays opt-in. Under strict Vastu, any room scoring below 0.6 against its
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

## Languages

English and Hindi. `ui/strings.ts` is the English table and `ui/strings.hi.ts` the Hindi one, with
the same shape: TypeScript fails the build if a key is missing from Hindi, and a test checks that
no Hindi value is empty. The choice is saved on the device; the switch is on the welcome screen.

Covered by the translation: the wizard, results, viewer, export labels and the PDF page, plus the
room names and car, two-wheeler and north labels on the plan.

Not yet translated:
- Warnings and rule notes produced by the engine (for example, "Living room does not face the
  road"). They stay in English.
- DXF text, which is for CAD and stays in English.

The PDF loads Noto Sans Devanagari from Google Fonts when it is printed, so a Hindi PDF needs
network access at print time.

## Android

Checked here: `npx expo export --platform android` builds the Hermes bundle with no errors, and
`react-native` is aligned to the version this Expo SDK expects. Not checked here: running on a
device. The sandbox has no Android SDK, no emulator, and no network path to Google's download
host, so the first device run is still to do.

To try it on a phone:

1. Install Expo Go from the Play Store, then run `npm run android` (or `npx expo start`) on the
   same network. Scan the QR code. Expo Go can run most of the app; the PDF print and the image
   share are the features to check.
2. For a standalone APK: `npx eas build -p android --profile preview` (needs an Expo account).
   The profile is in `eas.json`.

Things to check on the device:
- Pinch to zoom and one-finger pan on the plan (PanResponder with two touches).
- Feet-inches entry with the keyboard (`30'-6"`).
- The PDF export opens the system print or share sheet, and the DXF and PNG share through it.
- The room list in the viewer and the red issue list after a resize.

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

# GharPlan rules: evidence from the reference plans

This file records what three reference plans show, the rule each one produced, and whether the
rule is implemented in the engine. Sizes are in feet unless marked m or m2.

## Reference plans

| Ref | Plan | Key observations |
|---|---|---|
| A | Galway County Council, single residential unit (GCC-HC-AD-004, June 2026). About 46.8 x 26.9 ft (14.26 x 8.19 m). Four bedrooms, one accessible. | Entrance opens into the living/kitchen/dining block. Bedrooms 2 to 4 open off a short passage at the back. Bedroom 1 (wheelchair) has an en-suite. Living/kitchen/dining 36.8 m2 combined. Bedrooms 3 and 4 at 7.1 m2 (DHPLG minimum). Storage cupboards in the passage and beside the kitchen. 1800 mm turning circles in the accessible bedroom, living and kitchen. |
| B | Kanpur group housing, typical flat (TAG Infotech). 1.83 m (6 ft) shared passage and lift lobby. | Drawing/dining 22'1" x 9' (three-bay, through room). Kitchen 7' x 9' with dry balcony. Master 12'6" x 11'. Bedrooms 12' x 10'. Toilets 8' x 5' (common) and 5' x 8' (en-suite). Lobby with lift and stair near the entrance. Balconies on each habitable room. |
| C1 | Groot Parys House 42 (267 m2 plot, 99 m2 internal). | Covered entrance beside the kitchen. Living/dining 39.5 m2 open plan. Bedroom 1 12.4 m2 with en-suite 6.2 m2 off it. Bedroom 2 11.0 m2 with a separate bathroom 4.65 m2 off a 4 m2 passage. Kitchen 8.8 m2 with a service yard 10 m2 behind it. Garage 18.9 m2 at the road side. |
| C2 | Groot Parys House 45 (300 m2 plot, 102 m2 internal). | Living/dining 39 m2, central with the kitchen on its back wall. Bedroom 1 14.2 m2 with en-suite 6.4 m2 off it. Bedroom 2 13.5 m2 off living with bathroom 5 m2 next to it. Kitchen 10.3 m2 with service yard 8.8 m2 beside it. Covered entrance 5.7 m2 at the road side. Garage 18.9 m2 with a second parking bay outside. Covered patio/braai at the back. |

## Rules derived from the references

| # | Rule | Evidence | Status |
|---|---|---|---|
| R1 | Living and dining together are 36-40 m2 (about 14 x 16 ft default). | A: 36.8 m2. C1: 39.5. C2: 39.0. | Implemented as default (14 x 16 living, 11 x 12 dining). Minimum kept at 10 x 12 / 8 x 10 so 30 x 40 plots still have layouts. |
| R2 | Master bedroom about 12-15 m2 (about 13 x 14 ft default). | C1 12.4, C2 14.2, B 12.5 x 11. | Implemented as default 13 x 14. |
| R3 | Other bedrooms about 11-13 m2 (about 11.5 x 12.5 ft default). | C1 11.0, B 12 x 10 to 12.5 x 11. | Implemented as default 11.5 x 12.5. |
| R4 | Bedrooms open off the living room or a short passage, not off the kitchen or a long hall. | A, B, C1, C2 all do this. | Implemented: access score counts bedrooms reached via hall/living; corridor hard rule. |
| R5 | En-suite opens off its own bedroom and is about 6-8 m2 (about 7.5 x 9 ft default). | C1 6.2, C2 6.4, A 8.3. | Implemented as default 7.5 x 9; minimum 4.5 x 7 kept for feasibility. The oversize cost still pushes the search toward the default. |
| R6 | Common bathroom about 4.7-8 m2 (6.5 x 7.5 ft default). | C1 4.65, B 8 x 5 (4.6 m2), A 4.2 m2. | Implemented as default 6.5 x 7.5. |
| R7 | Dining sits between living and kitchen. | B, C1, C2. | Implemented: kitchen-dining score and dining-living score in `scoreCard`. |
| R8 | A passage is short (about 4-7 m, 13-23 ft) and at most about 3.5 ft wide, or 6 ft in a shared lobby. | C1 passage 4 m2, Groot Parys passage 1.0 m wide, B 1.83 m shared passage. | Implemented: passage width 3.5 ft; hard limit 20 ft long and 6:1 ratio (was 16 ft and 5:1). The longer limit is a judgement call; check it against the corridor screenshots. |
| R9 | Kitchen next to the entrance or the service side, with a service yard behind it. | C1 and C2 both place the service yard off the kitchen. | Open. Needs a utility/service-yard zone and a zoning term. |
| R10 | Covered entrance near the kitchen or living on the road side. | C1 2.9 m2, C2 5.7 m2. | Open. Entrance is on the road side (implemented), but no covered-porch area is modelled. |
| R11 | Garage at the road side, inside the building footprint. | C1 and C2 both have a 19 m2 garage at the front. | Open. Parking is only in the front setback today; a garage inside the footprint needs a 9 ft setback. |
| R12 | Braai/covered patio adjacent to the living/dining room at the back. | C2 covered patio 14.6 m2 beside living. | Open. Outdoor rooms are not modelled. |
| R13 | Accessible unit: 1800 mm turning circle in one bedroom, living and kitchen. | A. | Open (optional). Only needed if the brief asks for an accessible unit. |
| R14 | Lobby with lift or stair near the entrance (multi-storey). | B. | Out of scope for single-storey houses. |

## Changes made in this round

- `config/room-defaults.json`: defaults moved to the reference sizes (living 14 x 16, dining 11 x 12,
  master 13 x 14, bedrooms 11.5 x 12.5, en-suite 7.5 x 9, common toilet 6.5 x 7.5). Each room has a
  `source` note.
- Minimums were **not** moved to the reference sizes. With the reference minimums (living 14 x 15,
  bedroom 10.5 x 11.5, en-suite 6 x 8, etc.) the 30 x 40 and 20 x 45 acceptance cases were rejected
  as too small (about 721 sq ft of rooms in a 709 sq ft envelope), and the 30 x 50 and 40 x 60 cases
  returned no layouts. The minimums were returned to the previous floors. The search still aims at
  the defaults, and the oversize cost pulls rooms toward them.
- `engine/evaluate.ts`: passage limit changed from 16 ft / 5:1 to 20 ft / 6:1 (R8).
- Acceptance: all four cases return three layouts each. `npx vitest run`: 45 of 45 pass.

## Open items for the user

1. Passage limit: 20 ft / 6:1 or keep 16 ft / 5:1? The longer limit matches the Groot Parys passage
   but is more permissive than the corridor review that prompted it.
2. Setbacks: the brief table is tighter than the references, which use about 4 ft at the front and
   rear. Decide which to use.
3. Garage inside the footprint (R11) needs a setback rule decision.
4. Service yard and covered entrance (R9, R10) need a zone type each, if they should be scored.

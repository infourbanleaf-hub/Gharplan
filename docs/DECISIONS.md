# Decisions and standing permissions

## Standing permissions (from the project owner)
- After each finished change on `open-space-layout`: run `scripts/release-planner.sh` (when the planner changed) or `npx vitest run`, commit with the attribution lines used on this branch, and push to origin.
- Republishing the planner artifact is done when the planner source changes and the smoke test passes.
- Anything outside this stays a question: new branches, pull requests, merges into `main`, and deleting files.

## Open decisions (default in use until changed)
| Topic | Default in use | Options still open |
|---|---|---|
| Dining connection | Preference only (scored), not a hard rule | Hard rule for living; hard rule for both living and kitchen (loses plans) |
| Partial setback | Not built | Road side only or all sides; "half" = first half from the corner or middle half |
| Attached toilets | One, for the master bedroom | One per bedroom (needs a second table row and fewer plans on small plots) |
| First floor | Not built; stair stays a room on the ground floor | Stair block at the back wall (in progress, reverted) |
| Zero setbacks | Default in the planner | Bye-law table as an option |

## Tools
- `scripts/sweep-plots.ts`: plan counts and missing furniture across the test plots (CSV).
- `scripts/planner-smoke.cjs`: headless check of the built planner.
- `scripts/release-planner.sh`: type-check, tests, build and smoke test in one command.
- `planner/build.mjs`: builds `planner/dist/planner.html` from `planner/planner-template.html`.

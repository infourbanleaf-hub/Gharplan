#!/usr/bin/env bash
# One routine for a planner change: type-check, tests, build, smoke test.
# Commit and push are done after this passes. Republishing the artifact is a separate step.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit -p .
npx vitest run
node planner/build.mjs
node scripts/planner-smoke.cjs planner/dist/planner.html
sha256sum planner/dist/planner.html

# Route R1 Heightfield Task 9 / Task 10 Handoff

## 1. Handoff status

- Date: 2026-08-23
- Branch: `codex/m5-route-r1-heightfield`
- Worktree: `.worktrees/m5-route-r1-heightfield`
- Base with `origin/main`: `5e0d6bf537c22f71aee5dc31ed8d9829be9fe9b3`
- Last fully pushed implementation commit before this handoff: `0a3c0037a99a2dd399e6d63009dd74801b8bbff5`
- Scope: M5 Route Graph / Traversability **R1 Heightfield only**
- Overall status: Task 9 implementation is present and its focused gates have passed, but Task 10 final verification, final review record, documentation reconciliation, and integration are still open. M5 remains open because R1b is not implemented.

Do not mark R1 complete merely from the implementation commits listed below. A fresh current-HEAD full verification and final review are still required.

## 2. Pushed implementation slices

The branch already contains these Task 9 commits:

1. `4e8d947 feat: add bounded heightfield traversal exclusions`
2. `9bed7b5 feat: add locked low-budget traversal profile`
3. `0a3c003 test: add route r1 heightfield conformance gate`

Task 8 and its review closures are also present immediately before them:

- `63daf07 docs: document trusted route verification`
- `c778794 fix: close trusted route evidence boundaries`
- `1aa3edc docs: close trusted route verification task`

## 3. What Task 9 implements

- Eleven Authoring V4 fixtures under `examples/traversal/r1-heightfield/`:
  `success`, `fail-wall`, `fail-slope`, `fail-width`, `fail-overhead`,
  `fail-water`, `fail-gap`, `fail-budget`, `fail-start-support`,
  `fail-start-surface`, and `fail-outside-detour`.
- A real trusted pipeline gate: Authoring V4 -> Normalizer -> Compiler V5 ->
  Recast -> Babylon 9.21.2/Havok -> Validation.
- Provider-neutral `spatial.traversalAreas[]` flowing through Authoring V4,
  IR V4, ExecutionPlan V5, and Heightfield Build Input. It clips traversal
  graph/nav source only and does not alter Heightfield runtime collision.
- Shared simple XZ polygon validation in `@whitebox-world/terrain-surface`.
- Bounded traversal-area complexity limits and fail-closed admission before
  expensive graph building.
- A trusted-host-only locked low-budget Graph Builder Profile for deterministic
  `ROUTE_GRAPH_BUDGET_EXCEEDED` coverage. It does not expose numeric tuning or
  profile selection to Authoring JSON, CLI, or Browser protocols.
- Exact adversarial check execution: anchored full test names, exact match
  counts, JSON reporter evidence, and zero-match failure.
- Route Overlay included in provider-identity scanning.
- A real Havok regression proving a traversal exclusion removes graph support
  without removing the corresponding terrain collision/support at runtime.
- Deterministic 30/60/120-like render-cadence report, probe, final-state, and
  processed-tick evidence for the success fixture.

## 4. Independent review findings already closed

An independent review found four material gaps. All four were addressed in the
Task 9 implementation commits:

1. Traversal-area input had no complexity budget.
2. Adversarial checks could false-green when Vitest matched no intended test.
3. Canonical Route Overlay was not included in provider-identity scanning.
4. Graph-only evidence did not prove that traversal exclusions leave runtime
   Heightfield collision unchanged.

A follow-up narrow review found no remaining P0/P1 in those four boundaries.
This is supporting evidence, not a substitute for Task 10 final review.

## 5. Verification evidence already obtained

Before this handoff, the following commands passed on the Task 9 implementation:

- `pnpm typecheck`
- `pnpm verify:route-r1-heightfield`
- `pnpm verify:route-r0-contract`
- `pnpm verify:canonical`
- `pnpm verify:placement-layout`
- `pnpm verify:rigged-subject`
- `pnpm verify:g-bot-subject`
- `pnpm build` (with the repository's existing large-chunk warning only)
- Focused cross-package tests: 11 files / 134 tests
- Full test run before the final four review closures: 142 files / 1399 tests

After the four review closures, a full `pnpm test` reached 143 files / 1408
tests but two unrelated integration tests timed out under resource contention.
The cause was that `scripts/verify-route-r1-heightfield.test.ts` invoked the
complete R1 gate inside the general Vitest run, while that gate recursively
spawned seven exact Vitest checks and the full Babylon/Havok fixture matrix.
Both timed-out tests had passed independently.

The handoff change therefore removes the duplicate heavy fixture-matrix test
from the general Vitest suite. The fail-closed zero-match unit test remains.
The authoritative heavy gate remains `pnpm verify:route-r1-heightfield` and must
still run explicitly during Task 10. Do not replace this with larger unrelated
test timeouts unless a fresh clean run still proves they are necessary.

## 6. Cursor review status

The final Cursor CR started through the repository's `reviewing-with-cursor`
workflow but did not return a verdict before shutdown. It was interrupted and
must be recorded as `INTERRUPTED/TIMEOUT`, never as `GO`.

Run one fresh final Cursor review only after the current HEAD passes the full
Task 10 gate. Avoid fragmenting the remaining work into repeated small reviews.
Codex/host must independently reproduce and disposition any Cursor finding.

## 7. Exact next actions

Execute these steps in order:

1. Confirm the handoff commit is the only new branch change and the worktree is
   clean before starting new implementation.
2. Run the complete Task 10 gates on the current HEAD:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm verify:route-r0-contract
   pnpm verify:route-r1-heightfield
   pnpm verify:canonical
   pnpm verify:placement-layout
   pnpm verify:rigged-subject
   pnpm verify:g-bot-subject
   ```

3. If `pnpm test` still times out, first reproduce the named test independently
   and inspect process/resource contention. Do not weaken the R1 standalone gate
   or silently increase global timeouts.
4. Run a fresh final Cursor completion review against the new HEAD using
   `/Users/xiateng/.agents/skills/reviewing-with-cursor/SKILL.md`. Treat it as an
   independent reviewer, then reproduce and disposition every real finding.
5. Create
   `docs/reviews/2026-08-22-route-r1-heightfield-runtime-review.md` using
   `docs/reviews/full-dimension-review-protocol.md` and
   `docs/reviews/runtime-deep-review-checklist.md`. Record exact commit hashes,
   commands, pass counts, rendered/manual evidence actually obtained, review
   findings, and dispositions.
6. Only after all blocking gates and final review pass, reconcile the public
   progress/docs: README, `docs/00-*`, `docs/02-*`, `docs/05-*`, `docs/17-*`,
   `docs/18-refactor-progress-and-backlog.md`, the Route design spec, this R1
   implementation plan, and the SDD progress ledger. Mark Task 9/Task 10/R1
   complete only then.
7. Keep M5 open and R1b pending. After R1 is integrated and verified, write a
   separate R1b implementation plan for explicit static Traversal Surfaces,
   terrain/step/platform seams, multi-surface identity, and Collider/Surface
   evidence. Do not add R1b implementation to this branch.
8. Commit the Task 10 documentation as a separate semantic slice, push the
   branch, and only then prepare final integration/merge review.

## 8. Non-goals for the next AI

- Do not implement R1b, NPC navigation, dynamic avoidance, caves, vehicles, or
  a public runtime `goTo` API in this R1 branch.
- Do not expose Recast, Babylon, or Havok handles/provider names in canonical
  public Schema, CLI, Browser, Report, or Snapshot contracts.
- Do not reintroduce Motion parameter bags, ray/AABB grounding, or competing
  ground-support ownership.
- Do not treat prior or interrupted reviewer output as final acceptance.


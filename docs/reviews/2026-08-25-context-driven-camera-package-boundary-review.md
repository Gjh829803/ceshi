# Context-driven Camera package boundary review

## Review metadata

- Date: 2026-08-25.
- Mode: Mode A design-spec review, with runtime authority and Legacy cleanup coverage.
- Review object:
  [`2026-08-24-context-driven-gameplay-camera-composition-design.md`](../superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md),
  the P2.4/P3.2 task linkage in
  [`18-refactor-progress-and-backlog.md`](../18-refactor-progress-and-backlog.md), and the related
  README/AGENTS package guidance.
- Tree baseline: local `main@8257b81`; that pre-existing active-guide commit is outside this review
  diff. Current G19-6 implementation/review authority is `eef75c6` / `5ffd031`.
- Installed runtime evidence: Babylon.js `9.21.2`; the current Legacy camera package still imports
  Three.js `0.180.x`, and `subjects` still imports that package plus Rapier `0.19.x`.
- Capability claim: documentation and work-graph only. This review does not claim that Context
  selection, mount/flight cameras, first-person cameras, or Legacy retirement are implemented.

## Decision

**DESIGN GO for implementation planning.** The target is one clean-break,
provider-neutral `@whitebox-world/camera` domain package. It owns Camera Profile/Context,
Preference, Admission, deterministic Selection, Decision, Explain, and Diagnostic semantics.
`runtime-babylon` remains the sole owner of Babylon pose, collision, smoothing, blend, render
lifecycle, and disposal.

The current same-name package is not that target. It is a Legacy Three.js rig used only through
the old subjects/catalog path. GCC-0C must first relocate that rig to an explicit Legacy subjects
scope and then rebuild the package without engine dependencies. The whole Three/Rapier runtime
cannot be deleted until Babylon replaces, or the product explicitly retires, catalog scene loading,
Opening Composition, SDK-derived tri-view, and the associated scene gates.

## Source-backed findings and dispositions

### Closed P1 — stale G19 dependency direction

The previous text still treated G19-5/G19-6 as future upstream work. Current `main` already contains
G19-6 and Browser V5. The design now makes GCC-0A a current-source reconciliation and prohibits
reopening completed G19 tasks or publishing a second Browser camera dialect.

### Closed P1 — current package was mislabeled as engine-independent

`packages/camera/package.json` directly depends on Three.js, its public rig exposes Three types,
and `packages/subjects` reaches its source through `../../camera/src`. README and the package-local
warning now label this path Legacy and prohibit new Canonical Camera semantics there.

### Closed P1 — unsafe single-package deletion

The live reachability chain is `packages/camera → packages/subjects → sdk-world-adapter →` the
non-Authoring Playground/catalog route. `pnpm test:scenes`, the documented `?scene=` workflow,
Opening Composition, and SDK-derived tri-view still exercise that path. P3.2 now requires a
replacement-or-retirement gate and zero reverse reachability before grouped deletion.

### Closed P2 — package ownership and handoff were underspecified

The design now provides a one-way dependency graph and an explicit package responsibility table.
GCC-0 through GCC-8 each state stable IDs, dependencies, blockers, exclusive ownership, exact
integration points, stable inputs/outputs, verification evidence, and execution mode.

### Open findings

No confirmed open P0/P1/P2 findings in the reviewed documentation diff. Camera implementation and
Legacy removal remain tracked future work, not review defects.

## Dimension coverage

| Dimension | Evidence and disposition |
| --- | --- |
| D1 Product semantics | Named AI-facing Camera semantics remain semantic resources and preferences; Kit recipes do not become Runtime truth. Production versus experimental claims remain explicit. |
| D2 Contracts/schema | One canonical term per concept, closed discriminators, unit-bearing numeric names, explicit View-State ownership, and clean-break Browser V5 reconciliation are retained. |
| D3 Compiler/IR | Registry envelopes, resource locks, compiler projection, Runtime selection, and Babylon execution now have separate owners and stable integration points. |
| D4 Runtime authority | Committed Gameplay state projects Context; pure selection returns a Decision; only CameraDirector executes provider state. Reset/rebind/dispose and 30/60/120-like cadence evidence are required. |
| D5 Dependency/cleanup | Dependency arrows are explicitly defined as “left depends on right.” Canonical Camera cannot import Three/Babylon/Havok or consumer packages. Legacy deletion requires zero reverse reachability. |
| D6 Evidence/operations | GCC tasks separate contract, numeric runtime, rendered visual, and manual interaction evidence. Documentation-only verification does not imply production support. |

## Verification evidence

- `git diff --check`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:scenes`: passed, 2 files / 26 tests.
- `pnpm test`: 167 files / 2,133 tests passed; one unrelated Git-fixture test hit its existing
  20-second timeout while another worktree was concurrently running Vite, Vitest, Playwright, and
  verifier workloads. The same focused assertion completed successfully in 19.46 seconds with a
  diagnostic-only 60-second CLI timeout, then passed unchanged under its original 20-second timeout
  in 14.67 seconds after the competing load fell. No test or timeout code was changed.
- `pnpm build`: passed; the emitted Legacy `sdk-world-adapter` chunk also confirms that deleting the
  currently reachable Three/subjects path would break the production build.
- `pnpm verify:canonical`: passed, including real Browser V5, two-instance control, collision, and
  deterministic reset gates.
- `pnpm verify:placement-layout`: passed, including rendered screenshot and deterministic-run gates.
- `pnpm verify:rigged-subject`: passed, including real browser action captures, pose difference,
  multi-instance isolation, collision, and tamper gates.
- `pnpm verify:g-bot-subject`: passed, including real browser fixed-tick action captures, pose
  difference, multi-instance isolation, and collision gates.

## Independent review

The authenticated Cursor Agent CLI was invoked in read-only design mode with the full ownership,
current-main, and Legacy-deletion question. It produced no result after approximately five minutes
and was safely interrupted. After all local gates, a fresh shorter final-review session was attempted
with long tests explicitly disabled; it likewise produced no result within two minutes and was
interrupted. Both attempts are recorded as **no conclusion**, not as approval. The host review above
is source-backed and contains the final disposition.

# Camera GCC-3B Completion Review

- Date: 2026-08-26
- Review mode: B, change review
- Branch: `codex/camera-development`
- PR base after integration: `origin/main@62acfc8b54c232574a6024f0ef89ca2ca26f4b38`
- Runtime dependencies: Babylon.js `9.21.2`, Havok `1.3.14`
- Scope: Camera View Command/Receipt, unified WorldSession Event journal, automatic Camera Selection events,
  Browser Protocol V5 clean break and Playground consumer cutover

## Outcome

The reviewed Camera GCC-3B vertical slice is ready for final user acceptance. The RuntimeHost owns command
idempotency, capacity reservation, receipt publication, View revision and one monotonic WorldSession Event
sequence. The Babylon coordinator projects provider-neutral Camera Selection state and publishes changes
caused by commands, gameplay transitions and each fixed simulation Tick. Browser Protocol V5 exposes only
the asynchronous command and unified event-query surface.

No character-ignore collision policy was added. Spring Arm collision retains only its pre-existing owner
ignore through `ignoredEntityId: input.subjectEntityId`; other character filtering remains outside this
change by explicit product decision.

## Authority and contract review

- Camera Selection remains owned by the Camera runtime; RuntimeHost receives immutable projections and
  never derives selection from render pose.
- View commands use strict closed parsing, canonical command hashes, deterministic receipt/event IDs and
  retained idempotent replay. Conflicting payload reuse rejects without invoking the runtime executor.
- Event capacity is reserved before runtime execution and committed before publication. Rejected commands
  do not advance View revision or Event sequence.
- Gameplay and Camera events share the same retained journal and monotonically increasing sequence.
- Gameplay and Camera commands also share the same idempotency-record and retained-Receipt budgets; either
  command family closes admission before the other can exceed the configured Session capacity.
- Automatic Context, Modifier, target rebound, fallback and target-unbound changes are observed at the
  coordinator integration point. Multi-Tick input is evaluated one Tick at a time, matching the existing
  WorldSession held-input semantics while preventing intermediate Camera changes from being skipped.
- A bound runtime without Camera Selection fails closed. Only a legitimately unbound possession target may
  omit the optional Camera projection.
- Browser V5 removed the old synchronous set/reset methods and gameplay-only event query instead of keeping
  aliases. Consumer compensation now awaits command receipts.

## Adversarial coverage

- strict protocol fields, canonicalization, receipt diagnostics and ordered event lists;
- committed command, identical replay, command-ID conflict, runtime rejection and capacity exhaustion;
- shared Gameplay/Camera sequence and View revision advancement;
- gameplay-driven target rebound and target-unbound publication;
- real Babylon/Havok Camera command and automatic Context/Modifier transition;
- Browser exact-key surface, async command routing and consumer rollback;
- fixed-step determinism, held-versus-pressed input, reset/rebind, multi-instance isolation, collision and
  resource cleanup remain covered by the repository aggregate and G Bot acceptance gates.
- true Havok sphere Sweep covers a thin diagonal blocker, an L-shaped corner and a doorway narrower than
  Probe diameter; a zero-distance `shapeProximity` closes initial Probe overlap before ShapeCast.

## Ten-round self-PR review

1. Scope/clean-break: removed stale Follow Arm references from current architecture documentation and
   confirmed the canceled other-character ignore policy is absent.
2. State authority: confirmed CameraDirector remains Selection/orbit owner, Gameplay remains possession and
   relationship owner, and RuntimeHost consumes only provider-neutral projections.
3. Protocol/idempotency: rechecked exact parsers, canonical hashes, deterministic IDs, replay and conflict
   behavior; no second command dialect remains in Browser V5.
4. Capacity/atomicity: found and fixed Camera receipts not reducing Gameplay command-retention capacity;
   added Camera-first and Gameplay-first exhaustion regression coverage.
5. Fixed-step timing: verified multi-Tick coordinator execution advances one host Tick per observation while
   preserving held-versus-pressed semantics and deterministic cadence coverage.
6. Spring Arm collision: reconciled main's nine-ray adversarial work into true Havok ShapeCast and fixed the
   RED initial-overlap case with `shapeProximity(maxDistance=0)`.
7. Browser/consumer: renamed remaining Gameplay-only event diagnostic codes to WorldSession terminology and
   reran exact-key, hostile-query and asynchronous compensation tests.
8. Lifecycle/isolation: verified component rollback, throwing cleanup, cached Probe shape disposal and
   multi-runtime isolation; no additional owner was introduced.
9. Runtime evidence: reran the affected 16-file/230-test matrix, production build, G Bot and Canonical Browser
   gates on the integrated tree.
10. Documentation/release: reconciled the living open-source ledger and implementation plan with the final
    ShapeCast architecture, checked the PR diff and reran final repository gates.

## Verification evidence

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 196 contract files / 2,093 tests; 2 skipped.
- Resource-heavy lane: passed, 22 files / 422 tests; 4 skipped and one integration file intentionally
  skipped by its configured gate.
- Affected self-review matrix: passed, 16 files / 230 tests.
- `pnpm build`: passed, 2,213 modules transformed. Vite reported only the existing large-chunk warning.
- `pnpm verify:g-bot-subject`: passed in check mode with real Browser/Babylon/Havok evidence, including
  idle/walk/run/jump pose separation, two-subject isolation and wall-stop collision. Rendering used
  SwiftShader, so performance is not hardware-representative.
- `pnpm verify:canonical`: passed all listed Canonical and Browser Protocol V5 gates. Rendering used
  SwiftShader.
- `git diff --check`: passed.
- Canceled-policy search: no new character-ignore filter exists in Camera/Spring Arm runtime code.

`pnpm verify:placement-layout` was attempted but stopped before its Browser phase with the repository path
guard `LAYOUT_OUTPUT_CONTAINS_INPUT`; the configured output directory contains the AuthoringSpec input. This
gate is not in the affected Camera closure and no Camera code was changed to bypass that unrelated guard.

## Independent review status

The project-local Cursor helper preflight found an authenticated Cursor Agent CLI, but the required helper
could not start on Windows because Python could not import the Unix-only `fcntl` module. No Cursor verdict is
claimed. Host review reproduced the changed authority boundaries directly and all affected automated and
rendered gates above were rerun on the final tree.

## Non-claims and remaining roadmap

This completion closes GCC-3B, not the whole Camera roadmap. GCC-2 Registry Lock completion, fully atomic
cross-domain Mount/Equipment/Flight rollback, Camera Kits, CLI/Take publication and their Golden Fixtures
remain separately tracked. The large production chunk warning and the unrelated Placement Layout path guard
also remain repository follow-ups.

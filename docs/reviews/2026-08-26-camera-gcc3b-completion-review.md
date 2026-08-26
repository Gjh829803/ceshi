# Camera GCC-3B Completion Review

- Date: 2026-08-26
- Review mode: B, change review
- Branch: `codex/camera-development`
- Base: `7e3ff84508d926f23c2c88994af079aa5e941993`
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

## Verification evidence

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 194 contract files / 2,081 tests; 2 skipped.
- Resource-heavy lane: passed, 21 files / 405 tests; 4 skipped and one integration file intentionally
  skipped by its configured gate.
- `pnpm build`: passed, 2,202 modules transformed. Vite reported only the existing large-chunk warning.
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

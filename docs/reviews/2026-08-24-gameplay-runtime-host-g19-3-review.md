# Gameplay RuntimeHost G19-3 Review Disposition

## Review boundary

- Branch: `codex/pr19-gameplay-r1b-integration`.
- Implementation checkpoint: `f71bcb3` plus the post-review corrections recorded here.
- Future integration authority: `origin/codex/r1b-integration@df9f674`.
- Scope: provider-neutral Gameplay core, `WorldSession`, `RuntimeHost`, fixed-input publication, Runtime Activity settlement, replacement, disposal, and closed diagnostics.
- Explicitly excluded: R1b Task 9/10, authoritative external `ExecutionPlanV5` parsing, Gameplay Bootstrap WorldPackage membership, Babylon Gameplay Port, Camera, Browser V5, CLI, Playground, and outdoor scene wiring.

This checkpoint is trusted in-process staging. It is not an external WorldPackage Loader or production Browser entry.

## R1b compatibility disposition

The latest R1b branch adds multi-Surface graph construction, Static Surface support resolution, and public Route evidence without modifying the G19-3 package owners. A merge-tree check between this branch and `origin/codex/r1b-integration@df9f674` completed without textual conflicts.

Future G19-4/G19-5 integration must preserve these R1b authorities:

- `ExecutionPlanV5` and Route V2 artifacts remain R1b-owned.
- Babylon remains the only fixed-tick owner of Subject transform, support, medium, facing, and actual speed.
- Gameplay consumes the canonical projection from that committed Tick. It must not run a second support query, Heightfield sample, Graph query, or Surface-owner inference.
- Recast, Babylon, Havok, Provider names, and native handles remain outside Canonical Schema, CLI, Browser, Report, and Snapshot contracts.

G19-4 remains blocked until R1b Task 9 atomic cutover and Task 10 completion review produce an accepted completion HEAD.

## Host review findings

### G19-3-H1 — Activity settlement after release — confirmed / fixed

Host disposal now joins registered cleanup even after an Activity was released. Release is terminal for cleanup registration, while active unregistered work still requires a late release after cancellation.

### G19-3-H2 — Cleanup failure aggregation — confirmed / fixed

Runtime Activity cleanup uses all-settlement semantics. One rejection no longer lets Host disposal finish before sibling cleanup settles. The public failure remains the sanitized closed `WORLD_SESSION_FAILED` diagnostic.

### G19-3-H3 — Synchronous abort reentrancy — confirmed / fixed

The coordinator marks every active lease `terminated-by-host` and sets the active count to zero before dispatching any abort callback. A callback that releases another lease cannot make the count negative or publish a mixed terminal state.

### G19-3-H4 — Fixed-input capacity error shape — confirmed / fixed

Every fixed-input capacity admission failure now throws a domain Error carrying the closed `GAMEPLAY_CAPACITY_EXCEEDED` diagnostic. Physics is not advanced for the rejected Tick. In a multi-Tick request, prior committed Ticks remain available through the Host Snapshot; the Error does not add a competing free-form details bag.

### G19-3-H5 — Full external Plan validation — deferred by design

The current Host checks Plan kind/version, canonical hash, and Build Receipt hash correlation only. G19-4 must call the single authoritative closed `ExecutionPlanV5` parser in `runtime-contracts` before any Adapter effect and add six-way Gameplay Bootstrap Package membership. No temporary duplicate parser was added to `runtime-host`.

## Independent Cursor review

Cursor code review `g19-runtime-host-f71bcb3` initially returned `CODE NO-GO` with two findings:

| Finding | Host disposition |
| --- | --- |
| Fixed-input capacity rejection exposed a bare Error without a Diagnostic. | Reproduced with failing Session and Host tests, then fixed as G19-3-H4. |
| A failed Session should allow Host reset/replacement. | Rejected. Frozen section 9.1 defines the failure path as `failed -> disposed`; no-throw commit violation is fail-close, and phase-B rejection after old-Session failure is an already closed authority rule. |

The same read-only review session inspected the corrections and returned **CODE GO / No findings**. Cursor did not execute repository commands; all executable evidence below is Host-owned.

Fresh Cursor completion review `g19-runtime-host-final-0a609d3` inspected committed range
`1a3d824..0a609d3` and returned **FINAL GO / No findings**. It independently reconfirmed the closed
fixed-input Diagnostic, fail-close lifecycle, deterministic Event ordering, fixed-input Controller authority,
two-phase replacement, Activity all-settlement cleanup, sanitized errors, and the absence of a second
Support/Medium/Facing/Route owner. It also confirmed that G19-4 remains blocked on R1b Task 9/10 rather than
being an incomplete G19-3 requirement.

## Verification evidence

- `pnpm typecheck` — passed.
- RuntimeHost focused suite — 8 files / 118 tests passed.
- `pnpm test` — 160 files / 1,972 tests passed after the final code correction.
- `pnpm build` — passed; only the existing Vite large-chunk advisory remains.
- `pnpm verify:canonical` — passed.
- `pnpm verify:placement-layout` — passed.
- `pnpm verify:rigged-subject` — passed.
- `pnpm verify:g-bot-subject` — passed.
- `pnpm verify:route-r0-contract` — passed.
- `pnpm verify:route-r1-heightfield` — passed, including deterministic 30/60/120-like evidence and Provider identity leak checks.
- `git diff --check` — passed.

The visual verification commands regenerated local raster artifacts under this machine's rendering environment. Those generated diffs were restored and are not part of this change.

# Character Support Observation Normalization

## Goal

Prevent a transient Babylon/Havok support classification with a zero average
normal from becoming a fatal fixed-Tick Runtime error. Preserve the single
`checkSupport()` authority, transactionality, deterministic movement, and honest
ground/air semantics. Do not synthesize a fake up normal.

## Authority map

| State | Sole owner | Consumers | Forbidden fallback |
| --- | --- | --- | --- |
| Raw support observation | Babylon/Havok driver | Character Body adapter only | Treating provider output as Canonical input |
| Canonical support sample | Character Body adapter | Movement resolver, integrate request, committed state | Terrain height, raycast, animation, arbitrary `[0,1,0]` |
| Upward-departure latch | Character Body transaction | Next begin projection only | Input recovery or render state |
| Provider incoherence telemetry | Character Body adapter | Read-only diagnostics | Snapshot/Hash or movement decisions outside the adapter |

## Work graph

### S1 — Missing-combination reproducer

- **Goal:** reproduce `upward departure + positive Y velocity + native
  supported/sliding + [0,0,0] normal`.
- **Depends on:** none.
- **Blocks:** S2, S3.
- **Ownership:** `babylon-character-body-port.test.ts` only.
- **Input:** Fake native driver with the exact observed output.
- **Output:** a RED regression that currently throws before the departure rule.
- **Evidence:** focused Vitest failure at `beginTick()`.
- **Execution:** sequential.

### S2 — Raw observation boundary

- **Goal:** validate provider output structurally without applying Canonical
  nonzero-normal constraints before transition context is known.
- **Depends on:** S1.
- **Blocks:** S3, S4.
- **Ownership:** native support parsing and begin projection in
  `babylon-character-body-port.ts`.
- **Input:** raw provider mode, finite normal/velocity fields, current contacts,
  committed upward-departure latch and velocity.
- **Output:** one Canonical Body support plus one Canonical support passed back to
  native integration.
- **Evidence:** the RED test becomes GREEN and integrate never receives
  `supported/sliding` with a zero normal.
- **Execution:** sequential.

### S3 — Incoherent observation policy

- **Goal:** resolve zero-normal observations without inventing ground.
- **Depends on:** S2.
- **Blocks:** S5.
- **Ownership:** Character Body begin projection only.
- **Rules:**
  1. Authored upward departure with positive up velocity publishes
     `unsupported` before inspecting a discarded native normal.
  2. Otherwise, supporting contacts inside the existing contact band may derive
     a normalized support normal.
  3. Without a usable contact-derived normal, publish `unsupported`.
- **Evidence:** focused regressions for all three paths, plus valid native support
  remains unchanged.
- **Execution:** sequential.

### S4 — Diagnostic and recovery truth

- **Goal:** classify provider incoherence as nonfatal telemetry and prevent
  neutral-input replay from being presented as its recovery mechanism.
- **Depends on:** S2.
- **Blocks:** S5.
- **Ownership:** read-only Body observation telemetry and Runtime diagnostic
  projection; no public Gameplay state.
- **Output:** raw mode/normal, contact counts, upward-departure flag, resolution
  reason, and trusted source revision in exported diagnostics.
- **Evidence:** diagnostic immutability and recorder serialization tests.
- **Execution:** sequential.

### S5 — Runtime closure

- **Goal:** prove the repaired boundary under fake-driver adversarial cases and
  real Babylon/Havok lifecycle.
- **Depends on:** S3, S4.
- **Blocks:** completion.
- **Ownership:** verification only.
- **Evidence:** focused Body test, real G Bot jump/landing tests, typecheck, root
  test aggregate, Playground build, and manual repeated-jump playtest.
- **Execution:** main-agent-only.

## Invariants

- Exactly one `checkSupport()` call per active Character per fixed Tick.
- Canonical `supported/sliding` always has a finite normalized normal.
- Canonical `unsupported` never claims a supporting point or surface velocity.
- A zero native average normal never becomes `[0,1,0]` by fiat.
- Provider telemetry is immutable and cannot affect Snapshot, Hash, Reset,
  Replay, Rollback, input interpretation, or movement outcomes.
- Failed transactional work still restores native and semantic state exactly.

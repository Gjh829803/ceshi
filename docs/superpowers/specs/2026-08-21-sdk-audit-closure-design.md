# SDK Audit Closure Design

**Status:** Accepted for implementation on 2026-08-21

**Inputs:**

- `docs/reviews/2026-08-20-sdk-full-audit.md`
- `docs/reviews/2026-08-20-sdk-protocol-gates-terrain-audit.md`
- `docs/reviews/2026-08-20-real-model-binding-review.md`
- `docs/reviews/runtime-deep-review-checklist.md`

## Goal

Close the confirmed correctness and contract-integrity findings from the two SDK audits without expanding the current product boundary. The result must keep one authoritative meaning for solved transforms, terrain height, product Subject discovery, capability validation, and verification state.

## Non-goals

- Do not implement WorldPackage, ValidationReport, SimulationTake, five-pass capture, relationships, swimming, new camera algorithms, vehicles, or NPC behavior.
- Do not remove the documented legacy outdoor authoring stack.
- Do not delete or hide `Beta_Joints` by mesh-name heuristic. Product assets must eventually declare render roles explicitly.
- Do not claim all 25 G Bot clips are runtime-selected semantic actions.
- Do not change runtime behavior for control rebind, animation interruption, or asynchronous unload without a separately accepted behavioral contract.

## Design decisions

### 1. Solved spatial transforms are world-space authority

`LayoutSolveResultV1` Anchor transforms are absolute world transforms. Compiler projection must copy the solved Subject position without resampling or adding terrain height. Execution Subjects gain an explicit unit-bearing `spawnSubjectFacingRadians` derived from the solved Anchor Y rotation; `forwardDirection: "-z"` remains the asset-forward convention. Runtime construction and reset both initialize yaw from `spawnSubjectFacingRadians`.

Terrain height, normal, and slope queries must use one shared triangle-surface sampler matching the rendered and physics mesh diagonal. Layout, Compiler, Babylon, and the legacy outdoor heightfield call that implementation. A non-symmetric saddle cell is the mandatory regression because flat and bilinear-equivalent cells cannot detect the drift.

### 2. One canonical G Bot product definition

The unreleased SDK uses a clean break: `worldkit://subject-definition/humanoid.g-bot@2` becomes the single V3 product definition. It contains the approved capability assembly plus both camera/seat sockets and `hand.right`. The duplicate `.ground@1` definition is removed. CLI, Browser, examples, build artifacts, and both G Bot conformance paths resolve the same Ref and canonical hash.

The semantic action resolver remains limited to implemented baseline actions. The 25-clip asset inventory is not promoted into a universal engine action contract in this closure; that taxonomy is deferred to the extensible action-catalog design.

### 3. Gates report what the runtime can prove

Subject spawn validation rejects intersections with blocking water and static blocking object footprints. `blocked`, `walkable`, and `swimmable` retain distinct traversal meanings; this closure does not add swimming. The exact validation is shared by Canonical compile and legacy outdoor compile where their data models permit equivalent evidence.

Reference-guided outdoor scenes cannot be exported as `verified` or finalized when the persisted composition report is absent, stale, or `pass: false`. The trusted host recomputes or verifies report inputs rather than trusting a client-supplied boolean.

`validateSubjectPackage` reports only executable checks it actually evaluates. Relationship and other unimplemented catalog claims must not produce a valid package result. Capability catalog statuses are corrected where runtime consumption is absent; velocity-chase is not downgraded solely because it shares the generic chase implementation.

### 4. Make host transformations and hashes explicit

Playground capability demo overrides are an explicit overlay with a deterministic identity in diagnostics/receipts, not a silent mutation presented as the original Authoring Spec. CLI build remains the unmodified-spec authority.

The Playground declares every directly imported workspace dependency. Canonical hashing rejects non-plain objects such as `Map`, `Date`, and typed arrays instead of silently converting them into misleading JSON objects.

## Test and evidence strategy

Each behavior change follows RED-GREEN-REFACTOR. Required adversarial fixtures include:

- non-zero and non-flat solved spawn height;
- solved non-zero facing and reset preservation;
- asymmetric saddle-cell height, normal, and slope parity across layers;
- identical G Bot Ref/hash/socket discovery through CLI and Browser;
- spawn inside blocked water and a static blocker;
- failed composition report refusing verified/finalized state;
- invalid capability packages with unavailable relationship/runtime behavior;
- explicit Playground overlay identity and unchanged input object;
- `Map`, `Date`, and typed-array canonical-hash rejection.

Completion requires focused tests for every batch, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, and `pnpm verify:g-bot-subject`.

## Review disposition contract

After implementation, each input review receives an append-only disposition section. Every finding is marked `fixed`, `deferred`, `rejected`, or `already closed`, with the current commit, tests, and a concise reason. Original reviewer text is not rewritten. The three review files are committed with the implementation evidence so future agents can distinguish external findings from accepted SDK behavior.

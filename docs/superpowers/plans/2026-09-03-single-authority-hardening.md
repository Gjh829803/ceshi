# Single-authority hardening implementation plan

**Base:** `7d5fcbdfd925d1c69802071f9f22dc1de9e20199`

**Goal:** remove the confirmed public dual-authority seams, repair the current Native Block
Builder Skill freeze failure, and add source-level structural enforcement inside the existing
workflow gate so equivalent duplicate paths cannot become a long-lived migration.

## Work graph

### SAH-10 — Repair and gate the frozen Builder Skill input

- **Goal:** make the representative Case input byte-identical to the live Skill and surface
  future drift before the expensive CI lanes.
- **Depends on:** none.
- **Blocks:** SAH-60.
- **Exclusive ownership:** `.codex/skills/worldkit-native-block-builder/` and
  `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/builder-skill/`.
- **Input/output contract:** the three files enumerated by
  `scripts/agents/native-block-builder-skill.test.ts` remain exact byte copies; the existing
  contract-test census continues to run that drift check in CI without duplicating it in an
  earlier workflow step.
- **Evidence:** `pnpm check:native-block-builder-skill`.
- **Execution mode:** `sequential`.

### SAH-20 — Make Subject Definition provenance unrepresentably mismatched

- **Goal:** replace the independent `source` plus `definition` fields with one discriminated
  request union while preserving the intentional package-only `mountSlots` contract.
- **Depends on:** none.
- **Blocks:** SAH-60.
- **Exclusive ownership:** `packages/authoring/src/subject-definition-normalizer.ts` and its
  direct tests/callers.
- **Input/output contract:** `source: "package"` accepts only `PackageSubjectDefinitionV1` and
  `source: "registry"` accepts only `SubjectDefinitionV3`; Registry definitions continue to
  have no `mountSlots` field.
- **Evidence:** authoring normalizer focused tests and typecheck.
- **Execution mode:** `sequential`.

### SAH-30 — Collapse the hosted fixed-Tick and Locomotion publication seams

- **Goal:** expose one prepared fixed-Tick transaction through RuntimeHost and one Locomotion
  V2 capability envelope. Route every supported planar-vector Subject through the current
  CharacterMovement transaction regardless of static or rigged presentation.
- **Depends on:** none.
- **Blocks:** SAH-40, SAH-50, SAH-60.
- **Exclusive ownership:** `packages/runtime-host/`, `packages/runtime-babylon/`,
  `packages/gameplay-contracts/`, and direct verification consumers.
- **Input/output contract:**
  - `GameplayWorldPortV1` requires `prepareFixedInputTick` and has no mutating
    `runFixedInputTick` alternative;
  - Babylon's provider-neutral internal port implements that one method;
  - hosted Gameplay rejects unsupported specialized-control configurations before mutation;
  - all planar-vector subjects use `CharacterMovementRuntimeV1` plus the Babylon BodyPort;
  - both `align-to-move` and registered `align-to-view` planar profiles provide separate
    movement/facing inputs to the same CharacterMovement owner; MotionKernel contains no
    planar-vector execution branch;
  - CharacterMovement alone reconciles post-reset Body support, coyote state, transition
    sequence, and bounded turn-rate state;
  - the BodyPort performs exactly one support query after all colliders and Subjects activate
    and before the first Runtime Snapshot is publishable;
  - canonical Gameplay capability state accepts only `locomotion-capability-state-v2`.
  - Traversal skips suspended mounted riders, rejects a mounted traversal target, and
    preserves relationship-owned suspension through anchor resets.
- **Evidence:** RuntimeHost transaction tests, Runtime Babylon Golden/mounted tests,
  gameplay-contract tests, typecheck, and the 3C migration gate.
- **Execution mode:** `main-agent-only` because it changes cross-package authority and
  commit/rollback semantics.

### SAH-40 — Remove duplicate public entry names

- **Goal:** keep one authoring schema subpath and one canonical JSON utility owner.
- **Depends on:** SAH-30 only to avoid overlapping contract edits during integration.
- **Blocks:** SAH-60.
- **Exclusive ownership:** `packages/authoring/package.json`, authoring exports/imports, and
  script imports that currently consume canonical JSON through authoring.
- **Input/output contract:** `@whitebox-world/authoring/schema` is the only schema subpath;
  canonical JSON helpers are imported from `@whitebox-world/protocol`.
- **Evidence:** package-boundary tests, affected script tests, and typecheck.
- **Execution mode:** `sequential`.

### SAH-50 — Add structural and authoring-policy prevention

- **Goal:** reject semantic duplicates even when a legacy symbol is renamed and document the
  required clean-break behavior for future agents.
- **Depends on:** SAH-30.
- **Blocks:** SAH-60.
- **Exclusive ownership:** `scripts/verification/verify-3c-migration.ts`, its tests,
  `config/3c-migration-ledger.json`, and root `AGENTS.md`.
- **Input/output contract:** the migration verifier checks structural invariants for controller
  selection, fixed-Tick port shape, and Locomotion envelope shape in addition to symbol counts;
  AGENTS requires one owner/entry point/parser and bounded migrations with an exit gate.
  The fixed-input rule parses TypeScript interface structure so a renamed direct mutation
  beside the prepared transaction still fails, and the verifier runs inside root `pnpm test`.
- **Evidence:** verifier RED fixtures followed by `pnpm verify:3c-migration` GREEN.
- **Execution mode:** `main-agent-only` because the gate defines repository-wide policy.

### SAH-60 — Freeze, verify, independently review, and integrate

- **Goal:** produce one clean exact-SHA candidate and merge only after full repository evidence
  and independent review pass.
- **Depends on:** SAH-10, SAH-20, SAH-30, SAH-40, SAH-50.
- **Blocks:** none.
- **Exclusive ownership:** integration commit, remote branch, Cursor Cloud tasks, and merge.
- **Input/output contract:** focused local evidence first; then a clean pushed SHA is immutable
  during one full Cursor gate and a separate read-only review. Any blocking fix creates a new
  SHA and invalidates only affected evidence.
- **Evidence:** focused tests; Cursor full gate (`pnpm check:agent-self-check`, `pnpm typecheck`,
  `pnpm test:studio`, `pnpm test:independent`, `pnpm test`, `pnpm build`, clean-tree check);
  separate independent review; final merged `main` SHA.
- **Execution mode:** `main-agent-only`.

## Explicit non-goals

- Babylon Native surface admission stays in `@whitebox-world/runtime-babylon`; BNA-4 already
  assigns that provider-specific geometry decision there.
- Distinct throttle/steer or flight movement strategies are not collapsed into ground
  CharacterMovement. They remain separate algorithms, but cannot masquerade as a second hosted
  planar owner or publish a second canonical Locomotion schema.
- Private compiler helper names that contain `V3` are nomenclature debt, not a second public
  contract or runtime authority, and are intentionally excluded from this behavioral fix.

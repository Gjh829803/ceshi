# Historical Naming and Compatibility Path Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove superseded development-history names and compatibility paths from active code while preserving versioned contracts that are still the sole current authority.

**Architecture:** Treat naming cleanup as a contract census, not a global search-and-replace. Every match is classified as `current-authority`, `superseded-delete`, `historical-only`, or `deferred-blocked`; only the second class is deleted immediately, and the fourth class must carry an executable removal record. This plan is the implementation detail for G19-8 work unit `UCCB-65` and blocks `UCCB-70` completion.

**Tech Stack:** TypeScript, pnpm workspace, `rg`, Vitest, current Authoring V4 / Normalized IR V4 / ExecutionPlan V5 / Browser Protocol V5 / Runtime Snapshot V4 contracts.

**Spec:** `docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md`

## Global Constraints

- The project is unreleased: do not retain aliases, converters, dual reads, dual writes, fallback parsing, or union acceptors solely for development history.
- A `V1`, `V2`, or `V3` suffix is not evidence of obsolescence. A symbol is removable only when an authoritative replacement exists and every active consumer has moved.
- Canonical Schema, CLI, Browser Protocol, examples, generated types, reports and snapshots use one canonical public term for each concept.
- Babylon, Havok and provider-specific names remain behind adapters and never enter Canonical Schema, CLI, Browser Protocol, Report or Snapshot.
- Historical specs, plans and reviews remain immutable evidence unless they incorrectly claim to be current authority; history is not a production compatibility surface.
- Every deferred item must name the exact consumer, blocker, owner, removal task, machine-verifiable removal gate and latest allowed milestone. Open-ended deferral fails G19-8.
- Do not hand-edit generated canonical artifacts. Regenerate them through their owning command after the current contracts pass.

---

## 1. Classification Contract

| Classification | Meaning | Required disposition |
| --- | --- | --- |
| `current-authority` | The symbol is the only current contract even if its name carries an older version suffix | Keep it; record the owner and prove no competing public synonym exists |
| `superseded-delete` | A newer current contract exists and active consumers no longer require the old path | Delete declaration, export, branch, fixture and test-only constructor in one atomic change |
| `historical-only` | The name appears only in dated specs, plans, reviews or migration history | Keep the evidence; exclude it from production symbol gates |
| `deferred-blocked` | The old path is superseded but a real current production consumer still blocks deletion | Register the complete removal record; missing fields block G19-8 |

The following are explicitly **not** bulk-renamed by this plan: current nested contracts such as `PackageSubjectDefinitionV1`, `ExecutionObjectV3`, `ExecutionTraversalSurfaceV1`, current Gameplay/RuntimeHost/WorldPackage contracts, and any other symbol for which no authoritative replacement exists.

## 2. Work Graph and Ownership

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Execution mode |
| --- | --- | --- | --- | --- | --- |
| HNC-00 | Freeze the match families and verifier regression cases | UCCB-50 | HNC-10, HNC-20, HNC-30 | `scripts/verification/verify-unreleased-clean-break.ts`, its focused test | sequential |
| HNC-10 | Remove superseded public names, aliases and package exports | HNC-00, UCCB-60 | HNC-40 | affected package `src/index.ts`, declaration files and focused tests | main-agent-only |
| HNC-20 | Remove hidden compatibility behavior: converters, union acceptors, dual reads/writes and fallback ownership | HNC-00, UCCB-50 | HNC-40 | Runtime/Host/Browser/CLI implementation and focused tests | sequential |
| HNC-30 | Regenerate or replace serialized fixtures and generated artifacts that still encode superseded contracts | HNC-00, UCCB-60 | HNC-40 | `examples/**`, generated `artifacts/**`, owning generators and verifiers | sequential |
| HNC-40 | Produce the final classified census, including retained current-authority versioned names | HNC-10, HNC-20, HNC-30 | HNC-50 | completion review census and command evidence | main-agent-only |
| HNC-50 | Resolve every `deferred-blocked` item or register its exact removal contract | HNC-40 | HNC-60 | deferred-removal ledger | main-agent-only |
| HNC-60 | Run zero-census, full gates and host semantic review | HNC-50 | UCCB-70 | final evidence and Git integration status | main-agent-only |

## 3. Execution Ledger

| Work item | Status at creation | Evidence / next gate |
| --- | --- | --- |
| HNC-00 | Complete | `pnpm verify:unreleased-clean-break` has focused classifier coverage and currently reports zero forbidden matches |
| HNC-10 | Complete | Superseded top-level contracts and public exports were removed; active code exposes only Authoring V4, IR V4, Plan V5, Snapshot V4 and Browser V5 |
| HNC-20 | Complete | Runtime possession is explicitly `unbound | possessed`; reset/release do not restore an initial-control fallback, and no public direct-bind compatibility path remains |
| HNC-30 | Complete | Canonical package fixtures, Registry expectations and both example Takes were regenerated from their current owning generators and identities |
| HNC-40 | Complete | The live census reports 632 scanned files, zero forbidden matches and 489 retained current-authority matches |
| HNC-50 | Complete | No superseded compatibility path is deferred; the approved deferral ledger is empty |
| HNC-60 | Complete | Candidate `99fb822` passed typecheck, 178 files / 2,172 tests, build and every required Canonical, Placement, asset, Capture, Route, Outdoor and clean-break gate |

## 4. Post-G19 Cleanliness Commitment

G19-8 removes every compatibility path known to have an existing current replacement. It does not authorize
the repository to stop auditing after merge. `HNC-F1` is a mandatory pre-Alpha audit over public names,
package exports, parsers, Browser/CLI methods, generated artifacts and implicit fallback behavior. It must run
the latest clean-break verifier plus a fresh human classification against the then-current contracts; a green
historical census copied from G19-8 is not sufficient.

One current semantic bridge is explicitly scheduled for that audit:

#### SCENE-ORIGIN-1 — Scene humanoid center offset bridge

- classification: current-authority bridge; not an approved compatibility alias
- files: `apps/playground/src/outdoor-scene-gameplay-loader.ts`, `packages/world/src/scene.ts`
- current_owner: World Scene DSL and Playground Outdoor importer
- current_semantics: Scene DSL humanoid spawn uses a center-height convention while Canonical Runtime placement uses the support-origin convention
- current_name: `SCENE_HUMANOID_SPAWN_CENTER_OFFSET_METERS`
- removal_task: HNC-F1 / SCENE-ORIGIN-1
- depends_on: a frozen Scene spawn-origin contract and collider-derived placement contract
- delete_when: Scene spawn requests declare their origin convention or resolve it from the locked collider; all catalog scenes are migrated; `pnpm test:scenes`, `pnpm verify:outdoor-gameplay`, `pnpm plan:check`, and `pnpm plan:scene:check` pass without a fixed 0.9m importer conversion
- verification: exact constant/reference census plus the four gates above
- latest_allowed_milestone: before the first SDK Alpha release

This bridge was renamed during G19-8 so it no longer impersonates historical compatibility. It remains a
tracked design cleanup because deleting the number before the replacement contract exists would change scene
placement semantics rather than improve cleanliness.

### Task 1: Freeze the machine census

**Files:**
- Modify: `scripts/verification/verify-unreleased-clean-break.ts`
- Test: `scripts/verification/verify-unreleased-clean-break.test.ts`
- Reference: `docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md`

**Interfaces:**
- Consumes: the four classifications in section 1 and active roots `packages`, `apps`, `scripts`, `examples`, `README.md`, `docs/17-canonical-json-quickstart.md`.
- Produces: `unreleased-clean-break-census` JSON with `forbiddenMatchCount`, current-authority matches and per-family paths.

- [x] **Step 1: Add a failing regression for a real legacy alias and for a current strict version guard**

  The fixture containing an obsolete alias must fail; a fixture containing only `schemaVersion === 4` or `schemaVersion !== 5` must pass as a current strict guard.

- [x] **Step 2: Run the focused verifier test and confirm the new regression fails before implementation**

  Run: `pnpm vitest run scripts/verification/verify-unreleased-clean-break.test.ts`

- [x] **Step 3: Implement family-based classification without treating every version suffix as debt**

  The verifier must report exact paths and values, and historical document roots must remain excluded from the blocking production census.

- [x] **Step 4: Run the focused test and live census**

  Run: `pnpm vitest run scripts/verification/verify-unreleased-clean-break.test.ts && pnpm verify:unreleased-clean-break`

  Expected: focused tests pass and the live command reports `forbiddenMatchCount: 0` only when active superseded paths are absent.

### Task 2: Remove superseded public names and exports

**Files:**
- Modify/Delete: declarations and exports reported by the `superseded-top-level-contracts` and `superseded-runtime-and-subject-contracts` verifier families.
- Test: owning package tests for every changed export surface.

**Interfaces:**
- Consumes: current Authoring V4, Normalized IR V4, ExecutionPlan V5, Registry current definitions, Browser V5 and Snapshot V4.
- Produces: one public symbol for each current concept and no importable alias for a superseded top-level contract.

- [x] **Step 1: Capture the exact pre-change export census**

  Run:

  ```bash
  rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' \
    'AuthoringSpecV[1-3]|NormalizedWorldIRV[1-3]|ExecutionPlanV[1-4]|WorldRuntimeSnapshotV3|BindControlRequestV2|RegistrySubjectDefinition(Input)?V2|SubjectResourceRegistryV2' \
    packages apps scripts examples
  ```

- [x] **Step 2: For each match, prove its replacement and remove the declaration, export and old-construction test together**

  Do not rename a current nested contract solely to remove a numeric suffix. Any retained match must be classified in Task 5.

- [x] **Step 3: Run the owning package tests and typecheck**

  Run: `pnpm typecheck && pnpm test`

  Expected: no active import requires a deleted symbol and no test recreates the superseded shape.

### Task 3: Remove hidden compatibility behavior

**Files:**
- Modify/Delete: matches from the `superseded-compatibility-mechanisms` verifier family.
- Test: Runtime reset/rebind/release, Browser protocol strictness, CLI parsing and package-admission tests.

**Interfaces:**
- Consumes: Gameplay Possession as the only runtime control owner and strict current-version parsers.
- Produces: fail-closed current-only behavior with no converter, dual-read, union acceptor or hidden initial-control fallback.

- [x] **Step 1: Add or retain failing reproducers for every behavior being deleted**

  Required examples include: old schema rejection, release remaining unbound, reset remaining unbound until the Host submits `control.bind`, and stale controller input not moving the newly possessed entity.

- [x] **Step 2: Delete the compatibility branch rather than translating old input**

  Runtime control projection must use a discriminated `unbound | possessed` state. Current strict guards may reject wrong versions but must not convert them.

- [x] **Step 3: Run focused Runtime, Host, Browser and CLI tests**

  Run:

  ```bash
  pnpm vitest run packages/runtime-babylon/src packages/runtime-host/src packages/runtime-contracts/src
  pnpm typecheck
  ```

### Task 4: Clean serialized fixtures and generated artifacts

**Files:**
- Modify: current fixtures under `examples/**` through their owning authoring source.
- Regenerate: changed canonical outputs under `artifacts/**` through the repository verifier/generator commands.
- Test: `scripts/verification/verify-unreleased-clean-break.test.ts` and owning artifact verifiers.

**Interfaces:**
- Consumes: current Authoring V4 and current generators.
- Produces: fixtures/artifacts whose serialized top-level contracts match the current authority and whose hashes are generated, not hand-edited.

- [x] **Step 1: Census serialized top-level versions by kind**

  Run:

  ```bash
  rg -n '"kind"\s*:\s*"worldkit-authoring-spec"|"schemaVersion"\s*:\s*[1-3]' examples apps packages scripts artifacts
  ```

- [x] **Step 2: Classify nested current schemas by `kind` and regenerate only superseded top-level artifacts**

  A nested schema version 1–3 is kept when its `kind` remains the sole current authority.

- [x] **Step 3: Run owning generators and verify deterministic diffs**

  Run: `pnpm verify:placement-layout && pnpm verify:control-capture && pnpm verify:validation-capture`

### Task 5: Publish the classified census and deferred-removal ledger

**Files:**
- Modify: `docs/reviews/2026-08-25-gameplay-g19-8-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**
- Consumes: machine census plus host review of every retained versioned public name.
- Produces: auditable current-authority inventory and zero or more complete `deferred-blocked` records.

- [x] **Step 1: Record the final candidate commit and exact census counts**

  Copy evidence only from commands rerun on the committed integrated candidate.

- [x] **Step 2: Record every retained versioned symbol family as current authority or historical-only**

  Each current-authority family must name its owner and state that no replacement exists. Do not create cleanup work merely because a suffix is small.

- [x] **Step 3: Resolve or fully register every blocked deletion**

  Each row requires: superseded path, exact production consumer, blocker, owner, removal task, `depends_on`, executable `delete_when`, verification command and latest allowed milestone. The current expected ledger is empty.

### Task 6: Run the final G19-8 completion gate

**Files:**
- Modify: `docs/reviews/2026-08-25-gameplay-g19-8-completion.md`
- Modify: `docs/superpowers/plans/2026-08-24-gameplay-framework-r1b-integration-implementation-plan.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**
- Consumes: HNC-10 through HNC-50 complete on one committed candidate.
- Produces: HNC-60 and UCCB-65 completion evidence that allows UCCB-70 to begin.

- [x] **Step 1: Run the current-only census and structural gates**

  Run:

  ```bash
  pnpm verify:unreleased-clean-break
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- [x] **Step 2: Run the G19 capability matrix**

  Run:

  ```bash
  pnpm verify:canonical
  pnpm verify:placement-layout
  pnpm verify:rigged-subject
  pnpm verify:g-bot-subject
  pnpm verify:control-capture
  pnpm verify:validation-capture
  pnpm verify:route-r0-contract
  pnpm verify:route-r1-heightfield
  pnpm verify:route-r1b-static-platform
  pnpm verify:outdoor-gameplay
  ```

- [x] **Step 3: Perform the host semantic review**

  Apply `docs/reviews/full-dimension-review-protocol.md` and `docs/reviews/runtime-deep-review-checklist.md`. Confirm that compatibility deletion did not create a second owner for possession, camera, support, medium, facing or fixed-step time.

- [x] **Step 4: Close the task only from evidence**

  Mark `UCCB-65` complete only when the forbidden census is zero, every retained name is classified, the deferred ledger is empty or complete, all commands pass on the same candidate, and `git diff --check` is clean.

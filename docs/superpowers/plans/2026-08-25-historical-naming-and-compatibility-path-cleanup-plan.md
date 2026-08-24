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
| HNC-00 | Freeze the match families and verifier regression cases | UCCB-50 | HNC-10, HNC-20, HNC-30 | `scripts/verify-unreleased-clean-break.ts`, its focused test | sequential |
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
| HNC-10 | In progress under UCCB-60 | Re-run public export and obsolete symbol census after Runtime commits |
| HNC-20 | In progress under UCCB-50 | Finish explicit `unbound | possessed` projection and prove reset/release never use an initial-control fallback |
| HNC-30 | Pending | Regenerate Placement and other canonical fixtures after current-only contracts stabilize |
| HNC-40 | Pending | Attach exact match counts and retained-current classifications to the G19-8 completion review |
| HNC-50 | Pending | Current approved deferred-removal ledger is empty |
| HNC-60 | Pending | Run the complete G19-8 matrix on one committed candidate |

### Task 1: Freeze the machine census

**Files:**
- Modify: `scripts/verify-unreleased-clean-break.ts`
- Test: `scripts/verify-unreleased-clean-break.test.ts`
- Reference: `docs/superpowers/specs/2026-08-24-unreleased-compatibility-clean-break-design.md`

**Interfaces:**
- Consumes: the four classifications in section 1 and active roots `packages`, `apps`, `scripts`, `examples`, `README.md`, `docs/17-canonical-json-quickstart.md`.
- Produces: `unreleased-clean-break-census` JSON with `forbiddenMatchCount`, current-authority matches and per-family paths.

- [x] **Step 1: Add a failing regression for a real legacy alias and for a current strict version guard**

  The fixture containing an obsolete alias must fail; a fixture containing only `schemaVersion === 4` or `schemaVersion !== 5` must pass as a current strict guard.

- [x] **Step 2: Run the focused verifier test and confirm the new regression fails before implementation**

  Run: `pnpm vitest run scripts/verify-unreleased-clean-break.test.ts`

- [x] **Step 3: Implement family-based classification without treating every version suffix as debt**

  The verifier must report exact paths and values, and historical document roots must remain excluded from the blocking production census.

- [x] **Step 4: Run the focused test and live census**

  Run: `pnpm vitest run scripts/verify-unreleased-clean-break.test.ts && pnpm verify:unreleased-clean-break`

  Expected: focused tests pass and the live command reports `forbiddenMatchCount: 0` only when active superseded paths are absent.

### Task 2: Remove superseded public names and exports

**Files:**
- Modify/Delete: declarations and exports reported by the `superseded-top-level-contracts` and `superseded-runtime-and-subject-contracts` verifier families.
- Test: owning package tests for every changed export surface.

**Interfaces:**
- Consumes: current Authoring V4, Normalized IR V4, ExecutionPlan V5, Registry current definitions, Browser V5 and Snapshot V4.
- Produces: one public symbol for each current concept and no importable alias for a superseded top-level contract.

- [ ] **Step 1: Capture the exact pre-change export census**

  Run:

  ```bash
  rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' \
    'AuthoringSpecV[1-3]|NormalizedWorldIRV[1-3]|ExecutionPlanV[1-4]|WorldRuntimeSnapshotV3|BindControlRequestV2|RegistrySubjectDefinition(Input)?V2|SubjectResourceRegistryV2' \
    packages apps scripts examples
  ```

- [ ] **Step 2: For each match, prove its replacement and remove the declaration, export and old-construction test together**

  Do not rename a current nested contract solely to remove a numeric suffix. Any retained match must be classified in Task 5.

- [ ] **Step 3: Run the owning package tests and typecheck**

  Run: `pnpm typecheck && pnpm test`

  Expected: no active import requires a deleted symbol and no test recreates the superseded shape.

### Task 3: Remove hidden compatibility behavior

**Files:**
- Modify/Delete: matches from the `superseded-compatibility-mechanisms` verifier family.
- Test: Runtime reset/rebind/release, Browser protocol strictness, CLI parsing and package-admission tests.

**Interfaces:**
- Consumes: Gameplay Possession as the only runtime control owner and strict current-version parsers.
- Produces: fail-closed current-only behavior with no converter, dual-read, union acceptor or hidden initial-control fallback.

- [ ] **Step 1: Add or retain failing reproducers for every behavior being deleted**

  Required examples include: old schema rejection, release remaining unbound, reset remaining unbound until the Host submits `control.bind`, and stale controller input not moving the newly possessed entity.

- [ ] **Step 2: Delete the compatibility branch rather than translating old input**

  Runtime control projection must use a discriminated `unbound | possessed` state. Current strict guards may reject wrong versions but must not convert them.

- [ ] **Step 3: Run focused Runtime, Host, Browser and CLI tests**

  Run:

  ```bash
  pnpm vitest run packages/runtime-babylon/src packages/runtime-host/src packages/runtime-contracts/src
  pnpm typecheck
  ```

### Task 4: Clean serialized fixtures and generated artifacts

**Files:**
- Modify: current fixtures under `examples/**` through their owning authoring source.
- Regenerate: changed canonical outputs under `artifacts/**` through the repository verifier/generator commands.
- Test: `scripts/verify-unreleased-clean-break.test.ts` and owning artifact verifiers.

**Interfaces:**
- Consumes: current Authoring V4 and current generators.
- Produces: fixtures/artifacts whose serialized top-level contracts match the current authority and whose hashes are generated, not hand-edited.

- [ ] **Step 1: Census serialized top-level versions by kind**

  Run:

  ```bash
  rg -n '"kind"\s*:\s*"worldkit-authoring-spec"|"schemaVersion"\s*:\s*[1-3]' examples apps packages scripts artifacts
  ```

- [ ] **Step 2: Classify nested current schemas by `kind` and regenerate only superseded top-level artifacts**

  A nested schema version 1–3 is kept when its `kind` remains the sole current authority.

- [ ] **Step 3: Run owning generators and verify deterministic diffs**

  Run: `pnpm verify:placement-layout && pnpm verify:control-capture && pnpm verify:validation-capture`

### Task 5: Publish the classified census and deferred-removal ledger

**Files:**
- Modify: `docs/reviews/2026-08-25-gameplay-g19-8-completion.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**
- Consumes: machine census plus host review of every retained versioned public name.
- Produces: auditable current-authority inventory and zero or more complete `deferred-blocked` records.

- [ ] **Step 1: Record the final candidate commit and exact census counts**

  Copy evidence only from commands rerun on the committed integrated candidate.

- [ ] **Step 2: Record every retained versioned symbol family as current authority or historical-only**

  Each current-authority family must name its owner and state that no replacement exists. Do not create cleanup work merely because a suffix is small.

- [ ] **Step 3: Resolve or fully register every blocked deletion**

  Each row requires: superseded path, exact production consumer, blocker, owner, removal task, `depends_on`, executable `delete_when`, verification command and latest allowed milestone. The current expected ledger is empty.

### Task 6: Run the final G19-8 completion gate

**Files:**
- Modify: `docs/reviews/2026-08-25-gameplay-g19-8-completion.md`
- Modify: `docs/superpowers/plans/2026-08-24-gameplay-framework-r1b-integration-implementation-plan.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**
- Consumes: HNC-10 through HNC-50 complete on one committed candidate.
- Produces: HNC-60 and UCCB-65 completion evidence that allows UCCB-70 to begin.

- [ ] **Step 1: Run the current-only census and structural gates**

  Run:

  ```bash
  pnpm verify:unreleased-clean-break
  pnpm typecheck
  pnpm test
  pnpm build
  ```

- [ ] **Step 2: Run the G19 capability matrix**

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

- [ ] **Step 3: Perform the host semantic review**

  Apply `docs/reviews/full-dimension-review-protocol.md` and `docs/reviews/runtime-deep-review-checklist.md`. Confirm that compatibility deletion did not create a second owner for possession, camera, support, medium, facing or fixed-step time.

- [ ] **Step 4: Close the task only from evidence**

  Mark `UCCB-65` complete only when the forbidden census is zero, every retained name is classified, the deferred ledger is empty or complete, all commands pass on the same candidate, and `git diff --check` is clean.

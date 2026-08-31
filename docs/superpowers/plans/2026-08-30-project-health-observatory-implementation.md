# Project Health Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repository-local observatory that detects cross-cutting engineering drift beyond ordinary tests and emits one stable, explainable health report for PR, Nightly, and Release modes.

**Architecture:** Existing tests, builds, verifiers, Browser runs, visual capture, and review protocols remain their own fact owners. New code under `scripts/project-health/` selects and invokes those owners, runs narrowly owned static/dynamic sensors, normalizes their evidence into current-only DTOs, and applies one deterministic policy. Configuration under `config/project-health/` is the only machine-readable profile/authority/debt source; ephemeral output stays under ignored `.project-health/`.

**Tech Stack:** TypeScript 5.9, Node 24, `tsx`, Vitest 3, `lodash-es`, existing pnpm workspace/Playwright/Babylon/Havok gates, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-30-project-health-observatory-design.md`

## Global Constraints

- `ProjectHealthReportV1` is repository tooling and must not enter Registry, WorldPackage, Runtime, Browser, or `ValidationReportV1`.
- Reuse existing test census, parsers, hashes, build commands, verifiers, and runtime probes; do not create shadow algorithms.
- The repository is unreleased: one current Profile, parser, command family, and state owner; no aliases or old/new paths.
- Check mode never writes tracked files. Baseline changes require an explicit update command and reviewed diff.
- Stable DTOs contain no absolute paths, credentials, nondeterministic execution timestamps, machine names, random directories, or raw provider errors. The Report's required `evaluatedOn` is a trusted Host UTC-date input in strict `YYYY-MM-DD` form and participates in debt-expiry evaluation; only tests may inject a fixed Clock.
- Equality uses `===` / `!==`; nullish/empty checks use named `lodash-es` imports such as `isNil` and `isEmpty`.
- Every implementation task starts with a behavior-level failing test and ends with focused verification plus `git diff --check`.
- `profile.json`、`authority-policy.json`、Registry、root `package.json`、workflow 和 test-gate manifest 是 main-agent-only shared seams；Sensor tasks 不得并行修改它们。
- 每个新增 test file 必须在所属任务的最后一步立即登记到现有 `scripts/lib/test-gate-manifest.ts` 并运行 census；不得等 PHO-7 才批量补录。

## File map

| Path | Responsibility |
|---|---|
| `config/project-health/profile.json` | sole mode, Sensor requirement, threshold, and budget policy |
| `config/project-health/authority-policy.json` | workspace scanner 未表达的补充 authority rules；不得复制 workspace edge debt |
| `config/project-health/supply-chain-policy.json` | exact package source/license/provider snapshot policy；无自动升级或 waiver |
| `config/project-health/accepted-debt.json` | exact-fingerprint, expiring accepted debt only |
| `scripts/project-health/contracts.ts` | closed DTO types, parsers, canonical ordering, hashes |
| `scripts/lib/workspace-boundary-contract.ts` | neutral shared workspace graph/evidence/violation DTO and parser owner |
| `scripts/project-health/process-runner.ts` | 唯一 bounded/redacted external execution envelope 与 cooperative owned-process cleanup owner |
| `scripts/project-health/registry.ts` | Sensor ID → implementation registry; no command strings in JSON |
| `scripts/project-health/evidence-store.ts` | content-addressed local evidence and path redaction |
| `scripts/project-health/sensors/workspace-boundary.ts` | adapts the existing workspace graph/violation/debt Owner only |
| `scripts/project-health/sensors/supplemental-authority.ts` | Scene Source/dual-owner/compat supplemental rules only |
| `scripts/project-health/sensors/contract-parity.ts` | generated/dependency/contract owner evidence |
| `scripts/project-health/sensors/supply-chain.ts` | lock/provenance/license plus snapshot-bound vulnerability evidence |
| `scripts/project-health/sensors/test-topology.ts` | existing census + change-impact evidence |
| `scripts/project-health/sensors/runtime-health.ts` | registered lifecycle/determinism probes |
| `scripts/project-health/sensors/performance-size.ts` | static size and runner-bound performance evidence |
| `scripts/project-health/sensors/visual-evidence.ts` | existing capture/Golden evidence |
| `scripts/project-health/sensors/documentation-truth.ts` | links, commands, task IDs, and status claims |
| `scripts/project-health/sensors/independent-review.ts` | exact-tree review receipt and Host disposition |
| `scripts/project-health/change-impact.ts` | changed-path/dependency/capability → required Gate plan |
| `scripts/project-health/report.ts` | dedupe, debt application, policy, stable report |
| `scripts/project-health/cli.ts` | check/explain/update-baseline command parsing and exit mapping |
| Co-located test files enumerated in PHO-0A through PHO-7 | contract, sensor, integration, cleanup, CLI, and workflow regressions |
| `.github/workflows/project-health-nightly.yml` | heavy isolated Nightly run and artifact upload |
| `.github/workflows/project-health-release.yml` | manual exact-SHA Release health report; never publishes product artifacts |
| `.github/workflows/ci.yml` | PR/main-push fast health entry; existing fact-owner steps remain explicit |
| `package.json` | stable `health:*` developer commands |

## Requirement traceability

| Requirement | Design authority | Implementation tasks | Acceptance evidence |
|---|---|---|---|
| One repository-health contract without a second product validator | §1、§3、§4 | PHO-0A、PHO-6 | closed parser corpus; `ValidationReportV1` boundary review |
| One workspace graph/evidence DTO owner plus supplemental authority rules | §3、§4.5、§5.1 | PHO-0A、PHO-1 | graph/receipt/debt identity and dual-owner fixtures |
| Contract/generated/dependency/supply-chain drift | §5.2、§5.3 | PHO-0B、PHO-2 | exact receipt, dirty-tree, provenance/license/provider-snapshot fixtures |
| Test census and change-impact completeness | §5.4 | PHO-1、PHO-3、PHO-7 | changed-path matrix, exact head/base, one-execution workflow assertions |
| Runtime lifecycle, cleanup, isolation, and determinism | §5.5 | PHO-0B、PHO-4 | repeated create/reset/dispose, throws, cadence, double-Candidate fixtures |
| Performance, visual, documentation, and independent review evidence | §5.6–§5.9 | PHO-5 | frozen/advisory threshold, stale evidence, link/status, disposition fixtures |
| Stable policy, debt, trend, and explainability | §4.4–§4.6、§7–§8 | PHO-0A、PHO-6 | standalone baseline, Metric snapshot, cap/expiry, exit/explain fixtures |
| Exact-tree PR/Nightly/Release orchestration | §6、§9 | PHO-0B、PHO-3、PHO-6、PHO-7 | workflow layout, bounded dry runs, artifact and clean-tree receipts |
| Final adversarial adoption with no open P0/P1/P2 | §10–§11 | PHO-8 | D1–D6 review, Cursor/Codex receipts, backlog/doc truth update |

---

### Task 1: PHO-0A — Freeze contracts, profile, authority/supply-chain policy, and debt format

**Files:**
- Create: `scripts/project-health/contracts.ts`
- Create: `scripts/project-health/contracts.test.ts`
- Create: `scripts/lib/workspace-boundary-contract.ts`
- Create: `scripts/lib/workspace-boundary-contract.test.ts`
- Create: `config/project-health/profile.json`
- Create: `config/project-health/authority-policy.json`
- Create: `config/project-health/supply-chain-policy.json`
- Create: `config/project-health/accepted-debt.json`
- Modify: `.gitignore`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: canonical JSON/hash helpers already owned by `@whitebox-world/protocol` when public; otherwise the existing repository-local canonical helper used by verifier scripts.
- Produces: `parseProjectHealthProfileV1`, `parseProjectHealthObservationV1`, `parseProjectHealthReportV1`, `projectHealthFindingFingerprintV1`, and current JSON fixtures consumed by every later task.

- [x] **Step 1: Write parser and fingerprint RED tests**

```ts
it("rejects an observation containing an absolute path", () => {
  expect(() => parseProjectHealthObservationV1({
    ...VALID_OBSERVATION,
    evidenceRefs: ["file:///Users/example/private.log"],
  })).toThrow(/stable evidence reference/i);
});

it("fingerprints equivalent subjects independently of input order", () => {
  expect(projectHealthFindingFingerprintV1({
    ...VALID_FINDING,
    subjectRefs: ["package:b", "package:a"],
  })).toBe(projectHealthFindingFingerprintV1({
    ...VALID_FINDING,
    subjectRefs: ["package:a", "package:b"],
  }));
});

it("does not fingerprint evidence bytes or their ordering", () => {
  expect(projectHealthFindingFingerprintV1({
    sensorId: "contract-parity",
    code: "PROJECT_HEALTH_GENERATED_DRIFT",
    subjectRefs: ["package:builder"],
    evidenceClassIds: ["generated-byte-parity"],
  })).toBe(EXPECTED_CANONICAL_FINGERPRINT);
});
```

Also reject absolute workspace paths, backslashes, empty/`.`/`..` path segments and repository escapes. Assert that
all 49 current workspace debts preserve the exact
`sha256CanonicalJson({ importer, specifier, owner })` fingerprint and that adding `reason` or `removalGate` changes no
identity because those fields are excluded before hashing.

- [x] **Step 2: Run the focused RED test**

Run: `pnpm exec vitest run scripts/project-health/contracts.test.ts scripts/lib/workspace-boundary-contract.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the closed current-only DTOs**

Implement discriminated parsers for Profile, Metric, Finding, Observation, Gate Plan, Gate Receipt, Dependency Inventory, Independent Review Receipt, Accepted Debt, and Report. Implement the neutral `WorkspaceBoundaryViolationV1`, `WorkspaceDependencyGraphV1`, and `WorkspaceBoundaryEvidenceV1` parser in `scripts/lib/workspace-boundary-contract.ts`; Project Health imports it instead of copying it. Every workspace path is repo-relative POSIX; only the root Package `rootPath` may be `"."`, and the parser rejects machine paths or traversal elsewhere. Fingerprint Findings exactly as `sensorId + code + sorted unique subjectRefs + sorted unique evidenceClassIds` with `sha256CanonicalJson`; fingerprint workspace debt exactly as `{ importer, specifier, owner }`; exclude evidence bytes, metric values, mode, policy, text, time, explanatory debt fields, and machine paths. Reject unknown keys, non-content-addressed evidence, invalid SHA-256/modes, blocking debt, invalid `YYYY-MM-DD`, empty cap maps, cap-kind mismatch, non-finite/negative/unsafe-integer caps, ratio over 1, or caps over the Profile maximum. Require `capabilitySelectorsById` and `capabilityGateIdsById` to share the exact closed capability key set. Reject a capability without selector entries, or any individual selector entry that does not match at least one path or Workspace Package in the exact implementation tree, with `PROJECT_HEALTH_CAPABILITY_SELECTOR_EMPTY`; add RED fixtures for dead `packages/studio/` and another genuinely absent path so an invalid predeclared selector cannot silently survive beside valid entries. The current BNA tree owns real files under `scripts/native-scene/`, so include that directory in `native-scene-experimental`. Require `metricsBySensorId` to equal the selected Observation Metric closure, every Finding metric ID to resolve in its Sensor map, and `debtStatesByFingerprint` to have the exact current Finding key set. Expiry is evaluated against Report `evaluatedOn` with the expiry date itself still valid. Do not export aliases.

- [x] **Step 4: Add the single current configuration**

`profile.json` must freeze the complete initial Sensor set; PR/Nightly/Release Required/Advisory Sensor and per-Sensor Gate IDs; Metric thresholds/not-applicable rules; `sensorId + finding code → policy`; canonical Sensor input selectors; the exact path/Package→capability selectors and capability→Gate edges from the design; runner profiles; accepted-debt cap ceilings; budgets; and artifact retention. Capability selector and Gate maps must have the same exact key set; selector entries use only closed repo-relative paths/prefixes/suffixes and Package IDs, and every selector must match the exact implementation tree at freeze time. Use `apps/studio/` plus `@whitebox-world/studio` for Studio; do not retain the nonexistent `packages/studio/` path. Include the real BNA Owner `scripts/native-scene/` in the Native selector. The parser requires exact key closure and every referenced runner/Sensor to exist in the Profile; PHO-6 Registry integration later validates every Gate ID and Profile-derived Finding policy. `authority-policy.json` contains only supplemental Scene Source/dual-owner/compat rules and an empty sorted exception set; it must not copy workspace boundary edges or their 49-item debt ledger. `supply-chain-policy.json` freezes accepted source/license/provider IDs without package-version waivers or update commands. `accepted-debt.json` starts as a valid empty list. Add `.project-health/` to `.gitignore`.

- [x] **Step 5: Verify and commit**

Run: `pnpm exec vitest run scripts/project-health/contracts.test.ts scripts/lib/workspace-boundary-contract.test.ts && pnpm test:census && pnpm typecheck && git diff --check`

Commit: `feat: add project health contracts`

---

### Task 2: PHO-0B — Add the single bounded execution envelope

**Files:**
- Create: `scripts/project-health/process-runner.ts`
- Create: `scripts/project-health/process-runner.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: closed Host-owned argv/probe descriptors later registered without translation by PHO-6, plus explicit timeout/output budgets.
- Produces: redacted, bounded, content-addressed execution evidence with deterministic status and cooperative owner-token process cleanup.

- [x] **Step 1: Write RED fixtures** for timeout, inherited-owner descendant escape, output truncation, credential/path redaction, signal exit, setup/cleanup throw, repository-state mutation including ignored-root residue, concurrent runner infrastructure, fingerprint budget overflow, symlinked/swapped infrastructure parents, invalid execution scope, and isolation cleanup.
- [x] **Step 2: Run RED:** `pnpm exec vitest run scripts/project-health/process-runner.test.ts`.
- [x] **Step 3: Implement one runner** without a shell. A closed descriptor selects `in-place-checkout` for registered trusted PR Gate commands or `isolated-temp-worktree` for dynamic probes; both use a temporary output root, cap stdout/stderr, cooperatively terminate token-owning descendants in `finally`, and never retry a failed or timed-out command silently. Every descriptor requires `descendantOwnershipMode: "inherit-owner-token"`; registered Owners must preserve the injected token for all descendants and must not create tokenless sessions. The first scope hashes tracked, untracked, and non-infrastructure ignored-root repository state before/after under a separate 5-second/8-MiB/4096-entry budget; `.project-health/runs` and `.project-health/worktrees` are Registry-owned infrastructure roots so concurrent executions do not contaminate each other. Repository and every infrastructure/temporary directory require canonical non-symlink identity, revalidated by device/inode before cleanup. The second scope proves worktree removal. Setup, fingerprint, execution, and cleanup failures all publish closed Evidence. This envelope is not an OS sandbox for malicious code: any Probe requiring arbitrary-write containment must use the existing Hosted/container isolation boundary. Formal local profiles are Linux/macOS only.
- [x] **Step 4: Register the test immediately** in `TEST_GATE_MANIFEST_V1`; run its focused test and the existing census.
- [x] **Step 5: Verify and commit:** run the focused test, census, `pnpm typecheck`, and `git diff --check`.

Commit: `feat: add project health execution envelope`

---

### Task 3: PHO-1 — Extend the existing graph Owner and implement two authority Sensors

**Files:**
- Create: `scripts/project-health/sensors/workspace-boundary.ts`
- Create: `scripts/project-health/sensors/workspace-boundary.test.ts`
- Create: `scripts/project-health/sensors/supplemental-authority.ts`
- Create: `scripts/project-health/sensors/supplemental-authority.test.ts`
- Create: `scripts/project-health/workspace-boundary-adapter.ts`
- Create: `scripts/project-health/workspace-boundary-adapter.test.ts`
- Modify: `scripts/lib/workspace-boundary.ts`
- Create: `scripts/lib/workspace-boundary.test.ts`
- Modify: `scripts/testing/verify-workspace-boundaries.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: the existing scan/reconcile implementation in `scripts/lib/workspace-boundary.ts`, `config/workspace-boundary-debt.json`, and the frozen supplemental Authority Policy.
- Produces: the same Owner's closed `WorkspaceBoundaryEvidenceV1` plus separate `workspace-boundary` and `supplemental-authority` Observations for PHO-3/6; no third Sensor ID and no second dependency scanner.
- Scan contract: `scanWorkspaceBoundaries({ repositoryRoot, commitSha }) → WorkspaceBoundaryEvidenceV1`. Delete the violations-only signature. Host/`health:record` injects `commitSha`; the scanner must not spawn Git. One TypeScript walk projects graph edges and `publicSymbols`; Sensors never rescan.

- [x] **Step 1: Current-only Evidence and Authority Policy break**

Require `publicSymbols` on `WorkspaceBoundaryEvidenceV1`, unique graph/public-symbol integrity, and Host-injected 40-hex `commitSha`. Replace Authority Policy `subjectRefs` / `forbidden-owner-pair` with exact path/package selectors and `forbidden-public-symbol` / `unique-public-symbol-owner` / `forbidden-public-symbol-pair`. Reject glob/regex selectors. Do not change `scanWorkspaceBoundaries` in this step.

Run: `pnpm exec vitest run scripts/lib/workspace-boundary-contract.test.ts scripts/project-health/contracts.test.ts && pnpm test:census && pnpm typecheck && git diff --check`

Commit: `feat: project public-symbol authority facts`

- [ ] **Step 2: Write graph and authority Sensor RED fixtures**

Cover preservation of existing workspace edge/debt identities, wrong-tree Receipt, duplicate parser owner, Canonical/Native Scene Source leakage, public compat alias, and a lawful provider adapter import. Each failure asserts stable code, Owner, subject refs, evidence class, and fingerprint. Sensors consume `publicSymbols` from Evidence; they must not call `rg`, glob, or a second AST.

- [ ] **Step 3: Run RED**

Run: `pnpm exec vitest run scripts/lib/workspace-boundary.test.ts scripts/project-health/workspace-boundary-adapter.test.ts scripts/project-health/sensors/workspace-boundary.test.ts scripts/project-health/sensors/supplemental-authority.test.ts`

Expected: FAIL with missing implementation.

- [ ] **Step 4: Adapt the existing normalized repository graph**

Extend `scripts/lib/workspace-boundary.ts` itself so one scan returns canonical `WorkspaceBoundaryEvidenceV1`: violations, a sorted full dependency graph, sorted `publicSymbols`, and reconciled debt fingerprints. Keep all manifest/import/export/cycle/debt decisions in that Owner and update the existing verifier to consume that result. Accept only `WorkspaceBoundaryScanRequestV1`; do not read `HEAD` from Git. `health:record` owns the exact-head Receipt and points `evidenceRef` at those bytes; the adapter and both Sensors only load/validate that evidence and never parse manifests/imports again. The 49 reconciled edge debts remain only count/identity Metrics and evidence, never PHO Findings or accepted debt.

- [ ] **Step 5: Apply authority rules without heuristic blocking**

Keyword searches for `compat`, `legacy`, or `V2` always begin as `advisory-p3` derived from the same `publicSymbols` collection. Only an exact supplemental forbidden rule may emit `blocking-p1`; the exception set only declares exact lawful symbols. Keep provider-specific Babylon/Havok types behind existing adapter boundaries.

- [ ] **Step 6: Verify and commit**

Run: `pnpm exec vitest run scripts/lib/workspace-boundary.test.ts scripts/project-health/workspace-boundary-adapter.test.ts scripts/project-health/sensors/workspace-boundary.test.ts scripts/project-health/sensors/supplemental-authority.test.ts && pnpm test:census && pnpm typecheck && git diff --check`

Commit: `feat: detect architecture authority drift`

---

### Task 4: PHO-2 — Adapt contract parity and supply-chain evidence

**Files:**
- Create: `scripts/project-health/sensors/contract-parity.ts`
- Create: `scripts/project-health/sensors/contract-parity.test.ts`
- Create: `scripts/project-health/sensors/supply-chain.ts`
- Create: `scripts/project-health/sensors/supply-chain.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: PHO-0B execution envelope plus existing clean-break verifiers, generated Builder check, dependency/patch identity gates, and read-only owner command descriptors.
- Produces: separate `contract-parity` and `supply-chain` Observations whose evidence hashes bind exact command,
  exit, stable diagnostic, provider snapshot identity, and tracked-tree cleanliness.

- [ ] **Step 1: Write contract-parity RED tests**

```ts
it("reports incomplete when owner evidence records a tracked-tree mutation", async () => {
  const observation = await runContractParitySensorV1(FIXTURE_MUTATING_OWNER_EVIDENCE);
  expect(observation.status).toBe("incomplete");
  expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_OWNER_COMMAND_DIRTY_TREE");
});
```

Also cover a timeout receipt, stale tree/input/command identity, stable exit mapping, generated-byte drift, and a passing read-only verifier. Supply-chain fixtures cover a malformed or stale `dependency-inventory` Receipt, missing provenance, forbidden license, unavailable advisory provider, stale snapshot, and a version-bound advisory. Undeclared workspace imports are tested only in PHO-1. PHO-0B owns the process cleanup/output truncation mechanics.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/project-health/process-runner.test.ts scripts/project-health/sensors/contract-parity.test.ts scripts/project-health/sensors/supply-chain.test.ts`

- [ ] **Step 3: Implement mode-specific evidence adaptation**

In `pr`, only validate exact-head Receipts produced by the preceding `health:record` steps; never invoke an owner. In `nightly`/`release`, missing selected evidence may be produced once from a closed Host descriptor through PHO-0B. Register one immutable `dependency-inventory` argv descriptor backed by `pnpm licenses list --json`; this is the npm/pnpm declared-closure Owner, while `contract-parity` remains the only lock/install/patch byte-identity Owner. Project the pnpm output into the frozen Dependency Inventory DTO, sort/dedupe exact package/version/license entries, and drop raw `paths`, author, description, homepage and order before hashing; RED fixtures use different absolute install roots with byte-identical projected evidence. Supply-chain online evidence additionally binds provider ID, database snapshot date/hash, package name and exact version. Provider unavailability follows the mode-specific Profile rule: Advisory `incomplete` in PR/Nightly, and the explicit Release `not-applicable` reason plus a retained Advisory Finding; it is never a clean bill of health. PHO-6 later registers the same closed set. Neither Sensor may spawn, parse the lockfile independently, implement its own timeout, redact logs, or clean owned processes.

- [ ] **Step 4: Register existing fact owners**

Adapt `check:agent-self-check`, current clean-break verifiers, dependency/patch identity tests, artifact owner check modes, and a closed license/provenance policy. Workspace boundaries belong exclusively to PHO-1 and test census belongs exclusively to PHO-3. Online advisories remain Supply Chain evidence and never modify dependencies or waivers. Do not translate domain errors beyond stable status/code/evidence fields.

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec vitest run scripts/project-health/process-runner.test.ts scripts/project-health/sensors/contract-parity.test.ts scripts/project-health/sensors/supply-chain.test.ts && pnpm test:census && pnpm typecheck && git diff --check`

Commit: `feat: observe contract and supply-chain parity`

---

### Task 5: PHO-3 — Add Test Topology and Change Impact planning

**Files:**
- Create: `scripts/project-health/change-impact.ts`
- Create: `scripts/project-health/change-impact.test.ts`
- Create: `scripts/project-health/sensors/test-topology.ts`
- Create: `scripts/project-health/sensors/test-topology.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: `TEST_GATE_MANIFEST_V1`, PHO-1 repository graph evidence, a PHO-0B Registry-owned Git
  base/head diff descriptor, and Profile `capabilityGateIdsById`.
- Produces: `ProjectHealthGatePlanV1` plus a Test Topology Observation used by PHO-6/7.

- [ ] **Step 1: Write RED impact fixtures**

Cover a package-local source edit, public contract edit, runtime authority edit, Browser protocol edit, Vite/build edit, visual verifier edit, docs-only edit, new unregistered test, evidence recorded against an older tree, and PR checkout at a merge SHA instead of `pull_request.head.sha`.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/project-health/change-impact.test.ts scripts/project-health/sensors/test-topology.test.ts`

- [ ] **Step 3: Implement deterministic impact closure**

Resolve/fetch Git identities and diff only through PHO-0B's registered argv descriptor, then expand changed paths through reverse workspace dependencies and explicit capability edges. Return stable Gate IDs, reasons, input fingerprints, and evidence classes. Never spawn Git locally inside the Sensor or infer visual/manual completion from a unit test.

For mode `M`, place only the intersection with that mode's Profile Required Gate union in `requiredGateIds`; place every
other registered affected Gate in `advisoryGateIds`. The sets are sorted, disjoint, and exhaustive. A Browser/visual/Native
change in PR therefore recommends its Nightly/Release gate without requiring a Receipt the PR workflow cannot produce.
Use only the closed capability keys from the design; unknown capability edges fail closed instead of inventing a category.

- [ ] **Step 4: Enforce test census and evidence freshness**

Reuse the existing census result rather than scanning with a second classifier. Reject a required Gate receipt whose tree or input fingerprint differs from the planned inputs; classify docs-only edits without scheduling Runtime replay.

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec vitest run scripts/project-health/change-impact.test.ts scripts/project-health/sensors/test-topology.test.ts && pnpm test:census && pnpm typecheck && git diff --check`

Commit: `feat: plan project health gates by impact`

---

### Task 6: PHO-4 — Add Runtime lifecycle and determinism probes

**Files:**
- Create: `scripts/project-health/sensors/runtime-health.ts`
- Create: `scripts/project-health/sensors/runtime-health.test.ts`
- Create: `scripts/project-health/runtime-probe-registry.ts`
- Create: `scripts/project-health/runtime-probe-registry.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: explicitly registered existing Runtime/Browser verifiers and owner-provided count/snapshot probes.
- Produces: lifecycle/determinism Observations; no direct Babylon/Havok assumptions outside verified probes.

- [ ] **Step 1: Write RED lifecycle fixtures**

Create fake probes for clean three-cycle create/reset/dispose, leaked Observable, leaked Timer, partial-construction throw with complete cleanup, cleanup throw with remaining owners, cadence-equivalent snapshots, and mismatched duplicate Candidate hashes.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/project-health/runtime-probe-registry.test.ts scripts/project-health/sensors/runtime-health.test.ts`

- [ ] **Step 3: Implement registered probe execution**

Run every probe in isolation, require before/after owner snapshots, preserve cleanup failure as evidence, and forbid GC heap deltas from independently creating Blocking Findings. Read installed Babylon/Havok source before adding an engine-specific owner counter.

- [ ] **Step 4: Register existing probes incrementally**

Start only with already-production RuntimeHost lifecycle, Browser ready/reset, and fixed-cadence verifiers. BNA Candidate
replay/cleanup remains an Advisory registered probe outside the first Required Profile until the BNA production design
reaches GO; at that point update the one current Profile and Registry together, without retaining both sets. Each adapter
binds its current command/test identity; it does not copy runtime logic.

- [ ] **Step 5: Verify and commit**

Run focused probe tests, the exact registered affected verifier tests, `pnpm test:census`, `pnpm typecheck`, and `git diff --check`.

Commit: `feat: observe runtime lifecycle and determinism`

---

### Task 7: PHO-5 — Add performance, visual, documentation, and review sensors

**Files:**
- Create: `scripts/project-health/sensors/performance-size.ts`
- Create: `scripts/project-health/sensors/performance-size.test.ts`
- Create: `scripts/project-health/sensors/visual-evidence.ts`
- Create: `scripts/project-health/sensors/visual-evidence.test.ts`
- Create: `scripts/project-health/sensors/documentation-truth.ts`
- Create: `scripts/project-health/sensors/documentation-truth.test.ts`
- Create: `scripts/project-health/sensors/independent-review.ts`
- Create: `scripts/project-health/sensors/independent-review.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: build manifests, runner profile, existing screenshot/overlay/anchor outputs, Markdown links/status anchors, and exact-SHA independent review receipts.
- Produces: four independent Observations; heuristic AI/visual/online data remains Advisory until an exact Profile metric freezes it.

- [ ] **Step 1: Write RED fixtures**

Cover static bundle over-budget, cross-runner performance mismatch, stale visual tree identity, missing renderer profile, failed frozen pixel metric, broken doc link, Proposed/Implemented status conflict, AI review wrong SHA, AI timeout, and a Host-confirmed AI P1.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/project-health/sensors/{performance-size,visual-evidence,documentation-truth,independent-review}.test.ts`

- [ ] **Step 3: Implement stable adapters**

Use content hashes and normalized metric values. Do not store screenshots inside JSON, compare hardware metrics across runner profiles, execute AI output as instructions, or treat an AI GO as pass evidence.

- [ ] **Step 4: Validate the PHO-0A advisory/blocking policy**

Static size budgets and machine-confirmed doc/link contradictions may block. Dynamic performance trends, VLM assessments, online vulnerability lookups, and unreproduced AI findings remain Advisory/Incomplete according to the spec.

- [ ] **Step 5: Verify and commit**

Run all four focused test files, `pnpm test:census`, `pnpm typecheck`, and `git diff --check`.

Commit: `feat: add project health evidence sensors`

---

### Task 8: PHO-6 — Create Registry, receipt producer, report aggregation, and check/explain CLI

**Files:**
- Create: `scripts/project-health/report.ts`
- Create: `scripts/project-health/report.test.ts`
- Create: `scripts/project-health/evidence-store.ts`
- Create: `scripts/project-health/evidence-store.test.ts`
- Create: `scripts/project-health/cli.ts`
- Create: `scripts/project-health/cli.test.ts`
- Create: `scripts/project-health/registry.ts`
- Create: `scripts/project-health/registry.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)
- Modify: `package.json`

**Interfaces:**
- Consumes: all registered Observations, Profile, accepted debt, exact tree SHA, and optional baseline Report.
- Produces: canonical `ProjectHealthReportV1`, content-addressed evidence bundle, `health:record/pr/nightly/release/explain`, and fixed exit codes.

- [ ] **Step 1: Write RED policy and CLI tests**

Assert Fingerprint dedupe, evidence union, Required incomplete precedence, Required failed propagation, Blocking failure, Advisory non-blocking behavior, exact Finding-to-Metric closure, standalone baseline regression/improvement/Profile-mismatch comparison, exact debt policy/typed-metric-cap/same-day/next-day expiry matching, persisted current-Finding debt state, trusted-clock evaluation, Profile-derived Finding policy, registered suggested Gate IDs, no Blocking suppression, stable ordering, redaction, exit 0/1/2/3, exact-head Receipt rejection, pending-review incomplete, explain selection by fingerprint, and sole-writer baseline update rejection on stale identity.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run scripts/project-health/report.test.ts scripts/project-health/evidence-store.test.ts scripts/project-health/cli.test.ts`

- [ ] **Step 3: Implement aggregation and storage**

Hash validated Observations before aggregation, dedupe only by canonical Fingerprint, retain every evidence ref, persist the complete selected Sensor Metric maps plus exact current Finding debt states, and compute new/resolved/unchanged/improved/regressed from a standalone baseline Report with the same Profile and Sensor implementation identity. Requested baseline identity mismatch makes the Report incomplete and leaves the change map null. Bind `evaluatedOn` from the trusted Host clock (injectable only through test internals), and write output atomically under `.project-health/`.

- [ ] **Step 4: Implement commands**

Add:

```json
{
  "health:pr": "tsx scripts/project-health/cli.ts check --mode pr",
  "health:nightly": "tsx scripts/project-health/cli.ts check --mode nightly",
  "health:release": "tsx scripts/project-health/cli.ts check --mode release",
  "health:record": "tsx scripts/project-health/cli.ts record",
  "health:explain": "tsx scripts/project-health/cli.ts explain",
  "health:update-baseline": "tsx scripts/project-health/cli.ts update-baseline"
}
```

`health:record --gate <registered-id> --commit <sha> --output <receipt>` admits only a trusted descriptor with `descendantOwnershipMode: "inherit-owner-token"`, then invokes that exact owner command once through PHO-0B and atomically writes a Receipt. No production entry may call the runner without Registry admission. `health:update-baseline` is the sole tracked-baseline writer and rejects a Report whose commit/profile/evidence identity differs. Reject a moving Release branch without `--commit`; require explicit output; make every check mode read-only and reject an `--update-baseline` flag.

- [ ] **Step 5: Verify and commit**

Run the Registry plus three focused test files, `pnpm test:census`, `pnpm typecheck`, fixture
`health:record/health:pr/health:explain/health:update-baseline` commands, a check-mode clean-tree assertion, and
`git diff --check`.

Commit: `feat: add project health report cli`

---

### Task 9: PHO-7 — Integrate PR, Nightly, and Release execution

**Files:**
- Create: `.github/workflows/project-health-nightly.yml`
- Create: `.github/workflows/project-health-release.yml`
- Create: `scripts/project-health/workflow-layout.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/lib/test-gate-manifest.ts` (main-agent integration step only)

**Interfaces:**
- Consumes: `health:*` commands and current CI setup.
- Produces: exact-tree PR summary, Nightly evidence artifact, manual Release report, and fail-closed workflow status.

- [ ] **Step 1: Write workflow/census RED tests**

Add repository-layout assertions that every Project Health test is in the correct lane, PR explicitly checks out/passes `pull_request.head.sha`, main push binds event `after`/`before`, both fetch and verify sufficient base ancestry, use base only for impact, record each owner gate exactly once, Nightly uploads `.project-health/**`, Release requires exact SHA, and no workflow uses `--update-baseline`.

- [ ] **Step 2: Run RED**

Run the focused repository-layout/census tests; expect missing workflow/manifest entries.

- [ ] **Step 3: Wire PR without duplicating existing fact owners**

Replace each current direct fact-owner step with one `health:record` wrapper around the same Registry-owned command. Split the current aggregate `pnpm test` CI step into its existing four component commands so each executes once and gets a separate Receipt. Then run `health:pr` over those exact-head Receipts plus the four deterministic static Sensor families. It must not rerun any owner command or call network/AI/dynamic Runtime work. Keep every owner step explicit in CI.

- [ ] **Step 4: Add bounded Nightly and manual Release workflows**

Nightly uses concurrency cancellation, fixed runner profile, explicit timeout, artifact upload, and clean process/tree checks. Release is `workflow_dispatch` with a required immutable SHA and no automatic publication. PR checkout uses `ref: ${{ github.event.pull_request.head.sha }}` plus explicit fetch of the base ref followed by merge-base verification; main push uses exact event `after`/`before` and verifies ancestry. Measure the exact-head dry-run overhead and encode it in the Profile while keeping the PR job within the existing 20-minute timeout; if it does not fit, reduce PR Sensor scope instead of silently raising the timeout.

- [ ] **Step 5: Verify and commit**

Run workflow structure tests, test census, `pnpm typecheck`, `git diff --check`, then execute one fresh PR-mode, one
manual Nightly-mode, and one non-publishing Release-mode dry run on exact clean trees.

Commit: `ci: add project health observatory modes`

---

### Task 10: PHO-8 — Adversarial acceptance, independent review, and adoption

**Files:**
- Create: `docs/reviews/YYYY-MM-DD-project-health-observatory-review.md`
- Create: `config/project-health/baseline.json` through `health:update-baseline` only
- Modify: `docs/superpowers/specs/2026-08-30-project-health-observatory-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md` only if the command is accepted for ordinary contributors

**Interfaces:**
- Consumes: final exact-SHA PR/Nightly reports, adversarial fixtures, Codex self-review, Cursor Cloud review, and D1–D6 protocol.
- Produces: scoped GO/NO-GO, closed findings, current status, and truthful adoption docs.

- [ ] **Step 1: Run the adversarial corpus**

Inject each acceptance defect from the spec in isolated fixtures and prove stable Findings. Run lawful fresh-object/provider/debt/visual-trend fixtures to prove no overblocking.

- [ ] **Step 2: Run final affected gates once**

Run `pnpm install --frozen-lockfile`, Project Health focused tests, `pnpm typecheck`, `pnpm test:independent`, root
`pnpm test`, `pnpm build`, `health:pr`, `health:nightly`, non-publishing `health:release`, `git diff --check`, and
clean-tree assertion. Add Browser/visual gates only when implementation changes their inputs.

- [ ] **Step 3: Request independent exact-SHA review**

Cursor Cloud and Codex must review the current tree against the spec and D1–D6, including false-positive pressure, timeout/cleanup, evidence freshness, credential redaction, and the boundary with `ValidationReportV1`. Every finding is reproduced/dispositioned; AI output alone is not gate evidence.

- [ ] **Step 4: Update truth documents**

After the exact-tree GO, create `baseline.json` only through `health:update-baseline`, inspect its diff, then mark only
implemented PHO tasks complete, link the review/report evidence, and retain explicit limitations. Do not raise unrelated
BNA/BWB/Runtime completion percentages.

- [ ] **Step 5: Commit, PR, and merge**

Run final link/claim inspection and `git diff --check`; commit `docs: close project health observatory`; create a PR, wait for exact-tree CI, merge only with no open P0/P1/P2, then verify `origin/main` contains the merge.

## Self-review checklist

- [ ] Every requirement in the spec maps to PHO-0A、PHO-0B、PHO-1..8.
- [ ] No task introduces a second product Validation, test census, Schema parser, hash owner, Golden updater, or Runtime authority.
- [ ] All public names and file paths are consistent across tasks.
- [ ] No placeholder, broad suppression, automatic repair, or silent retry remains.
- [ ] PR/Nightly/Release evidence is scoped to exact inputs and exact tree.
- [ ] Heavy work stays outside the normal PR budget unless it is a deterministic required gate.

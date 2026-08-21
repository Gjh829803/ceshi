# Validation Capture/Integrity V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every production change follows RED-GREEN-REFACTOR.

**Goal:** Deliver milestone M4's narrow vertical slice: one versioned Validation Profile converts the existing Control Capture Bundle verifier and a focused Linear Depth semantic check into a canonical, hashable, explainable Validation Report whose blocking failures cannot be hidden by advisory results.

**Status:** Complete on 2026-08-21. Capture/Integrity V1 is implemented; broader P0.3 work remains open in `docs/18-refactor-progress-and-backlog.md`.

**Architecture:** `@whitebox-world/validation` owns engine-neutral public contracts, strict validation, canonical hashing, the built-in Profile, and pure policy evaluation. A Node-only adapter owns filesystem evidence collection and delegates Bundle truth to the existing `validateControlCaptureBundleV1`; it adds only the missing Linear Depth value check. `worldkit` writes the authoritative report beside, never inside, the immutable Bundle. No Babylon/Havok runtime or Authoring Schema path changes in this slice.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, canonical SHA-256, lodash-es, Node filesystem CLI.

**Spec:** `docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md`, section 4.0.

## Frozen scope and authority

- Subject kind is exactly `control-capture-bundle`.
- Built-in Profile Ref is exactly `worldkit://validation-profile/outdoor-control-video-dev@1`.
- Gates are exactly `capture-bundle-integrity`, `capture-completeness`, and `capture-ownership`.
- Bundle structure, manifest/frame/root Hash, pass presence, ID tables, schedule, and ownership delegate to `validateControlCaptureBundleV1`.
- The adapter independently checks only Linear Depth byte length and values: one little-endian float32 per pixel, finite, `0` for no hit, otherwise greater than `0` meters.
- Report output is a separate file supplied by `--output`; the Bundle remains byte-for-byte unchanged.
- No Profile composition, Layout/Physics/Composition integration, Browser protocol, compare command, video adapter, replay/resume, terrain, subject, asset, animation, camera, or movement changes.

---

### Task 1: Freeze and test the engine-neutral Validation contract

**Files:**
- Create: `packages/validation/package.json`
- Create: `packages/validation/src/types.ts`
- Create: `packages/validation/src/profile.ts`
- Create: `packages/validation/src/policy.ts`
- Create: `packages/validation/src/validate.ts`
- Create: `packages/validation/src/index.ts`
- Create: `packages/validation/src/validation.test.ts`
- Modify: `pnpm-lock.yaml`

- [x] Write RED tests for strict Profile/Report discriminators, unknown fields, malformed hashes, map-key/inner-ID mismatch, unknown metric kinds, and inconsistent derived status.
- [x] Write RED policy tests proving one Blocking Failure wins over Advisory success, Advisory Failure cannot fail an otherwise complete report, and a missing/not-evaluated Required Metric yields `incomplete`.
- [x] Write RED hash tests proving canonical key order does not change the Profile/Report Hash while a Gate, result, or evidence change does.
- [x] Implement the minimal closed V1 types, built-in Profile, pure status derivation, strict parsers, and canonical hash helpers.
- [x] Run `pnpm vitest run packages/validation/src/validation.test.ts`, `pnpm typecheck`, and `git diff --check`.

### Task 2: Adapt Control Capture evidence without duplicating its verifier

**Files:**
- Create: `scripts/lib/control-capture-validation.ts`
- Create: `scripts/lib/control-capture-validation.test.ts`
- Create: `scripts/lib/control-capture-validation-fixture.ts`
- Modify: `package.json`

- [x] Write RED fixtures/tests for a valid Bundle, a missing Required Pass, invalid self-consistently rehashed Linear Depth bytes, a self-consistently rehashed mixed Take, and damaged file/root Hash evidence.
- [x] Implement deterministic actual-directory Bundle Root/size evidence collection and strict Subject identity loading.
- [x] Delegate the existing checks to `validateControlCaptureBundleV1`; map every existing diagnostic code to exactly one Gate and Metric.
- [x] Add the focused Linear Depth semantic evaluator and stable AI-remediable diagnostics.
- [x] Build `ValidationReportV1` through the pure policy layer and prove the Bundle bytes are not modified.
- [x] Run `pnpm vitest run scripts/lib/control-capture-validation.test.ts packages/validation/src/validation.test.ts`, `pnpm typecheck`, and `git diff --check`.

### Task 3: Add `worldkit verify capture` and `verify explain`

**Files:**
- Create: `scripts/lib/validation-cli.ts`
- Create: `scripts/lib/validation-cli.test.ts`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`

- [x] Write RED parser tests for exact positional/option rules, duplicate or missing options, and command separation from legacy `capture validate|inspect`.
- [x] Write RED command tests proving atomic report output, deterministic JSON response fields, exit codes `0/2/3/1`, and explain lookup by exact Gate ID.
- [x] Implement `verify capture` using the one built-in Profile and refusing to overwrite the input Bundle or a directory.
- [x] Implement strict report loading plus machine/human explain output containing Gate, Metric, Evidence, Diagnostic, and suggested fix information.
- [x] Run the focused CLI suites, `pnpm typecheck`, and `git diff --check`.

### Task 4: Add an end-to-end conformance gate

**Files:**
- Create: `scripts/verify-validation-capture.ts`
- Modify: `package.json`

- [x] Write the bounded verifier around a generated two-frame Bundle; do not launch Babylon or Playwright because this layer validates an already produced artifact.
- [x] Prove a valid Bundle passes and emits a re-parseable report.
- [x] Prove missing pass, invalid depth, mixed Take, and damaged Hash each land on their unique expected Gate/Metric/Diagnostic and block.
- [x] Add `pnpm verify:validation-capture` and run it with `pnpm typecheck`, focused tests, and `git diff --check`.

### Task 5: Close docs, perform a full-dimension change review, and integrate

**Files:**
- Modify: `docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md`
- Modify: `docs/00-project-overview.md`
- Modify: `docs/02-sdk-architecture.md`
- Create: `docs/reviews/2026-08-21-validation-capture-integrity-v1-review.md`

- [x] Mark only the Capture/Integrity M4 subset complete; keep Placement, runtime physics/composition, compare, Browser/CI, and production Profile work open.
- [x] Document the public CLI/Profile/Report entry points and the legacy Bundle placeholder distinction.
- [x] Review the exact base-to-head diff in mode B using `docs/reviews/full-dimension-review-protocol.md`; cover required D2/D3/D4/D5/D6 and mark D1 applicability explicitly.
- [x] Run the final matrix: `pnpm typecheck`, `pnpm test`, `pnpm test:scenes`, `pnpm build`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, `pnpm verify:g-bot-subject`, `pnpm verify:control-capture`, `pnpm verify:validation-capture`, and `git diff --check`.
- [ ] Commit, merge into current `main`, rerun the relevant merged-tree gates, push `main`, and remove only this clean merged worktree.

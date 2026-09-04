# Close Prior Design Findings

## Goal

Close the still-actionable findings against `origin/main` at
`af620edb307f9d43a88917c150af7ba71179858c`, preserve the repository's
current-only contract policy, and merge only an exact-SHA verified candidate.

## Work graph

### DF-10 — Clarify Native repair authority

- **Goal:** remove the apparent conflict between same-task self-repair and
  Host-created Native reconstruction Attempts.
- **Deliverable:** aligned repository and Native Builder rules plus a structural
  regression that preserves the distinction.
- **Depends on:** none.
- **Blocks:** DF-70.
- **Ownership:** `AGENTS.md`, Native Builder Skill wording, its structural tests,
  and directly related Native reconstruction design text only.
- **Input/output contract:** the Planner and Canonical Builder remain one task per
  stage; each explicitly admitted Native reconstruction Attempt is a new,
  identity-bearing task, while checker-driven self-repair remains inside that
  task.
- **Integration point:** `scripts/reconstruction/run.ts` Attempt orchestration and
  `scripts/agents/run-codex-task.mjs` task routing.
- **Verification:** Native Builder Skill drift/structure check.
- **Execution mode:** `main-agent-only`.

### DF-20 — Collapse Validation to one current contract

- **Goal:** remove parallel public V1/V2 Validation protocols in this unreleased
  repository.
- **Deliverable:** one schema-version-1 public Validation profile/report family,
  one parser per envelope, one hash entry point, updated consumers and fixtures,
  and deletion of the replaced V2 modules.
- **Depends on:** none.
- **Blocks:** DF-30, DF-70.
- **Ownership:** `packages/validation/**` and Validation-specific consumers under
  `scripts/**`.
- **Input/output contract:** callers use the same envelope kind and
  `schemaVersion: 1`; `subjectKind`/`subject.kind` discriminate capture from
  world-package validation.
- **Integration point:** `@whitebox-world/validation` and the Validation CLI.
- **Verification:** package tests, CLI tests, typecheck, and unreleased clean-break
  verification.
- **Execution mode:** `sequential`.

### DF-30 — Make current-only enforcement part of CI

- **Goal:** ensure stale compatibility contracts cannot silently return.
- **Deliverable:** a passing clean-break verifier and inclusion in the root test
  gate without self-triggering audit literals.
- **Depends on:** DF-20.
- **Blocks:** DF-70.
- **Ownership:** clean-break/parity verification scripts and root `package.json`.
- **Input/output contract:** `pnpm test` invokes
  `pnpm verify:unreleased-clean-break` once.
- **Integration point:** the existing root CI test command.
- **Verification:** clean-break verifier and test-gate census.
- **Execution mode:** `main-agent-only`.

### DF-40 — Restore one fixed-tick commit owner

- **Goal:** delete the duplicated Gameplay commit tail and keep one transaction
  owner for native residency, Physics, committed projections, camera, and tick
  publication.
- **Deliverable:** a single `commitFixedTick` implementation with an explicit
  camera-mode input and a structural migration assertion.
- **Depends on:** none.
- **Blocks:** DF-70.
- **Ownership:** Babylon Runtime fixed-tick orchestration and 3C migration
  verifier only.
- **Input/output contract:** Gameplay and Traversal prepare paths pass an explicit
  commit mode; committed Runtime outputs retain their existing semantics.
- **Integration point:** `runGameplayFixedInputTick` and
  `runTraversalFixedTick`.
- **Verification:** focused Runtime regressions and `pnpm verify:3c-migration`.
- **Execution mode:** `sequential`.

### DF-50 — Separate capture writer input from Runtime protocol identity

- **Goal:** prevent two structurally different types from claiming the same
  serialized frame identity.
- **Deliverable:** an unversioned internal bundle-writer input; the Runtime frame
  remains the sole `worldkit-control-capture-frame` protocol.
- **Depends on:** none.
- **Blocks:** DF-70.
- **Ownership:** capture bundle writer, simulation-take adapter, and focused
  tests.
- **Input/output contract:** the adapter converts a Runtime protocol frame into
  decoded writer data without copying protocol identity fields.
- **Integration point:** `writeControlCaptureBundle`.
- **Verification:** focused capture and simulation-take tests plus typecheck.
- **Execution mode:** `sequential`.

### DF-60 — Replace registered workspace boundary debt

- **Goal:** replace remaining cross-package source imports with explicit package
  subpaths where the dependency is intentional.
- **Deliverable:** stable testing/built-in/application subpaths, migrated imports,
  and removal of resolved debt entries.
- **Depends on:** none.
- **Blocks:** DF-70.
- **Ownership:** affected package exports, import sites, direct dependency
  declarations, and `config/workspace-boundary-debt.json`.
- **Input/output contract:** consumers import only declared package APIs; no
  source-relative package traversal remains for the resolved entries.
- **Integration point:** workspace package export maps and the boundary verifier.
- **Verification:** `pnpm verify:workspace-boundaries` and affected package
  typechecks/tests.
- **Execution mode:** `sequential`.

### DF-70 — Freeze and verify the merge candidate

- **Goal:** integrate all priority fixes and establish local evidence on the final
  tree.
- **Deliverable:** clean branch, focused regressions, relevant structural gates,
  then one full local gate checkpoint.
- **Depends on:** DF-10, DF-20, DF-30, DF-40, DF-50, DF-60.
- **Blocks:** DF-80.
- **Ownership:** integration only; no new feature scope.
- **Input/output contract:** a single commit candidate whose exact SHA is pushed
  unchanged for durable verification.
- **Integration point:** root package gates and Git branch.
- **Verification:** focused checks first; then root test, typecheck, build, and any
  separate Studio gate required by CI exactly once.
- **Execution mode:** `main-agent-only`.

### DF-80 — Exact-SHA durable gate and independent review

- **Goal:** obtain merge evidence independent of the implementation session.
- **Deliverable:** one Cursor Cloud gate result and one separate read-only design
  review tied to the pushed SHA.
- **Depends on:** DF-70.
- **Blocks:** DF-90.
- **Ownership:** read-only Cloud tasks; they must not edit, commit, or open a PR.
- **Input/output contract:** both tasks inspect the same immutable SHA and report
  exact commands/findings.
- **Integration point:** pushed candidate branch.
- **Verification:** upstream SHA equality and returned Cloud task evidence.
- **Execution mode:** `main-agent-only`.

### DF-90 — Merge to main

- **Goal:** integrate only a verified candidate without disturbing the user's
  current checkout artifacts.
- **Deliverable:** candidate merged and pushed to `origin/main`.
- **Depends on:** DF-80 GO evidence.
- **Blocks:** none.
- **Ownership:** Git refs only; user-owned untracked artifacts remain untouched.
- **Input/output contract:** fast-forward or conflict-free integration from the
  verified exact SHA, followed by remote-main confirmation.
- **Integration point:** `origin/main`.
- **Verification:** remote SHA and GitHub Actions status for the merged commit.
- **Execution mode:** `main-agent-only`.

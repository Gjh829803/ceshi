# Gate Authority Closure V1 Implementation Plan

> **Execution:** Implement task-by-task in the main process. All tasks overlap gate or publication authority and are `main-agent-only`.

**Goal:** Make default gates read-only, make artifact updates explicit, close independent Node/Python/Site coverage without duplicate execution, and update the workspace audit with current-tree evidence.

**Architecture:** A tracked generated bundle gets one explicit generator and one temporary byte checker. Browser verifiers share a mode-aware staging finalizer whose default checks inventory and whose explicit update mode performs existing atomic promotion. An independent-test manifest discovers non-Vitest suites and drives one sequential runner. The broken Legacy Site becomes a direct current-state React publication.

**Tech stack:** Node.js 24, TypeScript 5.9, Vitest 3.2, Node test runner, Python unittest, Vinext/Vite, pnpm 10.14.

**Spec:** `docs/superpowers/specs/2026-08-25-gate-authority-closure-v1-design.md`

## Global constraints

- Observe a focused RED before every production behavior change.
- Default checks and verifiers must not write tracked files.
- Preserve the existing two Vitest lanes and do not add default coverage runs.
- Do not restore Legacy assets or delete tracked golden directories.
- Do not compare nondeterministic Browser evidence directories byte-for-byte.
- Run only focused evidence during iteration; run each relevant broad gate once on the final unchanged tree.

## Task 1 — GAC-01: Builder bundle generate/check separation

**Files:**

- Modify: `scripts/build-agent-self-check.mjs`
- Create: `scripts/check-agent-self-check.ts`
- Modify: `scripts/agent-self-check.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `package.json`
- Modify: `docs/22-hosted-scene-brief-and-evaluation.md`

**Contract:** `generate:agent-self-check` writes the tracked bundle; `check:agent-self-check` builds to temporary output and byte-compares; root parity consumes the tracked bundle without rebuilding.

- [x] Add a focused real-build test that requires an explicit temporary output directory and proves the tracked bundle remains unchanged.
- [x] Run it and observe failure because the builder ignores the output directory.
- [x] Add explicit output-directory parsing and a temporary byte checker; fail closed on bad arguments and stale/missing tracked bytes.
- [x] Remove the producer invocation from the root parity test and move that test to resource-heavy with `measured-duration`.
- [x] Run the checker, parity test, census, and `git diff --exit-code`.

## Task 2 — GAC-02: Browser verifier check/update split

**Files:**

- Modify: `scripts/lib/artifact-directory-promotion.ts`
- Modify: `scripts/lib/artifact-directory-promotion.test.ts`
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `scripts/verify-placement-layout.ts`
- Modify: `scripts/verify-rigged-subject-world.ts`
- Modify: `scripts/verify-g-bot-subject-world.ts`
- Modify: `package.json`

**Contract:** no arguments means read-only `check`; `--update` means validated atomic promotion; any other argument fails. Check validates exact staging inventory and leaves the target unchanged.

- [x] Add filesystem RED cases for default check preserving target bytes, update replacing target bytes, and invalid argument rejection.
- [x] Run the focused helper test and observe failure because the mode-aware API does not exist.
- [x] Implement the smallest shared parser/finalizer around existing atomic promotion.
- [x] Convert each verifier to the shared finalizer and expose one `:update` script.
- [x] Run helper GREEN, typecheck, then all four default verifiers while fingerprinting the tracked tree before/after.

## Task 3 — GAC-03: Independent test gate and current Site

**Files:**

- Create: `scripts/lib/independent-test-gate.ts`
- Create: `scripts/lib/independent-test-gate.test.ts`
- Create: `scripts/run-independent-test-gate.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `scripts/image-delivery.test.mjs`
- Modify: `sites/world-sdk-blueprint/app/page.tsx`
- Modify: `sites/world-sdk-blueprint/app/globals.css`
- Modify: `sites/world-sdk-blueprint/tests/rendered-html.test.mjs`
- Modify: `sites/world-sdk-blueprint/README.md`
- Modify: `package.json`

**Contract:** one fail-closed manifest equals discovered root Node, Cursor Python, and Site suites; one runner executes a selected lane or all lanes sequentially. The Site directly renders current architecture and contains no `/legacy/` dependency.

- [x] Add census RED cases for unclassified, stale, duplicate, outside-root, and invalid lane entries.
- [x] Add a real repository discovery RED requiring all six Node tests, two Python tests, and one Site suite.
- [x] Run focused Vitest and observe the missing module/API failure.
- [x] Implement manifest evaluation, discovery, and sequential runner without shell interpolation.
- [x] Run the existing image-delivery test and observe the removed producer import failure; delete only that obsolete test/import and retain both importer behavior tests.
- [x] Change the Site render test first to require current architecture content and reject Legacy paths; run it and observe RED.
- [x] Implement the direct current-state page/CSS/README and run Site GREEN.
- [x] Run Node, Python, Site, and all-lanes commands; verify the census is fail-closed.

## Task 4 — GAC-04: CI, docs, audit disposition, and integration

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/reviews/runtime-deep-review-checklist.md`
- Modify: `docs/reviews/full-dimension-review-protocol.md`
- Modify: `docs/reviews/2026-08-24-workspace-structure-authority-review.md`

**Contract:** CI installs required dependencies, executes every distinct evidence layer once, and ends with a tracked clean-tree assertion. The audit preserves open unrelated findings and withdraws only disproved or completed subclaims.

- [x] Update CI to check the generated bundle, run Studio, run the complete independent gate once, run root Vitest once, build once, and assert a clean tree.
- [x] Update gate documentation and replace the temporary warning that Browser verifiers mutate tracked goldens.
- [x] Correct the Vite-config audit claim and record GAC-01/GAC-02/GAC-03 disposition plus scoped evidence.
- [x] Run focused suites after the final edit.
- [x] Run `pnpm test:census`, `pnpm check:agent-self-check`, `pnpm test:independent`, `pnpm typecheck`, `pnpm test`, and `pnpm build` once on the final tree, followed by `git diff --check` and a clean-tree mutation audit.
- [x] Use the project-local read-only Cursor completion review; independently reproduce and disposition every candidate finding.
- [x] Commit and push `cursor/workspace-structure-audit-ad0d` only after all required evidence is current.

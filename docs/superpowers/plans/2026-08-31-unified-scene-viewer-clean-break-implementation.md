# WRC-Aligned Unified Scene Viewer Checkpoint A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one default G Bot Scene Viewer and three curated tuning presets without changing or deleting WRC-1/BNA evidence, corpus, Harnesses or Runtime authorities.

**Architecture:** `packages/scene-catalog` validates internal development preset metadata and its Host projection. `apps/playground` consumes that projection while continuing to create the existing RuntimeHost/Babylon/Havok session. WRC cases remain Host-selected inputs and all WRC/BNA evidence stays untouched in Checkpoint A.

**Tech Stack:** TypeScript, Vitest, Vite middleware, Babylon.js 9.23.0, Havok, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-unified-scene-viewer-clean-break-design.md`

## Global Constraints

- The Scene Catalog is development-tool metadata, not a Runtime protocol, Scene Source, WorldPackage format or WRC work package.
- Checkpoint A does not delete `artifacts/scenes`, WRC acceptance cases, Native Harnesses, Studio routes, Capture routes or verifier fixtures.
- RuntimeHost, CharacterMovement, Gameplay, Camera and Havok remain the sole state owners defined by WRC-1.
- Native entries remain undiscoverable until the applicable BNA production/admission disposition permits them.
- `worldkit run <world.json>` remains a Host-selected temporary input and never mutates the curated catalog.
- Checkpoints B and C require separate plans after Checkpoint A is merged to `main`.

---

### Task 1: Internal preset catalog contract

**Files:** `packages/scene-catalog/package.json`, `packages/scene-catalog/src/index.ts`, `packages/scene-catalog/src/scene-catalog.ts`, `packages/scene-catalog/src/scene-catalog.test.ts`, `scripts/lib/test-gate-manifest.ts`.

**Interfaces:** Produce `parseSceneCatalogV1(value)` and `parseViewerBootstrapV1(value)` as defensive internal Host projections with closed Canonical/Native source members.

- [ ] Write RED tests for exact keys, duplicate/inherited IDs, path traversal, raw Native module paths, source mismatch and mutable output.
- [ ] Run `pnpm exec vitest run packages/scene-catalog/src/scene-catalog.test.ts` and confirm the missing implementation fails.
- [ ] Implement closed parsing, canonical IDs, relative preset paths and deep freezing without adding a Browser/runtime protocol.
- [ ] Register the test and run the focused test plus `pnpm test:census`.
- [ ] Commit `feat(scene-catalog): define internal viewer metadata`.

### Task 2: Curated G Bot presets and publication boundary

**Files:** `scenes/catalog.json`, `scenes/presets/feel-flat/world.json`, `scenes/presets/traversal-course/world.json`, `scenes/presets/action-lab/world.json`, `scripts/scenes/promote-scene-preset.ts`, its focused test, root `package.json`.

**Interfaces:** Produce `promoteScenePresetV1({ sceneId, sourcePath, catalogPath })`; accept only authoritative AuthoringSpec V4, matching IDs, regular non-symlink input and a new destination.

- [ ] Write RED tests for valid publication, invalid Canonical JSON, ID mismatch, symlink input and overwrite rejection.
- [ ] Implement staging, file sync and atomic rename; publish catalog metadata only after preset bytes are durable.
- [ ] Create the three purpose-specific V4 presets with `worldkit://subject-definition/humanoid.g-bot@2`.
- [ ] Run focused tests and `pnpm worldkit validate`, `pnpm worldkit build`, and headless load for each preset.
- [ ] Commit `feat(scene-catalog): publish G Bot tuning presets`.

### Task 3: One development Host bootstrap

**Files:** `apps/playground/vite.config.mjs`, its tests, a focused `scripts/dev/run-scene-viewer.ts` and test, root `package.json`.

**Interfaces:** Produce internal `GET /__worldkit/viewer-bootstrap?scene=<id>` and make `pnpm dev` the catalog startup. Preserve fixed Host-selected source support without exposing local paths.

- [ ] Write RED middleware/process tests for default selection, explicit selection, unknown ID, HEAD, method rejection, G Bot metadata and path non-disclosure.
- [ ] Implement a focused middleware module rather than adding more responsibility to the existing large Vite config.
- [ ] Implement the owned Viewer process runner and set root `pnpm dev` to it; do not delete Studio/Capture/Native scripts in Checkpoint A.
- [ ] Run focused tests, `pnpm test:census` and `pnpm typecheck`.
- [ ] Commit `feat(playground): serve internal viewer bootstrap`.

### Task 4: Viewer selector and source-neutral tuning

**Files:** focused new route/selector modules and tests, `apps/playground/src/main.ts`, `apps/playground/src/authoring-loader.ts`, `apps/playground/src/style.css`.

**Interfaces:** Consume the internal Viewer bootstrap, navigate only with `scene`, load its Canonical source through the existing authoring loader, and install the existing tuning workbench for every curated preset.

- [ ] Write RED route/selector/loader tests covering stable order, selected value, same-origin navigation, old mode flags having no preset-selection authority and malformed bootstrap rejection.
- [ ] Implement route and selector modules without renderer or Runtime ownership.
- [ ] Replace default catalog startup with bootstrap selection while preserving the existing RuntimeHost creation path.
- [ ] Keep legacy Studio/Capture/Native owner routes operational for Checkpoint B; do not add aliases.
- [ ] Run focused tests, `pnpm typecheck` and `pnpm build`.
- [ ] Commit `feat(playground): default to G Bot tuning viewer`.

### Task 5: Checkpoint A exact-tree verification and merge

**Files:** only defects exposed by gates, each with a RED reproducer first.

**Interfaces:** Produce one independently useful merge candidate; no Checkpoint B/C cleanup is included.

- [ ] Browser-run all three presets and verify G Bot, movement, jump, reset, selector and tuning workbench.
- [ ] Run affected focused tests, `pnpm typecheck`, `pnpm build`, the relevant Browser smoke and repository boundary/census gates.
- [ ] Verify `git diff --check` and prove no WRC/BNA evidence or Harness path is deleted.
- [ ] Fetch latest `origin/main`, reconcile semantically, and rerun only invalidated gates.
- [ ] Merge and push the exact verified Checkpoint A tree.

## Deferred checkpoints

Checkpoint B migrates Studio, Capture and CLI Host consumers to the same Viewer shell. Checkpoint C
performs reference-proven cleanup with WRC/BNA owner sign-off. Each requires a fresh implementation
plan against the then-current `main`; neither is executed from this plan.

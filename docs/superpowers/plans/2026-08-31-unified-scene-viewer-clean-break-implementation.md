# WRC-Aligned Unified Scene Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one default G Bot Viewer and three curated Canonical tuning presets without adding Runtime authority or deleting WRC/BNA evidence.

**Architecture:** A Canonical-only internal Catalog publishes validated preset inputs. A later atomic cutover makes Playground, CLI and Studio use one app-owned Host bootstrap while preserving the existing RuntimeHost/Babylon/Havok session. Native Viewer support and obsolete-path deletion are outside the current contract.

**Tech Stack:** TypeScript, Vitest, Vite, Babylon.js 9.23.0, Havok, Node test, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-unified-scene-viewer-clean-break-design.md`

## Global Constraints

- Catalog and bootstrap are internal app metadata, not WorldKit Browser Protocol or a Scene Source.
- AuthoringSpec is the sole controlled-Subject authority; Catalog has no Subject field.
- Current contracts are Canonical-only; do not add a Native union member.
- `artifacts/scenes`, WRC cases, Native Harnesses and trusted artifact evidence remain untouched.
- Accepted source-route cutover updates Playground, CLI and Studio consumers atomically.
- Every production behavior follows RED -> GREEN; update `pnpm-lock.yaml` with workspace packages.

---

### Task 1: Repair the Canonical-only Catalog contract

**Files:** modify `packages/scene-catalog/src/scene-catalog.ts`, its index/test and package metadata; modify `pnpm-lock.yaml` and `scripts/lib/test-gate-manifest.ts`.

**Interfaces:** `parseSceneCatalogV1(value): SceneCatalogV1`; no `defaultSubjectDefinitionRef`, Native source or Viewer bootstrap in this task.

- [ ] Add RED tests rejecting Subject metadata, Native source members, inherited/extra keys and unsafe paths.
- [ ] Run the focused test and confirm failures against the current union.
- [ ] Implement the Canonical-only projection and remove the premature bootstrap/Native exports.
- [ ] Remove stale test-manifest entries, update lockfile with `pnpm install --lockfile-only`, then run focused test, census, frozen install and typecheck.
- [ ] Commit `fix(scene-catalog): keep preset metadata canonical-only`.

### Task 2: Publish complete G Bot tuning presets

**Files:** create `scenes/catalog.json`, three `scenes/presets/*/world.json`, `scripts/scenes/promote-scene-preset.ts` and focused test; modify root package scripts and test manifest.

**Interfaces:** `promoteScenePresetV1({ sceneId, sourcePath, catalogPath })`; it delegates to `parseAuthoringSpecV4`, verifies matching ID and controlled G Bot Subject, rejects symlink/overwrite, durably renames preset bytes, then publishes catalog metadata.

- [ ] Add RED tests for invalid V4, ID mismatch, non-G-Bot controlled Subject, symlink, overwrite and catalog-before-preset failure.
- [ ] Run the focused test and confirm the publisher is absent.
- [ ] Implement minimal atomic publication.
- [ ] Complete slope/step/corridor/ledge/blocker stations and limit Action Lab to currently admitted transitions.
- [ ] Run focused tests plus validate/build/headless load for each preset and commit.

### Task 3: Define the app-owned Canonical bootstrap projection

**Files:** create focused Host/client bootstrap modules and tests under `apps/playground`; modify package dependencies and Vite plugin composition.

**Interfaces:** `resolveViewerBootstrapV1(context)` consumes an already validated Catalog, fixed CLI source or Studio source and returns one Canonical bootstrap. It uses authoritative V4 parsing, proves selected ID and controlled G Bot for curated presets, and never returns paths.

- [ ] Add RED tests for default/explicit preset, fixed-source substitution, Studio identity, malformed V4, non-G-Bot preset, HEAD/method behavior and path leakage.
- [ ] Run RED, implement the focused projection/middleware, then run GREEN.
- [ ] Keep the module independent of renderer, RuntimeHost, Camera, Input and Havok.
- [ ] Run focused tests, census and typecheck; commit.

### Task 4: Atomically cut over Playground, CLI and Studio

**Files:** modify Playground route/main/loader/style and tests; modify `scripts/lib/worldkit-server.ts`, CLI tests, Studio preview/proxy/server modules and tests; delete replaced public route owner/tests only after all consumers compile.

**Interfaces:** `pnpm dev` selects curated scenes with `scene`; `worldkit run` and Studio supply fixed Host context; all initialize the existing Authoring/RuntimeHost path. Remove `authoring=1` and `catalog-gameplay` source-selection authority in the same candidate.

- [ ] Add RED route, selector, process, CLI and Studio tests for the one-shell behavior.
- [ ] Run the focused owner tests and confirm current routes fail the new expectations.
- [ ] Implement selector and all consumer migrations without changing Runtime ownership.
- [ ] Delete replaced route parsing and update current docs/AGENTS in the same clean break; retain separately owned trusted artifact capture.
- [ ] Run Playground, CLI, Studio, typecheck, build and Browser switch/reset/tuning gates; commit.

### Task 5: Exact-tree verification and integration

- [ ] Verify all three presets visually and manually: G Bot identity, movement, current jump/land, reset, selector, tuning and each traversal station.
- [ ] Run frozen install, census, affected tests, typecheck, Studio, independent gate, build, Browser evidence and `git diff --check`.
- [ ] Prove no active WRC/BNA evidence or Harness was deleted and no Native Viewer claim exists.
- [ ] Fetch latest `origin/main`, perform semantic reconciliation, and rerun invalidated gates.
- [ ] Merge and push only the exact verified candidate.

## Deferred cleanup

Removal of independent Native Web UI, legacy showcases and historical cases requires a new USV-2 plan
against then-current `main`, with exact WRC/BNA owner sign-off. It is not authorized by this plan.

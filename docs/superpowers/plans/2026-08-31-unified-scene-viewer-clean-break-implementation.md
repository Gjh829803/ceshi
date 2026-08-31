# Unified Scene Viewer Clean-Break Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repository's overlapping preview modes and historical scene catalog with one G Bot Scene Viewer backed by a validated, promoted Scene Catalog.

**Architecture:** `packages/scene-catalog` validates the only public scene list and the closed Viewer Bootstrap union. `apps/playground` consumes that bootstrap for every scene. Generated cases remain under `artifacts/scenes` until the promotion command publishes stable inputs under `scenes/presets`; legacy catalog and Native public apps are deleted after all consumers migrate.

**Tech Stack:** TypeScript, Vitest, Vite middleware, Babylon.js 9.23.0, Havok, Node.js Studio server, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-unified-scene-viewer-clean-break-design.md`

## Global Constraints

- Every world selects exactly one Canonical or verified Babylon Native Scene Source.
- G Bot uses `worldkit://subject-definition/humanoid.g-bot@2` by default.
- Scene source code never owns Input, Motion, Action, Camera, Havok, or Runtime state.
- The change is current-only: no aliases, redirects, dual parsers, legacy routes, or compatibility adapters survive.
- A Native entry cannot enter the public catalog before the ADR-0007 Trusted Local gates pass.
- Historical evidence needed by tests moves to owner-local fixtures before `artifacts/scenes` is cleaned.

---

### Task 1: Scene Catalog and Viewer Bootstrap contracts

**Files:**
- Create: `packages/scene-catalog/package.json`
- Create: `packages/scene-catalog/src/index.ts`
- Create: `packages/scene-catalog/src/scene-catalog.ts`
- Create: `packages/scene-catalog/src/viewer-bootstrap.ts`
- Create: `packages/scene-catalog/src/scene-catalog.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Produces: `parseSceneCatalogV1(value: unknown): SceneCatalogV1`.
- Produces: `parseViewerBootstrapV1(value: unknown): ViewerBootstrapV1`.
- Produces: closed `canonical-authoring` and `babylon-native-package` source members.

- [ ] **Step 1: Write parser tests** for exact keys, duplicate IDs, `__proto__`, absolute/traversal paths, raw Native module paths, unknown kinds, and mutable output.
- [ ] **Step 2: Run** `pnpm exec vitest run packages/scene-catalog/src/scene-catalog.test.ts` and confirm missing-module failure.
- [ ] **Step 3: Implement** the closed types and parsers with canonical IDs, relative preset paths, Registry-style Native refs, defensive projection, and deep freezing.
- [ ] **Step 4: Register the test** in `scripts/lib/test-gate-manifest.ts`, then run the focused test and `pnpm test:census`.
- [ ] **Step 5: Commit** `feat(scene-catalog): define the sole viewer catalog contract`.

### Task 2: Stable tuning presets and promotion boundary

**Files:**
- Create: `scenes/catalog.json`
- Create: `scenes/presets/feel-flat/world.json`
- Create: `scenes/presets/traversal-course/world.json`
- Create: `scenes/presets/action-lab/world.json`
- Create: `scripts/scenes/promote-scene-preset.ts`
- Create: `scripts/scenes/promote-scene-preset.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `parseSceneCatalogV1`.
- Produces: `promoteScenePresetV1({ sceneId, sourcePath, catalogPath })` with atomic, no-overwrite publication.
- Produces: exactly three Canonical catalog entries with G Bot defaults.

- [ ] **Step 1: Write failing promotion tests** covering valid promotion, non-Canonical JSON, ID mismatch, symlink input, destination overwrite, and catalog publication ordering.
- [ ] **Step 2: Run** the focused test and confirm the promotion API is absent.
- [ ] **Step 3: Implement promotion** by validating AuthoringSpec V4 through the authoritative authoring parser, writing into a sibling staging directory, fsyncing, and renaming before catalog publication.
- [ ] **Step 4: Create the three presets** from maintained current fixtures, replacing every controlled Subject with the G Bot Definition and ensuring the terrain/obstacle purpose is explicit.
- [ ] **Step 5: Run** `worldkit validate`, `worldkit build`, and `worldkit load --headless` for all three presets plus the focused promotion tests.
- [ ] **Step 6: Commit** `feat(scene-catalog): publish focused G Bot tuning presets`.

### Task 3: One Vite bootstrap endpoint

**Files:**
- Modify: `apps/playground/vite.config.mjs`
- Modify: `apps/playground/vite.config.test.mjs`
- Modify: `scripts/lib/worldkit-server.ts`
- Modify: `scripts/lib/worldkit-server.test.ts`
- Create: `scripts/dev/run-scene-viewer.ts`
- Create: `scripts/dev/run-scene-viewer.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `scenes/catalog.json` and fixed Host-selected world inputs.
- Produces: `GET /__worldkit/viewer-bootstrap?scene=<id>`.
- Produces: `pnpm dev` as the only root Viewer command.

- [ ] **Step 1: Write failing middleware tests** for catalog selection, default `feel-flat`, unknown IDs, no filesystem path leakage, fixed `worldkit run` input, HEAD, and method rejection.
- [ ] **Step 2: Write a failing process test** that starts `pnpm dev --port <free-port>` and expects bootstrap metadata for `feel-flat` with G Bot.
- [ ] **Step 3: Run both focused tests** and confirm the old source endpoint/default script causes failure.
- [ ] **Step 4: Implement the Viewer bootstrap middleware** with an allowlisted catalog root and a fixed-source mode used by `worldkit run`.
- [ ] **Step 5: Implement `run-scene-viewer.ts`** using the existing owned-process and readiness conventions; print only the canonical Viewer URL.
- [ ] **Step 6: Replace root scripts** so `dev` invokes the Viewer runner and delete all obsolete root `dev:*` aliases except unrelated non-Viewer tools.
- [ ] **Step 7: Run focused tests**, `pnpm test:census`, and `pnpm typecheck`.
- [ ] **Step 8: Commit** `feat(playground): serve one viewer bootstrap endpoint`.

### Task 4: Viewer route, selector, and tuning ownership

**Files:**
- Create: `apps/playground/src/viewer-route.ts`
- Create: `apps/playground/src/viewer-route.test.ts`
- Create: `apps/playground/src/scene-selector.ts`
- Create: `apps/playground/src/scene-selector.test.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/style.css`
- Delete: `apps/playground/src/playground-runtime-route.ts`
- Delete: `apps/playground/src/playground-runtime-route.test.ts`

**Interfaces:**
- Consumes: `ViewerBootstrapV1` from one endpoint.
- Produces: `resolveViewerRoute(search): { sceneId?: string }` with no mode flags.
- Produces: `installSceneSelector({ catalog, selectedSceneId, navigate })`.

- [ ] **Step 1: Write route tests** proving only `scene` is accepted and old `authoring`, `artifact`, and `captureArtifacts` flags have no route authority.
- [ ] **Step 2: Write selector tests** proving stable catalog order, selected value, same-origin navigation, query cleanup, and keyboard labeling.
- [ ] **Step 3: Run focused tests** and confirm the new modules are missing.
- [ ] **Step 4: Implement the route and selector modules** without renderer ownership.
- [ ] **Step 5: Replace startup branching in `main.ts`** with one bootstrap load and one source-neutral Runtime initialization; install the tuning workbench for every displayed preset.
- [ ] **Step 6: Remove mode-specific UI branches** while preserving capture, reset, Runtime Snapshot, and mounted/action controls through source-neutral capabilities.
- [ ] **Step 7: Run focused loader/route/UI tests**, `pnpm typecheck`, and `pnpm build`.
- [ ] **Step 8: Commit** `feat(playground): unify scene selection and G Bot tuning`.

### Task 5: Studio, CLI, and capture migration

**Files:**
- Modify: `apps/studio/src/server.mjs`
- Modify: `apps/studio/src/server.test.mjs`
- Modify: `apps/studio/src/public-proxy.mjs`
- Modify: `apps/studio/src/public-proxy.test.mjs`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`
- Modify: `scripts/lib/worldkit-server.ts`
- Modify: Browser capture verifiers selected by repository search.

**Interfaces:**
- Consumes: the same Viewer Bootstrap endpoint and route.
- Produces: Studio preview URLs `/play?scene=<world-id>` bound by the Host, not by a second frontend mode.
- Produces: `worldkit run <world.json>` opening the same Viewer with a fixed Host-selected scene.

- [ ] **Step 1: Change Studio and CLI expectations first** from old mode URLs/endpoints to Viewer Bootstrap.
- [ ] **Step 2: Run focused Studio and CLI tests** and capture the expected old-route failures.
- [ ] **Step 3: Implement Host-selected bootstrap publication** for Studio records and fixed CLI files without exposing paths or accepting arbitrary Browser IDs.
- [ ] **Step 4: Update capture launchers** to use the unified URL and readiness contract.
- [ ] **Step 5: Run** `pnpm test:studio`, focused CLI/server tests, and the Browser capture verifier.
- [ ] **Step 6: Commit** `refactor(runtime): route every preview through the scene viewer`.

### Task 6: Native harness migration

**Files:**
- Move retained provider/Host code from: `apps/native-scene-playground/src/`
- Move to owning packages under: `packages/native-babylon/` and `packages/runtime-babylon/`
- Move test-only assets to: `packages/native-babylon/test/fixtures/`
- Delete: `apps/native-scene-playground/`
- Modify: `pnpm-workspace.yaml`
- Modify: `scripts/verification/verify-bna1-clean-break.ts`
- Modify: Native build and verification scripts selected by repository search.

**Interfaces:**
- Consumes: verified Native WorldPackage and existing RuntimeHost Native Scene Source.
- Produces: package-owned test harness only; no independent Web entry.

- [ ] **Step 1: Add a repository-layout failure** requiring `apps/native-scene-playground` and `dev:native-scene` to be absent.
- [ ] **Step 2: Inventory every imported Native app module** and classify it as provider production code, test harness, fixture, or obsolete UI.
- [ ] **Step 3: Move production/provider modules** without changing their public contract, then update exact imports and package dependencies.
- [ ] **Step 4: Move fixtures beside tests** and update hashes/receipts through their authoritative generators.
- [ ] **Step 5: Delete the independent HTML/CSS/UI and app package**; do not add a redirect or alias.
- [ ] **Step 6: Run Native package tests**, BNA clean-break verifiers, Native build, and root typecheck.
- [ ] **Step 7: Commit** `refactor(native): remove the independent native preview app`.

### Task 7: Delete legacy scenes and tracked historical artifacts

**Files:**
- Delete: `apps/playground/src/scenes/`
- Delete obsolete directories under: `apps/playground/public/scene-plans/`
- Delete or migrate tracked directories under: `artifacts/scenes/`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `scripts/verification/verify-bna1-clean-break.ts`
- Modify: current README, AGENTS, active docs, and repository scripts returned by exact reference search.

**Interfaces:**
- Consumes: promoted presets and owner-local verifier fixtures from prior tasks.
- Produces: zero production references to the OutdoorScene catalog or historical artifact cases.

- [ ] **Step 1: Add negative census tests** for deleted scene IDs, source paths, root scripts, old route parameters, and artifact-case dependencies.
- [ ] **Step 2: Run the census tests** and record the full legacy reference set.
- [ ] **Step 3: Move still-required verifier evidence** into owner-local `fixtures/` and regenerate any integrity metadata.
- [ ] **Step 4: Delete old scene sources and public assets**, including Azure Bay, Canyon showcase, Mistbound Rider, Sunlit Flower Bay, and `world-08170639-54db`.
- [ ] **Step 5: Delete tracked historical artifact cases** after reference search proves no current consumer remains; keep only the generated root policy needed by active workflows.
- [ ] **Step 6: Rewrite current documentation** around `pnpm dev`, `pnpm studio`, Scene Catalog promotion, and the single Viewer route; leave historical reviews clearly historical or remove them when they only document deleted experiments.
- [ ] **Step 7: Run negative searches**, `pnpm test:census`, `pnpm verify:workspace-boundaries`, and `git diff --check`.
- [ ] **Step 8: Commit** `refactor(scenes): delete legacy previews and historical cases`.

### Task 8: Exact-tree verification and main integration

**Files:**
- Modify only defects exposed by gates, with a failing reproducer first.

**Interfaces:**
- Consumes: the completed clean-break tree.
- Produces: one pushed `main` commit range with no legacy residue.

- [ ] **Step 1: Run focused scene switch process/browser tests** and verify all three G Bot presets visually and interactively.
- [ ] **Step 2: Run** `pnpm typecheck`, `pnpm test`, `pnpm test:studio`, `pnpm build`, and every affected Native build/verifier.
- [ ] **Step 3: Run repository negative searches** for removed scripts, routes, scene IDs, application path, and artifact consumers.
- [ ] **Step 4: Fetch `origin/main`**, reconcile any new commits as a semantic merge, and rerun only gates invalidated by reconciliation.
- [ ] **Step 5: Commit remaining verified fixes**, fast-forward or merge into local `main`, and push `origin/main`.
- [ ] **Step 6: Confirm** local `main`, `origin/main`, and the exact tested commit are identical and the worktree is clean.

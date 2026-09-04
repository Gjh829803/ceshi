# Whitebox 3C Test Course and Foot Contact Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the supported G Bot's visible ground gap and add a default, fixed Whitebox 3C test course that covers the user's complete locomotion and third-person-camera evaluation matrix.

**Architecture:** Keep character support, movement, and snapshots unchanged. Prove whether the gap is physical or perceptual, then restore the missing Canonical contact-shadow cue without moving the authoritative visual root. Add the test course as one Canonical AuthoringSpec V4 curated preset and expose it through the existing scene catalog/bootstrap path.

**Tech Stack:** TypeScript, Vitest, Babylon.js/Havok Runtime tests, Canonical AuthoringSpec V4 JSON, Vite Playground Viewer.

**Spec:** `docs/superpowers/specs/2026-09-03-whitebox-3c-test-course-and-foot-contact.md`

**Global Constraints:** Preserve the existing isolated worktree's 3C UI changes. Do not change Browser Protocol V5, physics authority, collider dimensions, input normalization, camera ownership, or Authoring Schema. Use `apply_patch` for edits. The main agent owns architecture, shared Runtime decisions, integration, and final verification.

## Dependency-aware work graph

| ID | Goal and deliverable | depends_on | blocks | Exclusive ownership / I/O contract | Verification | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Reproduce the perceived G Bot ground gap with real asset; record support/origin/visible-mesh evidence, then lock the missing contact-shadow path in a focused failing test. | none | R2 | Owns only new assertions/helpers in `packages/runtime-babylon/src/runtime.test.ts`; input is current Runtime fixture, output proves geometry contact passes while the shadow contract fails, with no production edit. | Targeted Vitest reports RED for missing sun shadow generator while support remains `supported` and mesh contact passes. | main-agent-only |
| R2 | Restore the proven rendering cue without changing gameplay authority. | R1 | I1, V1 | Owns the narrow clear-day shadow setup in `packages/runtime-babylon/src/babylon-world-runtime.ts`; output changes rendered lighting only. | R1 becomes GREEN; Runtime lighting, disposal, and visual isolation tests pass. | main-agent-only |
| S1 | Define the consolidated deterministic 3C test course and catalog entry. | none | I1 | Owns `scenes/presets/whitebox-3c-test-course/world.json` and `scenes/catalog.json`; input/output is one valid V4 spec reachable through the existing catalog. | Parser/compiler load succeeds and station contract assertions pass. | sequential |
| S2 | Add preset contract coverage for default selection and every required station. | none | S1, I1 | Owns test additions in `apps/playground/src/viewer-bootstrap.test.ts`; first output is a RED test for the missing preset, then GREEN after S1. | Targeted Viewer bootstrap Vitest. | sequential |
| I1 | Integrate runtime fix and preset through the real Viewer. | R2, S1, S2 | V1 | Owns integration review only; no new authority. Exact integration point is `/__worldkit/viewer-bootstrap` -> `loadAuthoringScene` -> existing Babylon adapter. | Open `/` and `/?scene=whitebox-3c-test-course`; inspect HUD/support, scene picker, geometry, and console. | main-agent-only |
| V1 | Run final gates and capture scoped evidence. | I1 | none | Owns verification outputs only; must run on the final tree and report exact failures/warnings. | Focused tests, `pnpm typecheck`, `pnpm test`, `pnpm build`, browser visual/manual inspection, `git diff --check`. | main-agent-only |

## Task R1: Lock the ground-contact regression

**Files:**
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Read only: `packages/runtime-babylon/src/character-movement-component.ts`
- Read only: `packages/runtime-babylon/src/subject-visual.ts`

- [x] Add a real rigged-mesh measurement after an idle render pose.
- [x] Confirm the Runtime support mode is `supported`, committed subject origin/visual root are on the support plane, and visible geometry is within `0.03 m` of that plane.
- [x] Assert that the clear-day sun owns a shadow generator, G Bot meshes are casters, and terrain receives shadows; run only the named Runtime test and confirm RED for the missing generator.

## Task S2: Lock the preset contract before adding data

**Files:**
- Modify: `apps/playground/src/viewer-bootstrap.test.ts`

- [x] Add an assertion that catalog default and bootstrap default resolve `whitebox-3c-test-course` with title `Whitebox 3C 测试场`.
- [x] Parse the preset and assert its G Bot, third-person-only camera, flat spawn, and stable semantic station set.
- [x] Run the focused Viewer bootstrap test and confirm RED because the preset does not exist yet.

## Task R2: Apply the smallest rendering-only fix

**Files:**
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Test: `packages/runtime-babylon/src/runtime.test.ts`

- [x] Classify R1: physical support and real mesh height are correct; missing directional/contact shadow causes the perceived gap.
- [x] Keep Canonical terrain receiver-ready for every atmosphere; create one bounded generator only for clear-day and register only the authoritative possessed Subject meshes as casters.
- [x] Keep Native authored-light behavior unchanged and dispose the generated shadow resource exactly once.
- [x] Run R1 and focused Runtime lighting/disposal tests until GREEN.

## Task S1: Author the fixed Whitebox 3C test course

**Files:**
- Create: `scenes/presets/whitebox-3c-test-course/world.json`
- Modify: `scenes/catalog.json`
- Test: `apps/playground/src/viewer-bootstrap.test.ts`

- [x] Use one flat terrain as the authoritative support surface and place the spawn in a clear calibration zone.
- [x] Add stable prototypes and fixed nodes for slope, stairs, narrow gate, ledge/drop, small and large obstacles, corridor, high-speed chicane, occlusion pillars/L-corner, and jump/landing references.
- [x] Keep every collider within the declared budget and every station inside world bounds.
- [x] Add the catalog entry, make it the default, and retain the existing three presets.
- [x] Run S2 until GREEN, then run the Authoring loader/compiler-focused test needed to prove the world materializes.

## Task I1: Browser integration and manual test

**Files:**
- No planned production edits; repair only defects proven by integration.

- [x] Reload the Vite Viewer at `/` and verify it defaults to the new course.
- [x] Verify the picker contains all four entries and direct legacy URLs still load.
- [x] Inspect idle foot contact, Runtime `SUPPORTED`, and absence of a visible ground gap.
- [x] Exercise movement through the narrow gate, verify the full station inventory through the compiled bootstrap contract, and inspect the intended camera-occlusion behavior.
- [x] Confirm no Browser console errors and capture a final screenshot.

## Task V1: Final verification

**Files:**
- Inspect: all changed files and evidence from the final tree.

- [x] Run the focused Runtime and Viewer tests.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test` once on the final tree. The current Windows host exposed existing platform failures in POSIX permission, symlink, directory-fsync, and child-Git tests; scoped changed-domain tests remained green.
- [x] Run `pnpm build`.
- [x] Run `git diff --check` and inspect `git status --short` so unrelated user changes remain preserved.
- [x] Report the measured root cause, exact scope of the fix, test counts, manual evidence, and any remaining experimental boundaries.

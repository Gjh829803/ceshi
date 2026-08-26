# xier120 Non-human Subject Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert and register all 19 xier120 FBX source assets as actually loadable static Subjects without claiming unsupported animation, vehicle, flight, or mount behavior.

**Architecture:** Preserve FBX as provenance-only input, deterministically bake each file into a self-contained static GLB, and register one Asset/Collider/Definition closure per source entry. Extend the existing Static Subject vertical path to admit at most one Asset Part while keeping primitive-only static Subjects and the Rigged path unchanged.

**Tech Stack:** TypeScript 5.9, pnpm, Vitest, Three.js 0.180 FBXLoader/GLTFExporter, Babylon.js 9.21.2 NullEngine/AssetContainer, Vite Playground.

**Spec:** `docs/superpowers/specs/2026-08-24-xier120-non-human-static-subject-intake-design.md`

## Global Constraints

- Source branch input is `origin/codex/xier120-non-human-source-assets` commit `a63993e`; all 19 source hashes and byte lengths must remain unchanged.
- Runtime consumes only self-contained `model/gltf-binary` GLB assets with meters, `+Y` up, `-Z` forward, and support-center pivot.
- Static Binding accepts zero or one Asset Part globally; each xier120 Definition requires exactly one.
- Do not modify Authoring Schema field names, physics, camera, render scheduling, or the Rigged Subject contract.
- Use `LicenseRef-Loopit-Company-Private` and `internal-only` for every xier120 Runtime Asset.
- Animals are `advanced`; vehicle/composition entries are `experimental`; all reuse existing ground Character capability profiles.
- A failed animation readiness gate produces a report, never fabricated action bindings.
- Tests must be written and observed failing before their production changes.

---

### Task 1: Contributor Source Inventory

**Files:**
- Add unchanged: `assets/subjects/source-fbx/contributors/xier120/**`
- Modify: `packages/subject-registry/src/source-asset-inventory.ts`
- Modify: `packages/subject-registry/src/source-asset-inventory.test.ts`
- Delete instead of retaining: `packages/subject-registry/src/xier120-source-asset-inventory.test.ts`
- Modify: `docs/19-subject-preset-workspace.md`

**Interfaces:**
- Consumes: xier120 `catalog.json` rows with `sourceId`, `creatorId`, `authorship`, path, byte length, hash, coarse class, `format: "fbx"`, and `runtimeStatus: "source-only"`.
- Produces: `ContributorSourceFbxAssetInventoryEntryV1` and `sourceFbxContributorAssetInventory`, preserving `sourceFbxVehicleAssetInventory`.

- [ ] **Step 1: Write failing generic inventory tests**

  Add assertions that the combined contributor inventory has 19 xier120 rows, generic `${string}.${string}` IDs, unique paths/IDs, and real-file byte/hash equality. The test must import the generic aggregate, not an xier120-only interface.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `pnpm vitest run packages/subject-registry/src/source-asset-inventory.test.ts`

  Expected: failure because `sourceFbxContributorAssetInventory` is not exported.

- [ ] **Step 3: Add source files and minimal generic implementation**

  Extend the closed `SourceAssetCoarseClassV1` union with the contributor classes and add:

  ```ts
  export interface ContributorSourceFbxAssetInventoryEntryV1
    extends SourceFbxAssetInventoryEntryV1 {
    readonly sourceId: `${string}.${string}`;
    readonly creatorId: string;
    readonly authorship: "independent-original-model";
  }

  export const sourceFbxContributorAssetInventory = Object.freeze(
    contributorCatalogs.flatMap((catalog) => catalog.map((entry) =>
      Object.freeze(entry as ContributorSourceFbxAssetInventoryEntryV1))),
  );
  ```

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `pnpm vitest run packages/subject-registry/src/source-asset-inventory.test.ts`

---

### Task 2: Static Asset Part Authoring and Compiler Path

**Files:**
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`

**Interfaces:**
- Consumes: `SubjectVisualBindingV1` with `mode: "static"` and zero or one `kind: "asset"` visual part.
- Produces: normalized Subject Asset resource/lock/cost and an ExecutionPlan subject whose static Asset Part remains addressable by `subjectAssetRef`.

- [ ] **Step 1: Write Authoring RED tests**

  Add behavior tests proving one static Asset Part resolves and locks its Subject Asset, contributes its manifest cost, rejects a second Asset Part with `STATIC_SUBJECT_MULTIPLE_ASSET_PARTS_UNSUPPORTED`, and preserves a zero-asset primitive Subject.

- [ ] **Step 2: Run Authoring test and verify RED**

  Run: `pnpm vitest run packages/authoring/src/subject-definition-normalizer.test.ts`

  Expected: the one-asset case reports the existing static-asset rejection and/or omits the lock/cost.

- [ ] **Step 3: Implement one canonical visual-resource resolver**

  Replace rigged-only asset resolution with a resolver that always validates `0..1` Asset Parts for static and exactly one for rigged, resolves/locks the asset when present, and only resolves Rig/Animation resources for `mode: "rigged"`. Keep bone socket validation rigged-only.

- [ ] **Step 4: Run Authoring test and verify GREEN**

  Run: `pnpm vitest run packages/authoring/src/subject-definition-normalizer.test.ts`

- [ ] **Step 5: Write Compiler RED test**

  Compile a normalized static Asset Subject and assert that its Asset resource reaches the ExecutionPlan while visual binding remains `{ mode: "static" }`. Preserve the invariant failure for unresolved asset refs.

- [ ] **Step 6: Run Compiler test and verify RED**

  Run: `pnpm vitest run packages/compiler/src/compile.test.ts`

  Expected: failure from `contains rigged visual data`.

- [ ] **Step 7: Remove the invalid static rejection only**

  Let Compiler accept the already-normalized static Asset Part and continue to reject Rig/Animation resources paired with static binding or inconsistent locked assets.

- [ ] **Step 8: Run both focused suites and verify GREEN**

  Run: `pnpm vitest run packages/authoring/src/subject-definition-normalizer.test.ts packages/compiler/src/compile.test.ts`

---

### Task 3: Babylon Static Asset Lifecycle

**Files:**
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: an ExecutionPlan static Subject with at most one locked Subject Asset and `SubjectAssetCacheV1.acquire()`.
- Produces: one instantiated static asset attached beneath the Subject root, with reset-safe transforms, isolated instances, and ordered cleanup.

- [ ] **Step 1: Write Runtime RED tests**

  Add tests using a real generated static GLB fixture to prove: static asset creation succeeds without Skeleton/Animation; two instances have distinct Transform/Mesh ownership; reset restores the authored local transform; partial construction releases the lease; dispose removes the instance before releasing the lease.

- [ ] **Step 2: Run Runtime test and verify RED**

  Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "static asset subject"`

  Expected: current `Subject visual asset binding must be rigged` failure.

- [ ] **Step 3: Implement the static branch**

  In the existing single-asset ownership path, branch after instantiation: static attaches imported roots to the asset-part transform and skips Rig Profile, Animation Player, and bone sockets; rigged behavior remains byte-for-byte semantically unchanged. Ensure catch/finally cleanup covers instance and lease.

- [ ] **Step 4: Run Runtime tests and verify GREEN**

  Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

---

### Task 4: Deterministic FBX Static Bake

**Files:**
- Create: `scripts/lib/static-subject-bake.ts`
- Create: `scripts/lib/static-subject-bake.test.ts`
- Create: `scripts/bake-xier120-static-subjects.ts`
- Create: `packages/subject-registry/src/xier120-static-subject-config.ts`
- Create generated: `apps/playground/public/subject-assets/xier120/<slug>/v1/<slug>.glb`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ContributorSourceFbxAssetInventoryEntryV1` plus `StaticSubjectBakeConfigV1 { sourceId, scaleToMeters, rotateXYZRadians, expectedForward, displayColorHex }`.
- Produces: deterministic GLB bytes and `StaticSubjectBakeResultV1 { artifact, bounds, inventory }`; `pnpm bake:xier120-subjects -- --check` compares regenerated bytes to committed output.

- [ ] **Step 1: Write converter RED tests**

  Use a tiny controlled FBX fixture or one committed small xier120 source. Assert two bakes produce identical bytes; Babylon admission reports indexed triangles, normals, zero Skeletons/Animations, no external URI; bounds minimum Y is approximately zero after meter conversion.

- [ ] **Step 2: Run converter test and verify RED**

  Run: `pnpm vitest run scripts/lib/static-subject-bake.test.ts`

  Expected: failure because `bakeStaticSubjectFbx` does not exist.

- [ ] **Step 3: Implement minimal deterministic bake**

  Parse with `FBXLoader`, bake current skinned vertex positions into plain `BufferGeometry`, remove skin attributes, recompute invalid normals, index with Three `mergeVertices`, replace materials with deterministic `MeshStandardMaterial`, apply explicit rotation/scale, support-center the root, and export binary with `GLTFExporter`.

- [ ] **Step 4: Run converter test and verify GREEN**

  Run: `pnpm vitest run scripts/lib/static-subject-bake.test.ts`

- [ ] **Step 5: Add all 19 explicit configs and generate assets**

  Keep all corrections keyed by exact Source ID. Generate into per-slug versioned directories and fail before writes if source hash/length differs.

- [ ] **Step 6: Add and run check mode**

  Run: `pnpm bake:xier120-subjects -- --check`

  Expected: 19/19 outputs match committed bytes and reported inventory has zero Skeletons/Animations.

---

### Task 5: Registry Closures and Playground Resolver

**Files:**
- Create: `packages/subject-registry/src/xier120-resource-manifests.ts`
- Create: `packages/subject-registry/src/xier120-subject-definitions.ts`
- Create: `packages/subject-registry/src/xier120-subjects.test.ts`
- Modify: `packages/subject-registry/src/built-in-subject-resource-registry.ts`
- Modify: `packages/subject-registry/src/index.ts`
- Modify: `apps/playground/src/worldkit-asset-resolver.ts`
- Modify: `apps/playground/src/worldkit-asset-resolver.test.ts`

**Interfaces:**
- Consumes: generated bake results/inventory and existing capability/profile refs.
- Produces: `XIER120_SUBJECT_ASSET_MANIFESTS`, `XIER120_COLLIDER_PROFILES`, `XIER120_SUBJECT_DEFINITIONS`, and `XIER120_SUBJECT_ASSET_URI_BY_REF_V1` merged into the built-in Registry and Playground maps.

- [ ] **Step 1: Write Registry and Resolver RED tests**

  Assert literal count 19; each Definition closes over one Asset and one compatible support-centered Collider; exact availability/classification; internal-only provenance; Resolver URI exists and returned bytes match Manifest length/hash.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `pnpm vitest run packages/subject-registry/src/xier120-subjects.test.ts apps/playground/src/worldkit-asset-resolver.test.ts`

- [ ] **Step 3: Implement generated-data-backed manifests and definitions**

  Use creator-qualified refs, explicit topology/category/availability tables, a single asset part at identity transform, existing ground profiles, and per-asset support-centered capsule dimensions derived from reviewed baked bounds then clamped only in config—not Runtime.

- [ ] **Step 4: Merge maps into the built-in Registry and Resolver**

  Keep the public default Subject unchanged. Export the xier120 arrays for Catalog consumers and tests.

- [ ] **Step 5: Run focused suites and verify GREEN**

  Run: `pnpm vitest run packages/subject-registry/src/xier120-subjects.test.ts apps/playground/src/worldkit-asset-resolver.test.ts packages/subject-registry/src/subject-registry.test.ts`

---

### Task 6: Actual-use Fixture and Verifier

**Files:**
- Create: `examples/authoring/xier120-subject-gallery.json`
- Create: `scripts/verify-xier120-subjects.ts`
- Create: `scripts/verify-xier120-subjects.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all 19 built-in Subject Definition refs and Playground asset paths.
- Produces: `pnpm verify:xier120-subjects`, which validates source hashes, bake check, Registry closure, Normalize/Compile, and Babylon NullEngine load/instantiate/dispose for every Subject.

- [ ] **Step 1: Write verifier RED test**

  Invoke the verifier API against one valid and one corrupted manifest/asset pair; assert stable failure for hash mismatch and a success report containing resolved Definition/Asset/Collider refs.

- [ ] **Step 2: Run verifier test and verify RED**

  Run: `pnpm vitest run scripts/verify-xier120-subjects.test.ts`

- [ ] **Step 3: Implement verifier and 19-entry Gallery world**

  Build each Subject through the real Authoring/Compiler pipeline, acquire the real GLB in Babylon NullEngine, instantiate twice, dispose both, and report counts. The Gallery uses one selected xier120 Subject as player and places the remaining entries as inspectable static instances only if the public schema already supports that arrangement; otherwise use a deterministic single-player selection fixture plus Browser API Catalog switching.

- [ ] **Step 4: Run verifier and verify GREEN**

  Run: `pnpm verify:xier120-subjects`

---

### Task 7: Rendered and Manual Runtime Evidence

**Files:**
- Create: `artifacts/examples/xier120-subject-gallery/verification.json`
- Create: `artifacts/examples/xier120-subject-gallery/gallery.png`
- Create: `artifacts/examples/xier120-subject-gallery/manual-check.json`

**Interfaces:**
- Consumes: the actual `worldkit run` URL and Browser API Subject selection.
- Produces: rendered evidence for all 19 entries and manual evidence for one animal, one vehicle, and one composition.

- [ ] **Step 1: Start the canonical runtime**

  Run: `pnpm worldkit run examples/authoring/xier120-subject-gallery.json`

- [ ] **Step 2: Inspect all entries in the browser**

  Verify visible geometry, scale, support placement, and forward direction. Correct only per-asset bake config, regenerate, and rerun the automated gates for any defect.

- [ ] **Step 3: Exercise representative controls**

  Record move, turn, collision, camera, reset, two-instance isolation, and disposal for animal/vehicle/composition representatives. Do not record unsupported vehicle/flight/mount semantics as passing.

- [ ] **Step 4: Save evidence atomically**

  Evidence records exact branch SHA, Definition refs, asset hashes, browser URL, and separate automated/rendered/manual results.

---

### Task 8: Reusable Batch Subject Asset Intake Guide

**Files:**
- Modify: `docs/superpowers/skills/product-asset-intake.md`
- Create: `docs/superpowers/skills/product-asset-intake-static-assets.md`
- Modify: `docs/16-subject-assets-3c-integration.md`

**Interfaces:**
- Consumes: the verified xier120 source inventory, deterministic bake, Registry, resolver, verifier, and browser evidence workflow plus the existing rigged G Bot intake workflow.
- Produces: one discoverable intake router and one detailed static/batch guide that another agent can follow without rediscovering repository ownership or claiming unsupported semantics.

- [ ] **Step 1: Classify the existing documentation gap**

  Record that `product-asset-intake.md` covers one already-normalized Rigged GLB but not source-only FBX batches or ready static GLB batches. Preserve its existing G Bot contract as the Rigged route.

- [ ] **Step 2: Rewrite the entry document as a mode router**

  Route among: ready Rigged GLB, ready Static GLB, and source FBX requiring deterministic bake. State the shared canonical invariants and link the static/batch guide only for the latter two modes.

- [ ] **Step 3: Write the static/batch operational guide**

  Include intake checklist, source Catalog fields, immutable hash validation, ready-GLB admission versus FBX bake decision, explicit units/axes/pivot/orientation config, reflected-winding rule, generated inventory, Asset/Collider/V3 Definition refs, all resolver surfaces including trusted `worldkit run`, direct `subjectDefinitionRef` example, capability catalog discovery, license policy, automated/rendered/manual gates, and common failures. Use xier120 as a concrete example while keeping names generic.

- [ ] **Step 4: Validate the guide against the actual implementation**

  Check every referenced path/command/export exists; run `git diff --check`; scan for placeholders and contradictory claims. An independent reviewer executes a realistic “import a new static asset batch” dry run from the documents and reports any missing decision or integration surface.

---

### Task 9: Animation Readiness, Full Gates, Review, and Main Integration

**Files:**
- Create: `docs/reviews/2026-08-24-xier120-animation-readiness.md`
- Create: `docs/reviews/2026-08-24-xier120-subject-integration-review.md`
- Modify only for confirmed defects: files already owned above

**Interfaces:**
- Consumes: integrated diff, all verification logs, two long-animation source candidates.
- Produces: truthful animation pass/fail report, full-dimension review dispositions, and a verified merge into local `main`.

- [ ] **Step 1: Produce animation readiness evidence**

  Inspect Skeleton/Stack/Clip duration/root/orientation for quadruped animal and quadruped ridable. Mark every six-part gate from the spec pass/fail; do not add Rigged Definitions unless all gates pass.

- [ ] **Step 2: Run repository gates**

  Run the exact commands from Spec §9.2, plus `pnpm test:isolation`. Capture exit codes and counts.

- [ ] **Step 3: Self-review the actual integrated diff**

  Apply the full-dimension and runtime checklists. Reproduce and fix confirmed findings with RED tests, then rerun affected and full gates.

- [ ] **Step 4: Run the host final review**

  Apply the full-dimension review protocol, classify each P0-P3 finding, and reproduce any confirmed issue before editing.

- [ ] **Step 5: Merge into `main`, push, and verify branch state**

  Ensure the worktree is clean and all commits are on the feature branch. In the primary checkout, verify no unrelated user changes overlap, fetch and revalidate `origin/main`, merge `codex/xier120-non-human-subject-integration` non-destructively, rerun `pnpm verify:xier120-subjects` and a focused smoke test on `main`, push the verified `main` to `origin/main`, fetch again, and report matching local/remote HEAD plus both working-tree states.

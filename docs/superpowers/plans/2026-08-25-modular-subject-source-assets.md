# Modular Subject Source Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the existing merged G Bot and Golden GLBs into deterministic modular product-source packages, inventory all xier120 assets, and publish a concrete product correction guide without changing current Runtime inputs.

**Architecture:** A tested glTF recovery library reads committed self-contained GLBs, validates an explicit package definition, and emits one animation-free Model GLB, one Material Set manifest, one animation-only GLB per semantic action, and one byte-identical non-Runtime Source Archive under `extensions/`. A CLI stages the complete nested directory and atomically promotes it in write mode, or compares exact bytes in check mode. Existing Runtime GLBs and Registry contracts remain unchanged.

**Tech Stack:** TypeScript 5.9, Node.js 24 APIs, Vitest 3.2, `@gltf-transform/core` 4.4.2, `@gltf-transform/functions` 4.4.2, existing WorldKit hashing/canonical JSON conventions.

**Spec:** `docs/superpowers/specs/2026-08-25-modular-subject-source-assets-design.md`

## Global Constraints

- Product-authoritative resources are Model Asset, Rig Profile, Material Set, Animation Clip Assets, and Animation Set; current Runtime assets remain compatibility inputs.
- A rigged Model GLB has Mesh + Skin + exactly one Skeleton + Bind Pose and zero Animations.
- An Animation Clip GLB has exactly one Animation and zero Mesh, Material, Texture, Image, Camera, and Light resources.
- Model and every Clip must share one exact deterministic Rig signature; this slice performs no retargeting.
- The CLI never derives semantic `actionId` values from provider Clip names; every mapping is explicit.
- All written resources use `kind`, `schemaVersion`, `id`, `version`, `resourceRef`, unit-bearing numeric names, and exact SHA-256 identities.
- Existing merged GLBs, Registry Refs, Authoring examples, Resolver maps, and Runtime behavior are not modified.
- xier120 static GLB bytes are not copied, rewritten, rigged, or assigned invented actions.
- No texture resource is generated when the source GLB contains no Image/Texture.
- Output paths are immutable package versions under `assets/subjects/packages/**`.

---

### Task 1: Deterministic GLB recovery library

**Files:**
- Create: `scripts/lib/modular-subject-source.ts`
- Create: `scripts/lib/modular-subject-source.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: committed self-contained GLB bytes and `ModularSubjectPackageDefinitionV1`.
- Produces: `recoverModularSubjectSourcePackage(input): Promise<RecoveredSubjectSourcePackageV1>`, `inspectModularSubjectGlb(bytes): Promise<ModularSubjectGlbInventoryV1>`, and `validateRecoveredSubjectSourcePackage(package): Promise<void>`.

- [ ] **Step 1: Write a failing Golden recovery test**

Create a real integration test that reads `apps/playground/public/worldkit-assets/golden-humanoid.glb` and calls the wished-for API:

```ts
const recovered = await recoverModularSubjectSourcePackage({
  definition: goldenPackageDefinition,
  sourceGlbBytes,
});

expect(recovered.model.inventory).toMatchObject({
  meshCount: 1,
  skeletonCount: 1,
  animationClipCount: 0,
});
expect(recovered.animationClips.map((row) => row.actionId)).toEqual([
  "idle",
  "jump",
  "run",
  "walk",
]);
```

`goldenPackageDefinition` is a test-local literal in this task. The production package catalog is
introduced in Task 2 so Task 1 remains focused on the recovery contract.

For every recovered Clip, inspect the actual output GLB and assert literal inventory:

```ts
expect(clipInventory).toMatchObject({
  meshCount: 0,
  materialCount: 0,
  textureCount: 0,
  imageCount: 0,
  animationClipCount: 1,
});
expect(clip.manifest.rigSignatureHash).toBe(recovered.model.manifest.rigSignatureHash);
```

The production change this test catches is returning a cosmetic folder split while Meshes,
Materials, multiple Clips, or an incompatible joint hierarchy remain in the Clip artifacts.

- [ ] **Step 2: Run the focused test and record RED**

Run:

```bash
pnpm vitest run scripts/lib/modular-subject-source.test.ts
```

Expected: FAIL because `scripts/lib/modular-subject-source.ts` and its exports do not exist.

- [ ] **Step 3: Add the maintained glTF dependencies**

Run:

```bash
pnpm add -D @gltf-transform/core@4.4.2 @gltf-transform/functions@4.4.2
```

Keep them as root direct development dependencies because the root `scripts/` package imports them.

- [ ] **Step 4: Implement the minimal recovery types and inspection**

Define closed types including:

```ts
export interface ModularSubjectActionDefinitionV1 {
  readonly actionId: string;
  readonly sourceClipName: string;
  readonly loopMode: "repeat" | "once";
  readonly playbackSpeedRatio: number;
  readonly blendDurationSeconds: number;
  readonly rootMotionMode: "in-place";
}

export interface ModularSubjectPackageDefinitionV1 {
  readonly id: string;
  readonly version: number;
  readonly creatorId: string;
  readonly displayName: string;
  readonly sourceGlbRelativePath: string;
  readonly expectedSourceContentHash: `sha256:${string}`;
  readonly rigProfileRef: string;
  readonly provenanceMode: "derived-recovery" | "generated-fixture";
  readonly actions: readonly ModularSubjectActionDefinitionV1[];
}
```

Use `NodeIO.readBinary()` and the glTF property graph to inspect Mesh, Skin, joint, Animation,
Material, Texture, Image, Camera, and external URI facts. Reject all non-finite transforms,
duplicate action IDs/source Clips, missing configured Clips, unexpected unmapped Clips, external
URIs, zero-duration Clips, and any rigged source whose Skin count is not exactly one.

The recovered package also exposes `sourceArchive`: unchanged input bytes plus a canonical
`extensions/source-archive/original.manifest.json`. Its deterministic residue inventory records
Camera/Light counts, glTF `extensionsUsed`/`extensionsRequired`, root/Node/Material `extras` counts,
and unknown top-level GLB JSON keys. The archive manifest sets
`runtimeConsumption: "forbidden"`; unknown content must not enter standard Model or Clip layers.

Compute `rigSignatureHash` from canonical JSON containing each joint's full path, parent path,
translation, rotation, scale, and inverse-bind matrix row in stable joint order.

- [ ] **Step 5: Implement Model, Material Set, and per-action Clip recovery**

Clone the source Document for each output. For the Model clone, dispose every Animation and prune
unreferenced animation data. For each Clip clone, keep only its selected Animation, clear Mesh/Skin
bindings from Scene nodes, dispose Mesh/Material/Texture/Camera properties, retain the target joint
hierarchy, and prune unreferenced render data. Rename the single retained Animation to the semantic
`actionId` only after preserving `sourceClipName` in the Clip manifest.

Serialize manifests using one stable canonical JSON helper that recursively orders object keys and
emits UTF-8 with a trailing newline. Hash the final GLB bytes and record literal byte lengths.

- [ ] **Step 6: Run GREEN and add adversarial cases**

Run the focused test after each case. Add tests proving stable diagnostics for:

- missing configured Clip;
- duplicate semantic action ID;
- one extra unmapped source Clip;
- static GLB supplied with actions;
- Model/Clip Rig signature mismatch after a joint transform mutation;
- two independent recoveries produce byte-identical GLBs and manifests.
- Source Archive bytes equal the input byte-for-byte and its manifest forbids Runtime consumption.

Run:

```bash
pnpm vitest run scripts/lib/modular-subject-source.test.ts
```

Expected: PASS, no warnings.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json pnpm-lock.yaml scripts/lib/modular-subject-source.ts scripts/lib/modular-subject-source.test.ts
git commit -m "feat(assets): add deterministic subject source recovery"
```

---

### Task 2: Package catalog, atomic CLI, and exact check mode

**Files:**
- Create: `scripts/lib/modular-subject-source-catalog.ts`
- Create: `scripts/modular-subject-source-packages.ts`
- Create: `scripts/modular-subject-source-packages.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 recovery API and explicit G Bot/Golden definitions.
- Produces: `writeModularSubjectSourcePackages(options)` plus CLI scripts `assets:subjects:modularize` and `assets:subjects:modularize:check`.

- [ ] **Step 1: Write failing CLI tests**

In temporary directories, execute the real CLI library against Golden and assert:

- write mode publishes the exact nested inventory only after complete validation;
- write mode includes the exact Source Archive and residue manifest under `extensions/`;
- check mode succeeds against unchanged output;
- tampering one Clip byte produces `MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH` and does not rewrite it;
- injected staging failure preserves the prior target directory byte-for-byte;
- unknown arguments and invocation without `--write` or `--check` fail closed.

Run:

```bash
pnpm vitest run scripts/modular-subject-source-packages.test.ts
```

Expected: FAIL because the CLI library does not exist.

- [ ] **Step 2: Add exact G Bot and Golden definitions**

Create two immutable catalog rows. G Bot maps all twenty-five actions from the tracked
`action-manifest.json`, including both `land.hard` and `land.hard.alt`, to exact source Clip names.
Golden maps `idle`, `walk`, `run`, and `jump`. Both rows hard-code the committed source SHA-256 so
unexpected source replacement fails before staging.

Catalog output ordering is package ID, then action ID. No filesystem or GLB discovery decides
semantic identity.

- [ ] **Step 3: Implement staging and atomic directory promotion**

The CLI creates a `mkdtemp()` sibling staging directory, writes only the recovery library's declared
relative paths, re-reads every staged file for validation, then atomically renames the complete
package directory. Existing targets move to an exact sibling backup and are restored on any
pre-commit failure. Cleanup never targets a repository root, `$HOME`, a glob, or an unresolved
environment variable.

Check mode writes only below an OS temporary directory, compares the recursive sorted inventory and
bytes, reports every mismatch deterministically, and removes only its owned temporary directory.

- [ ] **Step 4: Add root scripts and verify GREEN**

Add:

```json
"assets:subjects:modularize": "tsx scripts/modular-subject-source-packages.ts --write",
"assets:subjects:modularize:check": "tsx scripts/modular-subject-source-packages.ts --check"
```

Run:

```bash
pnpm vitest run scripts/lib/modular-subject-source.test.ts scripts/modular-subject-source-packages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add package.json scripts/lib/modular-subject-source-catalog.ts scripts/modular-subject-source-packages.ts scripts/modular-subject-source-packages.test.ts
git commit -m "feat(assets): add modular subject package CLI"
```

---

### Task 3: Recover and commit G Bot and Golden packages

**Files:**
- Create: `assets/subjects/packages/seedleap/g-bot/v1/**`
- Create: `assets/subjects/packages/seedleap/golden-humanoid/v1/**`

**Interfaces:**
- Consumes: Task 2 write/check CLI and committed merged GLBs.
- Produces: immutable modular source packages matching the design spec.

- [ ] **Step 1: Generate into owned package directories**

Run:

```bash
pnpm assets:subjects:modularize
```

Expected report:

- G Bot: one Model, one Material Set, twenty-five Animation Clips;
- Golden: one Model, one Material Set, four Animation Clips;
- each package: one byte-identical recovery-input archive plus a non-Runtime residue manifest;
- no current Runtime path modified.

- [ ] **Step 2: Verify exact deterministic outputs**

Run twice:

```bash
pnpm assets:subjects:modularize:check
pnpm assets:subjects:modularize:check
```

Both runs must exit 0 and report exact-byte matches. Inspect generated manifests and actual GLB
inventories using the Task 1 inspector; do not accept manifest-only evidence.

- [ ] **Step 3: Run focused existing regressions**

```bash
pnpm vitest run \
  scripts/lib/modular-subject-source.test.ts \
  scripts/modular-subject-source-packages.test.ts \
  scripts/lib/g-bot-evidence.test.ts \
  scripts/fixtures/generate-golden-humanoid-glb.test.ts
```

Expected: PASS. Confirm `git diff --name-only` contains no existing merged GLB path.

- [ ] **Step 4: Commit Task 3**

```bash
git add assets/subjects/packages/seedleap/g-bot/v1 assets/subjects/packages/seedleap/golden-humanoid/v1
git commit -m "feat(assets): recover modular G Bot and Golden sources"
```

---

### Task 4: xier120 migration inventory and product correction guide

**Files:**
- Create: `scripts/lib/subject-source-migration-audit.ts`
- Create: `scripts/lib/subject-source-migration-audit.test.ts`
- Modify: `scripts/modular-subject-source-packages.ts`
- Modify: `scripts/modular-subject-source-packages.test.ts`
- Create: `assets/subjects/packages/migration-inventory.json`
- Create: `docs/20-modular-subject-source-assets.md`
- Modify: `docs/16-subject-assets-3c-integration.md`
- Modify: `docs/superpowers/skills/product-asset-intake.md`
- Modify: `docs/superpowers/skills/product-asset-intake-static-assets.md`

**Interfaces:**
- Consumes: committed xier120 Registry manifests, source inventory, runtime GLB bytes, and Task 3 package manifests.
- Produces: deterministic machine inventory and a complete human correction document.

- [ ] **Step 1: Write failing inventory tests**

The test loads real repository data and requires exactly twenty-one package rows: G Bot, Golden,
and nineteen xier120 assets. It asserts each xier row keeps its exact committed source/runtime hash,
has `currentUseMode: "static-subject"`, and has no invented Rig or Animation Clip Ref.

It also asserts literal blockers:

```ts
expect(rowsById["xier120.quadruped-animal"].riggedBlockers).toContain(
  "source-has-18-skeletons",
);
expect(rowsById["xier120.quadruped-ridable"].riggedBlockers).toEqual(
  expect.arrayContaining(["source-has-2-skeletons", "control-owner-undefined"]),
);
```

Run:

```bash
pnpm vitest run scripts/lib/subject-source-migration-audit.test.ts
```

Expected: FAIL because the audit module does not exist.

- [ ] **Step 2: Implement deterministic audit generation**

Read Registry/source manifests and actual bytes; verify every declared hash and inventory before
classifying. Use only these closed statuses:

- `recovered-modular` for G Bot and Golden;
- `ready-static` for xier120 current use;
- `needs-visual-review` for G Bot recovered orientation evidence;
- `requires-product-reexport` as the rigged-upgrade disposition for all xier120 rows.

Classification is explicit by audited asset ID/category; do not infer capability from filenames,
Mesh names, or Clip names. Canonical JSON output is sorted by asset ID.

- [ ] **Step 3: Generate and verify the machine inventory**

Add the inventory to the package CLI's write/check closure, then run:

```bash
pnpm assets:subjects:modularize
pnpm assets:subjects:modularize:check
pnpm vitest run scripts/lib/subject-source-migration-audit.test.ts
```

Expected: 21/21 rows verified, including 19/19 xier120 source/runtime hashes.

- [ ] **Step 4: Write the product correction guide**

`docs/20-modular-subject-source-assets.md` must include:

- the five-layer product source architecture and immutable version rules;
- exact input directory example and commands;
- what this migration generated and what Runtime still uses;
- one table row for G Bot, Golden, and every xier120 ID;
- for each xier row: current static usability, rigged blocker, and exact product correction;
- separate requirements for single-Skeleton animals and rider/carrier composites;
- the fact that current assets have no textures and current Runtime uses whitebox material;
- evidence layering: structural recovery is not rendered equivalence;
- the next approved Runtime slice, without claiming it is implemented.

Update `docs/16-subject-assets-3c-integration.md`, the existing Subject asset import guide, so its
product-delivery section points to the modular package layout and correction guide, distinguishes
product-authoritative sources from current self-contained Runtime GLBs, and documents the
`extensions/` preservation/forbidden-consumption rule. Do not leave the older guide implying that a
single merged GLB is the preferred editable product source.

Synchronize the two detailed intake guides under `docs/superpowers/skills/` to the same authority:
new product delivery starts from the modular source package, Ready Static remains an explicitly
limited path, and existing merged GLBs are compatibility Runtime artifacts rather than editable
source templates. Keep their Registry/Resolver/runtime verification instructions intact.

Run `git diff --check` and manually verify every local link and command.

- [ ] **Step 5: Commit Task 4**

```bash
git add scripts/lib/subject-source-migration-audit.ts scripts/lib/subject-source-migration-audit.test.ts scripts/modular-subject-source-packages.ts scripts/modular-subject-source-packages.test.ts assets/subjects/packages/migration-inventory.json docs/20-modular-subject-source-assets.md docs/16-subject-assets-3c-integration.md docs/superpowers/skills/product-asset-intake.md docs/superpowers/skills/product-asset-intake-static-assets.md
git commit -m "docs(assets): publish subject migration corrections"
```

---

### Task 5: Integration verification and completion review

**Files:**
- Modify only if a confirmed regression requires a focused tested fix.

**Interfaces:**
- Consumes: final Task 1-4 tree.
- Produces: evidence that source migration is complete and current Runtime behavior remains intact.

- [ ] **Step 1: Run source-package gates**

```bash
pnpm assets:subjects:modularize:check
pnpm vitest run \
  scripts/lib/modular-subject-source.test.ts \
  scripts/modular-subject-source-packages.test.ts \
  scripts/lib/subject-source-migration-audit.test.ts
```

- [ ] **Step 2: Run affected existing gates**

```bash
pnpm vitest run \
  scripts/lib/g-bot-evidence.test.ts \
  scripts/fixtures/generate-golden-humanoid-glb.test.ts \
  scripts/verify-xier120-subjects.test.ts \
  packages/subject-registry/src/xier120-subjects.test.ts
pnpm verify:g-bot-subject
pnpm verify:rigged-subject
pnpm verify:xier120-subjects
pnpm typecheck
pnpm build
```

Record every exit code. Do not claim material switching, independent Runtime Clip loading, or
rendered replacement equivalence.

- [ ] **Step 3: Inspect source and repository hygiene**

```bash
git diff --check origin/main...HEAD
git status --short
git diff --name-only origin/main...HEAD
```

Confirm no old Runtime GLB was changed or deleted, no source FBX was changed, and no other worktree
was touched.

- [ ] **Step 4: Run independent whole-branch review**

Review the actual branch diff under Full-dimension mode B, including D2/D3/D5/D6 and the Runtime
asset/resource-ownership checklist where applicable. Reproduce every finding before any fix and
rerun only invalidated evidence.

- [ ] **Step 5: Complete the branch**

Use `superpowers:finishing-a-development-branch` after all findings are closed. Do not merge, push,
or delete the worktree without explicit authorization for those side effects.

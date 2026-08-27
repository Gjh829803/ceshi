# Subject Onboarding and Source Asset Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the twelve supplied FBX vehicle sources under version control with truthful status, and add a safe manifest/CLI/workspace path for creating new whitebox or strictly compatible rigged-biped Subject Definitions.

**Architecture:** Raw FBX is source inventory only and never enters Babylon Runtime. A strict onboarding manifest selects closed tooling templates and existing Registry capabilities. Browser guides and exports; local CLI validates, plans, and transactionally generates allowlisted Registry/resolver/example files.

**Tech Stack:** TypeScript, Vitest, Node crypto/filesystem, Babylon GLB loader through existing `SubjectAssetCacheV1`, JSON catalogs, Vite Playground.

**Spec:** `docs/superpowers/specs/2026-08-21-subject-preset-workspace-design.md`

## Global Constraints

- Commit only the twelve `.fbx` files requested; do not copy `.blend`, `.blend1`, preview JPEG, or backup files.
- Every FBX stays `runtimeStatus: "source-only"`, `format: "fbx"`, and `conversionRequired: true`; it is excluded from Subject discovery and Babylon loading.
- Runtime assets remain self-contained GLB; never claim raw FBX is runnable.
- First onboarding slice supports primitive whitebox assembly and the existing strict one-Skeleton/one-asset-part/in-place four-action rigged-biped GLB contract.
- Generated canonical definitions have empty `relationshipCapabilityRefs`; Seat/Mount/Tether fail closed.
- Browser cannot write repository files; CLI generation requires explicit non-main transactional `--write`.

---

### Task 1: Import and verify the twelve source-only FBX assets

**Files:**
- Create binary files under: `assets/subjects/source-fbx/vehicles/<source-id>/source.fbx`
- Create: `assets/subjects/source-fbx/vehicles/catalog.json`
- Create: `packages/subject-registry/src/source-asset-inventory.ts`
- Create: `packages/subject-registry/src/source-asset-inventory.test.ts`
- Modify: `packages/subject-registry/src/index.ts`

**Interfaces:**
- Produces: `SourceAssetInventoryCatalogV1`
- Produces: `listSourceAssetCandidatesV1()`

- [ ] **Step 1: Write RED inventory tests**

```ts
it("locks every source-only FBX and excludes it from runtime subject discovery", async () => {
  const entries = listSourceAssetCandidatesV1();
  expect(entries).toHaveLength(12);
  expect(entries.every((entry) =>
    entry.runtimeStatus === "source-only" &&
    entry.format === "fbx" &&
    entry.conversionRequired === true
  )).toBe(true);
  for (const entry of entries) {
    expect(await sha256File(resolveRepoPath(entry.repositoryRelativePath)))
      .toBe(entry.contentHash);
  }
  expect(builtInSubjectResourceRegistry.listCapabilitySubjectDefinitions()
    .some((definition) => entries.some((entry) => definition.id === entry.sourceId)))
    .toBe(false);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm exec vitest run packages/subject-registry/src/source-asset-inventory.test.ts`

Expected: FAIL.

- [ ] **Step 3: Resolve exact source files before copying**

Read only `.fbx` beneath `D:\01_Workspace\01_Loopit\07_world_model\引擎编辑器\模型资产\载具`; assert count `12`, every resolved path remains beneath that directory, and every file is below GitHub's 100 MB single-file limit.

- [ ] **Step 4: Copy binaries with stable English ids**

Use these ids: `two-wheel`, `aerial-hanging`, `aerial-cockpit`, `aerial-cockpit-variant`, `aerial-standing`, `aerial-seated`, `aerial-seated-variant`, `hoverboard-standing`, `prone-glider`, `flat-seated-glider`, `four-wheel`, `quadruped-ridable`. Preserve original Chinese filenames only as metadata.

- [ ] **Step 5: Generate and validate catalog**

Each closed entry includes `sourceId`, `originalRelativePath`, `repositoryRelativePath`, `byteLength`, `contentHash`, `coarseClass`, `format: "fbx"`, `runtimeStatus: "source-only"`, and `conversionRequired: true`. Sort by `sourceId`; recompute bytes/hash in tests.

- [ ] **Step 6: Run test and Git size audit**

Run: `pnpm exec vitest run packages/subject-registry/src/source-asset-inventory.test.ts`

Run: `git ls-files --stage assets/subjects/source-fbx`

Expected: 12 binaries plus catalog; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add assets/subjects/source-fbx packages/subject-registry/src/source-asset-inventory.ts packages/subject-registry/src/source-asset-inventory.test.ts packages/subject-registry/src/index.ts
git commit -m "assets: add source-only vehicle FBX inventory"
```

### Task 2: Strict onboarding manifest and validator

**Files:**
- Create: `packages/authoring/src/subject-onboarding.ts`
- Create: `packages/authoring/src/subject-onboarding.test.ts`
- Modify: `packages/authoring/src/index.ts`

**Interfaces:**
- Produces: `parseSubjectOnboardingManifestV1`
- Produces: `validateSubjectOnboardingManifestV1`
- Consumes: source inventory and locked Subject Registry

- [ ] **Step 1: Write RED schema tests**

Test valid primitive whitebox; valid G Bot-class strict biped fixture; absolute/drive/UNC/URI/`..` paths; symlink; external GLB URI; missing license; missing bone/action map; multiple skeleton/asset-part facts; root motion; unknown tooling template; reserved Kernel/Camera Algorithm; command mismatch; relationship capability.

```ts
expect(() => parseSubjectOnboardingManifestV1({
  ...validWhiteboxManifest(),
  relationshipCapabilityRefs: ["worldkit://capability/relationship.seat@1"],
})).toThrow("ONBOARDING_RELATIONSHIP_CAPABILITY_UNSUPPORTED");
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm exec vitest run packages/authoring/src/subject-onboarding.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement discriminated projection**

Implement only `whitebox-assembly` and `rigged-biped-glb`. Whitebox permits box/capsule/sphere/cylinder and local sockets. Rigged GLB requires a manifest-relative path, exact 17-bone map, exact idle/walk/run/jump map, explicit root and asset rotation. Reject unknown fields.

- [ ] **Step 4: Implement capability/template validation**

Map the six closed `onboardingTemplateId` values to explicit body/topology/capability defaults. Resolve selected Motion, Control, Camera Context/Algorithm, Collider, Medium and Harness. Reject reserved implementations and any relationship refs.

- [ ] **Step 5: Run test and typecheck**

Run: `pnpm exec vitest run packages/authoring/src/subject-onboarding.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/authoring/src/subject-onboarding.ts packages/authoring/src/subject-onboarding.test.ts packages/authoring/src/index.ts
git commit -m "feat: add strict subject onboarding manifests"
```

### Task 3: Onboarding plan and transactional generator CLI

**Files:**
- Create: `scripts/lib/subject-onboarding.ts`
- Create: `scripts/lib/subject-onboarding.test.ts`
- Modify: `scripts/cli/worldkit.ts`

**Interfaces:**
- Produces: `planSubjectOnboardingV1`
- Produces: `generateSubjectOnboardingTransactionallyV1`

- [ ] **Step 1: Write RED generator tests**

Test read-only validate/plan, strict biped GLB inventory using committed G Bot, whitebox generation, same-origin resolver output, default Camera resolution, example fixture, main/detached/dirty rejection, path/symlink rejection, stale preimages and rollback.

```ts
it("plans a primitive subject without asset or relationship resources", async () => {
  const plan = await planSubjectOnboardingV1(validWhiteboxManifest(), fixtureRepo());
  expect(plan.targets.some((target) => target.path.includes("subject-definitions"))).toBe(true);
  expect(plan.targets.some((target) => target.path.endsWith(".glb"))).toBe(false);
  expect(plan.generatedSubjectDefinition.relationshipCapabilityRefs).toEqual([]);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm exec vitest run scripts/lib/subject-onboarding.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement deterministic plan**

For whitebox, emit only a V3 Subject Definition and example/test fixture. For rigged biped, use existing Babylon `SubjectAssetCacheV1` preflight to verify one Skeleton, bounds, inventory and clips; emit asset/rig/animation/collider/definition resources, versioned public GLB path, resolver map update and fixture. The plan shows exact Context → Camera Profile → Algorithm and Socket requirements.

- [ ] **Step 4: Implement transactional generation**

Reuse the same read-only Git guard and transactional writer as preset promotion. No catalog, resolver or asset write occurs until the entire generated Registry and resolver test validates in a temporary tree.

- [ ] **Step 5: Wire exact CLI commands**

Implement `subject onboard validate`, `subject onboard plan`, and `subject onboard generate --write`. Commands return stable JSON diagnostics and never commit or push.

- [ ] **Step 6: Run focused tests**

Run: `pnpm exec vitest run scripts/lib/subject-onboarding.test.ts packages/authoring/src/subject-onboarding.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/subject-onboarding.ts scripts/lib/subject-onboarding.test.ts scripts/cli/worldkit.ts
git commit -m "feat: add subject onboarding generator"
```

### Task 4: Onboarding workspace panel and end-to-end evidence

**Files:**
- Create: `apps/playground/src/subject-onboarding-workbench.ts`
- Create: `apps/playground/src/subject-onboarding-workbench.test.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/src/style.css`
- Modify: `README.md`
- Modify: `docs/19-subject-preset-workspace.md`

**Interfaces:**
- Consumes: source inventory, manifest parser, preset workbench
- Produces: user-facing source inventory and onboarding manifest export

- [ ] **Step 1: Write RED model/UI tests**

Test all 12 source cards show “待转换，不能运行”; no source card appears in Subject selector; whitebox and strict biped form validation; Camera Context resolution summary; manifest download; no repository or network mutation.

```ts
it("keeps source-only FBX outside runnable subject choices", () => {
  const model = createSubjectOnboardingWorkbenchModel(fixtureInventory(), fixtureSubjects());
  expect(model.sourceCandidates).toHaveLength(12);
  expect(model.sourceCandidates.every((entry) => entry.statusLabel === "待转换，不能运行")).toBe(true);
  expect(model.runnableSubjects.some((subject) =>
    model.sourceCandidates.some((entry) => entry.sourceId === subject.id)
  )).toBe(false);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm exec vitest run apps/playground/src/subject-onboarding-workbench.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement guided panel**

Add steps: source/assembly, coordinate facts, rig/actions when applicable, capability template, default Camera, preflight/export. Use explicit Chinese status text and keep “FBX 源文件” separate from “可运行 GLB / 白模主体”.

- [ ] **Step 4: Add operator documentation**

Document how an intern adds a source asset, why FBX is not runnable, how to convert externally to self-contained GLB, how to create/validate a manifest, and how a reviewed branch becomes a public default.

- [ ] **Step 5: Run full relevant gates**

Run: `pnpm exec vitest run apps/playground/src/subject-onboarding-workbench.test.ts packages/subject-registry/src/source-asset-inventory.test.ts packages/authoring/src/subject-onboarding.test.ts scripts/lib/subject-onboarding.test.ts`

Run: `pnpm typecheck && pnpm build`

Expected: PASS.

- [ ] **Step 6: Browser QA**

Confirm the source inventory count/status, download a whitebox manifest, validate it through CLI, and launch the generated fixture without diagnostics. Confirm selecting any raw FBX never attempts a Babylon load.

- [ ] **Step 7: Commit**

```bash
git add apps/playground/src README.md docs/19-subject-preset-workspace.md
git commit -m "feat: add subject onboarding workspace"
```

# Subject Preset Workspace and Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a typed local workspace for Motion selection plus Control Feel, Control, and multiple Camera Profile tuning, then export and safely promote immutable public-default versions.

**Architecture:** Playground owns mutable/local Feel/Control drafts, Camera session preview, and candidate download. Subject Registry owns exact resource closure and public-default validation. Babylon Runtime owns exact compiled Profile selection plus atomic Camera application; it does not own a second Feel/Control numeric overlay. A local CLI validates and transactionally writes versioned resources on a clean non-main branch; it never performs mutating Git operations.

**Tech Stack:** TypeScript 5.9, Vitest, Babylon.js 9.21, Vite, Node.js CLI, JSON catalogs, localStorage, canonical SHA-256 helpers.

**Spec:** `docs/superpowers/specs/2026-08-21-subject-preset-workspace-design.md`

## Global Constraints

- Existing `@N` Registry resources are immutable; publication creates new exact versions.
- Public defaults are explicit exact Ref/hash entries; never infer newest.
- Browser code cannot write the repository, invoke Git, or use network credentials.
- Candidate and local override maps are numeric, closed, finite, range-checked, and include exact base Ref/hash.
- Motion Profiles are parameter-free algorithm selections and are preserved by exact Ref/hash.
- Control Feel owns the centralized P1.5 movement values, including response exponent.
- Control V1 exposes only the current Runtime's `moveDeadzoneRatio`.
- Relationship-stripped Playground preview clones cannot be promoted.
- CLI writes require `--write`, a clean symbolic non-`main` branch, an exact fresh plan, allowlisted paths, and transactional rollback.
- P1.5 `control-feel-profile` is implemented and is the sole numeric movement-feel authority.
- Follow `docs/reviews/runtime-deep-review-checklist.md` for Control Feel, Control and Camera changes.

---

### Task 1: Registry closure and public-default authority

**Files:**
- Create: `packages/runtime-contracts/src/subject-preset.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Create: `packages/subject-registry/src/subject-preset-closure.ts`
- Create: `packages/subject-registry/src/subject-default-registry.ts`
- Create: `packages/subject-registry/src/subject-preset-closure.test.ts`
- Create: `packages/subject-registry/src/subject-default-registry.test.ts`
- Create: `assets/registry/subject-defaults/catalog.json`
- Modify: `packages/subject-registry/src/index.ts`
- Modify: `packages/subject-registry/package.json`

**Interfaces:**
- Produces: shared `NumericProfileOverrideV1`
- Produces: `resolveSubjectPresetClosureV1(registry, subjectDefinitionRef): SubjectPresetClosureV1`
- Produces: `createSubjectDefaultRegistryV1(catalog, subjectRegistry): SubjectDefaultRegistryV1`
- Produces: `builtInSubjectDefaultRegistry`

- [ ] **Step 1: Write failing closure and default-registry tests**

```ts
it("returns the complete sorted exact dependency closure", () => {
  const closure = resolveSubjectPresetClosureV1(
    builtInSubjectResourceRegistry,
    "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
  );
  expect(closure.entries.map((entry) => entry.resourceRef)).toEqual(
    [...closure.entries.map((entry) => entry.resourceRef)].sort(),
  );
  expect(closure.entries).toContainEqual(expect.objectContaining({
    resourceRef: "worldkit://motion-profile/wheeled-arcade.four-wheel@1",
  }));
  expect(closure.entries).toContainEqual(expect.objectContaining({
    resourceRef: "worldkit://camera-context/capability-driven.default@1",
  }));
});

it("rejects a default whose exact hash or definition id does not match", () => {
  expect(() => createSubjectDefaultRegistryV1({
    schemaVersion: 1,
    defaults: [{
      subjectDefinitionId: "wrong-id",
      subjectDefinitionRef: "worldkit://subject-definition/vehicle.four-wheel.arcade@1",
      subjectDefinitionContentHash: "sha256:" + "0".repeat(64),
    }],
  }, builtInSubjectResourceRegistry)).toThrow("SUBJECT_DEFAULT_ENTRY_INVALID");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run packages/subject-registry/src/subject-preset-closure.test.ts packages/subject-registry/src/subject-default-registry.test.ts`

Expected: FAIL because modules and catalog do not exist.

- [ ] **Step 3: Implement pure closure traversal**

Define exact entries:

```ts
export interface NumericProfileOverrideV1 {
  baseResourceRef: string;
  baseContentHash: string;
  values: Readonly<Record<string, number>>;
}

export interface SubjectPresetResourceLockEntryV1 {
  resourceRef: string;
  resourceKind: SubjectRegistryResourceV3["kind"];
  version: number;
  contentHash: string;
}

export interface SubjectPresetClosureV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
  entries: readonly SubjectPresetResourceLockEntryV1[];
  contentHash: string;
}
```

Traverse Subject asset/rig/animation/collider, every default/optional/fallback Motion/Profile Kernel, Control, Camera Context/default/first-person/rule Rig Profiles, Rig Algorithms, modifiers, Medium, Harness, Pose and Render refs. Resolve by resource kind; reject missing refs and cycles; deduplicate and sort by `resourceRef`; canonical-hash the entries.

- [ ] **Step 4: Implement strict public-default catalog**

```ts
export interface SubjectDefaultEntryV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
}

export interface SubjectDefaultRegistryV1 {
  resolvePublicDefault(subjectDefinitionId: string): SubjectDefaultEntryV1 | undefined;
  listPublicDefaults(): readonly SubjectDefaultEntryV1[];
}
```

Parse a closed object, require sorted unique ids, resolve exact refs against the locked Registry, and verify definition `id` plus `contentHash`. Seed all six current canonical Subject Definition refs as initial public defaults without altering their Registry resources.

- [ ] **Step 5: Run tests and Registry regression**

Run: `pnpm exec vitest run packages/subject-registry/src/subject-preset-closure.test.ts packages/subject-registry/src/subject-default-registry.test.ts packages/subject-registry/src/subject-registry.test.ts packages/subject-registry/src/capability-registry.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime-contracts packages/subject-registry assets/registry/subject-defaults
git commit -m "feat: add subject preset closure and public defaults"
```

### Task 2: Typed local preset repository and V4 migration

**Files:**
- Create: `apps/playground/src/subject-preset-local.ts`
- Create: `apps/playground/src/subject-preset-local.test.ts`
- Modify: `apps/playground/src/main.ts`

**Interfaces:**
- Consumes: `SubjectPresetClosureV1`
- Produces: `createSubjectPresetLocalRepository(storage): SubjectPresetLocalRepositoryV1`
- Produces: pure `compareSubjectPresetSemanticContentV1`

- [ ] **Step 1: Write RED tests for multi-profile persistence and migration**

```ts
it("round-trips named versions with independent camera profiles", () => {
  const repository = createSubjectPresetLocalRepository(memoryStorage());
  const version = repository.saveVersion(fixtureDraft({
    cameraOverridesByProfileRef: {
      "worldkit://camera-profile/orbit.medium@1": override("sha256:a", { distanceMeters: 5 }),
      "worldkit://camera-profile/follow.medium@1": override("sha256:b", { distanceMeters: 7 }),
    },
  }), { displayName: "Vehicle calm", notes: "baseline" });
  expect(repository.getVersion(version.localVersionId)?.content)
    .toEqual(version.content);
});

it("migrates V4 keys once and scopes the old camera preference", () => {
  const storage = legacyV4Storage();
  const repository = createSubjectPresetLocalRepository(storage);
  repository.migrateV4(fixtureBaseline());
  repository.migrateV4(fixtureBaseline());
  expect(repository.listVersions("vehicle.four-wheel.arcade")).toHaveLength(1);
  expect(storage.getItem("worldkit.subject-preset-migration.v1")).not.toBeNull();
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm exec vitest run apps/playground/src/subject-preset-local.test.ts`

Expected: FAIL because repository is missing.

- [ ] **Step 3: Implement closed local types and canonical hash**

Use the spec's `SubjectPresetWorkingDraftV1`, `SubjectPresetLocalVersionV1`, and `SubjectPresetLocalDefaultPointerV1`. Import the shared override from Runtime Contracts:

```ts
import type { NumericProfileOverrideV1 } from "@whitebox-world/runtime-contracts";
```

Reject unknown kinds/schema versions, non-finite values, duplicate version ids, mismatched profile map keys and base refs. Hash semantic content only. Storage operations return `{ status: "persisted" | "memory-only", diagnostic? }` rather than swallowing exceptions.

- [ ] **Step 4: Implement idempotent V4 migration**

Read exact legacy motion and every resolvable camera key for the current definition/profile hashes. Record migrated source keys in `worldkit.subject-preset-migration.v1`. Never reapply a receipt; never delete malformed source data; return diagnostics for hash drift.

- [ ] **Step 5: Replace direct main.ts draft ownership**

Keep current controls working, but route draft reads/writes through the repository. Do not yet add new UI layout; expose one `SubjectPresetWorkbenchModelV1` from `main.ts` initialization for Task 7.

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run apps/playground/src/subject-preset-local.test.ts apps/playground/src/worldkit-browser-api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/playground/src/subject-preset-local.ts apps/playground/src/subject-preset-local.test.ts apps/playground/src/main.ts
git commit -m "feat: add local subject preset versions"
```

### Task 3: Control Feel, Control and atomic Runtime preset application

**Files:**
- Modify: `packages/subject-registry/src/types-v3.ts`
- Modify: `assets/registry/control-profiles/catalog.json`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-babylon/src/control-profile-runtime.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/control-profile-runtime.test.ts`
- Modify: `packages/runtime-babylon/src/capability-runtime.test.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`

**Interfaces:**
- Produces: local draft numeric differences limited to the centralized P1.5 parameter contract
- Produces: Runtime selection of exact compiled Control Feel/Control Profile Refs
- Produces: `applySubjectPresetTuning(request): SubjectPresetTuningReceiptV1`

- [ ] **Step 1: Write RED tests for locked Control Feel/Control authority**

```ts
it("uses the locked Control deadzone and Control Feel response exactly once", () => {
  const lockedControl = planarProfile({ moveDeadzoneRatio: 0.4 });
  expect(compileMotionCommandV1(lockedControl, [], frame(), { moveYRatio: 0.3 }, 2))
    .toMatchObject({ directionMetersXZ: [0, 0] });
  expect(hasForwardControlIntentV1(lockedControl, [], { moveYRatio: 0.3 }, 2)).toBe(false);
});
```

Add integration tests proving Browser/Runtime numeric setters are absent, Snapshot
contains no Feel/Control tuning bags, exact locked Feel Ref switching succeeds,
and an unavailable Ref rejects atomically without changing Camera or Subject state.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run packages/runtime-babylon/src/control-profile-runtime.test.ts packages/runtime-babylon/src/capability-runtime.test.ts`

Expected: FAIL while the obsolete session overlay remains exposed.

- [ ] **Step 3: Keep Control Profile declarations free of movement-feel fields**

Keep numeric `safetyLimits` and `authoringRanges` in the authoring/candidate lane for the existing input-tuning fields. Browser runtime discovery publishes only exact Profile identity for Feel/Control. Catalog defaults remain byte-for-byte equivalent in effective behavior, and Registry admission rejects unknown/non-finite/unsafe materialized resources.

- [ ] **Step 4: Keep Runtime on exact locked Control Feel and Control resources**

SubjectController stores no transient Feel/Control maps. It consumes one compiled
Control Profile and one exact locked Control Feel per tick; `compileMotionCommandV1`
and `hasForwardControlIntentV1` receive the same deadzone and response exponent.
Snapshot publishes the active exact Control Feel Ref and no numeric overlay.

- [ ] **Step 5: Add atomic preset request and receipt**

```ts
export interface ApplySubjectPresetTuningRequestV1 {
  subjectEntityId: string;
  expectedSubjectDefinitionRef: string;
  expectedSubjectDefinitionContentHash: string;
  selectedControlFeelProfileRef: string;
  selectedControlProfileRef: string;
  cameraOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  cameraPreference: string;
}

export interface SubjectPresetTuningReceiptV1 {
  status: "committed" | "rejected";
  diagnostic?: { code: string; message: string };
  snapshot: WorldRuntimeSnapshotV3;
}
```

Validate the selected Feel against the compiled `availableControlFeels`, require the exact compiled Control Ref, then validate every Camera ref/hash/name/value and algorithm before mutation. Commit the Ref selections, Camera maps and preference together; on any failure return the previous snapshot unchanged. Feel/Control numeric differences remain local/candidate-only until promotion materializes new Registry versions.

- [ ] **Step 6: Run focused and contract tests**

Run: `pnpm exec vitest run packages/runtime-babylon/src/control-profile-runtime.test.ts packages/runtime-babylon/src/capability-runtime.test.ts packages/subject-registry/src/subject-registry.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime-contracts packages/runtime-babylon packages/subject-registry assets/registry/control-profiles
git commit -m "feat: add ref-locked preset preview"
```

### Task 4: Candidate schema, legacy import, and Browser baseline API

**Files:**
- Create: `packages/authoring/src/subject-preset-candidate.ts`
- Create: `packages/authoring/src/subject-preset-candidate.test.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/package.json`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`

**Interfaces:**
- Produces: `parseSubjectPresetCandidateV1`, `createSubjectPresetCandidateV1`
- Produces: `importLegacyAuthoringSnapshotV4`
- Produces: Browser `getSubjectPresetBaseline` and `applySubjectPresetTuning`

- [ ] **Step 1: Write strict candidate RED tests**

Cover canonical semantic hash, full closure, multi-camera derive/preserve exact-set rules, single selected Control override, Motion roles, unknown fields, source drift, preview clones, non-finite values and forged hashes.

```ts
expect(() => parseSubjectPresetCandidateV1({
  ...validCandidate(),
  semanticContent: { ...validCandidate().semanticContent, unexpected: true },
})).toThrow("SUBJECT_PRESET_CANDIDATE_UNKNOWN_FIELD");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run packages/authoring/src/subject-preset-candidate.test.ts apps/playground/src/worldkit-browser-api.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement strict parser and constructor**

Use manual projection or the repository's schema utilities; do not clone untrusted objects. Validate ids, 40-hex source commit, ISO timestamps, max 128-char display name, max 4096-char notes, exact override base refs/hashes and canonical semantic hash. Candidate evidence remains provenance.

- [ ] **Step 4: Implement explicit legacy V4 adapter**

Accept only the existing `schemaVersion: 4` authoring export shape. Resolve its exact Subject Definition and compatible profiles through the Registry closure. Convert only supported numeric differences. Reject relationship preview clones and unknown parameter names.

- [ ] **Step 5: Expose read-only baseline and atomic apply in Browser API**

Return a deep-frozen closure plus compatible Motion/Control Feel/Control/Camera
summaries and public-default entry. Preserve Browser protocol compatibility by
adding non-enumerable optional extensions in the existing wrapper pattern.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm exec vitest run packages/authoring/src/subject-preset-candidate.test.ts apps/playground/src/worldkit-browser-api.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/authoring packages/runtime-contracts apps/playground/src/worldkit-browser-api.ts apps/playground/src/worldkit-browser-api.test.ts
git commit -m "feat: add locked subject preset candidates"
```

### Task 5: Deterministic promotion CLI

**Files:**
- Create: `scripts/lib/subject-preset-promotion.ts`
- Create: `scripts/lib/subject-preset-promotion.test.ts`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateSubjectPresetCandidateFile`
- Produces: `planSubjectPresetPromotion`
- Produces: `promoteSubjectPresetTransactionally`

- [ ] **Step 1: Write RED CLI/transaction tests**

Test validate/plan no writes; detached/main/dirty/missing-write rejection; stale preimage and plan-hash rejection; absolute/drive/UNC/URI/`..`/symlink target rejection; version collision; same-volume transaction rollback; exact successful new resource/default output.

```ts
await expect(promoteSubjectPresetTransactionally(fixture, {
  branch: "main",
  write: true,
})).rejects.toThrow("SUBJECT_PRESET_PROMOTION_MAIN_FORBIDDEN");
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `pnpm exec vitest run scripts/lib/subject-preset-promotion.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement deterministic plan materialization**

Preserve exact Motion Profile refs; create subject-scoped Control Feel, Control
and Camera Profile refs as requested; copy/rewrite Camera Context refs; create
the next Subject Definition version; and optionally update defaults. Every plan
target includes logical relative path, preimage hash or `null`, postimage hash
and canonical bytes. Generate a candidate-specific fixture path in
`.codex-tmp/subject-presets/`.

- [ ] **Step 4: Implement read-only Git guard and transaction**

Use `execFile(process.execPath, ...)` only for Node tools and `execFile("git", [...])` for read-only `rev-parse`, `symbolic-ref`, and `status`. Reject detached/main/dirty. Recheck before final promotion. Reuse `scripts/lib/transactional-artifact-promotion.ts`; lstat every ancestor and reject symlinks.

- [ ] **Step 5: Wire CLI commands and help**

Implement exact commands from the spec. `validate` and `plan` default to JSON-safe diagnostics; `promote` requires both `--plan` and `--write`.

- [ ] **Step 6: Run tests and CLI smoke**

Run: `pnpm exec vitest run scripts/lib/subject-preset-promotion.test.ts`

Run: `pnpm worldkit subject-preset validate C:\Users\13031\Downloads\subject-animal-quadruped.worldkit-authoring.json --legacy-v4 --json`

Expected: tests PASS; CLI emits one valid converted candidate summary without writing.

- [ ] **Step 7: Commit**

```bash
git add scripts package.json
git commit -m "feat: add subject preset promotion CLI"
```

### Task 6: Seed the quadruped public default through the real promotion path

**Files:**
- Create: `assets/subject-presets/candidates/animal.quadruped.forward-steer-v1.json`
- Modify: `assets/registry/motion-profiles/catalog.json`
- Modify: `assets/registry/camera-profiles/catalog.json`
- Modify: `assets/registry/subject-definitions/catalog.json`
- Modify: `assets/registry/subject-defaults/catalog.json`
- Test: `packages/subject-registry/src/subject-default-registry.test.ts`

**Interfaces:**
- Consumes: promotion CLI from Task 5
- Produces: exact quadruped public default pointing at a new Subject Definition version

- [ ] **Step 1: Convert legacy export into strict candidate**

Use the CLI legacy adapter. Preserve only the approved six differences:

```json
{
  "motion": {
    "turnRateRadiansPerSecond": 2.4,
    "jumpSpeedMetersPerSecond": 3.1,
    "bodyLeanMaximumRadians": 0.09
  },
  "camera": {
    "targetHeightMeters": 1.35,
    "collisionRetractionPerSecond": 4.5,
    "collisionRecoveryPerSecond": 3.25
  }
}
```

- [ ] **Step 2: Validate and generate promotion plan**

Run candidate validate and plan into `.codex-tmp/subject-presets/`; inspect that original `@1` resources have no target writes and every new ref is subject-scoped/versioned.

- [ ] **Step 3: Promote with explicit write on feature branch**

Run the exact generated plan through
`subject-preset promote --plan <plan.json> --harness-receipt <receipt.json> --write`.
The Receipt must come from the trusted Harness/CI run for that exact Candidate,
plan and source commit; browser-reported checks are informational only.

- [ ] **Step 4: Add regression assertions**

Assert the default Registry resolves `animal.quadruped.forward-steer` to the new
exact Subject Definition/hash, its Motion roles retain the baseline refs, and
the derived Control Feel and Camera resources contain the five retained values.

- [ ] **Step 5: Run Registry and Runtime harness tests**

Run: `pnpm exec vitest run packages/subject-registry/src/subject-default-registry.test.ts packages/runtime-babylon/src/capability-runtime.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/subject-presets assets/registry packages/subject-registry/src/subject-default-registry.test.ts
git commit -m "assets: publish quadruped tuning default"
```

### Task 7: Large workbench UI

**Files:**
- Create: `apps/playground/src/subject-preset-workbench.ts`
- Create: `apps/playground/src/subject-preset-workbench.test.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/src/style.css`

**Interfaces:**
- Consumes: local repository, Browser baseline, atomic apply, candidate constructor
- Produces: one user-facing workspace for tuning/versioning/publishing

- [ ] **Step 1: Write RED workbench model tests**

Test save/rename/duplicate/delete/set-default/restore, cross-profile Camera isolation, diff grouping, storage failure status, atomic rejection preservation, and candidate download with no fetch/write call.

```ts
it("restores a named version atomically without leaking camera tuning", () => {
  const receipt = model.restoreVersion("local-v2");
  expect(receipt.status).toBe("committed");
  expect(runtime.applyRequests).toHaveLength(1);
  expect(runtime.applyRequests[0]?.cameraOverridesByProfileRef)
    .toEqual(localVersionV2().content.cameraOverridesByProfileRef);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run apps/playground/src/subject-preset-workbench.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extract the authoring panel from main.ts**

Build a focused controller/view module. Render sections: baseline, Motion
selection, Control Feel/Control/Camera tabs, local versions, evidence and
publish. Use plain Chinese labels such as “保存本地版本”, “设为本机默认”,
“恢复此版本”, “与公共默认对比”, and “导出待发布配置”. Do not show
callback/Registry implementation jargon.

- [ ] **Step 4: Render truthful parameter state**

Each row shows default, current value, source, authoring range, Runtime support
and apply receipt. Camera tabs retain separate maps. Conditional controls are
disabled with a reason. Control displays only deadzone; response and all other
movement-feel values are displayed under Control Feel. Motion has no numeric
slider surface.

- [ ] **Step 5: Wire versions and candidate export**

Use prompt-free inline name/notes fields. Delete requires one confirmation and affects localStorage only. Candidate export downloads `*.worldkit-subject-preset.json`; publication instructions show CLI commands but never a “push main” button.

- [ ] **Step 6: Run UI tests, typecheck and build**

Run: `pnpm exec vitest run apps/playground/src/subject-preset-workbench.test.ts apps/playground/src/worldkit-browser-api.test.ts && pnpm typecheck && pnpm build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/playground/src
git commit -m "feat: add versioned subject tuning workspace"
```

### Task 8: Integration verification and browser QA

**Files:**
- Modify: `README.md`
- Create: `docs/19-subject-preset-workspace.md`
- Modify tests only when a confirmed regression needs a focused reproducer.

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified end-to-end delivery evidence

- [ ] **Step 1: Add operator documentation**

Document local versions, local default, candidate export, validate/plan/promote, public default rollback, and the distinction between source-only assets and Runtime GLB assets.

- [ ] **Step 2: Run focused complete suites**

Run: `pnpm test:studio`

Run: `pnpm typecheck`

Run: `pnpm test`

Run: `pnpm build`

- [ ] **Step 3: Run canonical verifiers**

Run: `pnpm verify:canonical`

Run: `pnpm verify:placement-layout`

Run: `pnpm verify:rigged-subject`

Run: `pnpm verify:g-bot-subject`

- [ ] **Step 4: Browser QA**

Open Authoring Playground and verify: select all six frozen Subject refs; select
Motion and tune Control Feel/Control/two Camera Profiles; save two local
versions; set/restore local default across refresh; export candidate; validate
quadruped default; confirm no diagnostics, NaN, startup failure or
relationship-truthfulness regression.

- [ ] **Step 5: Independent review**

Run two-stage code review for spec compliance and code quality. Resolve every Critical/Important finding and rerun affected tests.

- [ ] **Step 6: Final commit**

```bash
git add README.md docs
git commit -m "docs: document subject preset publishing"
```

### Task 9: Merge verified delivery and push GitHub main

**Files:**
- No source-file changes.

**Interfaces:**
- Consumes: completed preset plan and `2026-08-21-subject-onboarding-assets.md`
- Produces: `origin/main` containing the verified delivery

- [ ] **Step 1: Prove feature branch is clean and based on current origin**

Run: `git status --short --branch`

Run: `git fetch origin main`

Run: `git merge-base --is-ancestor origin/main HEAD`

Expected: clean feature branch; ancestor command exits `0`.

- [ ] **Step 2: Record final verification evidence**

Run: `git log --oneline origin/main..HEAD`

Run: `git diff --check origin/main...HEAD`

Expected: only intended implementation commits and no whitespace errors.

- [ ] **Step 3: Fast-forward local main**

```bash
git switch main
git merge --ff-only feature/subject-preset-workspace
```

Expected: local `main` advances without a merge conflict or synthetic merge commit.

- [ ] **Step 4: Push authorized main update**

Run: `git push origin main`

Expected: remote reports the old `origin/main` to final verified commit update.

- [ ] **Step 5: Verify local and remote identity**

Run: `git status --short --branch`

Run: `git rev-parse HEAD`

Run: `git rev-parse origin/main`

Expected: clean `main`, and both hashes are identical.

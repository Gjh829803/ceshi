# G Bot Product Asset S1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the committed G Bot humanoid as a Registry-backed, AI-selectable, physically playable rigged Subject with deterministic CLI/browser evidence.

**Architecture:** Correct the Rig Profile boundary so the unique Skeleton root is independent from the 17 anatomical Biped Bone IDs, then register G Bot through the existing Asset/Rig/Animation/Collider/Subject Definition LEGO resources. Keep URL resolution in the Host and prove the same Canonical Authoring → Normalized IR → ExecutionPlan → Babylon/Havok path with a product-asset example and verifier.

**Tech Stack:** TypeScript 5.9, Vitest, Babylon.js 9, Havok, AJV Authoring Schema, Playwright, pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-08-20-g-bot-product-asset-s1-design.md`

## Global Constraints

- Keep Canonical Schema, AI Schema Profile, CLI, Browser Protocol, examples, and generated types on one public vocabulary.
- Use `skeletonRootBoneName`; do not retain `skeletonRootNodeName` as an alias.
- Keep provider names, asset URLs, and provenance URIs out of Canonical Authoring, Normalized IR, and ExecutionPlan.
- Do not mutate `apps/playground/public/subject-assets/humanoid/g-bot/v1/g-bot.glb` or the deterministic Golden GLB.
- Expose only `idle`, `walk`, `run`, and `jump` as current Semantic Actions.
- Every production behavior change follows RED → GREEN → refactor, with the focused failing command recorded before implementation.
- Preserve the existing closed diagnostic codes, exact cleanup guarantees, deterministic hashes, and transactional artifact promotion.

---

### Task 1: Separate Skeleton root identity from anatomical Biped Bone IDs

**Files:**
- Modify: `packages/subject-registry/src/types-v2.ts`
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Test: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/resource-lock.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Test: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Test: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Test: `packages/compiler/src/compile.test.ts`
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Test: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Produces: `BipedBoneIdV1` and `ExecutionBipedBoneIdV1` with exactly 17 anatomical IDs.
- Produces: `RigProfileManifestInputV1.skeletonRootBoneName: string` and `ExecutionRigProfileV1.skeletonRootBoneName: string`.
- Preserves: exact one-to-one anatomical Bone mapping and root-motion rejection for both distinct-root and Hips-root Skeletons.

- [x] **Step 1: Read the test quality rules before editing tests**

Run: `sed -n '1,320p' /Users/xiateng/.codex/plugins/cache/openai-curated-remote/superpowers/6.3.0/skills/test-driven-development/writing-good-tests.md`

- [x] **Step 2: Write focused RED contract tests**

Add assertions that `root` is absent from the canonical Bone ID/key sets, `skeletonRootBoneName` is the only serialized root field, and a Runtime Rig may use the same physical Hips Bone as both Skeleton root metadata and the canonical `hips` mapping without creating two semantic mappings.

```ts
expect(executionRig.requiredBoneIds).toEqual(BIPED_ANATOMICAL_BONE_IDS);
expectExactKeys(executionRig.sourceNodeNameByBoneId, BIPED_ANATOMICAL_BONE_IDS);
expect(executionRig.skeletonRootBoneName).toBe("root");
expect(executionRig).not.toHaveProperty("skeletonRootNodeName");
```

- [x] **Step 3: Run focused tests and verify RED**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts packages/authoring/src/subject-definition-normalizer.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts packages/compiler/src/compile.test.ts packages/runtime-babylon/src/runtime.test.ts`

Expected: failures name the obsolete `root` semantic key and missing `skeletonRootBoneName` projection.

- [x] **Step 4: Implement the minimal cross-layer contract correction**

Remove `root` from both canonical Bone unions and exact projections. Rename the root field through Registry, lock, Normalized IR, Compiler, ExecutionPlan, and Runtime. In `validateRig`, resolve the unique parentless Bone by `skeletonRootBoneName`, resolve all 17 anatomical mappings one-to-one, and pass the root Bone separately to root-motion validation.

```ts
const skeletonRootBone = rootBones[0]!;
if (skeletonRootBone.name !== rigProfile.skeletonRootBoneName) fail();
validateRootMotion(animationGroups, skeletonRootBone, mappedBones.get("hips"), asset);
```

- [x] **Step 5: Run focused tests and typecheck**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts packages/authoring/src/subject-definition-normalizer.test.ts packages/runtime-contracts/src/runtime-contracts.test.ts packages/compiler/src/compile.test.ts packages/runtime-babylon/src/runtime.test.ts && pnpm typecheck`

Expected: all selected tests and typecheck pass.

- [x] **Step 6: Commit Task 1**

```bash
git add packages/subject-registry packages/authoring packages/runtime-contracts packages/compiler packages/runtime-babylon
git commit -m "refactor: separate skeleton root from biped bones"
```

### Task 2: Register the G Bot LEGO resources and Host mapping

**Files:**
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Test: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `apps/playground/src/worldkit-asset-resolver.ts`
- Test: `apps/playground/src/worldkit-asset-resolver.test.ts`
- Test: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Produces: five versioned G Bot Registry refs specified by the design.
- Produces: Host-only mapping from the G Bot Subject Asset ref to its same-origin public route.
- Consumes: the committed immutable GLB bytes and the corrected Rig Profile contract from Task 1.

- [x] **Step 1: Write RED Registry and Resolver tests**

Assert exact inventory/hash/bounds/provenance, exact Mixamo Bone mapping, four ground bindings, accepted Collider values, Subject Definition composition, stable resource order, and the resolver route.

```ts
expect(gBotRig).toMatchObject({
  skeletonRootBoneName: "mixamorig:Hips",
  sourceNodeNameByBoneId: {
    hips: "mixamorig:Hips",
    chest: "mixamorig:Spine2",
    "hand.right": "mixamorig:RightHand",
  },
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts apps/playground/src/worldkit-asset-resolver.test.ts packages/runtime-babylon/src/runtime.test.ts -t "G Bot|g-bot|Hips-root"`

Expected: missing Registry resources/route and the absent Hips-root product plan cause failures.

- [x] **Step 3: Add G Bot resources and real-byte Runtime coverage**

Register the Asset, Rig, Animation Set, Collider, and Definition with explicit canonical fields. Add the Host route. In Runtime tests, load the committed GLB through an in-memory resolver and assert its exact inventory, unique Hips root, four mapped Action states, isolated clone ownership, and Bone Socket resolution.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts apps/playground/src/worldkit-asset-resolver.test.ts packages/runtime-babylon/src/runtime.test.ts`

Expected: all Registry, resolver, and Runtime tests pass against the actual 5.30MB asset.

- [x] **Step 5: Commit Task 2**

```bash
git add packages/subject-registry apps/playground/src/worldkit-asset-resolver.ts apps/playground/src/worldkit-asset-resolver.test.ts packages/runtime-babylon/src/runtime.test.ts
git commit -m "feat: register G Bot product subject"
```

### Task 3: Add the AI-facing G Bot example and CLI flow

**Files:**
- Create: `examples/authoring/g-bot-subject-world.json`
- Test: `scripts/worldkit.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: a Canonical Authoring V3 example that references only `worldkit://subject-definition/humanoid.g-bot@1`.
- Produces: build, capture, snapshot, and explain artifacts through existing CLI operations.

- [x] **Step 1: Write RED CLI integration coverage**

Add a test that loads the G Bot example, compiles exactly one G Bot asset/rig/animation/collider resource chain, and verifies the serialized build contains no `url`, `uri`, `babylon`, or `havok` field outside the allowed backend discriminator.

- [x] **Step 2: Run the focused CLI test and verify RED**

Run: `pnpm vitest run scripts/worldkit.test.ts -t "G Bot"`

Expected: the example file is missing.

- [x] **Step 3: Create the example world**

Create a small deterministic outdoor plain with one controllable G Bot, one second G Bot for isolation, a blocking wall, a third-person Camera, and a resource budget above the compiled product asset cost. Keep the Subject nodes limited to stable Definition refs and spawn anchors.

- [x] **Step 4: Run validate/build/explain and focused tests**

Run:

```bash
pnpm worldkit validate examples/authoring/g-bot-subject-world.json --json
pnpm worldkit build examples/authoring/g-bot-subject-world.json --output /tmp/g-bot-world.build.json --json
pnpm worldkit subject explain examples/authoring/g-bot-subject-world.json --entity-id g-bot-primary --json
pnpm vitest run scripts/worldkit.test.ts
```

Expected: all commands exit zero and the compiled chain names only canonical refs.

- [x] **Step 5: Commit Task 3**

```bash
git add examples/authoring/g-bot-subject-world.json scripts/worldkit.test.ts package.json
git commit -m "feat: add G Bot authoring example"
```

### Task 4: Prove the product asset in the real browser runtime

**Files:**
- Create: `scripts/verify-g-bot-subject-world.ts`
- Create: `scripts/lib/g-bot-evidence.ts`
- Test: `scripts/lib/g-bot-evidence.test.ts`
- Modify: `package.json`
- Create: `artifacts/examples/g-bot-subject-world/world.build.json`
- Create: `artifacts/examples/g-bot-subject-world/world.png`
- Create: `artifacts/examples/g-bot-subject-world/snapshot.json`
- Create: `artifacts/examples/g-bot-subject-world/explain.json`
- Create: `artifacts/examples/g-bot-subject-world/idle.png`
- Create: `artifacts/examples/g-bot-subject-world/walk.png`
- Create: `artifacts/examples/g-bot-subject-world/run.png`
- Create: `artifacts/examples/g-bot-subject-world/jump.png`
- Create: `artifacts/examples/g-bot-subject-world/verification.json`

**Interfaces:**
- Produces: `pnpm verify:g-bot-subject` as the single product-asset Gate.
- Produces: transactional artifacts with exact input/build/asset hashes, action ticks, movement/collision/isolation evidence, PNG dimensions/hashes, and failure-safe cleanup.
- Consumes: existing `startWorldkitServer`, `promoteArtifactDirectory`, Browser API, and fixed-tick Runtime methods.

- [x] **Step 1: Write RED evidence-helper tests**

Parse the committed GLB JSON chunk and product manifests, then assert exact hash/inventory, the twenty-five declared source clips, the four supported ground bindings, unique Bone names, Hips-root hierarchy, no forbidden content, and non-empty per-action timing.

- [x] **Step 2: Run the focused helper test and verify RED**

Run: `pnpm vitest run scripts/lib/g-bot-evidence.test.ts`

Expected: the evidence helper module is missing.

- [x] **Step 3: Implement the pure evidence helper**

Return a closed JSON-ready result without Babylon objects or raw source bytes. Reject manifest/GLB disagreement with stable verifier assertions.

- [x] **Step 4: Write and run the initial E2E RED Gate**

Add `verify:g-bot-subject` to `package.json`, invoke it before creating the verifier, and record the missing-script/module failure.

Run: `pnpm verify:g-bot-subject`

Expected: the verifier entrypoint is missing.

- [x] **Step 5: Implement the transactional CLI/browser verifier**

Use existing CLI functions for validate/build/capture/explain. Start the nonce-owned Vite server, use the deferred Browser API, pause/reset between fixed-action captures, bind control atomically for isolation, move into the wall, and assert stable snapshots. Record all evidence under a temporary sibling and promote only after every assertion passes.

- [x] **Step 6: Generate and visually inspect all captures**

Run: `pnpm verify:g-bot-subject`

Open `world.png`, `idle.png`, `walk.png`, `run.png`, and `jump.png` with the local image viewer. Confirm the G Bot is approximately human-scale, grounded, visible, untextured/neutral, differently posed for the four actions, and not intersecting the wall.

- [x] **Step 7: Run focused regressions**

Run:

```bash
pnpm vitest run scripts/lib/g-bot-evidence.test.ts scripts/lib/worldkit-server.test.ts scripts/lib/artifact-directory-promotion.test.ts apps/playground/src/worldkit-asset-resolver.test.ts
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
```

Expected: Golden and G Bot verifiers both pass with no server/temp/backup residue.

- [x] **Step 8: Commit Task 4**

```bash
git add scripts/verify-g-bot-subject-world.ts scripts/lib/g-bot-evidence.ts scripts/lib/g-bot-evidence.test.ts package.json artifacts/examples/g-bot-subject-world
git commit -m "test: verify G Bot subject end to end"
```

### Task 5: Regenerate renamed contracts, update docs, and close the branch

**Files:**
- Modify: `artifacts/examples/rigged-subject-world/world.build.json`
- Modify: `artifacts/examples/rigged-subject-world/verification.json`
- Modify: `docs/16-subject-assets-3c-integration.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-19-asset-subject-s1b-visible-slice-design.md`
- Modify: `docs/superpowers/plans/2026-08-19-asset-subject-s1b-visible-slice.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-20-g-bot-product-asset-s1.md`

**Interfaces:**
- Produces: regenerated Golden evidence using `skeletonRootBoneName`, current G Bot onboarding/status, and a completed checkbox ledger.
- Preserves: the original Golden GLB hash and all provider/URI boundary audits.

- [x] **Step 1: Regenerate Golden artifacts through the verifier**

Run: `pnpm verify:rigged-subject`

Expected: build/evidence hashes update only because the canonical Rig descriptor changed; action images and the GLB hash remain deterministic.

- [x] **Step 2: Update design/status documentation**

Replace the obsolete root field and 18-semantic-Bone statement with the exact 17 anatomical Bone plus independent Skeleton root contract. Add G Bot refs, supported actions, one-command Gate, product gaps, and the distinction between source handoff manifests and Canonical Registry resources.

- [x] **Step 3: Run obsolete-field and boundary audits**

Run targeted `rg` checks proving no production/example/generated JSON contains `skeletonRootNodeName`, raw asset URI fields, or provider-specific public keys beyond the documented allowlist.

- [x] **Step 4: Run the complete verification matrix**

Run:

```bash
pnpm test
pnpm test:scenes
pnpm typecheck
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
git diff --check
```

Expected: every Gate passes; only existing deprecation/chunk-size advisories may remain.

- [x] **Step 5: Self-review exact scope and commit docs/artifacts**

Inspect `git diff --stat`, `git diff`, resource hashes, PNGs, process/temp residue, and commit history. Mark completed plan checkboxes only after their evidence exists.

```bash
git add README.md docs artifacts/examples/rigged-subject-world
git commit -m "docs: complete G Bot product asset slice"
```

- [x] **Step 6: Request independent review and fix findings test-first**

Review the full feature range against the approved design, exact generated artifacts, and complete verification output. Any P0-P2 finding must be reproduced with a failing test before correction.

Initial integration independent review: CLEAN for `84d60e1..1ba48e7`, with no remaining P0-P2 findings. Registry canonical-hash coverage and real-byte G Bot clone/Clip/Socket/disposal isolation were added before closure. The later `main` synchronization adopts product asset update `7f8a48b` (25 source Clips); its three P2 metadata/documentation drifts were corrected in `32aa354`, and final independent review is CLEAN for `f2d6ca7..ece76eb`, with no remaining P0-P2 findings.

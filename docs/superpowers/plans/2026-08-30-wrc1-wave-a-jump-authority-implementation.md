# WRC-1 Wave A Jump Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PR #51's Babylon-owned split-jump state with a PR #41-compliant committed Jump Episode while preserving its useful animation asset, presentation, and product-path work.

**Architecture:** CharacterMovement owns split policy, anticipation, variant, physics, Snapshot/Hash, and rollback. Subject Actions derives presentation solely from the committed Movement result, while Babylon renders and optionally anchors feet without writing Gameplay state. A mechanical repository policy prevents the rejected shadow-owner fields and declarations from returning.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Babylon.js 9.21.2, Havok 1.3.14, JSON Schema, existing WorldKit Registry/Compiler/RuntimeHost contracts.

**Spec:** `docs/superpowers/specs/2026-08-30-wrc1-pr41-split-jump-correction-design.md`

## Global Constraints

- PR #41's fixed-Tick order and `CharacterMovementRuntimeV1` remain authoritative.
- Use one current contract only; update all consumers and delete replaced fields/classes in the accepted tree.
- `runtime-babylon` must not own pending/active jump state or rewrite `jumpPressed`/`jumpHeld`.
- Use `===` / `!==` for equality and lodash `isNil` / `isEmpty` for nil/empty checks when a new check needs them.
- Every production change begins with one behavior-level RED and ends with focused GREEN.
- Run affected gates once at the work-package boundary; use Cursor Cloud for exact-SHA deep review and Wave A heavy gates.
- Preserve the alpha local-actions GLB and provenance bytes from `2c74fffd004243b98ed30895a8844e76754ea05f`; do not cherry-pick its TypeScript authority changes wholesale.

---

## File structure

### Authority and movement

- `config/runtime-authority-boundaries.json`: the one supplemental protected-fact policy consumed later by PHO.
- `scripts/verification/verify-runtime-authority-boundaries.ts`: parser, source census, and stable diagnostic producer for that policy.
- `scripts/verification/verify-runtime-authority-boundaries.test.ts`: adversarial repository fixtures for shadow-owner rejection.
- `packages/character-movement/src/character-movement-contracts.ts`: sole serialized `JumpVariantPolicyV1` and `JumpEpisodeStateV1` owner.
- `packages/character-movement/src/character-movement-runtime.ts`: sole Episode reducer and physical proposal owner.
- `packages/character-movement/src/character-movement-runtime.test.ts`: behavior-level Episode, physics, reset, replay, and rollback regressions.
- `packages/character-movement/src/package-boundary.test.ts`: exact parser/hash/reachability and exported vocabulary tests.

### Profile and package propagation

- `packages/runtime-contracts/src/control-feel-parameter-contract.ts`: composes the movement-owned policy into the current Control Feel contract.
- `packages/subject-registry/src/types-v3.ts`: Registry input uses the same `jumpVariantPolicy` name and union.
- `packages/subject-registry/src/subject-resource-registry.ts`: validates/freezes the policy and split binding closure.
- `packages/authoring/src/types.ts` and `packages/authoring/src/subject-definition-normalizer.ts`: carry the one normalized field.
- `packages/compiler/src/compile.ts`: projects the policy without inference.
- `packages/runtime-contracts/src/world-runtime-bootstrap.ts` and `world-runtime-bootstrap-v1.schema.json`: carry the exact Runtime input.
- Existing tests beside each file own RED/GREEN and exact-key coverage.

### Presentation and provider

- `packages/subject-contracts/src/index.ts`: one current action/presentation vocabulary.
- `packages/subject-actions/src/types.ts`: committed Episode presentation input.
- `packages/subject-actions/src/action-presentation-resolver.ts`: pure Episode-to-key projection.
- `packages/runtime-babylon/src/golden-humanoid-3c-vnext.ts`: passes the committed Movement result without a side channel.
- `packages/runtime-babylon/src/subject-animation-player.ts`: consumes resolved keys and retains only clip-local telemetry.
- `packages/runtime-babylon/src/vertical-foot-support-anchor.ts`: optional presentation-only local-root adjustment.
- `packages/runtime-babylon/src/character-movement-component.ts`: wires locked policy into CharacterMovement and owns no Episode state.

### Asset/product path

- `assets/subjects/humanoid/alpha-local-actions/**`: preserved asset/provenance manifests normalized to ordinary bindings.
- `apps/playground/public/subject-assets/humanoid/alpha-local-actions/v1/alpha-local-actions.glb`: byte-identical admitted GLB.
- `examples/product-asset-intakes/humanoid.alpha-local-actions@1.json`: private-license intake.
- `examples/authoring/alpha-local-actions-world.json`: one product-level split-jump example.
- Existing Registry, Authoring, Compiler, WorldPackage, Playground, and product verifier files listed in Task 6 close the full path.

---

### Task 1: WRC-GOV-1 jump authority guard

**Files:**
- Create: `config/runtime-authority-boundaries.json`
- Create: `scripts/verification/verify-runtime-authority-boundaries.ts`
- Create: `scripts/verification/verify-runtime-authority-boundaries.test.ts`
- Modify: `package.json`
- Modify: `AGENTS.md`
- Modify: `docs/reviews/runtime-deep-review-checklist.md`

**Interfaces:**
- Consumes: repository-relative executable source paths and the closed JSON policy.
- Produces: `verifyRuntimeAuthorityBoundariesV1(options): Promise<RuntimeAuthorityBoundaryReceiptV1>` and root command `pnpm verify:runtime-authority-boundaries`.

- [ ] **Step 1: Write failing adversarial tests**

Add fixtures that put each forbidden form in `packages/runtime-babylon/src/provider.ts` and assert the
stable code:

```ts
await expect(verifyRuntimeAuthorityBoundariesV1({
  repositoryRoot,
  policy,
  sourceFilePaths: ["packages/runtime-babylon/src/provider.ts"],
})).rejects.toThrow("RUNTIME_AUTHORITY_SHADOW_OWNER");
```

Cover `class SplitJumpIntentV1`, `jumpPresentation`, `smallJumpSequence`,
`jumpTakeoffDelaySeconds`, and a passing import of public `JumpEpisodeStateV1` used read-only.

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```bash
pnpm exec vitest run scripts/verification/verify-runtime-authority-boundaries.test.ts
```

Expected: FAIL because `verify-runtime-authority-boundaries.ts` does not exist.

- [ ] **Step 3: Implement the closed policy and verifier**

Start the policy with this exact fact:

```json
{
  "schemaVersion": 1,
  "protectedFacts": [
    {
      "id": "jump-episode",
      "ownerPackage": "@whitebox-world/character-movement",
      "providerPackage": "@whitebox-world/runtime-babylon",
      "forbiddenDeclaredIdentifiers": ["SplitJumpIntentV1"],
      "forbiddenPublicFieldNames": [
        "jumpPresentation",
        "smallJumpSequence",
        "jumpTakeoffDelaySeconds"
      ],
      "requiredSnapshotTypeName": "CharacterMovementSnapshotV1"
    }
  ]
}
```

Export a frozen receipt:

```ts
export interface RuntimeAuthorityBoundaryReceiptV1 {
  readonly schemaVersion: 1;
  readonly policyHash: `sha256:${string}`;
  readonly scannedFileCount: number;
  readonly protectedFactIds: readonly string[];
  readonly ok: true;
}
```

Reuse the safe executable-source census rules from `verify-3c-migration.ts`; keep this verifier's
policy/parser in its own file and return stable sorted paths in diagnostics. Add:

```json
"verify:runtime-authority-boundaries": "tsx scripts/verification/verify-runtime-authority-boundaries.ts"
```

- [ ] **Step 4: Document the enforceable owner rule**

Add the Jump Episode owner and forbidden-provider-state rule to `AGENTS.md` and add an explicit review
item to `runtime-deep-review-checklist.md`: any new movement/action/camera state must identify its
Snapshot/Hash/Reset/Replay/Rollback representation before provider integration.

- [ ] **Step 5: Run focused GREEN**

Run:

```bash
pnpm exec vitest run scripts/verification/verify-runtime-authority-boundaries.test.ts
pnpm verify:runtime-authority-boundaries
```

Expected: both exit `0`; receipt has `ok: true` and protected fact `jump-episode`.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md config/runtime-authority-boundaries.json docs/reviews/runtime-deep-review-checklist.md package.json scripts/verification/verify-runtime-authority-boundaries.ts scripts/verification/verify-runtime-authority-boundaries.test.ts
git commit -m "chore(architecture): guard runtime state authorities"
```

### Task 2: JUMP-1 policy and committed Episode contracts

**Files:**
- Modify: `packages/character-movement/src/character-movement-contracts.ts`
- Modify: `packages/character-movement/src/index.ts`
- Modify: `packages/character-movement/src/package-boundary.test.ts`
- Modify: `packages/runtime-contracts/src/control-feel-parameter-contract.ts`
- Modify: `packages/runtime-contracts/src/control-feel-parameter-contract.test.ts`
- Modify: `packages/runtime-contracts/src/world-runtime-bootstrap.ts`
- Modify: `packages/runtime-contracts/src/world-runtime-bootstrap-v1.schema.json`
- Modify: `packages/runtime-contracts/src/world-runtime-bootstrap.test.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/subject-registry/src/types-v3.ts`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Modify: `packages/subject-registry/src/p15-admission-repro.test.ts`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.ts`
- Modify: `packages/authoring/src/subject-definition-normalizer.test.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `assets/registry/control-feel-profiles/catalog.json`
- Modify: `apps/native-scene-playground/src/cloud-ridge-world-runtime-bootstrap.json`
- Modify: `apps/playground/src/main.ts`
- Modify: `artifacts/scenes/cloud-ridge-celestial-gate/world.build.json`
- Modify: `artifacts/scenes/green-sahara-caravan/world.build.json`
- Modify: `artifacts/scenes/memory-postcard-coastal-ride/world.build.json`
- Modify: `examples/evidence/g-bot-subject-world/world.build.json`
- Modify: `examples/evidence/package-subject-world/world.build.json`
- Modify: `examples/evidence/placement-coastal-world/normalized-world-ir.json`
- Modify: `examples/evidence/placement-coastal-world/world.build.json`
- Modify: `examples/evidence/rigged-subject-world/world.build.json`
- Modify: `packages/runtime-babylon/src/babylon-character-body-port.test.ts`
- Modify: `packages/runtime-babylon/src/character-movement-component.ts`
- Modify: `packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts`
- Modify: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Modify: `packages/runtime-host/src/test/runtime-host-lifecycle-harness.ts`

**Interfaces:**
- Consumes: existing normalized `jumpPressed`, `jumpHeld`, and `runRequested` plus one locked Control Feel profile.
- Produces: exported `JumpVariantPolicyV1`, `JumpVariantV1`, `JumpEpisodeStateV1`, parsers, and a `jumpVariantPolicy` field propagated unchanged to Runtime.

- [ ] **Step 1: Write failing exact-contract tests**

Add parser cases for both policy branches and both Episode branches:

```ts
expect(parseJumpVariantPolicyV1({ mode: "hold-height" })).toEqual({
  mode: "hold-height",
});
expect(parseJumpEpisodeStateV1({
  schemaVersion: 1,
  variant: "small",
  phase: "anticipating",
  startedTick: 7,
  anticipationStartedTick: 7,
  committedTick: 7,
  anticipationTicksRemaining: 4,
})).toMatchObject({ variant: "small", phase: "anticipating" });
```

Reject extra keys, `-0`, NaN, duration above `1.5`, `anticipationStartedTick < startedTick`,
`takeoffTick < anticipationStartedTick`, a buffered Episode without a positive runtime jump-buffer
counter, and an Episode on a snapshot whose policy is `hold-height`.

- [ ] **Step 2: Run contract tests and confirm RED**

Run:

```bash
pnpm exec vitest run packages/character-movement/src/package-boundary.test.ts packages/runtime-contracts/src/control-feel-parameter-contract.test.ts packages/runtime-contracts/src/world-runtime-bootstrap.test.ts
```

Expected: FAIL on missing policy/Episode exports and missing `jumpVariantPolicy` keys.

- [ ] **Step 3: Add the canonical policy and Episode types**

Implement the exact unions from the spec in `character-movement-contracts.ts`. Add optional
`jumpEpisode` to `MovementCommitV1`, `CharacterMovementStateV1`, and
`CharacterMovementSnapshotV1`; update their exact-key parsers, canonical state hash input, and
reachability checks. The airborne branch must satisfy:

```ts
if (episode.phase === "airborne" && episode.takeoffTick < episode.startedTick) {
  invalid("JumpEpisodeStateV1");
}
```

No runtime/provider type may redeclare either union.

- [ ] **Step 4: Propagate one current `jumpVariantPolicy` field**

Add a required `jumpVariantPolicy` to Control Feel Registry/normalized/bootstrap data. Migrate every
ordinary existing profile to:

```json
  "jumpVariantPolicy": { "mode": "hold-height" }
```

Update the JSON Schema required list and exact-key tests. Do not use an optional default in a parser.
Regenerate or mechanically update tracked generated fixtures with their existing owner command; do
not hand-edit hashes whose repository tool owns them.

- [ ] **Step 5: Run focused GREEN**

Run:

```bash
pnpm exec vitest run packages/character-movement/src/package-boundary.test.ts packages/runtime-contracts/src/control-feel-parameter-contract.test.ts packages/runtime-contracts/src/world-runtime-bootstrap.test.ts packages/subject-registry/src/p15-admission-repro.test.ts packages/authoring/src/subject-definition-normalizer.test.ts packages/compiler/src/compile.test.ts
pnpm verify:runtime-authority-boundaries
```

Expected: all selected tests pass and the authority receipt remains green.

- [ ] **Step 6: Commit**

```bash
git add packages/character-movement packages/runtime-contracts packages/subject-registry packages/authoring packages/compiler assets/registry apps/native-scene-playground apps/playground artifacts examples
git commit -m "feat(3c): define committed split-jump contracts"
```

### Task 3: JUMP-2 CharacterMovement Episode reducer

**Files:**
- Modify: `packages/character-movement/src/character-movement-runtime.ts`
- Modify: `packages/character-movement/src/character-movement-runtime.test.ts`
- Modify: `packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts`

**Interfaces:**
- Consumes: unchanged `CharacterMovementCommandV1` and parsed `jumpVariantPolicy` in `CharacterMovementRuntimeOptionsV1`.
- Produces: one committed `jumpEpisode` on Movement commit/snapshot; no provider callback or mutable side channel.

- [ ] **Step 1: Write the behavior-level RED matrix**

Add focused cases proving:

```ts
const small = transact(splitRuntime, command(1, {
  jumpPressed: true,
  jumpHeld: true,
  runRequested: false,
}));
expect(small.commit.jumpEpisode).toMatchObject({
  variant: "small",
  phase: "anticipating",
});

const large = transact(splitRuntime, command(1, {
  jumpPressed: true,
  jumpHeld: true,
  runRequested: true,
}));
expect(large.commit.jumpEpisode).toMatchObject({ variant: "large" });
```

Also assert variant freeze after run changes, buffered-variant preservation until support becomes
eligible, buffer expiry, exact anticipation Tick countdown, exactly-one takeoff, small hold ignored,
large hold honored, press during active Episode ignored, ceiling/landing clear, coyote behavior,
snapshot restore mid-buffer and mid-anticipation, abort before commit, 30/60/120-like command history
equality, and two runtime instances with opposite variants.

- [ ] **Step 2: Run Movement tests and confirm RED**

Run:

```bash
pnpm exec vitest run packages/character-movement/src/character-movement-runtime.test.ts
```

Expected: FAIL because the runtime does not publish or advance `jumpEpisode`.

- [ ] **Step 3: Implement the reducer inside the existing transaction**

Parse policy into bounded Tick counts with the existing fixed-delta conversion. Stage the Episode in
the active transaction; publish it only in `reconcile()`. Variant selection is exactly:

```ts
const variant: JumpVariantV1 = command.runRequested ? "large" : "small";
```

On a buffered split press, publish a `buffered` Episode beside the existing buffer counter so the
variant cannot be reselected from later input. During `anticipating`, do not synthesize a new command.
The reducer itself decides when the existing jump takeoff branch becomes eligible. When small becomes
airborne, compute hold gravity as released; when large becomes airborne, reuse `command.jumpHeld` and
the existing hold counter. Keep the prior snapshot untouched until reconciliation succeeds.

- [ ] **Step 4: Run Movement and Golden transaction GREEN**

Run:

```bash
pnpm exec vitest run packages/character-movement/src/character-movement-runtime.test.ts packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts
```

Expected: all selected tests pass, including rollback and cadence histories.

- [ ] **Step 5: Commit**

```bash
git add packages/character-movement/src packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts
git commit -m "feat(3c): commit split-jump episodes in movement"
```

### Task 4: JUMP-2 committed presentation projection

**Files:**
- Modify: `packages/subject-contracts/src/index.ts`
- Modify: `packages/subject-actions/src/types.ts`
- Modify: `packages/subject-actions/src/index.ts`
- Modify: `packages/subject-actions/src/action-presentation-resolver.ts`
- Modify: `packages/subject-actions/src/action-presentation-resolver.test.ts`
- Modify: `packages/subject-actions/src/action-presentation-registry.test.ts`

**Interfaces:**
- Consumes: `jumpEpisode?: JumpEpisodeStateV1` from the same committed Movement tick.
- Produces: one `ResolvedActionPresentationV1` key; no `JumpPresentationV1` type or caller choice.

- [ ] **Step 1: Write failing committed-input tests**

Add the mapping table from the spec and an adversarial fake:

```ts
expect(resolveActionPresentationV1(input({
  locomotion: grounded(12),
  jumpEpisode: {
    schemaVersion: 1,
  variant: "small",
  phase: "anticipating",
  startedTick: 12,
  anticipationStartedTick: 12,
  committedTick: 12,
  anticipationTicksRemaining: 4,
  },
}), registry).presentationKey).toBe("locomotion.small-jump.takeoff");
```

Reject Episode/Locomotion Tick mismatch, airborne Episode with grounded non-takeoff state, extra
`jumpPresentation`, and duplicate/missing split automatic bindings.

- [ ] **Step 2: Run presentation tests and confirm RED**

Run:

```bash
pnpm exec vitest run packages/subject-actions/src/action-presentation-resolver.test.ts packages/subject-actions/src/action-presentation-registry.test.ts
```

Expected: FAIL on missing keys and Episode input.

- [ ] **Step 3: Add the current vocabulary and pure resolver**

Add `jump.small.takeoff` and `jump.small.airborne` to the one action-ID vocabulary and add
`locomotion.small-jump.takeoff` / `locomotion.small-jump.airborne` to the one automatic key list.
Parse `jumpEpisode` with the character-movement parser and choose the key from the mapping table.
There is no `JumpPresentationV1` export.

- [ ] **Step 4: Run focused GREEN and authority scan**

Run:

```bash
pnpm exec vitest run packages/subject-actions/src/action-presentation-resolver.test.ts packages/subject-actions/src/action-presentation-registry.test.ts
pnpm verify:runtime-authority-boundaries
```

Expected: tests pass; scan finds no forbidden presentation side channel.

- [ ] **Step 5: Commit**

```bash
git add packages/subject-contracts packages/subject-actions
git commit -m "feat(subject): derive jump presentation from committed movement"
```

### Task 5: JUMP-2 Babylon projection and visual foot anchoring

**Files:**
- Modify: `packages/runtime-babylon/src/golden-humanoid-3c-vnext.ts`
- Modify: `packages/runtime-babylon/src/golden-humanoid-presentation-context.ts`
- Modify: `packages/runtime-babylon/src/character-movement-component.ts`
- Modify: `packages/runtime-babylon/src/subject-animation-player.ts`
- Modify: `packages/runtime-babylon/src/subject-animation-player-vnext.test.ts`
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Create: `packages/runtime-babylon/src/vertical-foot-support-anchor.ts`
- Create: `packages/runtime-babylon/src/vertical-foot-support-anchor.test.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: committed `MovementCommitV1.jumpEpisode` and resolved presentation only.
- Produces: clip/blend telemetry and optional local visual-root Y offset; no Body/Subject/Camera mutation.

- [ ] **Step 1: Write provider RED tests**

Assert that the Golden controller forwards the Episode from its Movement result, not from arguments;
that reset/retry starts from the committed snapshot; and that foot anchoring leaves authority nodes
unchanged:

```ts
expect(bodyRoot.position.y).toBe(beforeBodyY);
expect(committedSubjectOriginY).toBe(beforeSubjectY);
expect(visualAdjustmentRoot.position.y).not.toBe(Number.NaN);
```

Cover missing bones, two instances, rebind, reset, disposal, throwing animation start, and
interpolation between two committed poses.

- [ ] **Step 2: Run provider tests and confirm RED**

Run:

```bash
pnpm exec vitest run packages/runtime-babylon/src/subject-animation-player-vnext.test.ts packages/runtime-babylon/src/vertical-foot-support-anchor.test.ts packages/runtime-babylon/src/runtime.test.ts
```

Expected: FAIL because the anchor file and committed Episode wiring are absent.

- [ ] **Step 3: Port only presentation-safe implementation**

Use the rejected branch's anchor as source material, but bind it below the committed render root and
remove any path that can move Body/Subject/Camera authority. `GoldenHumanoid3CVNextTransactionV1`
passes its committed Movement result into `resolveActionPresentationV1`; neither
`runCommand()` nor `step()` accepts a presentation discriminator.

Do not add `split-jump-intent.ts`, `#pending`, `#active`, or animation-driven control rewriting.

- [ ] **Step 4: Run provider GREEN and the mechanical guard**

Run:

```bash
pnpm exec vitest run packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts packages/runtime-babylon/src/subject-animation-player-vnext.test.ts packages/runtime-babylon/src/vertical-foot-support-anchor.test.ts packages/runtime-babylon/src/runtime.test.ts
pnpm verify:runtime-authority-boundaries
```

Expected: selected tests pass and no provider shadow owner is detected.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime-babylon/src
git commit -m "feat(runtime): project committed split-jump presentation"
```

### Task 6: JUMP-3 admitted alpha asset and product path

**Files:**
- Create from exact source commit: `apps/playground/public/subject-assets/humanoid/alpha-local-actions/v1/alpha-local-actions.glb`
- Create and normalize: `assets/subjects/humanoid/alpha-local-actions/action-manifest.json`
- Create: `assets/subjects/humanoid/alpha-local-actions/asset.manifest.json`
- Create: `examples/product-asset-intakes/humanoid.alpha-local-actions@1.json`
- Create: `examples/authoring/alpha-local-actions-world.json`
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Modify: `packages/subject-registry/src/capability-registry.test.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `packages/authoring/src/resource-lock.ts`
- Modify: `apps/playground/src/worldkit-asset-resolver.ts`
- Modify: `apps/playground/src/worldkit-asset-resolver.test.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/babylon-world-adapter.test.ts`
- Modify: `scripts/lib/product-asset-intake.ts`
- Modify: `scripts/lib/product-asset-intake.test.ts`
- Modify: `scripts/lib/product-asset-evidence.ts`
- Modify: `scripts/lib/product-asset-evidence.test.ts`
- Modify: `scripts/lib/file-world-package.ts`
- Modify: `scripts/lib/file-world-package.test.ts`
- Modify: `scripts/lib/world-package-resource-resolver.ts`
- Modify: `scripts/lib/world-package-resource-resolver.test.ts`
- Modify: `scripts/lib/trusted-world-package.ts`
- Modify: `scripts/lib/world-package-cli.test.ts`
- Modify: `scripts/cli/worldkit.test.ts`
- Modify: `scripts/verification/verify-g-bot-subject-world.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: the split policy and ordinary animation binding contracts from Tasks 2 and 4.
- Produces: one locked Subject Definition/Asset/Rig/Animation/Collider/Control Feel closure and one playable example WorldPackage.

- [ ] **Step 1: Add a failing admission/product-path test**

Add a Registry fixture using:

```ts
jumpVariantPolicy: {
  mode: "run-selects-variant",
  smallAnticipationSeconds: 0.8333333333333334,
  largeAnticipationSeconds: 0.9,
}
```

Require both small presentation bindings and assert missing either produces the existing stable
Subject/Registry admission diagnostic before Runtime creation.

- [ ] **Step 2: Run the focused asset path and confirm RED**

Run:

```bash
pnpm exec vitest run packages/subject-registry/src/subject-registry.test.ts packages/subject-registry/src/capability-registry.test.ts packages/authoring/src/subject-definition-normalizer.test.ts scripts/lib/product-asset-intake.test.ts scripts/lib/file-world-package.test.ts scripts/lib/world-package-resource-resolver.test.ts
```

Expected: FAIL because alpha resource refs and split binding closure are absent.

- [ ] **Step 3: Restore immutable asset inputs and normalize manifests**

Restore the five content files from the exact source commit:

```bash
git restore --source=2c74fffd004243b98ed30895a8844e76754ea05f -- \
  apps/playground/public/subject-assets/humanoid/alpha-local-actions/v1/alpha-local-actions.glb \
  assets/subjects/humanoid/alpha-local-actions/action-manifest.json \
  assets/subjects/humanoid/alpha-local-actions/asset.manifest.json \
  examples/product-asset-intakes/humanoid.alpha-local-actions@1.json \
  examples/authoring/alpha-local-actions-world.json
```

Rewrite `smallJumpSequence` in the action manifest as ordinary `animationBindings` with action IDs
`jump.small.takeoff` and `jump.small.airborne`. Remove `jumpTakeoffDelaySeconds` and
`jumpSourceTakeoffFrame`; retain source frame ranges only as provenance/QA metadata outside Runtime
contracts.

- [ ] **Step 4: Port the resource closure by responsibility**

Port the Registry, resolver, WorldPackage, Playground, and verifier changes file-by-file. Preserve
exact Resource Refs, asset hash, byte length, redistribution policy, and private-repository warning.
Do not copy rejected split-jump types or optional compatibility parsers.

- [ ] **Step 5: Run focused GREEN and asset byte check**

Run:

```bash
pnpm exec vitest run packages/subject-registry/src/subject-registry.test.ts packages/subject-registry/src/capability-registry.test.ts packages/authoring/src/subject-definition-normalizer.test.ts packages/compiler/src/compile.test.ts scripts/lib/product-asset-intake.test.ts scripts/lib/product-asset-evidence.test.ts scripts/lib/file-world-package.test.ts scripts/lib/world-package-resource-resolver.test.ts apps/playground/src/worldkit-asset-resolver.test.ts apps/playground/src/babylon-world-adapter.test.ts
test "$(git hash-object apps/playground/public/subject-assets/humanoid/alpha-local-actions/v1/alpha-local-actions.glb)" = "$(git rev-parse 2c74fffd004243b98ed30895a8844e76754ea05f:apps/playground/public/subject-assets/humanoid/alpha-local-actions/v1/alpha-local-actions.glb)"
```

Expected: tests pass and the GLB blob hashes are identical.

- [ ] **Step 6: Commit**

```bash
git add apps/playground assets/subjects examples packages/authoring packages/compiler packages/subject-registry scripts
git commit -m "feat(subject): admit alpha split-jump asset"
```

### Task 7: JUMP-3 generated bundles, browser evidence, and affected gates

**Files:**
- Modify generated owner outputs: `.codex/skills/worldkit-canonical-builder/scripts/self-check.mjs`
- Modify generated owner outputs: `.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs`
- Modify/update by owner command: `examples/evidence/g-bot-subject-world/**`
- Create: `docs/reviews/2026-08-30-wrc1-wave-a-jump-review.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`

**Interfaces:**
- Consumes: exact Wave A merge candidate.
- Produces: focused automated evidence, Browser/manual receipt, independent review, and accurate backlog state.

- [ ] **Step 1: Rebuild tracked generated owners once**

Run:

```bash
pnpm check:agent-self-check
```

If it reports stale bundles, use the repository's reported build command once, then rerun
`pnpm check:agent-self-check`. Do not hand-edit generated bundle internals.

- [ ] **Step 2: Run each affected gate once**

Run:

```bash
pnpm typecheck
pnpm exec vitest run packages/character-movement/src packages/subject-actions/src packages/runtime-babylon/src/golden-humanoid-3c-vnext.test.ts packages/runtime-babylon/src/subject-animation-player-vnext.test.ts packages/runtime-babylon/src/vertical-foot-support-anchor.test.ts packages/subject-registry/src packages/authoring/src/subject-definition-normalizer.test.ts packages/compiler/src/compile.test.ts scripts/verification/verify-runtime-authority-boundaries.test.ts
pnpm verify:runtime-authority-boundaries
pnpm verify:3c-migration
pnpm build
pnpm verify:g-bot-subject
git diff --check
```

Expected: every command exits `0`. Do not also run root `pnpm test` locally in this step.

- [ ] **Step 3: Capture Browser and manual behavior**

Start `pnpm dev:g-bot` only for the manual layer. Verify idle small jump, running large jump, ceiling
impact, landing, and Reset. Record exact commit, Control Feel profile hash, example WorldPackage hash,
Browser version, and observed behavior in the review document. Stop the server after capture.

- [ ] **Step 4: Commit the exact merge candidate**

```bash
git add .codex/skills examples/evidence docs
git commit -m "test(3c): close split-jump product evidence"
git status --short
```

Expected: clean tree after the commit.

- [ ] **Step 5: Request one exact-SHA Cursor Cloud deep review and heavy gate run**

Use the Cloud-only Cursor workflow with separate review and gate tasks. Both prompts name
`git rev-parse HEAD`, PR #41, the split-jump spec, runtime deep-review checklist, and the command set
they own. A GO applies only to that SHA. Do not rerun unchanged heavy gates locally.

- [ ] **Step 6: Repair only confirmed findings**

For each confirmed P0/P1/P2, write a failing reproducer, apply the narrow fix at the authority
boundary, rerun the reproducer and invalidated gates only, commit, and request a new review for the
new exact SHA. Record withdrawn findings with source evidence.

- [ ] **Step 7: Replace PR #51 and update status**

Close superseded PR #51 after the new branch is pushed and its replacement PR is linked. Mark
`JUMP-0`, `WRC-GOV-1`, and `JUMP-1..3` complete only after merge to `main`; record merged SHA and the
review/evidence links in `docs/18-refactor-progress-and-backlog.md`.

```bash
git push -u origin HEAD
```

Expected: replacement PR is reviewable, branch is clean, and no completion claim precedes merge.

### Task 8: Wave A main integration checkpoint

**Files:**
- Modify only if truth changed: `docs/18-refactor-progress-and-backlog.md`
- Modify only if public use changed: `README.md`

**Interfaces:**
- Consumes: reviewed exact-SHA replacement PR and passing required GitHub checks.
- Produces: merged `main` checkpoint that downstream BNA-3/WRC Action work can depend on.

- [ ] **Step 1: Verify merge-base and exact review SHA**

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git rev-parse HEAD
```

Expected: the branch contains current `origin/main`; the printed SHA equals the final review/gate SHA.

- [ ] **Step 2: Merge and verify remote truth**

Merge the replacement PR, fetch `origin/main`, and verify the reviewed commit is an ancestor:

```bash
git fetch origin main
git merge-base --is-ancestor HEAD origin/main
```

Expected: exit `0`.

- [ ] **Step 3: Advance to the next independently useful package**

Start BNA-3 from its approved design and a dedicated implementation plan based on the new main SHA.
Do not hold BNA-3 behind the later WRC Action/Camera or PHO waves.

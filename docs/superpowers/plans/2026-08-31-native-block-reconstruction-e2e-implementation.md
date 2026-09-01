# Native Block Reconstruction End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one real reference-driven Babylon Native Block world through AI generation, formal Check/Package/Runtime/Capture, dimensioned evaluation, one bounded repair, and a directly runnable final WorldPackage.

**Architecture:** Keep exactly the existing Canonical JSON and Babylon Native Scene Sources. Add source-neutral generation identity and reconstruction evaluation to existing contract owners, invoke the existing Codex router for generation/repair, and reuse the admitted Native checker, WorldPackage builder, RuntimeHost, BabylonWorldRuntime, SDK Havok/Subject/Input/Action/Camera, Browser lifecycle, and Capture ports. Every failed evaluation creates a new immutable Attempt/Package/Capture chain; no stage edits a frozen predecessor.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Babylon.js, Havok, Vite, Playwright, existing WorldKit CLI/RuntimeHost/WorldPackage contracts, `scripts/agents/run-codex-task.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-31-native-block-reconstruction-e2e-design.md`

**Plan synchronization baseline:** `origin/main@1eec016022d18a0cab1eeed2feaafb62b2e5d155`

**Current implementation checkpoint:** NBR-45, NBR-50 and NBR-60 are complete through
[PR #138](https://github.com/seedleap/agent-whitebox-world-sdk/pull/138), merged as
`origin/main@04dda773deaea94c1ba9521cb3c13898fbdf8327`. Exact-head Cloud evidence passed 165/165 affected
tests, typecheck, the 425-entry test census and the BNA clean-break gate. NBR-20 real formal generation,
NBR-70, NBR-80, NBR-90 and overall NBR-1 remain incomplete; the unchecked historical steps below must not
be read as proof of a real Case run.

## Global Constraints

- `NBR-1` is the only highest-priority WRC-1 slice until the representative Case is runnable end to end; do not expand BWB-6, full PHO-7/8, full Action/Camera/Event, product Route/Nav/`goTo`, full Golden Corpus, BNA-8, or WRC-ACC-1.
- `RuntimeSceneSourceV1` remains exactly Canonical JSON Source or Babylon Native Source; one World selects exactly one Source.
- Do not add overlay, a third Scene Source, a shadow Plan, Canonical Compiler re-entry, Mesh/tag/name collider scan, or a Native-specific Runtime/Gameplay/Camera/Physics/Package/Browser owner.
- The Native Module may create visual objects only in the Host Candidate Scene and may register only explicit Spawn/static Collider/Surface intent; it must not create Engine, Scene, Render Loop, Havok/Physics, SDK Camera, Input, Gameplay entities, timers, workers, network calls, or an independent Tick.
- The formal model/profile is `gpt-5.6-sol` with reasoning effort `xhigh`; smoke profiles never count as BNA-6 evidence.
- All model work goes through `scripts/agents/run-codex-task.mjs`; creation submits exactly once and uncertain outcomes reconcile by request ID.
- Use current-only clean breaks: one public name, parser, entry point, and state owner; delete replaced fields, aliases, fallbacks, duplicate DTOs, and Case-specific production adapters.
- Formal Capture Intent uses approved Scheme A only: the Case requires
  `formalCaptureIntentRef: "inputs/formal-world-capture-intent.json"` and
  `formalCaptureIntentHash`; `@whitebox-world/runtime-contracts` owns the sole
  `FormalWorldCaptureIntentV1` parser/canonical-bytes/hash implementation; production receives no scattered
  Capture Intent arguments or inferred/default fallback.
- Checker success precedes Package build; verified Package plus Host admission precede Runtime Candidate allocation.
- For Native generation, `BabylonNativeSceneBootstrapV1` is only the Host-derived read-only startup projection. `GameplayBootstrapV1`, `WorldRuntimeBootstrapV1`, and validated `WorldPackageWorldBoundsV1` remain the canonical owners whose identities the Request context binds.
- Static collision comes only from explicit Frozen Contributions; SDK remains sole owner of Havok, Character Capsule, support, Input, Fixed Tick, Action, Camera, Reset, and lifecycle.
- The current Unified Scene Viewer (`apps/playground`, its curated Catalog/bootstrap, Studio preview route, and `worldkit run`) remains Canonical AuthoringSpec-only. NBR-1 must not add a Native route to that shell or alter its public source-selection contract.
- Native Package launch and formal Capture use the retained BNA verification Web Harness in `apps/native-scene-playground` and an explicit BNA-scoped CLI route. That Harness is evidence infrastructure, not a second product Viewer or a new Runtime owner.
- Deleting the Native Harness, its identity-bound fixtures, or its verification command is outside NBR-1 unless BNA-7 evidence has migrated, the applicable BNA-8 disposition exists, production/test references are zero, and the BNA Runtime/Capture owners explicitly sign off.
- Treat `codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05` as the implementation migration source for Builder Skill/self-check, deterministic Block validation, playthrough Capture, visual reconstruction review and bounded retry. Port accepted logic/tests into current owners before writing replacements; do not merge its Three.js/old Compiler/duplicate Runtime packages or create compatibility paths.
- Each implementation worktree runs `pnpm install --frozen-lockfile`; development runs focused RED/GREEN plus necessary typecheck, not repeated whole-repository gates.
- Every independently reviewable checkpoint is committed, pushed, reviewed, and merged to `main` before the next main-agent integration checkpoint; exact-SHA Cloud evidence may replace waiting on queued GitHub CI.
- Use `===` / `!==` for equality and lodash `isNil` / `isEmpty` for null-or-empty semantics.

---

## Execution map

| Task | Work ID | Deliverable | depends_on | blocks | Mode / exclusive owner | Merge checkpoint |
|---|---|---|---|---|---|---|
| 1 | NBR-10A | Clean-break Attempt identity and route decision owner | NBR-00 | 2, 3, 4 | main-agent-only; `scene-authoring-contracts` shared seam | PR A |
| 2 | NBR-10B | Closed generation request/receipt plus Case/Profile/Evidence/Result contracts | 1 | 3, 8, 10 | sequential; contracts only | PR A |
| 3 | NBR-20A | Native Block Builder Skill and Host replay rules | 2 | 4 | sequential; Skill files only | PR B |
| 4 | NBR-20B | Router-only immutable AI generation workspace and receipt | 2, 3 | 5, 11 | sequential; `scripts/reconstruction/generation-*` | PR B |
| 5 | NBR-30 | Generic Native package command and Cloud Ridge clean break | 4 | 6, 7 | main-agent-only; package CLI adapter | PR C |
| 6 | NBR-40 | Generic verified-Package Runtime through retained BNA verification Harness | 5 | 9, 13 | main-agent-only; BNA Harness/Browser lifecycle | PR D |
| 7 | NBR-45P | Persist trusted Block materializer metadata and complete inventory in Package Root/Receipt | 5, 8 | 9 | main-agent-only; BNA-3 Package identity | PR E1 |
| 8 | NBR-45A | Formal Capture and Block semantic identity contracts | 2 | 7 | sequential; contracts only | PR E0 |
| 9 | NBR-45B | Hosted same-session opening/top/world-side/overlay/traversal Capture | 6, 7, 8 | 11, 13 | main-agent-only; Runtime/Capture bridge | PR E2 |
| 10 | NBR-50A | Pure dimensioned evaluator and stable diagnostics | 2 | 11 | parallel-safe; validation evaluator only | PR F1 |
| 11 | NBR-50B | Formal Capture/runtime evidence adapter | 9, 10 | 12, 13 | main-agent-only; evaluation adapter only | PR F2 |
| 12 | NBR-60 | Atomic Case-bound Formal Capture Intent cutover, production ports, and at-most-one immutable repair journal | 4, 5, 9, 11 | 13 | main-agent-only; temporary exclusive ownership of shared Intent/Case/materializer seams plus run production integration | PR G |
| 13 | NBR-70 | Real `cloud-temple-t-gate-native-block` Case/Intent, artifacts, and local launch | 6, 9, 11, 12 | 14 | main-agent-only; one Case artifact root | PR H |
| 14 | NBR-80 | Delete replaced/duplicate experimental production and scattered Capture Intent paths | 13 | 15 | main-agent-only; deletion ledger | PR H |
| 15 | NBR-90 | Exact-SHA gates, independent review, docs truth, final merge | 14 | later WRC | main-agent-only | final PR/merge |

After Task 2 freezes contracts, Task 10/NBR-50A may run in parallel with sequential Task 3/4 or Task 8/NBR-45A because their file ownership does not overlap. In execution order, Task 8/NBR-45A lands before Task 7/NBR-45P, then Task 9/NBR-45B. Shared exports, `scripts/cli/worldkit.ts`, Vite configuration, Runtime ownership, Package identity, run journal, and final artifacts remain with the main agent. Every work item has exactly one execution mode.

## File ownership map

- `packages/scene-authoring-contracts/src/scene-authoring-contracts.ts`: Route, Attempt, Attempt Result, generation Request/Receipt parsers and hashes.
- `packages/validation/src/reconstruction-contracts.ts`: source-neutral
  Case/Profile/Evidence/Result/Diagnostic/Run Receipt contracts and canonical hashes, including the Case's
  required `formalCaptureIntentRef/formalCaptureIntentHash` fields and fixed-ref validation; it does not
  parse Formal Capture Intent bytes.
- `packages/validation/src/reconstruction-evaluator.ts`: pure evaluator only; no file/model/runtime access.
- `packages/world-package/src/package-build.ts`: NBR-10 clean-break generation-request/source-closure join; NBR-45P modifies the same Package identity seam sequentially only after PR A is merged.
- `packages/world-package/src/package-contract.ts`: NBR-10 verified Package membership closure; NBR-45P extends the same verifier sequentially only after PR A is merged.
- `packages/world-package/src/test-fixture.ts`: NBR-10 current generation-request Package fixture; NBR-45P extends the fixture sequentially only after PR A is merged.
- `.codex/skills/worldkit-native-block-builder/`: AI-facing Builder instructions and standalone preflight self-check; never a trusted admission owner.
- `scripts/reconstruction/generation-request.ts`: trusted Request/Attempt materialization and declared output inventory.
- `scripts/reconstruction/generation-runner.ts`: the only reconstruction caller of `run-codex-task.mjs` and atomic output promotion.
- `scripts/reconstruction/native-package.ts`: generic checked-workspace-to-WorldPackage adapter.
- `packages/runtime-contracts/src/formal-world-capture.ts`: sole owner of
  `FormalWorldCaptureIntentV1`, its parser/canonical bytes/hash, and the source-neutral formal
  Capture/Traversal Request/Receipt contracts.
- `scripts/reconstruction/formal-capture-request.ts`: materializes a formal Request from one already parsed
  Intent plus parsed Case and verified Package metadata; it owns no Intent parser, defaults or inference.
- `scripts/reconstruction/formal-capture.ts`: Package/Runtime/Capture orchestration and Receipt publication.
- `scripts/reconstruction/evaluate.ts`: filesystem adapter that loads verified evidence and calls the pure validation evaluator.
- `scripts/reconstruction/run-journal.ts`: immutable initial/repair Attempt state machine and cleanup join.
- `scripts/reconstruction/run.ts`: core at-most-two-Attempt state machine over injected ports; it is not a
  production adapter.
- `scripts/reconstruction/run-production.ts`: sole production transaction that materializes Case/Profile/Intent
  inputs, constructs the existing generation/package/capture/evaluate/cleanup ports, calls the core, then
  invokes the existing run verifier/final publisher owners.
- `scripts/lib/world-package-browser-transport.ts`: exact receipt-listed Package files exposed only to the BNA verification Browser process.
- `apps/native-scene-playground/src/world-package-loader.ts`: generalize the existing fixed Package loader to a verified Package input; no Source-specific fallback or repository scan.
- `apps/native-scene-playground/src/native-runtime-host.ts`: retained generic consumer of existing RuntimeHost/Runtime Babylon owners; it does not become a product Viewer owner.
- `apps/native-scene-playground/src/native-bootstrap.ts`: start the verified Native Package through the retained Harness and publish only the existing verification bridge.
- `scripts/cli/worldkit.ts`: stable command parsing/dispatch only; domain logic remains in responsibility directories.
- `artifacts/scenes/cloud-temple-t-gate-native-block/`: immutable Case input/profile/run evidence and final Package/Capture.

## Experimental branch reuse audit

Before Task 3 changes production code, write the PR description's three-way migration table against
`codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`:

| Source asset | Disposition | Current destination owner |
|---|---|---|
| `.codex/skills/worldkit-block-builder/**` and `scripts/agent-block-builder-self-check.ts` | adapt prompt/self-check and preserve useful adversarial fixtures | `.codex/skills/worldkit-native-block-builder/**` plus Host replay |
| `packages/block-world/**` check/shape tests | census first; most geometry/Layout semantics already exist, port only a proved missing engine-neutral rule | `@whitebox-world/native-babylon-block-profile` |
| `scripts/run-spatial-world-agent.sh` | retain task/recovery requirements but reject shell/backend coupling | `scripts/agents/run-codex-task.mjs` through `scripts/reconstruction/generation-*` |
| `scripts/run-playthrough-capture.ts` | retain fixed-input/cleanup test intent only; reject raw Browser keyboard injection | `scripts/reconstruction/hosted-session-capture.ts` plus SDK control-capture owners |
| `scripts/lib/block-world-visual-review.ts` | adapt deterministic entry/top composition rules, reject its software renderer | formal Babylon Capture plus WRC-SR evaluator |
| styled visual reconstructor files | reject from NBR structural scoring; preserve only as separately owned post-Capture work | no NBR destination |
| LWDP pending/failure classification/late-output recovery fixtures | direct-port or semantic-adapt only after RED tests distinguish unknown submission from repairable scene failure | current router plus immutable run journal |
| `scripts/verify-block-builder-host-resume.ts` | adapt identity/replay intent; reject old self-check version compatibility table | Native Check, Package Root/Receipt and Runtime replay |
| `packages/block-world-three/**`, old Compiler/Viewer/Runtime paths | reject | no destination; current Babylon/BNA/SDK owners remain authoritative |

The audit must identify direct ports, semantic adaptations and rejected legacy code. It is not permission to
restore the old packages wholesale or preserve two public authoring dialects.

## Checkpoint discipline

For every PR below:

1. branch from the latest `origin/main` in an isolated worktree;
2. run `pnpm install --frozen-lockfile`;
3. write the focused failing test before production code;
4. run only the listed focused tests and necessary `pnpm typecheck`;
5. run `git diff --check`, commit, push, request exact-commit review, fix open P0/P1, then merge;
6. refresh `origin/main` before the next shared-owner task.

Do not wait for queued GitHub CI before starting an independent next checkpoint when exact-SHA Cursor Cloud evidence covers the same affected gate.

### Task 1: NBR-10A Clean-break Attempt identity and freeze route selection

**Files:**
- Modify: `packages/scene-authoring-contracts/src/scene-authoring-contracts.ts`
- Modify: `packages/scene-authoring-contracts/src/scene-authoring-contracts.test.ts`
- Modify: `packages/scene-authoring-contracts/src/package-boundary.test.ts`
- Modify: `scripts/native-scene/native-package-input.ts`
- Modify: `scripts/native-scene/native-package-input.test.ts`
- Modify: `scripts/native-scene/build-cloud-ridge-package.ts`
- Modify: `packages/world-package/src/package-build.ts`
- Modify: `packages/world-package/src/package-contract.ts`
- Modify: `packages/world-package/src/test-fixture.ts`
- Modify: every tracked fixture containing `moduleGenerationInputRef` or `moduleGenerationInputHash`, found by the exact census command below

**Interfaces:**
- Consumes: parsed Scene Brief identity, reference hashes, required capability refs, trust profile, and explicit supported-lane selection.
- Produces: `decideSceneAuthoringRouteV1(input: DecideSceneAuthoringRouteV1Input): SceneAuthoringRouteDecisionV1`; Native Attempt `sourceInput.generationRequestRef` and `sourceInput.generationRequestHash`.

- [ ] **Step 1: Freeze the legacy-field census**

Run:

```bash
rg -n 'moduleGenerationInput(Ref|Hash)' packages scripts apps artifacts
```

Expected on baseline `33dfb49`: exactly the Attempt parser/tests, Native package input/tests, Cloud Ridge builder, two WorldPackage source-closure checks, the shared Native WorldPackage fixture, and generated Cloud Ridge Attempt. Save the exact path list in the PR description; no match may remain at Task completion.

- [ ] **Step 2: Write RED contract tests for the clean break and route owner**

Add tests that require the new fields and explicitly reject the old fields:

```ts
expect(parseSceneAuthoringAttemptV1({
  ...nativeAttempt,
  sourceInput: {
    kind: "babylon-native",
    bootstrapInputRef: "worldkit://native-bootstrap/cloud-temple@1",
    bootstrapInputHash: hashA,
    generationRequestRef: "worldkit://native-generation-request/cloud-temple.initial@1",
    generationRequestHash: hashB,
  },
}).sourceInput).toMatchObject({ generationRequestHash: hashB });

expect(() => parseSceneAuthoringAttemptV1({
  ...nativeAttempt,
  sourceInput: {
    kind: "babylon-native",
    bootstrapInputRef: "worldkit://native-bootstrap/cloud-temple@1",
    bootstrapInputHash: hashA,
    moduleGenerationInputRef: "legacy",
    moduleGenerationInputHash: hashB,
  },
})).toThrowError("SCENE_AUTHORING_ATTEMPT_INVALID");
```

Add asymmetric route tests: selected Native + distinctive silhouette returns Native; World Change Set, formal Route/Nav, dynamic multilayer surface, or unadmitted trust returns `capability-gap`; a model-authored desired route is not an input field.

- [ ] **Step 3: Run RED tests**

Run:

```bash
pnpm exec vitest run packages/scene-authoring-contracts/src/scene-authoring-contracts.test.ts scripts/native-scene/native-package-input.test.ts
```

Expected: FAIL because `generationRequestRef`, `generationRequestHash`, and `decideSceneAuthoringRouteV1` do not exist.

- [ ] **Step 4: Implement the closed route input and clean-break Native Attempt member**

Add the closed input and decision owner without Runtime/Compiler imports:

```ts
export interface DecideSceneAuthoringRouteV1Input {
  readonly id: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly trustProfileRef: string;
  readonly trustProfileHash: Sha256HashV1;
  readonly requiredCapabilityRefs: readonly string[];
  readonly requestedSourceKind: "canonical" | "babylon-native";
  readonly nativeTrustAdmitted: boolean;
  readonly referenceDrivenDistinctiveSilhouette: boolean;
}

export function decideSceneAuthoringRouteV1(
  input: DecideSceneAuthoringRouteV1Input,
): SceneAuthoringRouteDecisionV1;
```

Replace the Native source field list atomically:

```ts
readonly sourceInput: Readonly<{
  kind: "babylon-native";
  bootstrapInputRef: string;
  bootstrapInputHash: Sha256HashV1;
  generationRequestRef: string;
  generationRequestHash: Sha256HashV1;
}>;
```

`decideSceneAuthoringRouteV1()` must sort/dedupe the required capability refs, return the frozen Native decision only for the admitted first profile, and fail closed to a capability gap for the unsupported capabilities named in the spec. It must not inspect output source or call a model.

- [ ] **Step 5: Update package closure and all fixtures atomically**

Change `PrepareFrozenBabylonNativeWorldPackageBuildInputV1.moduleGenerationInputRef` to `generationRequestRef` and add `generationRequestHash`. `assertAuthoringClosure()` compares Attempt fields to these inputs. `assertSourceClosure()` compares only `SceneAuthoringAttemptResultV1.authoredSourceHash` to the built source graph hash; it must no longer compare a request hash to generated source bytes.

Update Cloud Ridge and serialized fixtures to the one new dialect. Do not read either legacy property in a fallback branch.

- [ ] **Step 6: Run GREEN and clean-break census**

Run:

```bash
pnpm exec vitest run packages/scene-authoring-contracts scripts/native-scene/native-package-input.test.ts packages/world-package/src/package-build.test.ts packages/world-package/src/package-directory.test.ts
pnpm typecheck
if rg -n 'moduleGenerationInput(Ref|Hash)' packages scripts apps artifacts; then exit 1; fi
```

Expected: all focused tests pass, typecheck exits 0, and the legacy census exits 0 through the negated branch because there are no matches.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/scene-authoring-contracts scripts/native-scene apps artifacts
git commit -m "refactor: bind native attempts to generation requests"
```

### Task 2: NBR-10B Add closed generation and reconstruction evidence contracts

**Files:**
- Modify: `packages/scene-authoring-contracts/src/scene-authoring-contracts.ts`
- Modify: `packages/scene-authoring-contracts/src/scene-authoring-contracts.test.ts`
- Modify: `packages/scene-authoring-contracts/src/index.ts`
- Create: `packages/validation/src/reconstruction-contracts.ts`
- Create: `packages/validation/src/reconstruction-contracts.test.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Consumes: `SceneAuthoringRouteDecisionV1`, SHA-256 identities, Case inputs, closed metric values.
- Produces: parsers/canonical bytes/hash helpers for `NativeBlockGenerationRequestV1`, `NativeBlockGenerationReceiptV1`, `WorldReconstructionCaseV1`, `WorldReconstructionEvaluationProfileV1`, `WorldReconstructionEvidenceSetV1`, `WorldReconstructionEvaluationResultV1`, `WorldReconstructionDiagnosticV1`, and `WorldReconstructionRunReceiptV1`.

- [ ] **Step 1: Write RED generation Request/Receipt parser tests**

Use the exact declared output tuple and formal profile:

```ts
const request = parseNativeBlockGenerationRequestV1({
  kind: "native-block-generation-request",
  schemaVersion: 1,
  id: "cloud-temple.initial",
  routeDecisionRef,
  routeDecisionHash,
  sceneBriefRef,
  sceneBriefHash,
  referenceInputs: [{ inputRef: referenceRef, contentHash: referenceHash, mediaType: "image/png" }],
  codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
  codexExecutionProfileHash: formalProfileHash,
  taskInstructionRef: "worldkit://task-instruction/native-block-reconstruction@1",
  taskInstructionHash,
  builderSkillRef: "worldkit://skill/worldkit-native-block-builder@1",
  builderSkillHash,
  workspaceContextManifestRef: "worldkit://workspace-context/native-block-builder@1",
  workspaceContextManifestHash,
  contextInputs,
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneApiHash,
  nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox@1",
  nativeSceneProfileHash,
  blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
  blockProfileHash,
  bootstrapInputRef: "worldkit://native-bootstrap/cloud-temple@1",
  bootstrapInputHash,
  seed: 202608311,
  budgets,
  declaredOutputPaths: ["scene.ts", "native-block-authoring.json", "native-resources.json"],
});
expect(request.declaredOutputPaths).toEqual([
  "scene.ts",
  "native-block-authoring.json",
  "native-resources.json",
]);
```

Reject output reordering, extra keys, duplicate reference/context inputs, unsorted context manifest rows, any absolute path/mtime/gzip identity, API/Profile hash mismatch, Bootstrap identity mismatch, `maximumRepairAttemptCount > 1`, non-formal resolved model/effort, credentials/provider payloads, and output inventory not exactly matching the request. The Request rejects `routerTaskPayloadHash`: the canonical router task payload contains the Request identity, so putting its payload hash back into the Request would be self-referential.

- [ ] **Step 2: Write RED reconstruction contract tests**

Require all seven dimension IDs independently and closed metric kinds:

```ts
expect(parseWorldReconstructionEvaluationResultV1(result).dimensions.map(
  ({ dimensionId }) => dimensionId,
)).toEqual([
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
]);

expect(() => parseWorldReconstructionEvaluationResultV1({
  ...result,
  dimensions: result.dimensions.filter(({ dimensionId }) => dimensionId !== "collider"),
})).toThrowError("WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID");
```

Also reject empty `acceptanceTargetRefs`, empty `requiredEvidenceProfileRefs`, a Case that labels scripted traversal as Route/Nav, advisory-only pixel metrics, stale Attempt/Package/Capture hashes, and a passed dimension with missing required evidence. Every Case scripted traversal check must carry a non-empty, execution-ordered `fixedInputSequence` of `@whitebox-world/runtime-contracts` `FixedInputV1` values. Parse each step only with `parseFixedInputV1`, deep-freeze the sequence, preserve its order, and include it in Case canonical bytes/hash; retain `checkpointIds` solely as result-sampling identities. Do not add Route/Nav/`goTo` fields or a duplicate action/axes parser.

- [ ] **Step 3: Run RED contract tests**

```bash
pnpm exec vitest run packages/scene-authoring-contracts/src/scene-authoring-contracts.test.ts packages/validation/src/reconstruction-contracts.test.ts
```

Expected: FAIL because the new parsers and files are absent.

- [ ] **Step 4: Implement generation contracts in the existing source-authoring owner**

Implement the exact Request shape from the spec and this closed Receipt outcome:

```ts
export type NativeBlockGenerationReceiptV1 = Readonly<{
  kind: "native-block-generation-receipt";
  schemaVersion: 1;
  id: string;
  generationRequestRef: string;
  generationRequestHash: Sha256HashV1;
  routerTaskPayloadHash: Sha256HashV1;
  taskInstructionHash: Sha256HashV1;
  builderSkillHash: Sha256HashV1;
  workspaceContextManifestHash: Sha256HashV1;
  routerRequestId: string;
  backend: "cloud" | "local";
  executionProfile: "formal";
  resolvedModel: "gpt-5.6-sol";
  resolvedReasoningEffort: "xhigh";
  outcome: "completed" | "rejected" | "tool-error" | "unknown";
  outputs: readonly NativeBlockGenerationOutputV1[];
  diagnosticCodes: readonly NativeBlockGenerationDiagnosticCodeV1[];
  cleanupOutcome: "completed" | "failed";
}>;
```

Expose `parse*`, `*CanonicalBytesV1`, and `hash*V1` for Request and Receipt. The Receipt must repeat and verify the canonical router payload, instruction, Skill and context-manifest hashes. Use sorted closed arrays; do not accept aliases, mutable filesystem metadata, archive-byte identity, or provider fields.

- [ ] **Step 5: Implement source-neutral reconstruction contracts in validation**

Define the metric union exactly:

```ts
export type WorldReconstructionMetricV1 =
  | Readonly<{ kind: "ratio-basis-points"; valueBasisPoints: number }>
  | Readonly<{ kind: "normalized-distance-basis-points"; valueBasisPoints: number }>
  | Readonly<{ kind: "distance-millimeters"; valueMillimeters: number }>
  | Readonly<{ kind: "boolean-presence"; isPresent: boolean }>
  | Readonly<{ kind: "identity-match"; isMatch: boolean }>
  | Readonly<{ kind: "receipt-outcome"; outcome: "completed" | "failed" | "incomplete" }>;
```

The Profile sets `maximumRepairAttemptCount: 1` and `builderSelfRepairAttemptCount: 0`. The Case binds real input hashes and expected topology, normalized composition targets, Spawn/Support, required collider IDs/roles, and scripted fixed-input traversal checkpoints. The Result contains no aggregate score. Missing evidence produces `incomplete`, never a numeric zero or advisory pass.

NBR-10C closes the evaluator seam before NBR-50A: Case freezes facts only, Profile owns every
BasisPoints/Millimeters threshold, and EvidenceSet contains seven closed observed payloads with per-row
evidence refs. The shared identity closure includes Attempt, formal Package root, World Build Identity,
and Capture. Observed traversal uses `reached | blocked | incomplete`; pixels remain advisory.

- [ ] **Step 6: Run GREEN contracts and package boundaries**

```bash
pnpm exec vitest run packages/scene-authoring-contracts packages/validation/src/reconstruction-contracts.test.ts
pnpm typecheck
git diff --check
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 7: Commit and merge contract checkpoint PR A**

```bash
git add packages/scene-authoring-contracts packages/validation scripts/native-scene apps artifacts
git commit -m "feat: add native reconstruction identity contracts"
git push -u origin HEAD
```

Open PR A, request focused contract review, close every P0/P1, merge to `main`, and refresh `origin/main` before Tasks 3/4. PR A must contain no orchestration, model call, Runtime, or Browser change.

### Task 3: NBR-20A Add the Native Block Builder Skill without adding authority

**Files:**
- Create: `.codex/skills/worldkit-native-block-builder/SKILL.md`
- Create: `.codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md`
- Create: `.codex/skills/worldkit-native-block-builder/scripts/self-check.mjs`
- Create: `scripts/agents/native-block-builder-skill.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: attached reference image, Scene Brief, `NativeBlockGenerationRequestV1`, Host-selected API/Profile context.
- Produces: exactly `scene.ts`, `native-block-authoring.json`, and `native-resources.json`; the Host-frozen `native-scene.bootstrap.json` is read-only input, and the standalone preflight Receipt is advisory and never substitutes for Host `worldkit native check`.

- [ ] **Step 1: Write the RED Skill bundle test**

Test the actual Skill tree, required language, forbidden authority, and a synthetic valid output workspace:

```ts
expect(skill).toContain("write exactly these three declared outputs");
for (const forbidden of [
  "new Engine(", "new Scene(", "runRenderLoop", "new Havok", "new FreeCamera(",
  "addEventListener", "setInterval", "setTimeout", "fetch(",
]) expect(skill).not.toContain(`you may use ${forbidden}`);

expect(await runSelfCheck(validWorkspace)).toMatchObject({
  ok: true,
  declaredOutputPaths: [
    "scene.ts",
    "native-block-authoring.json",
    "native-resources.json",
  ],
});
```

Also test missing output, extra output, symlink, empty file, unsorted/duplicate resource refs, and instruction text that asks the model to create Physics/Camera/Input.

- [ ] **Step 2: Run RED Skill test**

```bash
pnpm exec vitest run scripts/agents/native-block-builder-skill.test.ts
```

Expected: FAIL because the Skill bundle and checker do not exist.

- [ ] **Step 3: Write the closed Skill instructions**

The Skill must state this exact responsibility split:

```text
JSON/Case/Scene Brief owns identity, intent, Subject, Spawn target, budgets, and evidence requirements.
scene.ts owns Babylon Native Block visual construction and explicit registration calls only.
The Host owns Check, Package, Receipt, Runtime Candidate, Havok, Character, Input, Action, Camera, Reset, Capture, and evaluation.
```

Require use of `@whitebox-world/native-babylon` plus `@whitebox-world/native-babylon-block-profile`, deterministic seeded construction, explicit visual groups, explicit Spawn registration, and explicit collider contribution. Require a ground-supported Spawn, readable central ascent, T-shaped upper platform, gate/building silhouette, blocker walls, and no claimed Route/Nav output for this Case.

- [ ] **Step 4: Implement the standalone output-shape self-check**

The checker accepts one workspace path, rejects symlinks/extra top-level files, verifies the exact three non-empty outputs, parses the two JSON files as accessor-free plain data, and returns stable canonical JSON:

```js
{
  kind: "native-block-builder-self-check",
  schemaVersion: 1,
  ok: true,
  declaredOutputPaths: [
    "scene.ts",
    "native-block-authoring.json",
    "native-resources.json",
  ],
  outputHashes: [/* path/hash rows sorted by path */],
  diagnosticCodes: [],
}
```

It does not typecheck Babylon source, instantiate a Candidate, infer colliders, or claim admission; those remain BNA-2 Host checks.

- [ ] **Step 5: Run GREEN Skill test and register the focused script**

Add `check:native-block-builder-skill` to root `package.json`, then run:

```bash
pnpm exec vitest run scripts/agents/native-block-builder-skill.test.ts
pnpm check:native-block-builder-skill
git diff --check
```

Expected: both commands pass and the checker output is byte-stable across two runs.

- [ ] **Step 6: Commit Task 3**

```bash
git add .codex/skills/worldkit-native-block-builder scripts/agents/native-block-builder-skill.test.ts package.json
git commit -m "feat: add native block reconstruction builder skill"
```

### Task 4: NBR-20B Dispatch immutable Native Block generation only through the Codex router

**Files:**
- Create: `scripts/reconstruction/generation-request.ts`
- Create: `scripts/reconstruction/generation-request.test.ts`
- Create: `scripts/reconstruction/generation-runner.ts`
- Create: `scripts/reconstruction/generation-runner.test.ts`
- Create: `scripts/reconstruction/run-native-block-generation.ts`
- Create: `artifacts/scenes/cloud-temple-t-gate-native-block/case.json`
- Create: `artifacts/scenes/cloud-temple-t-gate-native-block/evaluation-profile.json`
- Create: `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/reference-0.png` by copying and hash-binding `/Users/xiateng/Downloads/测试集/1.png`
- Create: `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/scene-brief.md` from the accepted Cloud Ridge Scene Brief, preserving visible facts and labeling the top T continuation as inferred
- Create: `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json` as the validated `WorldPackageWorldBoundsV1` input for the later Package manifest
- Reuse: the admitted G Bot `GameplayBootstrapV1` and `WorldRuntimeBootstrapV1` from the retained verified Cloud Ridge Package as Host owner inputs; do not duplicate their large Registry closure under the Case source directory
- Materialize: canonical `gameplay-bootstrap.json`, `world-runtime-bootstrap.json`, `world-bounds.json`, and Host-derived `native-scene.bootstrap.json` under `artifacts/scenes/cloud-temple-t-gate-native-block/runs/<run-id>/attempts/0/inputs/` before router submission
- Modify: `package.json`

**Interfaces:**
- Consumes: parsed Case/Profile, route decision, parsed `GameplayBootstrapV1`, parsed `WorldRuntimeBootstrapV1`, validated `WorldPackageWorldBoundsV1`, Builder Skill context, Host-selected Scene Module/API/Profile refs and backend, and immutable input files.
- Produces: `prepareNativeBlockGenerationTaskV1(input): PreparedNativeBlockGenerationTaskV1`; `runNativeBlockGenerationV1(input, ports): Promise<NativeBlockGenerationRunV1>` with atomically promoted outputs and parsed `NativeBlockGenerationReceiptV1`.

- [ ] **Step 1: Write RED Request materialization tests**

Assert canonical request identity, stable router request ID, exact output declarations, and rejection before process creation:

```ts
const prepared = prepareNativeBlockGenerationTaskV1({
  case: parsedCase,
  profile: parsedProfile,
  routeDecision,
  attemptIndex: 0,
  backend: "cloud",
  runDirectoryPath,
});
expect(prepared.routerArguments.filter((value) => value === "--output")).toHaveLength(3);
expect(prepared.routerArguments).toContain("--execution-profile");
expect(prepared.routerArguments).toContain("formal");
expect(prepared.routerArguments).toContain("--submit-attempts");
expect(prepared.routerArguments).toContain("1");
```

Reject a Canonical/capability-gap decision, a caller-forged Native decision, Route/Case Scene Brief mismatch, changed input bytes after hashing, undeclared output, `attemptIndex > 1`, output outside the run directory, symbolic-link files or ancestors, an existing Attempt/task root, and duplicate router identity across run IDs. Require exact resolved-resource descriptors with content hashes. Add cross-owner RED cases for a Gameplay ref/hash mismatch, a World Runtime Bootstrap not admitted by the selected Registry Lock or whose controlled descriptor/Camera closure does not close `initialControlledEntityId`, a Case Spawn mismatch, invalid WorldPackage Bounds, and any change to Gameplay/World Runtime/Bounds canonical bytes after Request identity is frozen.

- [ ] **Step 2: Write RED runner lifecycle tests with an injected process port**

Define the port so tests never call a real model:

```ts
export interface CodexTaskProcessPortV1 {
  run(input: Readonly<{
    executablePath: string;
    arguments: readonly string[];
    cwd: string;
    requestId: string;
  }>): Promise<Readonly<{
    exitCode: number;
    stdout: string;
    stderr: string;
    taskOutcome?: CodexTaskOutcomeEnvelopeV1;
  }>>;
}
```

Test completed outputs, no output, empty output, task error, timeout/unknown outcome, same request ID + same hash reconciliation, same ID + different hash rejection, interrupted atomic promotion, and cleanup failure. Assert the executable basename is exactly `run-codex-task.mjs`; no test or production branch may call `run-lwdp-codex-task.mjs`, `run-local-codex-task.mjs`, LWDP HTTP, or `codex exec` directly.

The representative formal run uses the frozen 1,800-second timeout. Distinguish a definitive provider
task timeout as `task-timeout` from an uncertain creation outcome as `creation-outcome-unknown`; retain
only the stable provider-neutral diagnostic code in the Generation Receipt, never provider stderr or
payload details. Require both Local and Cloud adapters to emit one closed, request-ID-bound outcome
envelope. The production process port parses that envelope rather than stderr; unknown creation outcomes
must enter the Runner reconciliation port and call the router's GET-only recovery mode. Add focused tests
for the real Local timeout adapter, structured Cloud timeout codes, single-POST recovery, envelope identity,
Receipt diagnostic combinations, and the stable hyphen Bootstrap ID required by `whitebox.blocks@1`.

- [ ] **Step 3: Run RED generation tests**

```bash
pnpm exec vitest run scripts/reconstruction/generation-request.test.ts scripts/reconstruction/generation-runner.test.ts
```

Expected: FAIL because the generation owner does not exist.

- [ ] **Step 4: Implement immutable Request preparation**

`prepareNativeBlockGenerationTaskV1()` must:

1. parse the Case/Profile, `GameplayBootstrapV1`, `WorldRuntimeBootstrapV1` and `WorldPackageWorldBoundsV1`; prove the Gameplay ref/hash link, controlled Subject closure, Camera closure, Case Spawn identity and finite bounds; derive the sole `BabylonNativeSceneBootstrapV1` from the Case-bound Spawn/seed, Gameplay/World Runtime values and Host-selected Scene Module/API/Profile refs;
2. canonical-materialize `native-scene.bootstrap.json` under the durable Attempt input directory before task creation, freeze its bytes, and then re-read and hash the Case, Profile, Scene Brief, reference image, Gameplay Bootstrap, World Runtime Bootstrap, WorldPackage Bounds, task instruction, Builder Skill, canonical sorted workspace-context manifest and each context input, plus Host-selected Native API/Profile/Block Profile content;
3. parse the supplied Route, prove its Case Scene Brief closure, recompute it with `decideSceneAuthoringRouteV1()`, require byte-equivalent output, and retain its Case-level identity rather than making it run-scoped;
4. parse exact Native API/Profile/Block resolved-resource descriptors; bind canonical Registry refs plus resolved content hashes in `NativeBlockGenerationRequestV1`, while binding descriptor paths plus descriptor-byte hashes only in sorted `contextInputs`; use only `worldkit://native-scene-api/babylon@1` for the current Case;
5. create the Request and Native `SceneAuthoringAttemptV1` with stable run-scoped Request/Attempt/router identities, and create a typed Host-closure descriptor binding the admitted World Runtime Bootstrap ref/resolved version/content hash to the parsed Bootstrap content hash;
6. atomically publish one fresh durable Attempt containing Route, Request, Attempt, Host closure, canonical Gameplay/World Runtime/Bounds/Bootstrap bytes and exact API/Profile/Block descriptors; reject existing Attempt/task roots and symbolic-link input/output ancestors; cleanup may remove only the isolated `.task`, never these durable inputs;
7. construct the complete canonical router task payload from the already-hashed Request, compute `routerTaskPayloadHash`, record that hash only in the Generation Receipt, then construct router arguments with one task, one request ID, formal profile, timeout from the Request, three declared outputs, and a unique S3 prefix `<scene-id>/<run-id>/attempt-0` for cloud;
8. never pass credentials, the mutable checkout, unrelated artifacts, or absolute host paths in serialized contracts.

- [ ] **Step 5: Implement run, reconciliation, receipt, and atomic promotion**

`runNativeBlockGenerationV1()` invokes the router once, parses the exact three delivered files, reruns the Skill self-check, computes hashes/bytes, and promotes them from `attempts/0/.staging` to `attempts/0/source` only when complete. An uncertain create outcome writes `outcome: "unknown"` and calls a read-only reconciliation port keyed by the same request ID; it never launches a second creation request.

The completed Attempt Result binds `authoredSourceHash` to the admitted source graph at Task 5, not to the raw request. Until Check completes, preserve the Attempt and Generation Receipt but do not synthesize a completed Attempt Result.

- [ ] **Step 6: Create and validate the real Case inputs**

Copy the source image without transformation, calculate its SHA-256, and bind it in `case.json`. Bind the copied Scene Brief hash. Reuse the retained verified Cloud Ridge Package's canonical Gameplay and World Runtime Bootstrap owner artifacts for the one real controlled Subject/Camera closure, snapshot their canonical bytes into the durable Attempt input, and bind the validated WorldPackage Bounds; do not hand-author a second Subject/Camera closure in the Native Bootstrap. The Case must contain non-empty acceptance targets for foreground platform, central ascent, mountain/cliff layers, upper T junction, gate mass, supported Spawn, required blocker colliders, and fixed-input traversal checkpoints. `evaluation-profile.json` fixes one formal model/Profile/Prompt/budget/threshold set, `maximumRepairAttemptCount: 1`, and `builderSelfRepairAttemptCount: 0`.

Run:

```bash
pnpm exec vitest run packages/validation/src/reconstruction-contracts.test.ts scripts/reconstruction/generation-request.test.ts
```

Expected: the real Case/Profile parse and their stored content hashes match.

- [ ] **Step 7: Run the first real formal AI generation through the router**

Add root script `reconstruct:native-block:generate` and run:

```bash
pnpm reconstruct:native-block:generate -- \
  --case artifacts/scenes/cloud-temple-t-gate-native-block/case.json \
  --output artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial \
  --backend cloud
```

Expected: one formal router task reports `model=gpt-5.6-sol reasoning=xhigh`, creates the exact three non-empty files plus Request/Attempt/Generation Receipt, and does not create a Package, Runtime Candidate, or Capture. If provider submission is uncertain, stop this step in the recorded unknown state and reconcile the same request ID; do not rerun under a new ID.

- [ ] **Step 8: Run GREEN generation tests and repository policy census**

```bash
pnpm exec vitest run scripts/reconstruction/generation-request.test.ts scripts/reconstruction/generation-runner.test.ts scripts/agents/native-block-builder-skill.test.ts
pnpm typecheck
if rg -n 'run-lwdp-codex-task|run-local-codex-task|submitCodexGenerationJob|codex exec' scripts/reconstruction; then exit 1; fi
git diff --check
```

Expected: focused tests/typecheck pass and reconstruction code names only `run-codex-task.mjs`.

- [ ] **Step 9: Commit and merge generation checkpoint PR B**

```bash
git add .codex/skills/worldkit-native-block-builder scripts/reconstruction scripts/agents artifacts/scenes/cloud-temple-t-gate-native-block package.json
git commit -m "feat: generate native block worlds through the codex router"
git push -u origin HEAD
```

Open PR B. Review the actual formal Generation Receipt and source outputs without claiming checker/package/runtime success. Close every P0/P1, merge to `main`, and refresh before Task 5.

### Task 5: NBR-30 Build a generic checked Native WorldPackage and remove hand-written assembly

**Files:**
- Create: `scripts/reconstruction/native-package.ts`
- Create: `scripts/reconstruction/native-package.test.ts`
- Create: `packages/native-babylon-block-profile/src/authoring-manifest.ts`
- Create: `packages/native-babylon-block-profile/src/authoring-manifest.test.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Modify: `scripts/native-scene/native-package-input.ts`
- Modify: `scripts/native-scene/native-package-input.test.ts`
- Modify: `scripts/native-scene/build-trusted-world-package.ts`
- Delete: `scripts/native-scene/build-cloud-ridge-package.ts` after fixture callers use the generic adapter
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit-native.integration.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: one attempt directory containing Host authoring identity, canonical Gameplay/World Runtime/Bounds owner inputs, frozen `inputs/native-scene.bootstrap.json`, `source/scene.ts`, `source/native-block-authoring.json`, and `source/native-resources.json`, plus one parsed `WorldReconstructionCaseV1`.
- Produces: `packageNativeBlockAttemptV1(input): Promise<PackagedNativeBlockAttemptV1>` containing completed Attempt Result, verified `WorldPackageDirectoryV1`, build identity/receipt hashes, and an atomically published Package directory.

- [ ] **Step 1: Write RED generic package tests**

Build a test attempt directory with a valid asset-free Block source and assert order/identity:

```ts
const packaged = await packageNativeBlockAttemptV1({
  repositoryRoot,
  attemptDirectoryPath,
  casePath,
  outputDirectoryPath,
  candidateFactory,
});
expect(packaged.checkResult.outcome).toBe("passed");
expect(packaged.verifiedWorldPackage.kind).toBe("babylon-native-scene");
expect(packaged.sceneAuthoringAttemptResult.authoredSourceHash)
  .toBe(packaged.verifiedWorldPackage.sceneModuleBundleManifest.sourceGraphHash);
```

Use an injected formal Runtime Candidate allocation observer. Test a source-only directory without the Host bootstrap, authority violation, TypeScript error, unsupported import, missing output, resource mismatch, tampered Generation Receipt, failed dual replay, missing Spawn support, collider budget overrun, and throwing cleanup. Parse `native-block-authoring.json` as a closed accessor-free contract and join every declared semantic target/group/color to the checked Layout visual-group inventory; reject missing, duplicate, unbound, undeclared, or stale group rows. For every failed check assert `formalRuntimeCandidateAllocationCount === 0`, no Package directory exists, and the failure diagnostic/cleanup receipt is retained. The BNA-2 checker is still allowed to allocate and dispose its two isolated Build Epoch Candidate Scenes for deterministic replay; those are not formal Runtime Candidates.

- [ ] **Step 2: Write RED CLI grammar/integration tests**

Require exactly:

```text
worldkit native package <attempt-directory> --case <case.json> --json
```

Derive the only Package output as `<attempt-directory>/world-package`. Reject
missing `--case`, any legacy `--output`, a raw source directory without Host
identity files, and legacy Case-specific build commands.

- [ ] **Step 3: Run RED package tests**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/authoring-manifest.test.ts scripts/reconstruction/native-package.test.ts scripts/cli/worldkit-native.integration.test.ts
```

Expected: FAIL because the generic command/adapter do not exist.

- [ ] **Step 4: Implement check-before-Package materialization**

`packageNativeBlockAttemptV1()` performs this fixed sequence:

```text
re-hash Case/Request/Attempt/Generation Receipt/source files and canonical
Gameplay/World Runtime/Bounds owner inputs
-> assemble a sibling check staging directory from a Host-read-only copy of
   inputs/native-scene.bootstrap.json plus the exact three source outputs
-> checkBabylonNativeSceneWorldDirectoryV1(check-staging)
-> require outcome === passed
-> resolve the closed native-resources list
-> finalize completed SceneAuthoringAttemptResultV1
-> prepareFrozenBabylonNativeWorldPackageBuildInputV1
-> buildTrustedBabylonNativeWorldPackageV1
-> verifyWorldPackageDirectoryV1
-> writeWorldPackageDirectoryV1 atomically
```

The generated source directory never owns or contains `native-scene.bootstrap.json`. The Host re-hashes the immutable bootstrap input, copies it into the ephemeral sibling check staging directory, rejects symlinks or additional source outputs, and always cleans the staging directory. It does not add a second checker or trust a model-writable bootstrap.

The generic adapter derives shared Package inputs from admitted Registry/profile owners and the Case. It verifies that the Package manifest publishes the same validated Bounds input and that Gameplay/World Runtime closure matches the identities bound by the Generation Request; it does not copy Bounds or Subject/Camera resource closure from the Native Bootstrap. It does not hard-code Cloud Ridge hashes, synthesize an empty acceptance/evidence list, infer a Collider from Mesh/tag/name, or allocate a formal Runtime Candidate.

- [ ] **Step 5: Add the stable CLI command**

Add a closed `WorldkitArgs` member:

```ts
readonly {
  command: "native-package";
  attemptDirectoryPath: string;
  casePath: string;
  outputPath: string;
  json: true;
}
```

Dispatch into `scripts/reconstruction/native-package.ts`; keep `scripts/cli/worldkit.ts` free of build policy. The JSON result returns exact Attempt Result, WorldPackage Ref/Root, WorldBuildIdentity hash, Build Receipt hash, output path, and diagnostics.

- [ ] **Step 6: Replace Cloud Ridge assembly and delete its production script**

Convert Cloud Ridge fixtures to invoke `packageNativeBlockAttemptV1()` with fixture inputs. Delete `build-cloud-ridge-package.ts`, its root package script, and every import. Preserve the generated fixture only when it is regenerated byte-for-byte through the generic command; otherwise update its exact hashes in the same commit and run its Package verifier.

- [ ] **Step 7: Run GREEN package and tamper gates**

```bash
pnpm exec vitest run packages/native-babylon-block-profile/src/authoring-manifest.test.ts scripts/reconstruction/native-package.test.ts scripts/native-scene/native-package-input.test.ts scripts/native-scene/native-scene-check.test.ts scripts/cli/worldkit-native.integration.test.ts packages/world-package/src/package-build.test.ts packages/world-package/src/package-directory.test.ts
pnpm typecheck
if rg -n 'buildCloudRidgePackage|build-cloud-ridge-package' packages scripts apps package.json; then exit 1; fi
git diff --check
```

Expected: all focused checks pass and the Case-specific production builder census is empty.

- [ ] **Step 8: Package the initial AI output**

```bash
pnpm worldkit native check \
  artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0/source --json
pnpm worldkit native package \
  artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0 \
  --case artifacts/scenes/cloud-temple-t-gate-native-block/case.json \
  --output artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0/world-package \
  --json
```

Expected: formal check passes before Package publication. Store Check Result, Explain output, Attempt Result, Build Receipt, and Package identity. If Check fails, keep the diagnostics as initial-generation evidence and do not hand-edit source in this task; the explicit repair path is Task 12.

- [ ] **Step 9: Commit and merge package checkpoint PR C**

```bash
git add scripts/reconstruction scripts/native-scene scripts/cli package.json apps artifacts/scenes/cloud-temple-t-gate-native-block
git commit -m "feat: package checked native reconstruction attempts"
git push -u origin HEAD
```

Request exact-commit Package/identity review. Merge only after P0/P1 closure, then refresh `origin/main`.

### Task 6: NBR-40 Run an admitted Native Package through the retained BNA verification Harness

**Files:**
- Create: `scripts/lib/world-package-browser-transport.ts`
- Create: `scripts/lib/world-package-browser-transport.test.ts`
- Modify: `scripts/lib/worldkit-server.ts`
- Modify: `scripts/lib/worldkit-server.test.ts`
- Modify: `apps/native-scene-playground/vite.config.ts`
- Modify: `apps/native-scene-playground/src/world-package-loader.ts`
- Modify: `apps/native-scene-playground/src/native-runtime-host-module-loader.test.ts`
- Modify: `apps/native-scene-playground/src/native-runtime-host.ts`
- Modify: `apps/native-scene-playground/src/native-bootstrap.ts`
- Modify: `apps/native-scene-playground/src/native-package-migration.test.ts`
- Modify: `apps/native-scene-playground/src/hosted-runtime-bridge.ts`
- Modify: `apps/native-scene-playground/src/hosted-runtime-bridge.test.ts`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`

**Interfaces:**
- Consumes: a filesystem WorldPackage directory that passes `verifyWorldPackageDirectoryV1()`.
- Produces: `worldkit native run <package-directory>` serving the admitted Native Package through the retained BNA verification Harness and creating the existing RuntimeHost/BabylonWorldRuntime with SDK-owned systems. It does not change `worldkit run`, Studio, the Canonical Viewer Catalog/bootstrap, or the product Viewer source-selection contract.

- [ ] **Step 1: Write RED exact Package transport tests**

The server transport exposes only receipt-listed immutable bytes:

```ts
const transport = await createWorldPackageBrowserTransportV1({
  packageDirectoryPath,
});
expect(transport.worldPackageRootHash).toBe(verified.receipt.worldPackageRootHash);
await expect(transport.read("native/scene.mjs")).resolves.toEqual(sceneBytes);
await expect(transport.read("../package.json")).rejects.toThrow(
  "WORLD_PACKAGE_BROWSER_PATH_UNADMITTED",
);
```

Test symlink root/file, unlisted file, wrong content hash/size/media type, path traversal, mutated byte after verification, and cleanup. No route may serve the repository root or arbitrary filesystem path.

- [ ] **Step 2: Write RED Native-only admitted startup tests**

Test the retained BNA Harness with `babylon-native-scene`: it must pass its verified Package and exact loaded Module hash into the existing runtime admission path. Explicitly prove that a `canonical-execution-plan` Package and any unknown kind are rejected before Harness startup. The source-neutral verified Package union remains tested by its existing WorldPackage/Runtime owner; this Harness must not become a mixed Source route or add a `default -> canonical` fallback.

Use spies to assert the Module cannot create Engine/Physics/Camera/Input/loop and that SDK Runtime creates Havok/Subject/Camera after admission. Add unsupported Spawn, ledge departure, Reset/rebind, two Candidate, and throwing disposal cases from the runtime deep-review checklist.

- [ ] **Step 3: Run RED Runtime route tests**

```bash
pnpm exec vitest run scripts/lib/world-package-browser-transport.test.ts scripts/lib/worldkit-server.test.ts apps/native-scene-playground/src/native-runtime-host-module-loader.test.ts apps/native-scene-playground/src/native-package-migration.test.ts apps/native-scene-playground/src/hosted-runtime-bridge.test.ts
```

Expected: FAIL because the BNA verification Harness still embeds the fixed Cloud Ridge Package and cannot accept an arbitrary admitted Native Package directory.

- [ ] **Step 4: Add verified Package Browser transport and virtual Native module**

Extend `startWorldkitServer()` with a discriminated source input rather than ambiguous fields:

```ts
type WorldkitServerSourceV1 =
  | Readonly<{ kind: "canonical-file"; inputPath: string }>
  | Readonly<{ kind: "world-package"; packageDirectoryPath: string }>;
```

For Package source, verify before Vite spawn, expose receipt and receipt-listed files through nonce-protected same-origin middleware, and inject the Package Root. `apps/native-scene-playground/vite.config.ts` provides one active Native Module only from the verified Package; it loads exactly the admitted `native/scene.mjs` bytes and exports the verified bundle content hash. It must not embed a Cloud Ridge path or scan workspace packages beyond the already admitted runtime dependency graph.

- [ ] **Step 5: Generalize the BNA verification startup without touching the Unified Viewer**

`world-package-loader.ts` fetches receipt-listed rows, assembles them, and verifies the Native Package before returning the admitted input. `native-bootstrap.ts` then delegates to the existing Native RuntimeHost consumer and Hosted bridge. Do not add a Native branch to `PlaygroundRuntimeRouteV1`, `apps/playground`, Studio preview, or the current `worldkit run` parser. The Harness may keep a verification-only bridge, but it must not publish that bridge as a product Browser protocol.

- [ ] **Step 6: Preserve SDK owners and lifecycle semantics**

The retained Native adapter must delegate to `RuntimeHost`, `runtimeWorldConfigurationFromVerifiedWorldPackageV1()`, `prepareBabylonNativeRuntimePackageV1()`, `BabylonWorldRuntime.create()`, and the SDK Browser API adapter. It must not duplicate motion state, infer support, create Physics shapes itself, or retain a private Camera/Input state machine. Test pause-until-ready, Reset origin, active Candidate swap, exact module hash, page exit, partial create, and idempotent throwing cleanup.

- [ ] **Step 7: Add one explicit BNA-scoped launch command**

Add `worldkit native run <package-directory>` as the single verification command for an admitted Native Package. It reports `{ ok, url, port, worldPackageRootHash, sceneSourceKind }` and starts only the retained BNA Harness. Keep `worldkit run` Canonical-only and reject Native Package directories there; do not add an alias or input-kind fallback.

- [ ] **Step 8: Run GREEN Runtime gates**

```bash
pnpm exec vitest run scripts/lib/world-package-browser-transport.test.ts scripts/lib/worldkit-server.test.ts apps/native-scene-playground/src/native-runtime-host-module-loader.test.ts apps/native-scene-playground/src/native-package-migration.test.ts apps/native-scene-playground/src/hosted-runtime-bridge.test.ts scripts/cli/worldkit.test.ts packages/runtime-babylon/src/babylon-native-package-runtime.test.ts packages/runtime-host/src/native-execution-admission.test.ts
pnpm typecheck
pnpm build:native-scene
git diff --check
```

Expected: focused tests, typecheck, and retained BNA verification Harness build pass; no `apps/playground`, Studio, or Canonical route file changes.

- [ ] **Step 9: Manually launch the initial Package before merge**

```bash
pnpm worldkit native run \
  artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0/world-package \
  --port 5174 --json
```

Expected: returned URL opens the BNA verification Harness, the admitted Runtime reaches ready, the Subject settles on SDK support, WASD/Jump/Reset/Camera work, and explicit blocker colliders stop the Capsule. Record this as manual evidence only; do not call it formal Capture, a Native Viewer contract, or final Case success.

- [ ] **Step 10: Commit and merge playable Runtime checkpoint PR D**

```bash
git add scripts/lib scripts/cli apps/native-scene-playground
git commit -m "feat: run admitted native packages in the verification harness"
git push -u origin HEAD
```

Request Runtime deep review against the exact commit, fix P0/P1 with focused gates, merge, and refresh `origin/main`.

### Task 7: NBR-45P Persist trusted Block materializer metadata in WorldPackage identity

**Files:**
- Create: `packages/runtime-contracts/src/native-block-materializer-metadata.ts`
- Create: `packages/runtime-contracts/src/native-block-materializer-metadata.test.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/native-babylon-block-profile/src/profile-settlement.ts`
- Modify: `packages/native-babylon-block-profile/src/profile-settlement.test.ts`
- Modify: `packages/native-babylon-block-profile/src/babylon-visual-adapter.ts`
- Modify: `packages/native-babylon-block-profile/src/babylon-visual-adapter.test.ts`
- Create: `packages/native-babylon-block-profile/src/materializer-metadata.ts`
- Create: `packages/native-babylon-block-profile/src/live-handle-registry.ts`
- Modify: `packages/native-babylon-block-profile/src/host-evidence.ts`
- Modify: `scripts/native-scene/native-package-input.ts`
- Modify: `scripts/native-scene/native-package-input.test.ts`
- Modify: `packages/world-package/src/package-build.ts`
- Modify: `packages/world-package/src/package-build.test.ts`
- Modify: `packages/world-package/src/package-types.ts`
- Modify: `packages/world-package/src/package-directory.ts`
- Modify: `packages/world-package/src/package-directory.test.ts`
- Modify: `packages/world-package/src/native-runtime-directory.ts`
- Modify: `packages/world-package/src/test-fixture.ts`

**Interfaces:**
- Consumes: the trusted Block materializer's checked Layout records, visual-group inventory, collider joins, and committed profile settlement.
- Produces: `BabylonNativeBlockMaterializerMetadataV1`, `materializerMetadataHash`, full sorted Block/visual-group/collider inventory, profile-settlement fingerprint, and a required `native/block-materializer-metadata.json` Package member covered by WorldPackage Root, Build Identity, verifier, and Receipt.

- [ ] **Step 1: Write RED metadata parser/fingerprint tests**

Require complete materializer output rather than the current opaque fingerprint alone:

```ts
const metadata = parseBabylonNativeBlockMaterializerMetadataV1({
  kind: "babylon-native-block-materializer-metadata",
  schemaVersion: 1,
  nativeSceneProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  caseHash,
  authoringManifestHash,
  checkedLayoutInventoryHash,
  contributionHash,
  profileInventoryHash,
  settledVisualHash,
  blocks: sortedBlocks,
  visualGroups: sortedVisualGroups,
  colliderJoins: sortedColliderJoins,
});
expect(hashBabylonNativeBlockMaterializerMetadataV1(metadata))
  .toBe(materializerMetadataHash);
```

Reject missing Block rows, duplicate IDs, unsorted arrays, a visual group that references no Block, a Collider join absent from Frozen Contribution, identity-color collision, profile fingerprint mismatch, and accessor-bearing input.

- [ ] **Step 2: Write RED Package Root/Receipt join tests**

Assert `native/block-materializer-metadata.json` is mandatory for the blocks profile and forbidden for the standard profile. Tamper each Block center, group mapping, identity color, collider join, `profileInventoryHash`, and `settledVisualHash`; every mutation must fail Package verification or change Root/Build Receipt identity. A Package with only the old opaque profile settlement receipt must fail closed for the blocks profile.

- [ ] **Step 3: Run RED materializer/Package tests**

```bash
pnpm exec vitest run packages/runtime-contracts/src/native-block-materializer-metadata.test.ts packages/native-babylon-block-profile/src/profile-settlement.test.ts packages/world-package/src/package-build.test.ts packages/world-package/src/package-directory.test.ts scripts/native-scene/native-package-input.test.ts
```

Expected: FAIL because the complete trusted inventory is not a Package member.

- [ ] **Step 4: Emit metadata from the trusted materializer and join BNA-3**

The trusted Block visual adapter publishes Host-private live handles while materializing each checked
Block:

```ts
liveHandles.register({
  runtimeEntityId: `native-block:${block.id}`,
  semanticCaptureClassId: `worldkit.native-block.group.${block.visualGroupId ?? "ungrouped"}`,
  mesh,
});
```

These values are Host/Profile-defined from checked IDs, not copied from arbitrary Module Mesh metadata.
The same checked records create immutable serialized metadata; the live registry remains Host-private and
is never serialized. NBR-45B consumes only this explicit registry and verified Package metadata, never
`scene.meshes`, Mesh name/tag/metadata, or a raw authoring Layout. Change the Block profile settlement
owner to expose its committed fingerprint and immutable metadata assembly inputs:

```ts
export interface SettledBabylonNativeBlockProfileV1 {
  readonly profileInventoryHash: Sha256HashV1;
  readonly colliderInventory: readonly BabylonNativeBlockColliderCandidateInventoryEntryV1[];
}
```

`prepareFrozenBabylonNativeWorldPackageBuildInputV1()` accepts only this trusted result from Candidate replay, joins every metadata Collider ID to the Frozen Contribution, joins every authoring-manifest group to the full inventory, and passes the exact bytes/hash into BNA-3. It never reconstructs inventory by scanning Scene Mesh/tag/name.

- [ ] **Step 5: Extend Package builder/verifier/Root/Receipt in one clean break**

For `worldkit://native-scene-profile/whitebox.blocks@1`, add the exact package path `native/block-materializer-metadata.json` to manifest membership and integrity rows. `createBabylonNativeWorldPackageV1()` writes canonical metadata bytes; `verifyBabylonNativeWorldPackageDirectoryV1()` reparses and recomputes its hash, checks profile settlement fingerprints and target count, checks authoring group/Contribution joins, and exposes the verified metadata. Root and Build Receipt therefore change whenever any trusted inventory fact changes.

- [ ] **Step 6: Run GREEN identity/tamper gates and commit PR E1**

```bash
pnpm exec vitest run packages/runtime-contracts/src/native-block-materializer-metadata.test.ts packages/native-babylon-block-profile/src/profile-settlement.test.ts packages/world-package/src/package-build.test.ts packages/world-package/src/package-directory.test.ts scripts/native-scene/native-package-input.test.ts scripts/reconstruction/native-package.test.ts
pnpm typecheck
git diff --check
git add packages/runtime-contracts packages/native-babylon-block-profile packages/world-package scripts/native-scene scripts/reconstruction
git commit -m "feat: bind block materializer inventory to world packages"
git push -u origin HEAD
```

Request BNA-3 identity/tamper review, close every P0/P1, merge PR E1, and refresh `origin/main`. Do not start Task 9 from a Package built before this identity change.

### Task 8: NBR-45A Freeze formal Capture and Block semantic identity contracts

**Files:**
- Create: `packages/runtime-contracts/src/formal-world-capture.ts`
- Create: `packages/runtime-contracts/src/formal-world-capture.test.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Create: `packages/native-babylon-block-profile/src/formal-capture-identity.ts`
- Create: `packages/native-babylon-block-profile/src/formal-capture-identity.test.ts`
- Modify: `packages/native-babylon-block-profile/src/index.ts`

**Interfaces:**
- Consumes: the parsed Case, verified Package-owned `BabylonNativeBlockMaterializerMetadataV1`, and the frozen Contribution identity. NBR-45A must not parse `native-block-authoring.json` or checked Layout again, nor define a second identity inventory.
- Produces: parsed/hashable `FormalSemanticCaptureMapV1`, `FormalArtifactViewRequestV1`, `FormalWorldCaptureReceiptV1`, and `bindBlockMaterializerMetadataToSemanticCaptureTargetsV1()`; no Browser or Runtime operation.

- [ ] **Step 1: Write RED formal Capture contract tests**

Require Package/Build/Attempt/Case/Profile/Runtime/SDK owner identities, exactly three required world views, overlay/traversal hashes, rollback, and cleanup:

```ts
expect(parseFormalWorldCaptureReceiptV1(receipt).views.map(({ viewId }) => viewId))
  .toEqual(["opening", "world-side", "world-top-down"]);
expect(receipt.worldPackageRootHash).toBe(packageRootHash);
expect(receipt.runtimeSessionId).toBe(runtimeSnapshot.runtimeSessionId);
expect(receipt.cameraRollbackOutcome).toBe("completed");
expect(receipt.cleanupOutcome).toBe("completed");
```

Reject BWB `scope: "build-epoch-local"`, a mismatched Package/Attempt/Capture hash, a missing world-side view, stale Runtime Snapshot, absent collider overlay when required, and failed Camera rollback/cleanup. `world-side` must be a world-bounds lateral elevation request and must reject the existing object-local `right` tri-view identifier.

- [ ] **Step 2: Write RED Block visual-group to formal semantic identity adapter tests**

Do not treat Block group IDs as sufficient formal evidence. Define:

```ts
export function bindBlockMaterializerMetadataToSemanticCaptureTargetsV1(input: Readonly<{
  case: WorldReconstructionCaseV1;
  materializerMetadata: BabylonNativeBlockMaterializerMetadataV1;
  materializerMetadataHash: Sha256HashV1;
  contribution: BabylonNativeSceneContributionV1;
}>): FormalSemanticCaptureMapV1;
```

The NBR-45P materializer metadata parser is the sole identity owner for the uppercase `#RRGGBB`
identity-color dialect, authoring Manifest hash, checked Layout inventory hash, Case target-to-group join,
runtime entity IDs and Collider joins. NBR-45A compares its `caseHash` and `contributionHash` with the parsed
Case and Frozen Contribution rather than introducing another inventory. Test stale metadata/Contribution,
extra target and deterministic sort order. No mapping may be inferred from Mesh/tag/name.

- [ ] **Step 3: Run RED contract tests**

```bash
pnpm exec vitest run packages/runtime-contracts/src/formal-world-capture.test.ts packages/native-babylon-block-profile/src/formal-capture-identity.test.ts
```

Expected: FAIL because the formal contracts and Block semantic identity join do not exist.

- [ ] **Step 4: Implement formal Capture contracts and Block semantic identity join**

`FormalWorldCaptureReceiptV1` binds Case/Profile, Route/Attempt/Result, WorldPackage Ref/Root, WorldBuildIdentity, Build Receipt, Runtime session/ready Snapshot, SDK owner version identities, semantic capture map hash, view Camera inputs, viewport/DPR, renderer/browser identity, PNG hashes, collider overlay hash, scripted traversal hash, Camera rollback, Reset, and cleanup.

`bindBlockMaterializerMetadataToSemanticCaptureTargetsV1()` reparses the exact Case, verified Package
metadata and Frozen Contribution. Formal evidence uses semantic target refs from this map; raw authoring
Manifest/Layout inputs and Block group IDs are not a second Capture authority.

- [ ] **Step 5: Run GREEN contract tests and commit PR E0**

```bash
pnpm exec vitest run packages/runtime-contracts/src/formal-world-capture.test.ts packages/native-babylon-block-profile/src/formal-capture-identity.test.ts packages/native-babylon-block-profile/src/package-boundary.test.ts
pnpm typecheck
git diff --check
git add packages/runtime-contracts packages/native-babylon-block-profile
git commit -m "feat: define formal reconstruction capture identity"
git push -u origin HEAD
```

Request contract review, close every P0/P1, merge PR E0, and refresh `origin/main`. This PR has no Browser, Playwright, Runtime, CLI, or generated image change.

### Task 9: NBR-45B Capture world views and traversal through one admitted Hosted Session

**Files:**
- Create: `scripts/reconstruction/formal-capture.ts`
- Create: `scripts/reconstruction/formal-capture.test.ts`
- Create: `scripts/reconstruction/hosted-session-capture.ts`
- Create: `scripts/reconstruction/hosted-session-capture.test.ts`
- Modify: `apps/native-scene-playground/src/hosted-runtime-bridge.ts`
- Modify: `apps/native-scene-playground/src/hosted-runtime-bridge.test.ts`
- Modify: `apps/native-scene-playground/src/hosted-runtime-frame.ts`
- Create: `packages/runtime-babylon/src/formal-world-capture-provider.ts`
- Create: `packages/runtime-babylon/src/formal-world-capture-provider.test.ts`
- Modify: `packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.ts`
- Modify: `packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.test.ts`
- Modify: `packages/runtime-contracts/src/formal-world-capture.ts`
- Modify: `packages/runtime-contracts/src/formal-world-capture.test.ts`
- Modify: `packages/native-babylon-block-profile/src/formal-capture-identity.ts`
- Modify: `packages/native-babylon-block-profile/src/formal-capture-identity.test.ts`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`

**Interfaces:**
- Consumes: one verified Package, completed Attempt/Result, `FormalSemanticCaptureMapV1`, frozen Collider Contribution, and one BNA-5 admitted Hosted Runtime Session.
- Produces: opening PNG, world top-down PNG, world side PNG, collider-overlay PNG, four measured observation documents, and `FormalWorldCaptureReceiptV1` bound to one Package/Runtime session.

- [ ] **Step 0: Close the measured-evidence contract before Runtime implementation**

Extend the existing `FormalSemanticCaptureMapV1`, rather than creating another inventory, so every Package
visual group has an explicit acceptance-target, composition-target, topology-node and layer binding. The
mapping input is the parsed Case-bound `FormalWorldCaptureIntentV1`; validators require complete one-to-one
target coverage and reject suffix/name/bounds inference. Topology relations remain requested measurements and are emitted as
observed only when Package bounds, SDK support/collider evidence or scripted traversal proves them.

Current-only replace the Receipt's ambiguous overlay/traversal hash fields with explicit artifact ref/hash
pairs. Every view gains a PNG artifact ref. Add refs/hashes for `opening-observation.json`,
`spawn-support-observation.json`, `collider-overlay.png`, `collider-overlay-observation.json` and
`scripted-traversal.json`. Each JSON artifact binds Package Root, Build Identity, formal request, stable Runtime
session, reset-ready Snapshot and its domain owner identity. Do not retain aliases or a second identity parser.

- [ ] **Step 1: Write RED Hosted Session capture tests**

The command must capture through the BNA-5 admitted Hosted Session transport, not by importing a Native Module
directly into the CLI process. The bridge exposes one bounded internal transaction, not a bag of general
Runtime/Camera/Input methods:

```ts
export interface HostedWorldCaptureSessionPortV1 {
  executeFormalCapture(
    request: FormalWorldCaptureRequestV1,
  ): Promise<FormalHostedWorldCapturePayloadV1>;
  dispose(): Promise<void>;
}
```

Test session-origin mismatch, ready timeout, stale Snapshot after reset, reset Candidate publication failure,
world-side request accidentally mapped to right-side object tri-view, capture before render-ready, missing/extra
live visual group, unresolved/ambiguous support collider, missing live Havok body/overlay, unmeasured traversal
checkpoint, Camera rollback failure, Browser exit, Server exit, partial Candidate cleanup and disposal failure.

- [ ] **Step 2: Run RED Hosted Capture tests**

```bash
pnpm exec vitest run scripts/reconstruction/hosted-session-capture.test.ts scripts/reconstruction/formal-capture.test.ts
```

Expected: FAIL because the Hosted same-session capture command does not exist.

- [ ] **Step 3: Implement Hosted Session capture orchestration including world side view**

`captureHostedWorldPackageV1()` starts the admitted Native Package through the retained BNA verification
Harness/Hosted Session and asks that one session to execute a single parsed Capture transaction. The existing
isolated entry uses its existing `RuntimeHost.resetWithInitialControlBinding()` path, keeps the Runtime session
identity stable, publishes a fresh WorldSession Candidate, waits for render readiness, and captures:

1. `opening`: SDK opening Camera state;
2. `world-top-down`: bounded orthographic/Host artifact pose covering Case world bounds;
3. `world-side`: bounded world-scale lateral elevation pose covering full height range and central route, not a front/right/back object tri-view;
4. collider overlay derived only from frozen Contribution/SDK collider inventory.

Artifact Camera transactions save the committed SDK Camera state and restore it before session cleanup. Fixed-input traversal checkpoints execute in the same session and record committed Snapshot hashes, positions, movement medium, pass/block outcomes, and exact input ticks. They do not publish Route Graph, NavMesh, path planning, or `goTo` evidence.

The provider also emits the four measured observation documents defined in the design. Opening projections
come from Package-frozen group AABBs plus the SDK Camera and verified live-handle registry; support comes from
the one SDK support path; collider evidence comes from Frozen Contribution plus the SDK-owned Havok registry;
traversal comes from committed fixed-tick Snapshots. Case expected values never enter measurement. Each
traversal check starts from its own Host reset/bind Snapshot. The Node orchestrator hashes and atomically
publishes artifacts, closes Browser/server/session/temporary resources in reverse order, then writes the
Receipt last.

This trusted artifact renderer/Capture path is an evidence tool, not a product Viewer. It must not register the Package in the Unified Viewer Catalog, add a Native branch to `apps/playground`, or change Studio/`worldkit run` source selection.

- [ ] **Step 4: Extend `worldkit capture` for verified Package directories**

The existing `capture` parser accepts the Package directory and requires `--triview-output`; for Package input,
that directory contains `world-top-down.png`, `world-side.png`, `opening-observation.json`,
`spawn-support-observation.json`, `collider-overlay.png`, `collider-overlay-observation.json`,
`scripted-traversal.json`, and `formal-world-capture-receipt.json`. `--output` remains the opening PNG. Canonical
file Capture remains its existing source form; there is one command and one input-kind switch after
verification, not `native capture`.

- [ ] **Step 5: Run GREEN Capture/runtime tests**

```bash
pnpm exec vitest run scripts/reconstruction/hosted-session-capture.test.ts scripts/reconstruction/formal-capture.test.ts apps/native-scene-playground/src/hosted-runtime-bridge.test.ts scripts/cli/worldkit.test.ts
pnpm exec vitest run packages/runtime-contracts/src/formal-world-capture.test.ts packages/native-babylon-block-profile/src/formal-capture-identity.test.ts packages/runtime-babylon/src/formal-world-capture-provider.test.ts packages/runtime-babylon/src/babylon-native-isolated-runtime-entry.test.ts
pnpm typecheck
pnpm build:native-scene
git diff --check
```

Expected: Hosted Session, CLI, typecheck, and build pass against the Task 7 Package identity and frozen Task 8 Capture contracts.

- [ ] **Step 6: Capture the initial Package**

```bash
pnpm worldkit capture \
  artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0/world-package \
  --output artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0/capture/opening.png \
  --triview-output artifacts/scenes/cloud-temple-t-gate-native-block/runs/initial/attempts/0/capture \
  --json
```

Expected: opening, world top-down, world side, collider overlay, scripted traversal, and one identity-bound Receipt from the same admitted Package/Runtime session. Inspect the images but do not edit them or claim evaluation success.

- [ ] **Step 7: Commit and merge formal Capture checkpoint PR E2**

```bash
git add packages/runtime-contracts scripts/reconstruction scripts/cli apps/native-scene-playground artifacts/scenes/cloud-temple-t-gate-native-block
git commit -m "feat: capture admitted reconstruction packages"
git push -u origin HEAD
```

Request exact-commit Runtime/Capture deep review, close P0/P1, merge PR E2, and refresh `origin/main`.

### Task 10: NBR-50A Implement the pure dimensioned reconstruction evaluator

**Files:**
- Create: `packages/validation/src/reconstruction-evaluator.ts`
- Create: `packages/validation/src/reconstruction-evaluator.test.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Consumes: already parsed `WorldReconstructionCaseV1`, `WorldReconstructionEvaluationProfileV1`, and identity-consistent `WorldReconstructionEvidenceSetV1`.
- Produces: `evaluateWorldReconstructionV1(input): WorldReconstructionEvaluationResultV1`; it performs no I/O, Browser, Runtime, model, repair, or file mutation.

- [ ] **Step 1: Write RED independent-dimension tests**

Use an asymmetric fixture where six dimensions pass and one fails:

```ts
const result = evaluateWorldReconstructionV1({
  case: reconstructionCase,
  profile,
  evidence: { ...evidence, collider: missingWestGateBlocker },
});
expect(result.dimensions.find(({ dimensionId }) => dimensionId === "collider")?.status)
  .toBe("failed");
expect(result.dimensions.filter(({ dimensionId }) => dimensionId !== "collider")
  .every(({ status }) => status === "passed")).toBe(true);
expect(result.outcome).toBe("failed");
expect("score" in result).toBe(false);
```

Cover topology node present/relation missing, semantic silhouette bounds center versus coverage, opening anchor ordering/drift, Spawn above/below support, wrong Collider role, required traversal blocked, required blocker passable, Candidate replay mismatch, Package/Capture identity mismatch, and one missing required evidence member. Pixel similarity may appear only as advisory evidence and can never make a failed required metric pass.

- [ ] **Step 2: Write RED stable diagnostic tests**

Require closed codes and one allowed source/resource repair action:

```ts
expect(result.diagnostics).toContainEqual(expect.objectContaining({
  code: "WORLD_RECONSTRUCTION_COLLIDER_MISSING",
  dimensionId: "collider",
  acceptanceTargetRef: westGateBlockerTargetRef,
  repairAction: { kind: "revise-native-source" },
}));
```

Test codes for missing/disconnected topology, silhouette drift, opening-anchor drift, unsupported Spawn, missing/wrong Collider, blocked required traversal, passable required blocker, nondeterministic build, and stale evidence. Diagnostics are sorted by dimension/code/target and contain exact evidence refs; no free-form repair command or Runtime mutation is accepted.

- [ ] **Step 3: Run RED evaluator tests**

```bash
pnpm exec vitest run packages/validation/src/reconstruction-evaluator.test.ts
```

Expected: FAIL because the pure evaluator is absent.

- [ ] **Step 4: Implement one evaluator with no masking aggregate**

Implement exactly seven private dimension evaluators called by one public function:

```ts
export function evaluateWorldReconstructionV1(input: Readonly<{
  case: WorldReconstructionCaseV1;
  profile: WorldReconstructionEvaluationProfileV1;
  evidence: WorldReconstructionEvidenceSetV1;
}>): WorldReconstructionEvaluationResultV1;
```

Each returns `passed | failed | incomplete`, closed metrics, evidence refs, and diagnostic IDs. The overall outcome is `incomplete` when any required dimension is incomplete, otherwise `failed` when any is failed, otherwise `passed`. Do not average, weight, or replace missing evidence with zero.

- [ ] **Step 5: Run GREEN evaluator tests and commit PR F1**

```bash
pnpm exec vitest run packages/validation/src/reconstruction-contracts.test.ts packages/validation/src/reconstruction-evaluator.test.ts
pnpm typecheck
git diff --check
git add packages/validation
git commit -m "feat: evaluate reconstruction evidence by dimension"
git push -u origin HEAD
```

Request pure-logic review, close every P0/P1, merge PR F1, and refresh `origin/main`. This task is `parallel-safe` only because it owns no Runtime/Capture/CLI files.

### Task 11: NBR-50B Join formal Package/Capture/Runtime evidence into the evaluator

**Files:**
- Create: `scripts/reconstruction/evaluate.ts`
- Create: `scripts/reconstruction/evaluate.test.ts`
- Create: `scripts/reconstruction/evidence-set.ts`
- Create: `scripts/reconstruction/evidence-set.test.ts`

**Interfaces:**
- Consumes: Case/Profile, checked authoring manifest, verified WorldPackage including trusted Block materializer metadata, Generation/Attempt/Build/Capture receipts, formal semantic map, Runtime Snapshot, overlay inventory, and scripted traversal evidence.
- Produces: one parsed `WorldReconstructionEvidenceSetV1`, one `WorldReconstructionEvaluationResultV1`, and canonical evidence/result files in the immutable Attempt directory.

- [ ] **Step 1: Write RED identity-join tests**

Construct valid bytes from two Attempts, then cross-wire exactly one identity per test. Reject stale Case/Profile, Request/Attempt/Result, source graph, materializer metadata, profile settlement fingerprint, Package Root, Build Identity, Capture Receipt, semantic map, Contribution, Runtime session, Snapshot, overlay, and traversal hash.

```ts
await expect(buildWorldReconstructionEvidenceSetV1({
  ...attemptA,
  formalCaptureReceipt: attemptB.formalCaptureReceipt,
})).rejects.toThrow("WORLD_RECONSTRUCTION_EVIDENCE_STALE");
```

Also reject BWB local screenshots, formal Route/Nav labels on scripted traversal, image files not listed in the Capture Receipt, and a Block group not present in trusted materializer metadata.

- [ ] **Step 2: Run RED adapter tests**

```bash
pnpm exec vitest run scripts/reconstruction/evidence-set.test.ts scripts/reconstruction/evaluate.test.ts
```

Expected: FAIL because no formal evidence adapter exists.

- [ ] **Step 3: Implement read-verify-adapt-evaluate**

`buildWorldReconstructionEvidenceSetV1()` reads each canonical artifact once, parses and hashes it, verifies all identity joins, derives only closed metrics, and returns frozen accessor-free data. `evaluateNativeBlockAttemptV1()` calls the pure evaluator, writes `evidence-set.json` and `evaluation.json` through sibling temporary files plus atomic rename, then re-reads/parses them before returning.

Topology and semantic silhouette come from the checked authoring manifest joined to trusted materializer metadata and formal projected bounds; Spawn/Collider/traversal/determinism come from admitted Runtime/Contribution/receipts. Do not infer facts from raw Meshes, filenames, image pixels alone, or provider prose.

- [ ] **Step 4: Run GREEN join/evaluation gates and evaluate attempt 0**

```bash
pnpm exec vitest run scripts/reconstruction/evidence-set.test.ts scripts/reconstruction/evaluate.test.ts packages/validation/src/reconstruction-evaluator.test.ts
pnpm typecheck
git diff --check
```

Then evaluate the captured initial Attempt with the internal adapter entry and store its Result. Expected: the result is stable across two evaluations and reports each dimension independently. It may pass, fail, or be incomplete according to real evidence; never rewrite thresholds after seeing it.

- [ ] **Step 5: Commit and merge evaluation adapter PR F2**

```bash
git add scripts/reconstruction artifacts/scenes/cloud-temple-t-gate-native-block
git commit -m "feat: join formal evidence for reconstruction evaluation"
git push -u origin HEAD
```

Request exact-identity review, close every P0/P1, merge PR F2, and refresh `origin/main`.

### Task 12: NBR-60 Orchestrate at most one immutable diagnostic-driven repair

**Current status:** Complete on `origin/main@04dda773deaea94c1ba9521cb3c13898fbdf8327` through PR #138.
This closes the production transaction and injected one-repair proof only; Task 13 still owns the real Case
execution that must supply NBR-20 real formal-generation evidence, real two-Attempt evidence, final publication
and manual launch.

**Files:**
- Modify: `packages/runtime-contracts/src/formal-world-capture.ts`
- Modify: `packages/runtime-contracts/src/formal-world-capture.test.ts`
- Modify: `packages/validation/src/reconstruction-contracts.ts`
- Modify: `packages/validation/src/reconstruction-contracts.test.ts`
- Modify: `packages/native-babylon-block-profile/src/formal-capture-identity.ts`
- Modify: `packages/native-babylon-block-profile/src/formal-capture-identity.test.ts`
- Modify: `scripts/reconstruction/formal-capture-request.ts`
- Modify: `scripts/reconstruction/formal-capture-request.test.ts`
- Create: `scripts/reconstruction/repair-request.ts`
- Create: `scripts/reconstruction/repair-request.test.ts`
- Create: `scripts/reconstruction/run-journal.ts`
- Create: `scripts/reconstruction/run-journal.test.ts`
- Create: `scripts/reconstruction/run.ts`
- Create: `scripts/reconstruction/run.test.ts`
- Create: `scripts/reconstruction/run-production.ts`
- Create: `scripts/reconstruction/run-production.test.ts`
- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`
- Modify: `artifacts/scenes/cloud-temple-t-gate-native-block/case.json`
- Create: `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: frozen Case/Profile, the Case-bound parsed `FormalWorldCaptureIntentV1`, canonical
  Gameplay/World Runtime/Bounds owner inputs, derived Bootstrap, Attempt 0 evaluation, stable diagnostics,
  the unchanged generation/package and existing capture/evaluation owners from Tasks 4/5/9/11, plus the
  already-present `final-artifact-publisher.ts` and NBR-70 verifier owners on the synchronization baseline.
  Task 13 supplies their real-Case acceptance evidence; it does not add a second publisher or verifier.
- Produces: the sole `FormalWorldCaptureIntentV1` parser/hash owner, Case
  `formalCaptureIntentRef/formalCaptureIntentHash` closure, a request materializer that accepts one parsed
  Intent, `runWorldReconstructionV1(input, ports): Promise<WorldReconstructionRunReceiptV1>` with Attempt 0
  and at most Attempt 1, and one production transaction used by `worldkit reconstruct run`; every Attempt
  owns different Request/Attempt/source/Package/Capture identities while reusing the same frozen Case/Intent.

- [ ] **Step 0: Write RED Case-bound Formal Capture Intent contract and cutover tests**

Define the expected current-only surface in tests before changing implementation:

```ts
const intent = parseFormalWorldCaptureIntentV1({
  kind: "formal-world-capture-intent",
  schemaVersion: 1,
  id: "cloud-temple-t-gate-native-block.formal-world-capture-intent",
  captureProfile,
  semanticCaptureTargetBindings,
  topologyRelations,
  checkpointSpatialCriteria,
});
expect(hashFormalWorldCaptureIntentV1(intent))
  .toBe(reconstructionCase.formalCaptureIntentHash);
expect(reconstructionCase.formalCaptureIntentRef)
  .toBe("inputs/formal-world-capture-intent.json");
```

Require a closed DTO, positive finite Capture dimensions/DPR, non-empty deterministic binding/relation/
criterion collections, exact Case acceptance/composition/topology/checkpoint closure, and exact Package group/
collider/bounds joins. Reject a missing/extra field, non-canonical collection order, duplicate target or
checkpoint, hash mismatch, wrong fixed ref, wrong Intent ID, symlink/path escape, stale Case/Profile/Package,
and any criterion whose frozen bounds or collider identity no longer matches verified Package metadata.

Add a materializer API test proving the final call shape contains only the parsed Intent:

```ts
await materializeFormalWorldCaptureRequestV1({
  casePath,
  evaluationProfilePath,
  sceneAuthoringAttemptPath,
  packageDirectoryPath,
  outputPath,
  formalCaptureIntent: intent,
});
```

The test compilation/runtime fixtures must reject the old four top-level arguments and must not load a
default file or derive bindings from Case ID, refs, expected rectangles, group names, Mesh metadata or tags.

- [ ] **Step 0A: Run the focused RED Intent tests**

```bash
pnpm exec vitest run \
  packages/runtime-contracts/src/formal-world-capture.test.ts \
  packages/validation/src/reconstruction-contracts.test.ts \
  packages/native-babylon-block-profile/src/formal-capture-identity.test.ts \
  scripts/reconstruction/formal-capture-request.test.ts \
  scripts/reconstruction/run-production.test.ts
```

Expected: FAIL because the Case fields, Intent parser/hash, parsed-Intent materializer call shape, production
reader and representative Intent file do not yet exist.

- [ ] **Step 0B: Implement Scheme A as one atomic current-only migration**

In `@whitebox-world/runtime-contracts`, define and export only
`FormalWorldCaptureIntentV1`, `parseFormalWorldCaptureIntentV1()`,
`formalWorldCaptureIntentCanonicalBytesV1()` and `hashFormalWorldCaptureIntentV1()`. Reuse the existing
topology-relation and traversal-criterion parsers rather than adding another dialect. In
`@whitebox-world/validation`, require exactly
`formalCaptureIntentRef: "inputs/formal-world-capture-intent.json"` and one SHA-256 hash in the Case parser
and canonical hash.

`run-production.ts` resolves that ref beneath the canonical Case root, rejects symlinks/path escape, reads
the bytes once, verifies canonical bytes/hash and Case/Intent ID closure, and passes the parsed object to
`materializeFormalWorldCaptureRequestV1()`. The materializer and Block semantic binder consume
`formalCaptureIntent`; delete their local Capture Profile/target-binding DTOs and the four scattered input
fields. Update every fixture and the real Case atomically. Do not add optional fields, aliases, fallback
filenames, default Intent data, slug maps or inference.

Do not modify the Native generation Request/Receipt, its three declared output paths, Native authoring
Manifest, Bundle, Package membership/parser/hash, Build Identity or Build Receipt. Verify this with a scoped
diff and existing generation/Package contract fixtures rather than introducing a second projection.

- [ ] **Step 0C: Run GREEN Intent cutover gates**

```bash
pnpm exec vitest run \
  packages/runtime-contracts/src/formal-world-capture.test.ts \
  packages/validation/src/reconstruction-contracts.test.ts \
  packages/native-babylon-block-profile/src/formal-capture-identity.test.ts \
  scripts/reconstruction/formal-capture-request.test.ts \
  scripts/reconstruction/formal-capture.test.ts \
  scripts/reconstruction/run-production.test.ts
if rg -n 'FormalWorldCaptureRequest(CaptureProfile|TargetBinding)V1|readonly (captureProfile|semanticCaptureTargetBindings|topologyRelations|checkpointSpatialCriteria):' scripts/reconstruction/formal-capture-request.ts; then exit 1; fi
git diff --exit-code -- packages/scene-authoring-contracts packages/world-package scripts/reconstruction/generation-request.ts scripts/reconstruction/generation-runner.ts
pnpm typecheck
git diff --check
```

Expected: focused tests/typecheck pass; the real Case ref/hash closes to the canonical Intent bytes; the
request materializer has one parsed-Intent input; Generation and Package owners have no diff.

- [ ] **Step 1: Write RED journal state-machine tests**

Test these exact transitions:

```text
created -> initial-generating -> initial-packaged -> initial-captured -> initial-evaluated
initial-evaluated(failed, repairable) -> repair-generating -> repair-packaged
-> repair-captured -> repair-evaluated -> cleanup-joined -> completed
```

Also test initial pass (no repair), initial incomplete (no publication), maximum one repair, non-repairable diagnostic, stale Case/Profile/Gameplay/World Runtime/Bounds/derived Bootstrap before submission, same request ID/same hash attach, same ID/different hash reject, create timeout unknown/reconcile, duplicate active job reconcile, no output, empty output, Check failure, Package/Capture/Evaluation failure, Camera rollback failure, and cleanup failure.

- [ ] **Step 2: Write RED source-only repair tests**

`createNativeBlockRepairInstructionV1()` receives only stable diagnostics plus immutable prior source/evidence refs. Its declared writable outputs remain exactly:

```text
scene.ts
native-block-authoring.json
native-resources.json
```

Assert the repair cannot change Case/Profile, canonical Gameplay/World Runtime/Bounds inputs, derived Bootstrap, acceptance thresholds, Runtime, Physics, Camera, evaluator, prior Package, prior Capture, or old durable Attempt inputs. Attempt 1 must bind the same `bootstrapInputHash` and the same canonical owner-input hashes, plus new Request/source graph/Package Root/Capture hashes.

- [ ] **Step 3: Run RED repair tests**

```bash
pnpm exec vitest run scripts/reconstruction/repair-request.test.ts scripts/reconstruction/run-journal.test.ts scripts/reconstruction/run.test.ts scripts/cli/worldkit.test.ts
```

Expected: FAIL because the bounded orchestrator and command do not exist.

- [ ] **Step 4: Implement the journal and cleanup join**

Persist a canonical append-only journal row before and after every external boundary. Re-read frozen input hashes before task creation and final publication. Never mutate Attempt 0. Attempt 1 uses a new S3 prefix and new Request ID; the same logical retry reuses that exact ID/hash. Terminal Run Receipt publishes only after provider task, Candidate, Hosted Browser Session, Vite Server, temporary directories, and output promotion cleanup all reach recorded terminal outcomes.

- [ ] **Step 5: Add the stable `reconstruct run` command**

Parse exactly:

```text
worldkit reconstruct run <case.json> --output <run-directory> [--backend cloud|local] --json
```

The CLI injects only one transaction-level production port. That transaction canonicalizes the Case and
output roots; resolves and hashes the Profile and fixed Formal Capture Intent refs from the Case; freezes
verified `runs/<run-id>/inputs/case.json`, `evaluation-profile.json` and
`formal-world-capture-intent.json`; constructs the
existing generation/package/capture/evaluate/rehash/cleanup ports; calls the core state machine once; and,
only for a passed terminal Receipt, invokes the same run verifier and final-artifact publisher/verifier
owners used by Task 13. The CLI must not know or inject the six core ports and must not build a second
receipt/result parser.

The command returns Case ID/ref, run ID, outcome, Attempt count, final WorldPackage path/ref/root, final
Capture Receipt path/hash, final Evaluation path/hash, Run Receipt path/hash, and final directory only after
verified atomic publication. A Canonical/capability-gap decision returns one stable unsupported-route
diagnostic; it never calls the old Builder. A Case/Intent ref, byte, hash, target-closure or Package-join
mismatch fails before Hosted Runtime/Capture allocation and cannot publish `final`.

- [ ] **Step 6: Run GREEN repair tests including a full injected two-Attempt proof**

Use fake router/Package/Hosted Capture ports that still emit correctly parsed identities. Attempt 0 must fail `WORLD_RECONSTRUCTION_COLLIDER_MISSING`; Attempt 1 must pass and own a different source graph, Package Root, Capture hash, and evaluation hash.

```bash
pnpm exec vitest run scripts/reconstruction/repair-request.test.ts scripts/reconstruction/run-journal.test.ts scripts/reconstruction/run.test.ts scripts/reconstruction/run-production.test.ts scripts/reconstruction/formal-capture-request.test.ts scripts/cli/worldkit.test.ts
pnpm typecheck
git diff --check
```

Expected: focused tests/typecheck pass; attempts length is exactly 2 and a requested third attempt fails closed.

- [ ] **Step 7: Commit and merge repair checkpoint PR G**

```bash
git add packages/runtime-contracts packages/validation packages/native-babylon-block-profile scripts/reconstruction scripts/cli artifacts/scenes/cloud-temple-t-gate-native-block/case.json artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json package.json
git commit -m "feat: repair native reconstructions with immutable attempts"
git push -u origin HEAD
```

Request orchestration/idempotency/cleanup review, close every P0/P1, merge, and refresh `origin/main`.

### Task 13: NBR-70 Run and publish the real Cloud Temple T-Gate Case

**Files:**
- Modify: `scripts/verification/verify-native-block-reconstruction-e2e.ts`
- Modify: `scripts/verification/native-block-reconstruction-e2e.test.ts`
- Modify: `scripts/reconstruction/final-artifact-publisher.ts`
- Modify: `scripts/reconstruction/final-artifact-publisher.test.ts`
- Modify: `package.json`
- Verify unchanged frozen inputs: `artifacts/scenes/cloud-temple-t-gate-native-block/case.json`
- Verify unchanged frozen inputs: `artifacts/scenes/cloud-temple-t-gate-native-block/inputs/formal-world-capture-intent.json`
- Add generated immutable evidence under: `artifacts/scenes/cloud-temple-t-gate-native-block/runs/<run-id>/`
- Add final promoted artifacts under: `artifacts/scenes/cloud-temple-t-gate-native-block/final/`

**Interfaces:**
- Consumes: the frozen Case/Profile/reference/Scene Brief/Bootstrap, the Case-bound parsed Formal Capture
  Intent from Task 12, and all merged NBR owners.
- Produces: one real formal run with AI-generated source, formal Check/Package/Runtime/Capture/Evaluation, one real bounded repair when the initial evaluation has a repairable failure, and a directly runnable final Package.

- [ ] **Step 1: Extend the RED artifact verifier with Case/Intent closure**

The verifier requires and cross-checks:

```text
generation request/receipt + route/attempt/result
Case + Formal Capture Intent ref/hash/canonical bytes
native check/explain
trusted Block materializer metadata
verified Package + Root + Build Identity + Build Receipt
opening + world-top-down + world-side + collider-overlay PNGs
formal Capture Receipt + scripted traversal
seven-dimension evaluation
run receipt + cleanup outcomes
```

It has one implementation and two explicit candidate modes: Run mode verifies the immutable
terminal Attempt selected by `run-receipt.json`; Final mode verifies the Case-root `final/` bytes
and `launch.json` against that same terminal Attempt and Receipt. These are verification phases,
not two artifact layouts or compatibility parsers. `runs/<run-id>/final` must be rejected.

It launches the final Package through `worldkit native run`, waits for the admitted BNA Runtime session to become ready, resets, verifies ground medium/support, applies fixed W/A/S/D and Jump sequences, proves gate/side blocker limits, proves the central route reaches the upper platform and at least one T arm, resets again, and disposes. It labels this scripted traversal, never Route/Nav/`goTo` or a Native Viewer contract.

- [ ] **Step 2: Run RED verifier test**

```bash
pnpm exec vitest run scripts/verification/native-block-reconstruction-e2e.test.ts
```

Expected: FAIL for an empty root and for a fixture whose Case Intent ref/hash, canonical bytes or materialized
Request values disagree, before any playability launch.

- [ ] **Step 3: Execute the real formal reconstruction run**

```bash
pnpm worldkit reconstruct run \
  artifacts/scenes/cloud-temple-t-gate-native-block/case.json \
  --output artifacts/scenes/cloud-temple-t-gate-native-block/runs/f-20260831 \
  --backend cloud --json
```

Expected: before any Hosted Runtime allocation, the production transaction proves the fixed Intent ref stays
under the Case root, Intent canonical bytes hash to `formalCaptureIntentHash`, Intent ID/targets/topology/
checkpoints close to the same parsed Case and verified Package, and the materialized formal Request embeds
exactly those parsed values. The router then reports `gpt-5.6-sol`/`xhigh`; Host-frozen Bootstrap and canonical
Gameplay/World Runtime/Bounds hashes are identical in every Attempt; AI writes only the three declared
authoring outputs; Check precedes Package; Runtime/Capture use one admitted Hosted Session per Attempt; task
cleanup retains durable Attempt inputs; and all terminal resources clean up. The short `f-20260831` run ID
keeps the derived router request ID within its frozen 80-character contract.

If initial evaluation has a repairable failure, the command must execute exactly one diagnostic-driven repair and publish a distinct second Package/Capture identity. The NBR-1 acceptance run must contain a real two-Attempt proof; if this initial result has no repairable failure, keep it immutable and run another independently identified initial Case execution under the same already-frozen Case/Profile until a genuine repairable diagnostic occurs. Do not alter thresholds, inject fake evidence, or corrupt a passed Package to manufacture repair.

- [ ] **Step 4: Run the artifact and playability verifier**

```bash
pnpm verify:native-block-reconstruction-e2e -- \
  --run artifacts/scenes/cloud-temple-t-gate-native-block/runs/f-20260831
```

Expected: the verifier re-reads the Case and Intent canonical bytes, re-hashes them, joins the formal Request's
profile/bindings/relations/criteria to that exact Intent and rejects any scattered/default/inferred value. All
remaining identity joins pass; final evaluation passes every required dimension; Subject spawns grounded,
moves, jumps, resets, cannot cross required wall/gate blockers, and reaches the upper platform/T branch.
Opening/top/world-side visibly show foreground, central ascent, mountain layers, T junction, and gate mass.

- [ ] **Step 5: Promote final artifacts atomically**

Copy the verified terminal Package/Capture/Evaluation into the Case-root sibling
`artifacts/scenes/cloud-temple-t-gate-native-block/.final-staging`, write the canonical
`launch.json`, run the same verifier in Final mode against those copied bytes, then atomically
rename the staging directory to `artifacts/scenes/cloud-temple-t-gate-native-block/final`.
Reject an existing/symlinked staging path and never mutate Attempt artifacts. `launch.json` uses
the closed fields `kind: "native-block-reconstruction-launch"`, `schemaVersion: 1`, `caseId`,
`runReceiptRef`, `runReceiptHash`, `worldPackageRelativePath`, `worldPackageRef`,
`worldPackageRootHash`, `captureReceiptRelativePath`, `captureReceiptHash`,
`evaluationRelativePath`, `evaluationHash`, and `launchCommand`. Every relative path is
Case-root-relative, remains under `final`, and is joined to
the copied bytes. Final verification also reuses the same Case/Intent identity closure; the final publisher
does not author or copy an alternative Intent. Do not write or accept `runs/<run-id>/final`.

- [ ] **Step 6: Manually launch and inspect the final world**

```bash
pnpm worldkit native run \
  artifacts/scenes/cloud-temple-t-gate-native-block/final/world-package \
  --port 5174 --json
```

Open the returned URL and manually verify movement, blocker collision, central climb, T arms, Jump, Reset, and Camera. Record manual observations separately from automated Capture/Runtime evidence. Preserve the actual opening/top/world-side images for the final user handoff.

- [ ] **Step 7: Commit real Case evidence**

```bash
git add scripts/verification package.json artifacts/scenes/cloud-temple-t-gate-native-block
git commit -m "feat: publish the cloud temple reconstruction case"
```

Do not yet claim full BNA-6, BNA-7, WRC-SR, BNA-8, or WRC-1 completion.

### Task 14: NBR-80 Complete the current-only deletion ledger

**Files:**
- Modify: `packages/native-babylon-block-profile/src/index.ts`
- Modify: `packages/native-babylon-block-profile/src/testing.ts`
- Modify: `packages/native-babylon-block-profile/src/package-boundary.test.ts`
- Modify: `apps/native-scene-playground/` only to remove the fixed Cloud Ridge loader and duplicate Case-specific startup after the generic admitted-Package Harness is green
- Retain: `scripts/verification/verify-native-scene-playground.ts` and identity-bound Harness fixtures until the separate BNA owner disposition permits deletion
- Modify: `scripts/reconstruction/formal-capture-request.ts`
- Modify: `scripts/reconstruction/formal-capture-request.test.ts`
- Modify: root `package.json`
- Modify: all residual callers discovered by the censuses below

**Interfaces:**
- Consumes: green generic generation/package/run/capture/evaluate/repair commands and final Case.
- Produces: one generic BNA verification route with no legacy API, duplicate Host, Case-specific loader, production Corpus factory, or compatibility fallback. It does not delete evidence infrastructure or alter the Canonical Unified Viewer.

- [ ] **Step 1: Move BWB Corpus factories to testing-only exports**

Remove reconstruction Corpus values/types from `packages/native-babylon-block-profile/src/index.ts`; export them only from `./testing`. Update BWB4/5 verifiers/tests to import `@whitebox-world/native-babylon-block-profile/testing`. Add a package-boundary test proving production root keys exclude every `ReconstructionCorpus` symbol.

- [ ] **Step 2: Remove only the fixed Native Case loader and duplicate startup**

Once the final Package runs through the generic BNA verification Harness, delete the fixed Cloud Ridge virtual loader and any Case-specific duplicate startup. Keep `apps/native-scene-playground`, `build:native-scene`, `verify:native-scene-playground`, and identity-bound fixtures as BNA Runtime/Capture evidence infrastructure. Full Native Web UI/Harness deletion requires zero production/test references, migrated BNA-7 evidence, an applicable BNA-8 disposition, and explicit BNA Runtime/Capture owner sign-off in a separate current-only change. Do not retain an alias URL or fallback loader.

- [ ] **Step 3: Delete temporary/Case-specific command surfaces**

Remove `reconstruct:native-block:generate` and any Case-specific package/capture root scripts after `worldkit reconstruct run`, `worldkit native package`, `worldkit native run`, and `worldkit capture` are green. Keep the stable generic commands only.

In the same clean-break census, delete any residual
`FormalWorldCaptureRequestCaptureProfileV1`, `FormalWorldCaptureRequestTargetBindingV1`, materializer input
fields that accept the four Intent groups separately, duplicate caller-owned Intent fixture factory, optional
`formalCaptureIntentRef/formalCaptureIntentHash`, fallback filename, default Intent, Case-ID slug map or
Case-specific production constant. This is verification of the atomic Task 12 cutover, not a compatibility
window: Task 12 must already have removed the old call shape before merge.

- [ ] **Step 4: Run the clean-break censuses**

```bash
if rg -n 'moduleGenerationInput(Ref|Hash)|buildCloudRidgePackage|__WORLDKIT_NATIVE_SPIKE__|virtual:worldkit-cloud-ridge-native-scene' packages scripts apps package.json; then exit 1; fi
if rg -n 'createBabylonNativeBlockReconstructionCorpus|inspectBabylonNativeBlockReconstructionCorpus|materializeBabylonNativeBlockReconstructionCorpus' packages/native-babylon-block-profile/src/index.ts; then exit 1; fi
if rg -n 'overlay.*canonical|canonical.*overlay|shadow.?plan|three\.js|mesh.*scan|tag.*collider|name.*collider' scripts/reconstruction apps/native-scene-playground/src; then exit 1; fi
if rg -n 'FormalWorldCaptureRequest(CaptureProfile|TargetBinding)V1|readonly (captureProfile|semanticCaptureTargetBindings|topologyRelations|checkpointSpatialCriteria):' scripts/reconstruction/formal-capture-request.ts; then exit 1; fi
if git diff origin/main -- apps/playground | grep -q .; then echo 'NBR-1 must not change the Canonical Unified Viewer'; exit 1; fi
```

Expected: all four negated source censuses plus the Unified Viewer diff guard pass. The four Intent field names
remain valid only inside the sole `FormalWorldCaptureIntentV1` contract and parsed object access; they must not
reappear as a second materializer input DTO. Inspect any match manually before deletion when it appears only
in an explicit negative test.

- [ ] **Step 5: Run focused post-deletion gates and commit PR H**

```bash
pnpm exec vitest run packages/native-babylon-block-profile scripts/reconstruction scripts/verification/native-block-reconstruction-e2e.test.ts apps/native-scene-playground/src/native-package-migration.test.ts apps/native-scene-playground/src/hosted-runtime-bridge.test.ts
pnpm typecheck
pnpm build:native-scene
git diff --check
git add -A
git commit -m "refactor: remove replaced native reconstruction paths"
git push -u origin HEAD
```

Open PR H containing Tasks 13/14. Request exact-commit functional plus clean-break review, close every P0/P1, and merge to `main` only after the final Package still launches from that exact commit.

### Task 15: NBR-90 Close exact-SHA gates, reviews, and documentation truth

**Files:**
- Modify: `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`
- Modify: `docs/superpowers/specs/2026-08-31-native-block-reconstruction-e2e-design.md`
- Modify: `docs/superpowers/plans/2026-08-31-native-block-reconstruction-e2e-implementation.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Add only retained exact-SHA evidence under the established review/evidence locations; delete temporary review files after findings are absorbed

**Interfaces:**
- Consumes: latest `origin/main` exact SHA after PR H, focused evidence, final Case artifacts, and Cloud results for that exact SHA.
- Produces: no-open-P0/P1 final disposition for NBR-1 only, truthful backlog/status, runnable command/path, and Capture image handoff.

- [ ] **Step 1: Verify the final local focused closure once**

```bash
git fetch origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
test -z "$(git status --porcelain)"
pnpm verify:native-block-reconstruction-e2e -- \
  --run artifacts/scenes/cloud-temple-t-gate-native-block/runs/f-20260831
pnpm typecheck
pnpm --filter @whitebox-world/playground build
git diff --check
```

Expected: clean exact `origin/main`; runnable Case verifier, typecheck, build, and diff check pass. Do not repeat broader commands already covered on the same SHA.

- [ ] **Step 2: Dispatch Cursor Cloud exact-SHA affected/full gates**

The prompt must name repository, exact SHA, clean checkout requirement, install command, affected gates, full gate command, final Package launch verifier, and a prohibition on code changes. Accept results only when every receipt/report repeats the exact SHA. If a gate times out without a semantic failure, record timeout separately and rerun that gate once in a fresh Cloud worker; do not wait on queued GitHub CI.

- [ ] **Step 3: Dispatch independent Mode B plus runtime-deep review**

Review the exact same SHA against `AGENTS.md`, `docs/reviews/full-dimension-review-protocol.md`, and `docs/reviews/runtime-deep-review-checklist.md`. Require source verification of: two-source exclusivity, no old aliases/fallbacks, pre-Candidate checker order, Generation Request/Receipt identity, materializer inventory Package binding, Hosted same-session Capture, SDK Havok/Subject/Input/Action/Camera authority, Reset/replay/cleanup, evaluation independence, and repair immutability.

- [ ] **Step 4: Fix only reproduced P0/P1 and invalidate scoped evidence**

For each finding, reproduce on the reviewed SHA, add a failing focused test, implement the owning-boundary fix, rerun only affected focused gates, commit/merge, then dispatch affected Cloud gate/review against the new exact SHA. P2 is either fixed when low-risk or recorded with owner/impact; no open P0/P1 may remain.

- [ ] **Step 5: Update durable status without overclaiming**

Mark `NBR-1` complete only when the spec completion definition is satisfied. In WRC/backlog, record only the delivered minimum slices of BNA-6, BNA-7, WRC-SR-1, and WRC-SR-2; leave complete Golden Corpus, product Route/Nav/`goTo`, BNA-8, WRC-ACC-1, BWB-6, PHO-7/8, generalized Action/Camera, and events unchecked/deferred. Ensure design, plan, commands, package paths, receipts, and code status agree.

- [ ] **Step 5A: Re-audit `codex/block-world-sdk-v2` capability migration**

Against exact source `codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`, close the
reuse table for Builder/Self-check, real AI generation, deterministic Block validation, playthrough Capture,
visual reconstruction diagnostics and resume/bounded-repair behavior. Each accepted capability must name its
current Babylon/BNA owner, focused test and real-Case evidence; every non-migrated capability must have an
explicit rejection reason. Verify the final representative Case preserves the source branch's useful visual
and playability outcome through current Capture plus manual inspection. Architectural cleanliness alone cannot
justify a functional regression, and line-for-line copying is not required when current owners provide stronger
equivalent evidence.

- [ ] **Step 6: Commit documentation truth and merge final docs PR**

```bash
git add docs
git commit -m "docs: close the native block reconstruction slice"
git push -u origin HEAD
```

Review links/status against the final exact SHA, merge the docs-only PR without waiting for unrelated long CI, and verify `origin/main` contains it.

- [ ] **Step 7: Final user handoff**

Provide:

```text
Case ID: cloud-temple-t-gate-native-block
Final Package: artifacts/scenes/cloud-temple-t-gate-native-block/final/world-package
Launch: pnpm worldkit native run artifacts/scenes/cloud-temple-t-gate-native-block/final/world-package --port 5174 --json
Opening: artifacts/scenes/cloud-temple-t-gate-native-block/final/capture/opening.png
Top-down: artifacts/scenes/cloud-temple-t-gate-native-block/final/capture/world-top-down.png
World side: artifacts/scenes/cloud-temple-t-gate-native-block/final/capture/world-side.png
Collider overlay: artifacts/scenes/cloud-temple-t-gate-native-block/final/capture/collider-overlay.png
```

Show the Capture images and state exact gates/review SHA. Say only “NBR-1 vertical slice complete”; do not claim full BNA-6/7 or WRC-1 completion.

## Final self-review checklist

- [ ] Every spec completion condition maps to Tasks 1–15.
- [ ] Every shared contract lands before its producer/consumer integration.
- [ ] Every work item has exactly one execution mode and an exclusive file owner.
- [ ] The Generation Request binds instruction, Skill, canonical context manifest/input hashes, API/Profile/Block Profile content hashes, and frozen Bootstrap; only the Generation Receipt binds `routerTaskPayloadHash`.
- [ ] The Case requires exactly `formalCaptureIntentRef: "inputs/formal-world-capture-intent.json"` plus
  `formalCaptureIntentHash`; `@whitebox-world/runtime-contracts` is the sole Intent parser/hash owner; the
  request materializer accepts one parsed Intent and no scattered/default/inferred alternative remains.
- [ ] The Host derives the Native Bootstrap from Case Spawn/seed, Gameplay Bootstrap, World Runtime Bootstrap and Host-selected refs; WorldBounds remains Package-owned, Subject/Camera resource closure remains WRT-owned, and task cleanup retains the durable Attempt input.
- [ ] AI writes `scene.ts`, `native-block-authoring.json`, and `native-resources.json`; it never writes the frozen Bootstrap.
- [ ] NBR-45P binds complete trusted Block materializer metadata and profile settlement fingerprints into Package Root/Receipt before NBR-45B Capture.
- [ ] Formal Capture includes semantic identity adapter, opening, world top-down, world side, collider overlay, scripted traversal, and same Hosted Session identity.
- [ ] Evaluation has seven independent dimensions and no masking aggregate/pixel-only GO.
- [ ] Repair changes only new Native authoring outputs, keeps Case/Profile, canonical Gameplay/World Runtime/Bounds inputs and derived Bootstrap frozen, and creates new immutable identities.
- [ ] Final Case is real AI output, runnable, playable, collision-checked, captured, scored, repaired, and independently reviewed.
- [ ] No legacy API, duplicate Host, third Source, shadow Plan, Mesh scan, alias, or fallback remains.
- [ ] `apps/playground`, its curated Catalog/bootstrap, Studio preview, and `worldkit run` remain Canonical-only; NBR-1 adds no Native Viewer contract.
- [ ] `apps/native-scene-playground` remains an explicitly BNA-owned verification Harness until the separate BNA-7/BNA-8 migration and owner sign-off permit deletion.
- [ ] Every useful `codex/block-world-sdk-v2@3c2e9826` generation, validation, deterministic visual-review and recovery capability is either migrated with current evidence or explicitly rejected with a documented reason; styled reconstruction/raw keyboard capture remain outside NBR, and final visual/playability behavior has not regressed.

# BNA-1 Runtime identity consumer census

Date: 2026-08-29
Plan: `docs/superpowers/plans/2026-08-29-babylon-native-runtime-scene-source-identity-clean-break.md`
Baseline: `8ae4249cb53de0ce91643540a64dac7121fcfc60` on `explore/scene-reconstruction-api`
Upstream base: `origin/main` at `febba985255b77a180b54b3b88be7f36601ff9c5` is an ancestor
Retained checkpoint: `stash@{0}` / `4ef4c2e25fceaa5b12ae3fd543450af9ed1cbd9b`

## Decision

BNA-1 is a current-only contract migration, not an adapter exercise. Generic Runtime identity becomes `worldBuildIdentity` / `worldBuildIdentityHash`; the Plan hash remains only where the operation is explicitly about the Canonical Scene Plan. `ExecutionPlanV5`, the V5 compiler entry points, the V1/V2 WorldPackage pair, and their migration surface are deleted after their facts have been projected into the terminal artifacts. No optional aliases, dual parsers, fallbacks, or Native shadow Plan are permitted.

The census covers executable source, tests, checked-in examples, and scene evidence under `packages/**`, `apps/**`, `scripts/**`, `examples/**`, and `artifacts/scenes/**`. Historical documents and Git history are evidence, not executable consumers.

## Reproducible search baseline

The exact command family was:

```bash
rg -n 'Sha256HashV1|WorldPackageSha256HashV1|ExecutionPlanV5|compileWorldV5|parseExecutionPlanV5|hashExecutionPlanV5|executionPlanHash|RuntimeWorldConfigurationV1|WorldStateSnapshotV1|WorldPackageBuildReceiptV1|WorldPackageBuildReceiptV2' packages apps scripts examples artifacts/scenes
```

At the baseline SHA it produced the following independently counted inventory. Counts include declarations, imports, type positions, values, fixtures, and assertions; file counts are unique paths.

| Symbol | Matches | Files | Terminal disposition |
|---|---:|---:|---|
| `Sha256HashV1` | 629 | 87 | one declaration in Protocol; every consumer imports it directly from Protocol |
| `WorldPackageSha256HashV1` | 91 | 12 | delete the alias and use Protocol `Sha256HashV1` |
| `ExecutionPlanV5` | 398 | 52 | replace with terminal Scene/Runtime contracts, then zero executable hits |
| `compileWorldV5` | 81 | 32 | replace with `compileCanonicalWorldV1`, then zero executable hits |
| `parseExecutionPlanV5` | 44 | 8 | delete after terminal parser adoption |
| `hashExecutionPlanV5` | 20 | 7 | delete; retain only Plan-specific `executionPlanHash` values |
| `executionPlanHash` | 1,295 | 116 | retain narrowly for Canonical Plan operations; migrate every generic identity field |
| `RuntimeWorldConfigurationV1` | 53 | 15 | replace with the closed Scene Source configuration |
| `WorldStateSnapshotV1` | 137 | 17 | require `worldBuildIdentityHash`; reject generic `executionPlanHash` |
| `WorldPackageBuildReceiptV1` | 99 | 11 | delete with the old package implementation |
| `WorldPackageBuildReceiptV2` | 61 | 15 | rename/collapse into the sole current receipt; no V2 suffix remains |

These counts are acceptance inputs. BNA1-10 must replace them with an executable zero/allowlist verifier rather than updating this review to match drift.

## SHA-256 and Package Ref ownership

### Declarations and re-exports

| Current owner | Current publication | BNA1-01 action |
|---|---|---|
| `packages/control-capture/src/types.ts` via its barrel | local `Sha256HashV1` | delete definition/re-export; import Protocol directly |
| `packages/gameplay-contracts/src/gameplay-contracts.ts` via its barrel | local `Sha256HashV1` | delete definition/re-export; import Protocol directly |
| `packages/authoring-edit/src/parse-kernel.ts` and `types.ts` | definition plus re-export | keep parser mechanics local, delete type ownership/re-export, import Protocol directly |
| `packages/validation/src/types.ts` via `index.ts` | local `Sha256HashV1` | delete definition/re-export; import Protocol directly |
| `packages/world-package/src/types.ts` via `index.ts` | `WorldPackageSha256HashV1` alias | delete alias/re-export and update every WorldPackage field |
| `scripts/lib/runtime-session-wal.ts` | private duplicate `Sha256HashV1` | delete private declaration; import Protocol directly |
| `packages/world-package/src/store.ts` via `index.ts` | `WorldPackageRefV1` and two conversion functions | move ownership to `@whitebox-world/world-identity`; do not re-export from WorldPackage |

The 87 hash-type files are exhaustively partitioned by the following path sets; every match in each set has the same type-ownership disposition above, even when its value-level field remains Plan-specific:

- Authoring/Edit: `packages/authoring-edit/src/**`, `packages/authoring-host/src/**`, `apps/playground/src/worldkit-authoring-edit-*`, `scripts/fixtures/durable-authoring-edit-host-child.test-support.ts`, and `scripts/lib/{authoring-edit-*,durable-world-change-runtime.test.ts,world-change-publication-recovery.test.ts}`.
- Runtime/Gameplay: `packages/{control-capture,gameplay-contracts,gameplay,runtime-contracts,runtime-host,subject-actions}/src/**`, `apps/playground/src/{mounted-skateboard-controls.ts,scenes/mounted-skateboard-s1.ts}`, and `scripts/lib/{control-capture-*,example-take-world-identity.ts,runtime-session-wal.ts,simulation-take-cli.ts}`.
- Validation/Route: `packages/validation/src/**`, `scripts/lib/{route-validation-cli.ts,validation-cli.ts}`, and `scripts/verification/verify-validation-capture.ts`.
- Package: `packages/world-package/src/**` and the direct Package consumers listed in the receipt section below.
- AI schema support: `scripts/lib/ai-schema-provider-conformance{,.test}.ts`.

No other declaration or alias was found in the scoped roots. BNA1-01's ownership test must scan every package rather than encode only these known owners.

## Plan contract and compiler consumers

All 52 `ExecutionPlanV5` files and all compiler/parser/hash hits are assigned to exactly one terminal owner:

| Classification | Exact source families | Terminal owner/action |
|---|---|---|
| Legacy delete | `packages/runtime-contracts/src/execution-plan.ts`, `execution-plan-v5.test.ts`; `packages/compiler/src/compile-v5.test.ts` | deleted after BNA1-04 projection evidence |
| Compiler producer | `packages/compiler/src/{compile.ts,compile.test.ts,compile-traversal-lock.ts,compile-traversal-lock.test.ts,capability-compile.test.ts}` | `compileCanonicalWorldV1` emits Canonical Scene Plan plus Runtime Bootstrap |
| Canonical package/publication | `packages/world-package/src/**`, `packages/authoring-host/src/{build.ts,journal/types.ts,prepared-candidate.test.ts}`, `packages/validation/src/world-package-validation-subject{,.test}.ts` | consume terminal Canonical Plan and retain explicit Plan hash inside package closure |
| Shared Babylon Kernel split | `packages/runtime-babylon/src/{babylon-world-runtime.ts,subject-visual.ts,camera-component.ts,camera-director.ts,gameplay-runtime-internal.ts,traversal-runtime-internal.ts,traversal-runtime-port.ts}` and their listed tests/fixtures | scene construction reads Canonical Plan; Kernel reads Runtime Bootstrap; serialized combined Plan disappears |
| Formal Runtime admission | `packages/runtime-host/src/{runtime-host.ts,runtime-host-lifecycle.test.ts,test/runtime-host-lifecycle-harness.ts}` | closed Scene Source configuration; Native remains pre-allocation rejected in BNA-1 |
| Playground/orchestration | `apps/playground/src/{authoring-loader.ts,babylon-world-adapter.ts,outdoor-scene-gameplay-loader.ts}` and tests; `scripts/lib/worldkit-pipeline.ts`; verification world builders | consume compiler's two terminal artifacts directly |
| Native experiment | `apps/native-scene-playground/src/native-bootstrap.ts` | delete the shadow `ExecutionPlanV5`; use checked-in Runtime/Gameplay bootstraps outside formal RuntimeHost |
| Canonical Route | `packages/traversal-recast/src/heightfield-source{,.test}.ts`, route orchestration/integration files, and route verification callers | consume Canonical Scene Plan; Plan-specific hash remains explicit |
| Builder/verification fixtures | `scripts/agents/{agent-builder-self-check.ts,builder-skill.test.ts}`, `scripts/verification/verify-{canonical-world,g-bot-subject-world,placement-layout,rigged-subject-world,xier120-subjects}.ts`, and affected integration tests | migrate names and regenerate through their owners |

`RuntimeWorldConfigurationV1` appears only in the formal Runtime/Playground/configuration path: `packages/runtime-host/src/{runtime-host.ts,runtime-host-lifecycle.test.ts}`, `packages/gameplay-contracts/src/gameplay-contracts{,.test}.ts`, `packages/runtime-contracts/src/runtime-contracts.test.ts`, `packages/authoring-host/src/journal/types.ts`, `packages/authoring-host/src/{index.ts,journal/index.ts}`, `apps/playground/src/{authoring-loader.ts,babylon-world-adapter.ts,outdoor-scene-gameplay-loader.ts}`, and `scripts/lib/{durable-world-change-runtime.ts,headless-runtime-session.ts,world-change-publication-recovery.ts,world-package-cli.ts}`. Every one migrates to the new closed configuration; none retains the old name.

## `executionPlanHash` classification

### Plan-specific retain

Only these semantic operations may retain a required `executionPlanHash` after the type migration:

- the `compileCanonicalWorldV1` result and Canonical Scene Plan hash;
- Canonical WorldPackage manifest, receipt, directory verification, signing/build output, and Canonical publication closure;
- Canonical Authoring Edit, prepared Candidate, Full Reload, and Plan validation;
- Route R1/R1B build input, evaluator, validation set, runtime probe, runtime evidence, overlay/publication, and their CLI/browser evidence;
- the Plan member of `WorldBuildIdentityV1.sceneSourceIdentity` and the Plan member of `RuntimeSceneSourceV1`;
- generated Canonical package or Route evidence where the owning schema explicitly remains Plan-specific.

The source path families are `packages/{compiler,world-package,authoring-edit,authoring-host,traversal,traversal-recast}/**`, Route-specific files under `packages/validation/**` and `packages/runtime-contracts/src/browser-route-evidence.ts`, Route/Edit files under `scripts/cli/**` and `scripts/lib/**`, and their exact tests. Mixed files must keep the field only in their Canonical/Route member; their generic envelopes migrate.

### Generic migrate

Every other occurrence becomes `worldBuildIdentity` or `worldBuildIdentityHash`, including:

- `WorldStateSnapshotV1`, Gameplay state/context, RuntimeHost, WorldSession, gameplay world port, state artifact store, and character transaction fixtures;
- Runtime Session and Browser Protocol generic state, capture targets/results, Control Capture, Simulation Take, and headless session helpers;
- generic Validation subject/result identity, non-Route CLI JSON, Studio persistence, Playground Browser publication, and visual reconstruction/capture manifests;
- `packages/runtime-babylon/src/traversal-runtime-port*` only where it transports generic Runtime identity; Route proof fields remain Plan-specific;
- app/orchestration forwarding fields that identify the running world rather than a Canonical Plan.

The generic migration explicitly rejects `executionPlanHash` as an unknown field. There is no optional dual identity or inference from Package/Plan data.

### Generated evidence classification

The exact checked-in generated files requiring owner-driven regeneration are:

- `examples/evidence/{g-bot-subject-world,package-subject-world,placement-coastal-world,rigged-subject-world}/world.build.json`;
- `examples/evidence/{g-bot-subject-world,package-subject-world,rigged-subject-world}/explain.json`;
- `examples/evidence/{g-bot-subject-world,placement-coastal-world,rigged-subject-world}/verification.json`;
- `artifacts/scenes/{cloud-ridge-celestial-gate,green-sahara-caravan,memory-postcard-coastal-ride}/world.build.json`;
- `artifacts/scenes/{cloud-ridge-celestial-gate,memory-postcard-coastal-ride}/triviews/whitebox-triview-manifest.json`;
- `artifacts/scenes/cloud-ridge-celestial-gate/route-validation.manual-20260827-cloud-ridge-r23.json` and its `00-route-validation-set-receipt.json` and `routes/000000/04-route-runtime-probe-receipt.json` evidence children.

`world.build.json`, verification, and explain files are regenerated by their existing package/world verification owners; tri-view manifests by the capture owner; Route evidence by the trusted Route command. None may be hand-edited. Plan-specific Route evidence keeps its Plan hash, while generic capture/manifest identity migrates.

## WorldPackage versions and receipts

The V1 and V2 implementations are transitional duplicates and both names disappear into one current `schemaVersion: 1` / `packageFormatVersion: 1` contract.

| Current family | Exact owners/consumers | Disposition |
|---|---|---|
| V1 receipt/build | `packages/world-package/src/{types.ts,build-receipt.ts,build-receipt.test.ts,index.ts}` | delete after facts are folded into sole current build/receipt |
| V2 types/contract/build/directory | `packages/world-package/src/{v2-types.ts,v2-contract.ts,v2-contract.test.ts,v2-build.ts,v2-directory.ts,v2-directory.test.ts,store.ts,index.ts}` | rename/collapse; delete V2 names and V1-to-V2 migration |
| Formal consumers | `packages/runtime-host/src/{runtime-host.ts,test/runtime-host-lifecycle-harness.ts}`, `packages/authoring-host/src/{build.ts,types.ts,journal/types.ts}`, `packages/validation/src/world-package-validation-subject{,.test}.ts` | consume sole current receipt |
| Script consumers | `scripts/lib/{file-world-package.ts,route-validation-runner.ts}` | consume sole current receipt; Route retains Plan-specific member |

Migration tests that manufacture a V1 receipt solely to migrate it are deleted or rewritten as direct current-contract tests. The World Package Ref and root conversion helpers leave this package in BNA1-01.

## Native Bootstrap wire contract

Exactly one wire schema exists: `packages/runtime-contracts/src/babylon-native-scene-bootstrap-v1.schema.json`, exported only as `@whitebox-world/runtime-contracts/babylon-native-scene-bootstrap-schema`. It declares Draft 2020-12 and documents why signed zero is an exact-parser invariant. `packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts` compiles the schema, checks parser/schema parity, and tests signed-zero rejection. At this baseline:

```text
Test Files  1 passed (1)
Tests       10 passed (10)
```

No second Native Bootstrap schema was found in the scoped roots.

## Dependency snapshot

| Dependency | Declared | Lock-resolved |
|---|---|---|
| pnpm | `10.14.0` | `10.14.0` |
| TypeScript | `^5.9.2` | `5.9.3` |
| Vite | `^7.1.2` | `7.3.6` |
| Vitest | `^3.2.4` | `3.2.7` |
| Babylon.js Core | exact project pin | `9.23.0` |
| Havok | exact project pin | `1.3.14` |

## Execution and ownership rulings

- Execute BNA1-01 through BNA1-10 sequentially in the main checkout. BNA1-02 and BNA1-03 are graph-independent after BNA1-01 but share lockfile/test-manifest ownership and are therefore serialized, with Runtime Bootstrap before Scene Authoring contracts.
- Architecture, public names, cross-artifact hashes, Package Root exclusion, Runtime state authority, and final integration stay main-agent-owned throughout.
- BNA1-04 is an evidence checkpoint, not an accepted architecture. Its projector is deleted by BNA1-05.
- BNA1-07 parses the Native source member but rejects it before Bundle resolution, adapter invocation, or Candidate allocation. Only BNA-4 may lift that gate after BNA-3.
- BNA1-08 preserves the trusted-local experiment without treating it as formal RuntimeHost or WorldPackage admission.
- Generated artifacts are changed only by their owner commands. Shared `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and `scripts/lib/test-gate-manifest.ts` remain main-agent-only resources.
- A later source edit invalidates only evidence whose inputs it changes, but BNA1-10 reruns the complete frozen acceptance matrix once on the terminal tree.

This census is the checklist for BNA1-09A through BNA1-09D. A source file discovered later by the permanent verifier is an omission to repair, not a reason to broaden an allowlist.

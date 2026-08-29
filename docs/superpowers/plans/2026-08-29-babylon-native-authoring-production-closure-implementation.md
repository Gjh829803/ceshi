# Babylon Native Authoring BNA-2 Production Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close BNA-2 with one fixed Native authoring workspace, AST/Program-backed Source Admission, audited single-Candidate admission, byte-exact dual-Candidate replay, stable `worldkit native check/explain`, and a current-only Cloud Ridge migration without claiming BNA-3/BNA-4 production capabilities.

**Architecture:** Trusted Node tooling owns filesystem, source graph, typecheck, temporary bundle, and CLI orchestration. `@whitebox-world/native-babylon/host` owns Candidate preconditions, Build Epoch, authority instrumentation/audit, Contribution freeze, and deterministic replay. Canonical JSON and Babylon Native remain mutually exclusive Scene Sources; Native does not compile through Canonical IR and BNA-2 does not attach Havok, Subject, Camera, input, or fixed Tick.

**Tech Stack:** The implementation uses the exact current lockfile toolchain, not versions copied into this plan. At this design SHA the resolved versions are TypeScript 5.9.3, Vite 7.3.6/Rollup, Babylon.js Core 9.23.0 Deep ESM, `lodash-es` 4.18.1, and Vitest 3.2.7, plus Node child-process CLI tests and the pnpm workspace. Babylon 9.23.0 remains the engine-semantics freeze; any lockfile change requires rechecking the installed source assumptions before implementation.

**Spec:** [`docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md`](../specs/2026-08-29-babylon-native-authoring-production-closure-design.md)

## Global Constraints

- Baseline is `main@9794f0cb05ec2ce54ec3367fa25e1274ea3605a6`; implementation starts only after confirming the working branch still contains that ancestry and no newer `origin/main` change invalidates the design.
- This repository is unreleased. Every touched contract is a current-only clean break: one name, one parser, one entry, one owner. Delete old exports and consumers in the same integration slice; do not add aliases, adapters, `legacy` branches, or V2/V3 siblings.
- Do not modify Canonical Compiler, Canonical Scene Plan, Catalog/Hosted Builder, WorldChangeSet, Runtime World Configuration diagnostics, old V5 naming, frozen plan locks, or scene artifact locks.
- Keep `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` before Candidate allocation in formal RuntimeHost. BNA-2 remains a trusted-local correctness gate, not a malicious-code sandbox or production Runtime admission.
- Native Module Source may create Babylon visual objects and register Spawn/static Collider intent only. Engine, Scene lifecycle, camera, physics, Subject, Gameplay, input, scheduling, timers, and Runtime callbacks remain Host/SDK authority.
- Use `===` / `!==` for equality and named `isNil` / `isEmpty` imports from `lodash-es` for null/empty checks. Do not turn exact `undefined` value contracts into null-tolerant contracts; use `typeof value === "undefined"` when only `undefined` is valid.
- Before writing any production fix, add the focused failing regression and record its exact failure. After each GREEN, rerun only the affected focused test. Run each broad gate once on the final exact tree.
- Engine claims must be verified against the lockfile-installed Babylon 9.23.0 source under `node_modules/.pnpm/@babylonjs+core@9.23.0/...`; do not use private `_...` fields.
- New script code belongs under `scripts/native-scene/`; the stable executable remains root `pnpm worldkit` through `scripts/cli/worldkit.ts`.
- Do not write persistent bundles, Package/Receipt/Registry identities, generated scene assets, or screenshots in BNA-2. Temporary bundle directories live under ignored `.codex-tmp/native-scene-check/` and are removed on every outcome.
- `NullEngine` evidence proves structural admission/audit/replay only. It does not prove Havok collision, ground support, step traversal, visual fidelity, browser rendering, or hosted isolation.

## Implementation-Baseline Evidence

The user supplied an independent full-gate run for exact `main@9794f0cb05ec2ce54ec3367fa25e1274ea3605a6` after the 22 commits since the earlier `7d1e4f41` audit. This evidence was not executed by the author of this plan and must be labelled user-supplied when cited.

| Gate | Baseline result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0; lock unchanged |
| `pnpm check:agent-self-check` | exit 0; Planner/Builder bundles current |
| `pnpm typecheck` | exit 0 |
| `pnpm test:studio` | exit 0; 75 passed |
| `pnpm test:independent` | exit 0; 6 Node + 1 Site census, 23 Node passed, Site build + 1 passed |
| `pnpm test` | exit 0; census 313 = 281 contract + 32 resource-heavy; 3027 contract passed / 3 skipped; 513 resource-heavy passed; boundary debt 49 |
| `pnpm build` | exit 0; chunk-size advisory only |
| `pnpm build:native-scene` | exit 0; chunk-size advisory only |
| `pnpm verify:bna1-clean-break` | exit 0; `ok: true`, 1002 files scanned |
| `pnpm verify:unreleased-clean-break` | exit 0 |
| `pnpm verify:route-r0-contract` | exit 0; 8 checks passed |
| `pnpm verify:route-r1-heightfield` | exit 0; expected positive/negative fixtures and 30/60/120 cadence hash agreement |
| `pnpm verify:route-r1b-static-platform` | exit 0; steps/platform/ramp success and legacy census zero |
| `pnpm verify:canonical` | exit 0; deterministic reset passed; SwiftShader warning only |
| `pnpm verify:native-scene-playground` | exit 0; path, jump/landing, camera reset, and pre-BNA2 collider overlay passed |
| `git diff --check` | exit 0; tracked tree clean; pre-existing untracked `.tmp/` and `__pycache__/` excluded |

Evidence rules for implementation:

- do not rerun this full matrix merely as a preflight on unchanged `9794f0c`; it already establishes that BNA2 does not begin from a known red baseline;
- do not carry these results forward as proof for an implementation commit: PC-05 through PC-50 change Native source, Runtime consumer, CLI, dependencies, tests, and builds, so the affected focused and final gates in PC-90 must run on the final exact SHA;
- `pnpm test:scenes` is already covered by `pnpm test`; do not duplicate it;
- `test:contract:coverage`, `verify:3c-migration`, `verify:placement-layout`, `verify:rigged-subject`, `verify:g-bot-subject`, `verify:control-capture`, and `verify:outdoor-gameplay` were not part of the supplied run. They are not added to BNA2 completion unless a BNA2 edit changes their inputs or an independent finding supplies a concrete reason;
- preserve the user's pre-existing untracked `.tmp/` and `__pycache__/` content and exclude it from commits.

## Frozen Interfaces and Diagnostic Vocabulary

The implementation must converge on these exact Host roles. Internal helpers may be split further, but these are the only `/host` Candidate entry points:

```ts
export interface BabylonNativeSceneCandidateV1 {
  readonly engine: ReturnType<Scene["getEngine"]>;
  readonly scene: Scene;
}

export interface BabylonNativeSceneCandidateLeaseV1
  extends BabylonNativeSceneCandidateV1 {
  dispose(): void | Promise<void>;
}

export interface BabylonNativeSceneCandidateFactoryV1 {
  createCandidate():
    | BabylonNativeSceneCandidateLeaseV1
    | Promise<BabylonNativeSceneCandidateLeaseV1>;
}

export interface AdmitBabylonNativeSceneCandidateInputV1 {
  readonly candidate: BabylonNativeSceneCandidateV1;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly module: BabylonNativeSceneModuleV1;
  readonly assets: BabylonNativeLockedAssetResolverV1;
  readonly budget: BabylonNativeSceneAdmissionBudgetV1;
}

export function admitBabylonNativeSceneCandidateV1(
  input: AdmitBabylonNativeSceneCandidateInputV1,
): Promise<BabylonNativeSceneCandidateAdmissionResultV1>;

export interface ReplayBabylonNativeSceneModuleInputV1 {
  readonly candidateFactory: BabylonNativeSceneCandidateFactoryV1;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly module: BabylonNativeSceneModuleV1;
  readonly assets: BabylonNativeLockedAssetResolverV1;
  readonly budget: BabylonNativeSceneAdmissionBudgetV1;
}

export function replayBabylonNativeSceneModuleV1(
  input: ReplayBabylonNativeSceneModuleInputV1,
): Promise<ReplayBabylonNativeSceneModuleResultV1>;

export type BabylonNativeSceneCandidateAdmissionResultV1 =
  | Readonly<{
      outcome: "passed";
      contribution: BabylonNativeSceneContributionV1;
      contributionHash: `sha256:${string}`;
    }>
  | Readonly<{
      outcome: "rejected";
      diagnostics: readonly NativeSceneDiagnosticV1[];
    }>;

export type ReplayBabylonNativeSceneModuleResultV1 =
  | Readonly<{
      checkResult: NativeSceneCheckResultV1 & Readonly<{ outcome: "passed" }>;
      contribution: BabylonNativeSceneContributionV1;
      contributionHash: `sha256:${string}`;
    }>
  | Readonly<{
      checkResult: NativeSceneCheckResultV1 &
        Readonly<{ outcome: "rejected" | "tool-error" }>;
    }>;
```

`BabylonNativeSceneCandidateAdmissionResultV1` is a distinct `/host`-role
`passed | rejected` union. Its passed member contains frozen `contribution` and
`contributionHash`; its rejected member contains stable diagnostics. It has no
`checkedInput`, `tool-error`, or `kind: "native-scene-check-result"`, and never contains
Scene, Engine, Mesh, Candidate, Context, Registration, resolver, or disposer handles.
`ReplayBabylonNativeSceneModuleResultV1` is the only Host wrapper that contains a
`checkResult: NativeSceneCheckResultV1`. Its passed member also contains the frozen
Contribution/hash; rejected/tool-error members do not. The full Source/Bundle/CLI checker
publishes that same `checkResult` directly. Candidate creation/cleanup/tool failures are
folded there; single-Candidate Admission never creates a Check DTO.

The Source/CLI implementation must use stable codes, not provider/compiler raw messages:

| Stage | Required stable codes |
|---|---|
| `bootstrap` | `WORLDKIT_NATIVE_SCENE_BOOTSTRAP_MISSING`, `WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID` |
| `dependency` | `WORLDKIT_NATIVE_SCENE_SOURCE_PATH_INVALID`, `WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN`, `WORLDKIT_NATIVE_SCENE_SOURCE_CASE_COLLISION`, `WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED`, `WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN` |
| `source-admission` | `WORLDKIT_NATIVE_SCENE_DYNAMIC_IMPORT_FORBIDDEN`, `WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN`, `WORLDKIT_NATIVE_SCENE_SOURCE_LIFECYCLE_FORBIDDEN`, `WORLDKIT_NATIVE_SCENE_SOURCE_MODULE_STATE_FORBIDDEN`, `WORLDKIT_NATIVE_SCENE_RUNTIME_EXPORT_INVALID` |
| `typecheck` | `WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED` |
| `bundle` | `WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED`, `WORLDKIT_NATIVE_SCENE_MODULE_EXPORT_INVALID` |
| `capability` | `WORLDKIT_NATIVE_SCENE_PROFILE_UNSUPPORTED`, `WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE` plus existing budget codes |
| `build` | existing Module failure/registration codes plus `WORLDKIT_NATIVE_SCENE_BUILD_RETURN_INVALID` |
| `authority-audit` | `WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID`, `WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION` |
| `runtime-replay` | `WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_MISMATCH` |
| `tooling` | `WORLDKIT_NATIVE_SCENE_TOOL_USAGE_INVALID`, `WORLDKIT_NATIVE_SCENE_WORKSPACE_UNAVAILABLE`, `WORLDKIT_NATIVE_SCENE_CANDIDATE_CREATE_FAILED`, `WORLDKIT_NATIVE_SCENE_CANDIDATE_CLEANUP_FAILED`, `WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED` |

Known diagnostics sort by canonical relative source path, line, column, registration ID, code, then id. Public messages never contain absolute paths, temp paths, home paths, stack traces, environment values, credentials, TypeScript diagnostic prose, Vite/Rollup stack text, or Babylon raw exceptions.

## Dependency-Aware Work Graph

| ID | Goal / independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Stable input -> output / integration | Verification | Mode |
|---|---|---|---|---|---|---|---|
| BNA2-PC-00 | Freeze this approved plan and exact current baseline | approved BNA-2 spec | all implementation | this plan and BNA-2 spec status/clarifications | approved spec -> executable task graph | links, placeholder/contradiction scan, `git diff --check` | `main-agent-only` |
| BNA2-PC-05 | Close Native null-style P2 and freeze one import profile owner | PC-00 | PC-10, PC-20, PC-40 | Native manifest/module/contribution/diagnostics/host, Native Bootstrap parser, lockfile, import-profile files | review finding -> direct dependency + one convention/profile | focused parser and package-boundary tests | `sequential` |
| BNA2-PC-10A | Admit fixed workspace and resolved local source graph | PC-05 | PC-10B, PC-40 | `authoring-workspace*`, `source-admission*`, test support | world directory -> parsed Bootstrap + closed Source Graph or diagnostics | workspace/import adversarial tests | `sequential` |
| BNA2-PC-10B | Typecheck, bundle, load, and delete ephemeral Module output | PC-10A | PC-40 | `ephemeral-bundle*` | admitted Source Graph -> exact default Module or diagnostics | typecheck/export/bundle/cleanup tests | `sequential` |
| BNA2-PC-20A | Replace raw build with Candidate Build Epoch and clean Host API | PC-05 | PC-20B, PC-30, PC-50 | `candidate-admission*`, `host.ts`, migrated host tests | parsed Module + Candidate -> frozen Contribution/result | migrated foundation + return/asset tests | `main-agent-only` |
| BNA2-PC-20B | Add mandatory precondition, instrumentation, and authority audit | PC-20A | PC-30, PC-50 | `authority-audit*` and Candidate integration | Candidate baseline/build mutations -> passed or authority rejection | installed-source-backed adversarial tests | `main-agent-only` |
| BNA2-PC-30 | Add two-Candidate deterministic replay and cleanup precedence | PC-20B | PC-40, PC-50 | `runtime-replay*` | factory + locked inputs -> one handle-free replay result | drift/concurrency/create/dispose tests | `sequential` |
| BNA2-PC-40A | Compose workspace/tooling and Host replay under fixed local policy | PC-10B, PC-30 | PC-40B, PC-50 | `check-policy*`, `native-scene-check*`, `explain*` | world directory -> exact DTO/human explanation | outcome/stage/redaction tests | `main-agent-only` |
| BNA2-PC-40B | Add `worldkit native check/explain` and 0/1/2 process contract | PC-40A | PC-50, PC-90 | `scripts/cli/worldkit.ts`, CLI tests | argv -> stdout/stderr/exit | real child-process matrix | `main-agent-only` |
| BNA2-PC-50A | Migrate Cloud Ridge to one default pure Module | PC-40B | PC-50B, PC-90 | Native experiment scene/main/tests/verifier | old controller/factory -> default Module + Host-owned debug removal | focused app tests/browser verifier | `sequential` |
| BNA2-PC-50B | Migrate runtime consumer and enforce old-API zero census | PC-20B, PC-30, PC-50A | PC-90 | Runtime Babylon consumer/tests, BNA2 verifier, root script | raw build consumer -> audited admission | runtime focused tests + clean-break verifier | `main-agent-only` |
| BNA2-PC-90 | Exact-tree gates, independent Mode B/runtime review, backlog truth | PC-05..PC-50B | BNA-3/BNA-4 | test manifest, review, backlog/current docs only | final tree -> scoped GO/NO-GO | final gate matrix and no open P0/P1/P2 | `main-agent-only` |

Critical path:

```text
PC-00 -> PC-05 -> PC-10A -> PC-10B ---------> PC-40A -> PC-40B -> PC-50A -> PC-50B -> PC-90
                \-> PC-20A -> PC-20B -> PC-30 /
```

Tasks are executed sequentially on one integration branch even where file ownership is independent. Do not duplicate diagnostic constructors, import profiles, Candidate types, or check orchestration to manufacture parallel work.

---

## Task 1: BNA2-PC-00 — Freeze the Approved Plan

**Files:**

- Modify: `docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md`
- Create: `docs/superpowers/plans/2026-08-29-babylon-native-authoring-production-closure-implementation.md`

**Deliverable:** The approved spec has no unresolved implementation ambiguity around CLI budget/assets, and this plan maps every spec gate to one file owner and verification command.

- [ ] **Step 1: Confirm the integration base before product edits**

Run:

```bash
git fetch origin
git merge-base --is-ancestor 9794f0cb05ec2ce54ec3367fa25e1274ea3605a6 HEAD
git log --oneline --decorate -5
git status --short --branch
```

Expected: ancestry exits `0`; branch contains only approved design/plan changes and no unrelated user changes.

- [ ] **Step 2: Scan the plan for placeholders and contract contradictions**

Run:

```bash
rg -n "TODO|TBD|FIXME|placeholder|legacy fallback|compatibility alias" \
  docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md \
  docs/superpowers/plans/2026-08-29-babylon-native-authoring-production-closure-implementation.md
rg -n "BNA2-PC-|worldkit native check|worldkit native explain|buildBabylonNativeSceneCandidateV1" \
  docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md \
  docs/superpowers/plans/2026-08-29-babylon-native-authoring-production-closure-implementation.md
git diff --check
```

Expected: no unresolved placeholder; the old API appears only as an explicit deletion/census target; diff check exits `0`.

- [ ] **Step 3: Commit the approved execution contract**

```bash
git add docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md \
  docs/superpowers/plans/2026-08-29-babylon-native-authoring-production-closure-implementation.md
git commit -m "docs: plan BNA2 production closure"
```

---

## Task 2: BNA2-PC-05 — Null Convention and Import Profile Owner

**Files:**

- Create: `packages/native-babylon/src/import-profile.ts`
- Create: `packages/native-babylon/src/import-profile.test.ts`
- Modify: `packages/native-babylon/src/index.ts`
- Modify: `packages/native-babylon/src/module.ts`
- Modify: `packages/native-babylon/src/contribution.ts`
- Modify: `packages/native-babylon/src/diagnostics.ts`
- Modify: `packages/native-babylon/src/host.ts`
- Modify: `packages/native-babylon/src/package-boundary.test.ts`
- Modify: `packages/native-babylon/package.json`
- Modify: `packages/runtime-contracts/src/babylon-native-scene-bootstrap.ts`
- Modify: `packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts`
- Modify: `pnpm-lock.yaml`

**Deliverable:** Native files use the repository null convention without changing exact parser semantics, and Source Admission imports one machine-owned Deep ESM allowlist.

- [ ] **Step 1: Add a RED package-boundary regression**

Extend `package-boundary.test.ts` so it expects direct `lodash-es` dependency and rejects Native production-source null comparisons:

```ts
expect(manifest.dependencies).toEqual({
  "@babylonjs/core": "9.23.0",
  "@whitebox-world/protocol": "workspace:*",
  "@whitebox-world/runtime-contracts": "workspace:*",
  "lodash-es": "^4.18.1",
});

for (const { path, source } of sources) {
  expect(source, path).not.toMatch(/===\s*(?:null|undefined)|!==\s*(?:null|undefined)/);
}
```

Add parser cases proving explicit `null` and explicit `undefined` remain distinct where the schema requires it; for example, `frictionRatio: null` must not become the optional default.

Run:

```bash
pnpm exec vitest run packages/native-babylon/src/package-boundary.test.ts \
  packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts
```

Expected RED: missing dependency and current comparisons are reported; semantic parser assertions expose any accidental null/undefined conflation.

- [ ] **Step 2: Add the single Import Profile constant**

Implement and export only this machine owner from the AI-facing root:

```ts
export const BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1 = Object.freeze([
  "@babylonjs/core/Buffers/buffer.js",
  "@babylonjs/core/Lights/directionalLight.js",
  "@babylonjs/core/Lights/hemisphericLight.js",
  "@babylonjs/core/Lights/pointLight.js",
  "@babylonjs/core/Materials/standardMaterial.js",
  "@babylonjs/core/Maths/math.color.js",
  "@babylonjs/core/Maths/math.vector.js",
  "@babylonjs/core/Meshes/mesh.js",
  "@babylonjs/core/Meshes/mesh.vertexData.js",
  "@babylonjs/core/Meshes/meshBuilder.js",
  "@babylonjs/core/Meshes/transformNode.js",
  "@babylonjs/core/scene.js",
] as const);

export type BabylonNativeDeepEsmImportSpecifierV1 =
  typeof BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1[number];
```

`package-boundary.test.ts` imports this constant rather than maintaining a second Module
allowed-import set. The test freezes its exact 12-string content so an accidental
wildcard/version drift fails. This is the **Module** Source Admission list only. Host code
has a separate, Host-private exact census for required provider imports such as NullEngine;
its boundary test asserts every Host import is either a member of the Module list or an
explicit Host-only specifier. Never merge the Host census into the AI-facing Module list or
require both roles to have identical imports.

- [ ] **Step 3: Apply `isNil` without widening contracts**

Add named imports per package. Use patterns such as:

```ts
if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
  return invalid();
}

if (isNil(input) || typeof input === "boolean" || typeof input === "string") {
  return input;
}

if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) {
  return invalid();
}

if (isNil(input) && typeof input === "undefined") return fallback;
```

For the last case, explicit `null` continues into numeric validation and fails. Replace the current `moduleFailure !== undefined` sentinel with a separate boolean so `throw undefined` is still a failure.

- [ ] **Step 4: Declare the direct dependency and update the lock**

Run:

```bash
pnpm --filter @whitebox-world/native-babylon add lodash-es@^4.18.1 --lockfile-only
```

Review the diff to ensure only the Native importer/lock importer entry changes; do not upgrade unrelated dependencies.

- [ ] **Step 5: Run GREEN focused verification**

```bash
pnpm exec vitest run \
  packages/native-babylon/src/import-profile.test.ts \
  packages/native-babylon/src/package-boundary.test.ts \
  packages/native-babylon/src/module.test.ts \
  packages/native-babylon/src/contribution.test.ts \
  packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts
```

Expected: all pass; `rg` finds no forbidden Native null comparison and no semantic test changed from reject to accept.

- [ ] **Step 6: Commit PC-05**

```bash
git add packages/native-babylon packages/runtime-contracts/src/babylon-native-scene-bootstrap.ts \
  packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts pnpm-lock.yaml
git commit -m "refactor: freeze native import and null contracts"
```

---

## Task 3: BNA2-PC-10A — Fixed Workspace and Source Graph Admission

**Files:**

- Create: `scripts/native-scene/test-support.ts`
- Create: `scripts/native-scene/authoring-workspace.ts`
- Create: `scripts/native-scene/authoring-workspace.test.ts`
- Create: `scripts/native-scene/source-admission.ts`
- Create: `scripts/native-scene/source-admission.test.ts`

**Deliverable:** One TypeScript Program-derived graph admits only `native-scene.bootstrap.json`, `scene.ts`, and reachable relative `src/**/*.ts`, with canonical relative diagnostics and no user config.

- [ ] **Step 1: Build temporary-workspace test support**

Implement a test-only helper that uses `mkdtemp`, writes the exact Bootstrap and requested source map, tracks roots, and removes them in `afterEach`. It must never write a package.json/tsconfig/Vite config unless a negative test explicitly proves those files are ignored.

- [ ] **Step 2: Write RED workspace boundary tests**

Cover, as separate named tests:

- valid `scene.ts` plus `src/geometry.ts`;
- `.js` specifier resolving to same-path `.ts` source;
- missing/invalid Bootstrap and missing entry;
- `.tsx`, `.js`, JSON, CSS, WASM, URL, absolute, bare-local, and `..` escape;
- symlinked entry/dependency and symlinked directory;
- case-fold collision (`src/Rock.ts` and `src/rock.ts`);
- unreachable files excluded from the graph;
- user package.json/tsconfig/Vite config ignored, never executed or merged.

Run:

```bash
pnpm exec vitest run scripts/native-scene/authoring-workspace.test.ts
```

Expected RED: module missing.

- [ ] **Step 3: Implement canonical workspace resolution**

Expose one internal result:

```ts
export type AdmittedBabylonNativeAuthoringWorkspaceV1 = Readonly<{
  worldDirectoryPath: string; // trusted internal absolute realpath only
  bootstrap: BabylonNativeSceneBootstrapV1;
  entrySourcePath: string;
  sourcePaths: readonly string[];
}>;
```

Implementation rules:

1. Resolve the requested directory once with `path.resolve` then `realpath`.
2. Distinguish nonexistent/not-directory/unreadable tool failures from missing required authoring inputs.
3. Use `lstat` plus `realpath` for every reached path; reject symbolic links and any realpath outside the root.
4. Normalize public source locations through `path.relative(...).split(path.sep).join("/")` and reject `..`/absolute results.
5. Store a lowercase canonical path map and reject two different spellings resolving to the same case-fold key.
6. Parse Bootstrap only with `parseBabylonNativeSceneBootstrapV1`; do not partially reconstruct it.

- [ ] **Step 4: Write RED Source Graph/import tests**

Use the TypeScript compiler API and assert exact diagnostic codes for:

- allowed relative static imports/exports, type-only imports, Native root, Block Profile root, and all 12 Deep ESM entries;
- bare `@babylonjs/core`, namespace import, `/host`, Runtime, Havok, Compiler, Authoring, Camera, Character Movement, Three.js, Node built-ins, URL imports, CommonJS, and dynamic import;
- unresolved local dependency and re-export;
- aliased dangerous dependency through re-export;
- `doNotAdd`/等价跳过 Scene 登记的构造路径，以及手工 Scene add/remove Mesh、TransformNode、Material、Light、
  Geometry collection 调用；
- local Build variables accepted while top-level mutable state is rejected.

Run:

```bash
pnpm exec vitest run scripts/native-scene/source-admission.test.ts
```

Expected RED: source analyzer missing.

- [ ] **Step 5: Implement the Program-backed graph and source policy**

Create one `ts.Program` using Host compiler options; do not use regex for production decisions. Resolve local modules through TypeScript resolution, then apply the realpath boundary. External source packages are allowlisted by exact specifier and are not recursively treated as user source.

Use TypeChecker symbol/scope analysis to reject:

- global random/time/network/DOM/process/timer/scheduling/eval/Function capabilities;
- `scene.getEngine`, Scene/Engine create/dispose/control, camera/physics/action/input APIs;
- assignment of a function/class/callable object into any Babylon-owned property and calls
  that pass a function/callable object to a Babylon API unless the exact synchronous API is
  positively allowlisted; the current whitebox profile needs no callback-valued Babylon API;
- assignment to any Babylon Observable property, writes to `notifyIfTriggered`, mutation of
  its live `observers` array, access through its `constructor`, or calls to
  `add/addOnce/remove/removeCallback/clear/notifyObserver/notifyObservers/
  makeObserverTopPriority/makeObserverBottomPriority/cleanLastNotifiedState/clone` on any
  TypeChecker-resolved Babylon `Observable`, regardless of property spelling or owning type;
- every method in `BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1`, including
  ready/once/freeze/render-order/external-data retention in addition to before/after render;
- every constructor option/overload that skips Candidate Scene registration, and every manual Scene
  add/remove Mesh, TransformNode, Material, Light, or Geometry collection method;
- every user class/subclass;
- module-scope `let`/`var`, mutable container construction, writes/calls mutating a module-scope binding, and Build assignments that retain Context/Scene/Engine/Mesh/Registration outside Build scope;
- any `return` with an expression inside `build` and any extra Runtime export.

Allow module-scope type declarations, pure function declarations, primitive constants, recursively literal `Object.freeze` tuples/tables, imports, and the single default `defineBabylonNativeScene(...)` expression. Do not reject ordinary function-local `let` used by geometry algorithms.

- [ ] **Step 6: Run GREEN workspace/source tests and inspect diagnostics**

```bash
pnpm exec vitest run \
  scripts/native-scene/authoring-workspace.test.ts \
  scripts/native-scene/source-admission.test.ts
```

Expected: all cases pass; snapshot/census assertions show only `/`-separated relative paths and no absolute root.

- [ ] **Step 7: Commit PC-10A**

```bash
git add scripts/native-scene
git commit -m "feat: admit native authoring source graphs"
```

---

## Task 4: BNA2-PC-10B — Host Typecheck and Ephemeral Bundle

**Files:**

- Create: `scripts/native-scene/ephemeral-bundle.ts`
- Create: `scripts/native-scene/ephemeral-bundle.test.ts`
- Modify: `scripts/native-scene/test-support.ts`

**Deliverable:** An admitted graph is strictly typechecked with Host-owned options, bundled without user plugins/config, loaded as exactly one default Native Module, and fully cleaned.

- [ ] **Step 1: Write RED typecheck/bundle/load tests**

Cover:

- sync and async valid builds;
- multi-file `.js` -> `.ts` source resolution;
- type-only export erased and accepted;
- TypeScript type failure mapped to one or more relative source diagnostics;
- extra Runtime export rejected after bundle load;
- missing/default non-Module export rejected;
- bundler failure cleans temp output;
- throwing module evaluation is cleaned and returns bundle/module diagnostic;
- two concurrent bundles use different temp roots and both roots disappear.

Run:

```bash
pnpm exec vitest run scripts/native-scene/ephemeral-bundle.test.ts
```

Expected RED: bundle loader missing.

- [ ] **Step 2: Implement Host-owned typecheck**

Freeze these compiler options in code, not a generated user-visible tsconfig:

```ts
const NATIVE_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  useDefineForClassFields: true,
  noEmit: true,
  allowImportingTsExtensions: false,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
};
```

Host mappings may resolve only the two approved WorldKit roots and the locked Babylon install. DOM libs exist for Babylon declarations; Source Admission still rejects Module DOM usage. Map TypeScript diagnostics to stable `WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED` locations and keep raw text out of the DTO.

- [ ] **Step 3: Implement the temporary Vite/Rollup bundle**

Call Vite `build()` with `configFile: false`, `logLevel: "silent"`, no user plugins, ES2022 library mode, one entry, and one `.mjs` output under a unique ignored `.codex-tmp/native-scene-check/<run>/` directory. Bundle reachable local sources; externalize only:

```text
@whitebox-world/native-babylon
@whitebox-world/native-babylon-block-profile
the 12 exact Babylon Deep ESM specifiers
```

Putting output below the repository root lets Node resolve the single installed workspace/Babylon identities. Never externalize an unvalidated specifier and never bundle a second Babylon class identity.

- [ ] **Step 4: Exact-load the default Module and clean in `finally`**

Dynamic-import the trusted temporary `.mjs` with a unique query. Require `Reflect.ownKeys(namespace)` to equal `["default"]`; then call `defineBabylonNativeScene(namespace.default)`. Do not cache or return the namespace. Return only the frozen Module to the immediate checker invocation.

Always remove the per-run directory in `finally`. Cleanup failure is a tooling failure and takes precedence over gate success/rejection.

- [ ] **Step 5: Run GREEN bundle tests**

```bash
pnpm exec vitest run \
  scripts/native-scene/authoring-workspace.test.ts \
  scripts/native-scene/source-admission.test.ts \
  scripts/native-scene/ephemeral-bundle.test.ts
```

- [ ] **Step 6: Commit PC-10B**

```bash
git add scripts/native-scene
git commit -m "feat: typecheck and bundle native scene modules"
```

---

## Task 5: BNA2-PC-20A — Candidate Build Epoch and Host Clean Break

**Files:**

- Create: `packages/native-babylon/src/candidate-admission.ts`
- Create: `packages/native-babylon/src/candidate-admission.test.ts`
- Modify: `packages/native-babylon/src/assets.ts`
- Modify: `packages/native-babylon/src/contribution.ts`
- Modify: `packages/native-babylon/src/contribution.test.ts`
- Modify: `packages/native-babylon/src/host.ts`
- Delete: `packages/native-babylon/src/host.test.ts`

**Deliverable:** Existing Foundation behavior moves behind `admitBabylonNativeSceneCandidateV1`; Host derives random from Bootstrap, rejects non-undefined Build returns, and preserves locked-asset failure even if Module catches it.

- [ ] **Step 1: Move existing Host tests before changing behavior**

Copy all current Foundation cases from `host.test.ts` into `candidate-admission.test.ts`, rename the subject to `admitBabylonNativeSceneCandidateV1`, and change helpers to pass `{ candidate: { scene, engine } }` with no random argument.

Run:

```bash
pnpm exec vitest run packages/native-babylon/src/candidate-admission.test.ts
```

Expected RED: new entry/types do not exist.

- [ ] **Step 2: Add new RED Build/asset cases**

Add behavior-level tests proving:

- the same Bootstrap seed reproduces the existing LCG output without caller-provided random;
- a sync or async Build resolving to `null`, object, callback, Controller, disposer, Mesh, or other non-`undefined` value rejects with `WORLDKIT_NATIVE_SCENE_BUILD_RETURN_INVALID`;
- `throw undefined` still rejects;
- Registration closes immediately after Promise settlement;
- a locked asset byte buffer is copied on every resolution;
- a resolver failure remains a rejection even when Module catches it and registers a valid Spawn;
- first Registration failure remains the root diagnostic when Module catches/rethrows another exception.

- [ ] **Step 3: Implement Host-only resolver failure transport**

Add a `/host`-only branded failure constructor/type that contains one already-parsed `NativeSceneDiagnosticV1`. The isolated resolver records its first failure and rethrows; admission checks the record after Build settlement so Module cannot swallow it. Unbranded resolver errors map to a stable sanitized asset-resolution diagnostic; BNA-2 asset-free policy can supply `WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE`.

Do not export this failure transport from the AI-facing root.

- [ ] **Step 4: Extract and rename Candidate admission**

Move the old Host implementation into `candidate-admission.ts`, preserving geometry, budget, ID, binding, sort, hash, and registration behavior. Apply these clean changes:

- input contains `candidate.engine` and `candidate.scene`;
- random is always `createBabylonNativeHostRandomV1(bootstrap.seed)`;
- `const buildResult = await module.build(context)` must have `typeof buildResult === "undefined"`;
- output uses the new `Admit...` result names;
- `host.ts` becomes the trusted barrel for the exact new types/functions;
- delete `BuildBabylonNativeSceneCandidateInputV1`, `BuildBabylonNativeSceneCandidateResultV1`, and `buildBabylonNativeSceneCandidateV1` rather than aliasing them.

- [ ] **Step 5: Run GREEN Candidate tests and old-name local census**

```bash
pnpm exec vitest run \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/native-babylon/src/contribution.test.ts \
  packages/native-babylon/src/package-boundary.test.ts
rg -n "BuildBabylonNativeSceneCandidate|buildBabylonNativeSceneCandidateV1" \
  packages/native-babylon/src
```

Expected: tests pass; census has zero production/export/test-name hits in the Native package.

- [ ] **Step 6: Commit PC-20A**

```bash
git add packages/native-babylon
git commit -m "refactor: close native candidate admission API"
```

---

## Task 6: BNA2-PC-20B — Mandatory Authority Audit

**Files:**

- Create: `packages/native-babylon/src/authority-audit.ts`
- Create: `packages/native-babylon/src/authority-audit.test.ts`
- Modify: `packages/native-babylon/src/candidate-admission.ts`
- Modify: `packages/native-babylon/src/candidate-admission.test.ts`
- Modify: `packages/native-babylon/src/package-boundary.test.ts`

**Deliverable:** Every `admit...` call validates a clean Candidate before Registration opens and rejects any Module attempt to own camera, physics, action, observer, render scheduling, or Candidate lifecycle.

- [ ] **Step 1: Record the installed Babylon public surface**

Before implementation, inspect the complete installed public declarations and record their
exact paths/version in the commit/review notes:

```bash
rg -n "Observable<|set (onDispose|beforeRender|afterRender|beforeCameraRender|afterCameraRender)|registerBeforeRender|registerAfterRender|actionManagers|activeCameras" \
  node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/scene.pure.d.ts
rg -n "Observable<|runRenderLoop|stopRenderLoop" \
  node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/Engines/abstractEngine.pure.d.ts
rg -n "get observers|hasObservers" \
  node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/Misc/observable.pure.d.ts
rg -n "getPhysicsEngine|isPhysicsEnabled" \
  node_modules/.pnpm/@babylonjs+core@9.23.0/node_modules/@babylonjs/core/Physics/joinedPhysicsEngineComponent.types.d.ts
```

Do not implement from remembered Babylon behavior.

- [ ] **Step 2: Write RED Candidate precondition tests**

Assert Build is never called when Candidate has any of:

- disposed Scene/Engine or mismatched `scene.getEngine()`;
- active camera, non-empty `activeCameras`, or preexisting camera collection;
- physics engine/physics-enabled state or Mesh physics body;
- Scene actionManager/actionManagers or Mesh action manager;
- preexisting Module-like observer/render callback beyond the factory baseline;
- Candidate factory Engine containing an unexpected Scene identity.

Each case must return `WORLDKIT_NATIVE_SCENE_CANDIDATE_PRECONDITION_INVALID` at `authority-audit` or the specified `capability` boundary and leave Registration unexposed.

- [ ] **Step 3: Write RED post-Build mutation tests**

Programmatic Modules must attempt and be rejected for:

- assigning `activeCamera`/`activeCameras` or creating a Camera;
- enabling physics or attaching a physics body;
- assigning Scene/Mesh ActionManager;
- registering before/after-render callbacks;
- adding/addOnce to every key in the single Host-owned Scene/Engine public Observable
  census, including Scene/Engine disposal and camera/draw/render-group/ready/resource/input
  callbacks;
- replacing an audited Observable, writing `notifyIfTriggered`, mutating the live
  `observers` array, and invoking every forbidden mutation/control API including priority
  reorder, last-state clean, notification, removal, clear, and clone;
- adding callbacks through every inherited surface in
  `BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1`: Node/TransformNode/
  AbstractMesh/Mesh/Material/StandardMaterial/Light Observables and setters, Mesh
  register-before/after-render helpers, Node Behavior retention, and static
  `Material.OnEventObservable`;
- assigning any direct callback property in the created-object census: `Node.onReady`,
  `TransformNode.customMarkAsDirty`, `Mesh.onLODLevelSelection`, Material
  `customShaderNameResolve/onCompiled/onError/getRenderTargetTextures`, and
  `Geometry.onGeometryUpdated`;
- assigning each Scene callback setter: `onDispose`, `beforeRender`, `afterRender`,
  `beforeCameraRender`, and `afterCameraRender`;
- replacing every function-valued key in
  `BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1`, including pointer predicates,
  `onPointer*`, candidate selectors, deterministic-frame-time, and `customRenderFunction`;
- invoking every retained callback/object method in
  `BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1`, including `executeWhenReady`,
  `whenReadyAsync`, `executeOnceBeforeRender`, `addIsReadyCheck`, `freezeActiveMeshes`,
  `setRenderingOrder`, and external-data retention;
- calling Engine `runRenderLoop`/`stopRenderLoop`;
- replacing Engine `customAnimationFrameRequester`;
- adding/removing/replacing
  `scene.imageProcessingConfiguration.onUpdateParameters` or replacing the containing
  `ImageProcessingConfiguration` identity;
- adding/removing/replacing `scene.postProcessManager.onBeforeRenderObservable` or replacing the
  containing `PostProcessManager` identity;
- disposing Scene or Engine;
- catching the instrumentation error and otherwise completing a valid Build.

Also assert allowed Mesh, TransformNode, Geometry, Material, Light, fog/clearColor visual state passes.
An exact `StandardMaterial` construction must be a positive regression: its one Babylon-owned
`ImageProcessingConfiguration` observer and non-null provider `getRenderTargetTextures` function
must pass. A second observer, a replacement direct function, a missing/reordered provider observer,
or a PostProcessManager mutation must fail.

Run:

```bash
pnpm exec vitest run packages/native-babylon/src/authority-audit.test.ts
```

Expected RED: current admission accepts at least several mutations.

- [ ] **Step 4: Implement baseline and public-API instrumentation**

Capture only public values/identities:

- Candidate Scene/Engine identity and disposed state;
- Engine `customAnimationFrameRequester` identity and own/prototype descriptor;
- cameras, active camera(s), Scene action manager(s), per-Mesh action manager/physics body;
- optional public physics getter/state when the installed component exposes it;
- ordered copies of `.observers` for
  `BABYLON_NATIVE_AUDITED_SCENE_OBSERVABLE_KEYS_V1` and
  `BABYLON_NATIVE_AUDITED_ENGINE_OBSERVABLE_KEYS_V1`;
- each Observable object identity plus an `observers.slice()` snapshot; never retain the live
  `observers` array returned by Babylon;
- function identity for every
  `BABYLON_NATIVE_AUDITED_SCENE_CALLBACK_PROPERTY_KEYS_V1` member;
- identity/order baselines for provider static/global Observables such as
  `Material.OnEventObservable`;
- object/Observable identity and `observers.slice()` for every path in
  `BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1`, currently exactly
  `scene.imageProcessingConfiguration.onUpdateParameters` and
  `scene.postProcessManager.onBeforeRenderObservable`;
- original own-property descriptors for instrumented methods.

Before Build, subscribe temporary Host observers to Scene's public new-Mesh, new-TransformNode,
new-Material, new-Light, and new-Geometry Observables. When an object is exposed, apply the single
inherited surface map in
`BABYLON_NATIVE_AUDITED_CREATED_OBJECT_CALLBACK_SURFACES_V1`; every Observable observer
snapshot, callback setter backing Observable, direct callback identity, and Behavior/retained-object
collection is captured as its provider baseline, and restorable per-instance direct-callback accessors
are installed before Module code regains control. The exact Babylon 9.23.0 map includes the
Node, TransformNode, AbstractMesh, Mesh, Material/StandardMaterial, and Light surfaces in
the approved design; Geometry has the direct `onGeometryUpdated` callback while Buffer and
concrete Light types must have an explicit empty increment rather than being silently omitted.

Instrument the public `scene.imageProcessingConfiguration.onUpdateParameters.add` during Build.
Babylon exposes a `StandardMaterial` from its base constructor before the subclass finishes; allow
exactly one synchronous provider add for each just-exposed exact `StandardMaterial`, record the
returned public `Observer` identity, then require exactly one provider assignment of
`getRenderTargetTextures` to close that construction window. At Build settlement, the nested observer
list must equal baseline plus the recorded live provider observers in encounter order, and the direct
function must equal the recorded provider identity. Reject any extra, missing, reordered, late, or
Module-owned transition. `scene.postProcessManager.onBeforeRenderObservable` remains byte-exact to
baseline. Do not read `_imageProcessingConfiguration`, `_imageProcessingObserver`, or any other
private field. Encode this as the single Host-owned
`BABYLON_NATIVE_ALLOWED_PROVIDER_CALLBACK_TRANSITIONS_V1` machine list; Babylon 9.23.0 has exactly
this one entry and no anonymous provider exception. If public instrumentation cannot classify the
exact sequence, reject fail-closed.

After Build, enumerate every Candidate-owned object through public Scene collections and registration
references. Require its callback surfaces to equal the captured provider identities/order and contain
no Module closure; Behavior/retained-object collections remain empty. In `finally`, remove all Host
new-object observers and restore every accessor/method descriptor before comparing the original
Scene/Engine/static baselines.

Install instance wrappers for all
`BABYLON_NATIVE_FORBIDDEN_SCENE_CALLBACK_METHOD_KEYS_V1` members plus
`engine.runRenderLoop` and `engine.stopRenderLoop`. A wrapper records the first authority
violation and throws without scheduling or retaining work. In `finally`, restore the prior
own descriptor or delete the temporary own property, then verify restoration. Delayed
Babylon Observable removal remains a rejection at Build settlement; do not wait a tick or
read `_activeRenderLoops`, `_willBeUnregistered`, or any private field.

Add one declaration-census test that extracts all public `Observable` properties from the
installed Babylon 9.23.0 `scene.pure.d.ts` and `abstractEngine.pure.d.ts`, then compares
them exactly with the two Host constants. At this SHA the expected census is 65 Scene keys
and 15 Engine keys. The same test freezes the exact 17 Scene function-valued callback
properties above. A source-backed test verifies the ten forbidden methods really retain a
callback/object or control later rendering in `scene.pure.js`. The constants are the only
machine lists; tests iterate them instead of hand-writing smaller callback subsets.

The census fixture must import the exact 12-specifier Module Profile into one TypeScript
Program and extract the effective, inherited/module-augmented instance and static public
surface for Scene, AbstractEngine, Node, TransformNode, AbstractMesh, Mesh, Material,
StandardMaterial, Geometry, Buffer, all three allowed Light types, and the nested
ImageProcessingConfiguration and PostProcessManager surfaces. It must also
instantiate the Host-private NullEngine/Scene and one minimal object of every constructible
type after loading that same import graph, then compare runtime Observable identities,
callback setters, direct function-valued properties, Behavior/retained-object collections,
static globals, callback-property keys, and instrumented method descriptors with the constants. This guards future import
side effects and module augmentations; scanning the entire unimported Babylon package or
only `scene.pure.d.ts` is not accepted as the sole evidence.

Add a source-backed provider-order test that freezes the legal Babylon 9.23.0 `StandardMaterial`
constructor sequence described above. It must fail when an upgrade changes exposure/add/assignment
order so the Host cannot silently relabel an unknown callback as provider-owned.

Add a cycle-safe Host-boundary runtime discovery test over the pre-Build Candidate's public
Babylon-owned object graph. It must compare every discovered nested Observable or direct
function-valued callback path with
`BABYLON_NATIVE_AUDITED_NESTED_AUTHORITY_SURFACES_V1`; the current exact extra path is
`scene.imageProcessingConfiguration.onUpdateParameters` plus
`scene.postProcessManager.onBeforeRenderObservable`. Do not merge these nested paths
into the 65 direct Scene keys or silently stop traversal at either containing object.

- [ ] **Step 5: Integrate audit around the entire Build Epoch**

Order is fixed:

1. parse Bootstrap/module/budget;
2. validate Candidate precondition and install probe;
3. open Registration and run Build exactly once;
4. close Registration in `finally`;
5. freeze/validate Contribution;
6. compare post-Build authority state;
7. restore instrumentation in `finally`;
8. return passed only if Build, Contribution, audit, and restoration all pass.

If Build and audit both fail, preserve both sanitized diagnostics and sort them. Any authority mutation rejects the whole Candidate; do not repair the Scene and continue.

- [ ] **Step 6: Run GREEN audit/Candidate suites and private-field census**

```bash
pnpm exec vitest run \
  packages/native-babylon/src/authority-audit.test.ts \
  packages/native-babylon/src/candidate-admission.test.ts
rg -n "_activeRenderLoops|_observers|_physicsEngine|_activeCamera" \
  packages/native-babylon/src --glob '!*.test.ts'
```

Expected: tests pass and census is empty.

- [ ] **Step 7: Commit PC-20B**

```bash
git add packages/native-babylon
git commit -m "feat: audit native candidate authority"
```

---

## Task 7: BNA2-PC-30 — Dual Candidate Runtime Replay

**Files:**

- Create: `packages/native-babylon/src/runtime-replay.ts`
- Create: `packages/native-babylon/src/runtime-replay.test.ts`
- Modify: `packages/native-babylon/src/host.ts`
- Modify: `packages/native-babylon/src/contribution.ts`
- Modify: `packages/native-babylon/src/contribution.test.ts`

**Deliverable:** Replay always builds and disposes two isolated Candidates, compares exact canonical Contribution bytes, and applies cleanup/tool-error precedence without leaking handles.

- [ ] **Step 1: Write RED happy-path and drift tests**

Cover:

- A/B use different Scene and Engine identities but yield identical bytes/hash;
- collider registration order changes while canonical ID sort yields identical bytes;
- a retained closure counter changes only the second Spawn, geometry, binding, ratio, or Collider set and rejects with `WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_MISMATCH`;
- the same Module object is reused for A and B;
- returned passed result has no Candidate/Scene/Engine/Mesh/disposer keys.

- [ ] **Step 2: Write RED lifecycle/precedence tests**

Use a tracked factory to cover:

- A create failure; A Build/audit rejection; A dispose failure;
- B create failure; B Build/audit rejection; B dispose failure;
- rejection plus cleanup failure retains the rejection diagnostic, appends tooling cleanup diagnostic, and returns `tool-error`;
- success plus cleanup failure returns `tool-error` and no Contribution publication;
- A failure means B is never created;
- two concurrent replay calls share no lease, observer, instrumentation, or disposal state.

Run:

```bash
pnpm exec vitest run packages/native-babylon/src/runtime-replay.test.ts
```

Expected RED: replay entry missing.

- [ ] **Step 3: Implement canonical byte comparison**

For each passed admission, exact-parse the Contribution again, call `canonicalJsonBytes`, and compare length and every byte. Hash derives from the accepted bytes/parsed Contribution and is not the equality authority. Keep the byte array internal; do not add it to public DTO/result.

- [ ] **Step 4: Implement two sequential leases and cleanup precedence**

Use one helper that:

1. calls `createCandidate()`;
2. calls `admit...`;
3. always calls `lease.dispose()` in `finally`;
4. converts factory/cleanup exceptions to sanitized tooling diagnostics;
5. never returns the lease.

Only create B after A admission and cleanup succeed. Dispose B before comparing/publishing the final passed result so cleanup failure can prevent publication.

- [ ] **Step 5: Run GREEN replay and Candidate suites**

```bash
pnpm exec vitest run \
  packages/native-babylon/src/runtime-replay.test.ts \
  packages/native-babylon/src/authority-audit.test.ts \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/native-babylon/src/contribution.test.ts
```

- [ ] **Step 6: Commit PC-30**

```bash
git add packages/native-babylon
git commit -m "feat: replay native modules deterministically"
```

---

## Task 8: BNA2-PC-40A — Trusted Local Checker Composition

**Files:**

- Create: `scripts/native-scene/check-policy.ts`
- Create: `scripts/native-scene/check-policy.test.ts`
- Create: `scripts/native-scene/native-scene-check.ts`
- Create: `scripts/native-scene/native-scene-check.test.ts`
- Create: `scripts/native-scene/explain.ts`
- Create: `scripts/native-scene/explain.test.ts`

**Deliverable:** One checker executes workspace -> source -> typecheck -> bundle -> replay under the fixed BNA-2 local policy and returns a single closed result.

- [ ] **Step 1: Write RED policy tests**

Freeze exactly:

```ts
export const BNA2_WHITEBOX_ADMISSION_BUDGET_V1 = Object.freeze({
  maximumStaticColliderCount: 256,
  maximumStaticColliderVertexCount: 65_536,
  maximumStaticColliderTriangleCount: 131_072,
});
```

Tests prove both `worldkit://native-scene-profile/whitebox.standard@1` and
`worldkit://native-scene-profile/whitebox.blocks@1` resolve through one closed policy map
and receive the same hard cap; any other profile rejects with
`WORLDKIT_NATIVE_SCENE_PROFILE_UNSUPPORTED`. The asset-free resolver records
`WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE`, even if Module catches its exception.

- [ ] **Step 2: Implement the NullEngine Candidate factory**

Trusted script code may import `@babylonjs/core/Engines/nullEngine.js` and `@babylonjs/core/scene.js`; these imports are not added to the Module allowlist. Each `createCandidate()` creates a new deterministic NullEngine and one right-handed Scene with no camera/physics/actions. Its disposer attempts Scene then Engine cleanup and retains the first failure while continuing cleanup.

- [ ] **Step 3: Write RED full-pipeline tests**

Cover one positive multi-file workspace and one failure at every stage: Bootstrap, dependency, source, typecheck, bundle/export, profile capability, Build, contribution, authority, replay, and tooling/cleanup. Assert:

- checkedInput is unresolved before a valid Bootstrap and `native-scene-module` afterward;
- passed/rejected/tool-error invariants pass `parseNativeSceneCheckResultV1`;
- diagnostics are deterministically sorted;
- no absolute/temp/home path or raw stack appears;
- temp roots and Candidates are gone after every result;
- concurrent checks are isolated.

- [ ] **Step 4: Implement one orchestration function**

```ts
export function checkBabylonNativeSceneWorldDirectoryV1(
  worldDirectoryPath: string,
): Promise<NativeSceneCheckResultV1>;
```

It is the CLI-owned trusted-local convenience entry. BNA-3 later calls the lower workspace/Source/Host functions with formal locks/budget; it does not parse CLI output or copy the pipeline.

Short-circuit at the first failed stage except that cleanup failures append a tooling error and change outcome to `tool-error`. Never execute Bundle/Module if Source Admission failed.

- [ ] **Step 5: Implement deterministic human explanation**

`explainNativeSceneCheckResultV1(result)` returns a newline-terminated string ordered exactly like diagnostics and containing only outcome plus `stage code location message repairHint`. It is a view of the same DTO, not a second schema.

- [ ] **Step 6: Run GREEN checker/explain tests**

```bash
pnpm exec vitest run \
  scripts/native-scene/check-policy.test.ts \
  scripts/native-scene/native-scene-check.test.ts \
  scripts/native-scene/explain.test.ts
```

- [ ] **Step 7: Commit PC-40A**

```bash
git add scripts/native-scene
git commit -m "feat: compose native scene checks"
```

---

## Task 9: BNA2-PC-40B — `worldkit native` CLI Contract

**Files:**

- Modify: `scripts/cli/worldkit.ts`
- Modify: `scripts/cli/worldkit.test.ts`
- Create: `scripts/cli/worldkit-native.integration.test.ts`

**Deliverable:** Real CLI processes implement check/explain with exact stdout and exits 0/1/2.

- [ ] **Step 1: Add RED argv parser/help tests**

Extend `WorldkitArgs` with only:

```ts
| { command: "native-check"; worldDirectoryPath: string; json: true }
| { command: "native-explain"; worldDirectoryPath: string; json: boolean }
```

Tests require `native check` to include `--json`, allow `native explain` with or without it, reject duplicates/unknown options, and include both commands in `HELP`.

- [ ] **Step 2: Add RED real child-process tests**

Spawn the actual `tsx scripts/cli/worldkit.ts` entry. For each fixture assert raw bytes:

- pass: stdout has exactly one newline-terminated JSON object, stderr has no protocol pollution, exit `0`;
- rejection: same one-line DTO, exit `1`;
- `explain --json` stdout parses deep-equal to `check --json` DTO;
- human explain contains stable fields and exit matches the DTO;
- usage/unreadable root/forced cleanup failure in JSON mode yields unresolved-world tooling DTO and exit `2`;
- stdout contains none of workspace absolute path, `.codex-tmp`, home directory, stack markers, or injected credential sentinel.

Run:

```bash
pnpm exec vitest run scripts/cli/worldkit.test.ts \
  scripts/cli/worldkit-native.integration.test.ts
```

Expected RED: parser/branch missing.

- [ ] **Step 3: Implement Native parse and output branches**

Use `stringifyCanonicalJson(result) + "\n"` for JSON. Wrap NullEngine execution with the existing Babylon log-silencing boundary so Babylon banners never reach stdout. Human logs go to stderr in JSON mode.

Because parse failures occur before `WorldkitArgs` exists, detect only the raw prefix `native` plus `--json` to emit `WORLDKIT_NATIVE_SCENE_TOOL_USAGE_INVALID`; preserve existing non-Native CLI usage behavior.

Map outcome to exit with one function:

```ts
const NATIVE_EXIT_BY_OUTCOME = Object.freeze({
  passed: 0,
  rejected: 1,
  "tool-error": 2,
} as const);
```

- [ ] **Step 4: Run GREEN CLI tests**

```bash
pnpm exec vitest run \
  scripts/cli/worldkit.test.ts \
  scripts/cli/worldkit-native.integration.test.ts \
  scripts/native-scene/native-scene-check.test.ts
```

- [ ] **Step 5: Manually inspect one exact CLI triplet**

Run one passing temporary fixture, one rejected fixture, and one invalid path. Record command, exit, stdout line count, and parsed outcome in implementation notes; do not keep fixture artifacts.

- [ ] **Step 6: Commit PC-40B**

```bash
git add scripts/cli
git commit -m "feat: add worldkit native checks"
```

---

## Task 10: BNA2-PC-50A — Cloud Ridge Pure Module Migration

**Files:**

- Modify: `apps/native-scene-playground/src/cloud-ridge-scene.ts`
- Modify: `apps/native-scene-playground/src/cloud-ridge-scene.test.ts`
- Modify: `apps/native-scene-playground/src/main.ts`
- Modify: `apps/native-scene-playground/src/native-scene-source-clean-break.test.ts`
- Modify: `scripts/verification/verify-native-scene-playground.ts`

**Deliverable:** Cloud Ridge default-exports one pure Module and no longer retains Collider Meshes or a Module-owned runtime controller/debug surface.

- [ ] **Step 1: Add RED clean-break tests before deleting the Controller**

Assert the scene module's only Runtime export is `default`, the default value passes `defineBabylonNativeScene`, and production sources contain none of:

```text
CloudRidgeNativeSceneControllerV1
createCloudRidgeNativeSceneControllerV1
collisionDebugSnapshot
setCollisionDebugVisible
module-owned collisionMeshes
```

Run:

```bash
pnpm exec vitest run \
  apps/native-scene-playground/src/cloud-ridge-scene.test.ts \
  apps/native-scene-playground/src/native-scene-source-clean-break.test.ts
```

Expected RED: current Controller/factory is found.

- [ ] **Step 2: Convert the scene to the exact default Module**

Replace the controller factory with:

```ts
export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "cloud-ridge-native-spike",
  build(context): void {
    // existing visuals and registrations
  },
});
```

Keep existing visual helpers and seeded composition unchanged. `createCollisionProxies` returns only what Build needs immediately to register; no array is retained outside Build.

- [ ] **Step 3: Move the app to Module lookup, not factory/controller lookup**

Use `Readonly<Record<string, BabylonNativeSceneModuleV1>>` keyed by `sceneModuleRef`. Pass the selected Module directly to `BabylonWorldRuntime.create`.

Remove the public spike probe's `setColliderDebugVisible`, debug state/count fields, `KeyC` handling, and all Controller calls. BNA-2 intentionally removes the experimental overlay rather than retaining a forbidden Module owner; a Host-owned collision overlay may return under BNA-4 with SDK-owned proxy handles.

- [ ] **Step 4: Update Cloud Ridge tests and browser verifier**

The unit test calls `admitBabylonNativeSceneCandidateV1` with the actual engine/scene, checks the same contribution/hash and seeded visual baselines, and confirms registered proxy Meshes are invisible without invoking a Controller.

The browser verifier deletes overlay toggling assertions but keeps stronger runtime evidence already present: contribution hash/IDs, physics body count, spawn, jump/landing, camera orbit/reset, main-path traversal, clean UI, and browser error census. Do not claim this browser verifier is the BNA-2 replay/Source gate.

- [ ] **Step 5: Run GREEN app-focused verification**

```bash
pnpm exec vitest run \
  apps/native-scene-playground/src/cloud-ridge-scene.test.ts \
  apps/native-scene-playground/src/native-package-migration.test.ts \
  apps/native-scene-playground/src/native-scene-source-clean-break.test.ts
pnpm build:native-scene
```

- [ ] **Step 6: Commit PC-50A**

```bash
git add apps/native-scene-playground scripts/verification/verify-native-scene-playground.ts
git commit -m "refactor: make cloud ridge a pure native module"
```

---

## Task 11: BNA2-PC-50B — Runtime Consumer and Clean-Break Verifier

**Files:**

- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: affected `packages/runtime-babylon/src/*.test.ts`
- Create: `scripts/verification/verify-bna2-clean-break.ts`
- Create: `scripts/verification/verify-bna2-clean-break.test.ts`
- Modify: `package.json`

**Deliverable:** The experimental Runtime consumer uses audited admission, and one stable verifier proves old APIs/controllers are gone while formal RuntimeHost remains closed.

- [ ] **Step 1: Add RED Runtime admission tests**

Update Native Runtime tests to assert:

- Host derives random from Bootstrap;
- authority mutation prevents Native contribution/Havok/Subject/camera initialization;
- passed admission still creates the same SDK-owned collision bodies;
- rejection disposes the Runtime Candidate through the existing owned disposer stack;
- formal RuntimeHost rejection remains before adapter/Candidate allocation.

Run the smallest affected test file(s) and record the old-import/behavior failure.

- [ ] **Step 2: Replace the Runtime consumer**

Change imports/call site from raw build to:

```ts
const nativeResult = await admitBabylonNativeSceneCandidateV1({
  candidate: { engine, scene },
  bootstrap: nativeScene.bootstrap,
  module: nativeScene.module,
  assets: nativeScene.assets,
  budget: nativeScene.budget,
});
```

Do not call replay here: this playground Runtime is an experimental one-Candidate consumer; formal package/build identity must later require BNA-3 replay. Admission remains mandatory so authority audit cannot be bypassed.

- [ ] **Step 3: Add the BNA-2 clean-break verifier**

The verifier scans current production/test entry points and fails if it finds the old Candidate symbol/type, Cloud Ridge controller/factory/debug API, a second Native workspace parser, or a second Babylon import allowlist. It also invokes/reuses the BNA-1 formal preallocation check and proves `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` remains before Candidate allocation.

Avoid self-matching by constructing deleted symbol strings from fragments, following `verify-bna1-clean-break.ts` precedent.

Add root script:

```json
"verify:bna2-clean-break": "tsx scripts/verification/verify-bna2-clean-break.ts"
```

- [ ] **Step 4: Run GREEN runtime/clean-break tests**

```bash
pnpm exec vitest run \
  packages/runtime-babylon/src/runtime.test.ts \
  scripts/verification/verify-bna2-clean-break.test.ts
pnpm verify:bna1-clean-break
pnpm verify:bna2-clean-break
```

- [ ] **Step 5: Run the current Native browser verifier once**

```bash
pnpm verify:native-scene-playground
```

Record separately: browser/runtime interaction passed. Do not label it Source Admission, replay, hosted security, or general visual quality proof.

- [ ] **Step 6: Commit PC-50B**

```bash
git add packages/runtime-babylon scripts/verification package.json
git commit -m "refactor: route native runtime through audited admission"
```

---

## Task 12: BNA2-PC-90 — Integration, Review, and Truth Update

**Files:**

- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- Create: `docs/reviews/2026-08-29-babylon-native-authoring-production-closure-review.md`
- Modify only if findings require a new RED fix: files owned by the finding's task

**Deliverable:** All new tests are in the correct gate, the exact tree has scoped verification and independent review, and documentation says precisely what BNA-2 did and did not close.

- [ ] **Step 1: Register every new test exactly once**

Add all new Native package, script, CLI integration, and verifier tests to `TEST_GATE_MANIFEST_V1` with the correct `contract` or resource-heavy lane. Run:

```bash
pnpm test:census
```

Expected: no unregistered or duplicate test.

- [ ] **Step 2: Run the complete focused BNA-2 suite**

```bash
pnpm exec vitest run \
  packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts \
  packages/native-babylon/src/import-profile.test.ts \
  packages/native-babylon/src/module.test.ts \
  packages/native-babylon/src/contribution.test.ts \
  packages/native-babylon/src/candidate-admission.test.ts \
  packages/native-babylon/src/authority-audit.test.ts \
  packages/native-babylon/src/runtime-replay.test.ts \
  packages/native-babylon/src/package-boundary.test.ts \
  packages/native-babylon-block-profile/src/api-type.test.ts \
  packages/native-babylon-block-profile/src/check.test.ts \
  packages/native-babylon-block-profile/src/layout.test.ts \
  packages/native-babylon-block-profile/src/package-boundary.test.ts \
  packages/native-babylon-block-profile/src/profile.test.ts \
  packages/native-babylon-block-profile/src/session.test.ts \
  packages/native-babylon-block-profile/src/shapes.test.ts \
  scripts/native-scene/authoring-workspace.test.ts \
  scripts/native-scene/source-admission.test.ts \
  scripts/native-scene/ephemeral-bundle.test.ts \
  scripts/native-scene/check-policy.test.ts \
  scripts/native-scene/native-scene-check.test.ts \
  scripts/native-scene/explain.test.ts \
  scripts/cli/worldkit-native.integration.test.ts \
  apps/native-scene-playground/src/cloud-ridge-scene.test.ts \
  apps/native-scene-playground/src/native-package-migration.test.ts \
  apps/native-scene-playground/src/native-scene-source-clean-break.test.ts \
  scripts/verification/verify-bna2-clean-break.test.ts
```

- [ ] **Step 3: Run broad relevant gates once on the unchanged exact tree**

```bash
pnpm verify:workspace-boundaries
pnpm test:census
pnpm typecheck
pnpm test
pnpm build
pnpm build:native-scene
pnpm verify:bna1-clean-break
pnpm verify:bna2-clean-break
git diff --check
```

Do not separately rerun `pnpm test:scenes`; root `pnpm test` already includes the registered gate. If a later narrow review fix lands, rerun its RED/GREEN and only invalidated gates unless it changes a cross-cutting contract or authority.

- [ ] **Step 4: Run explicit current-only censuses**

```bash
rg -n "BuildBabylonNativeSceneCandidate|buildBabylonNativeSceneCandidateV1|CloudRidgeNativeSceneControllerV1|createCloudRidgeNativeSceneControllerV1" \
  packages apps scripts --glob '!scripts/verification/verify-bna2-clean-break.ts'
rg -n "native-scene\.bootstrap\.json|BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1" \
  packages apps scripts
rg -n "WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED" packages/runtime-host
git status --short
```

Expected: old API/controller zero; one workspace convention; one Import Profile owner plus consumers/tests; formal guard present; clean tree after commits.

- [ ] **Step 5: Perform an independent Mode B + runtime-deep review**

The reviewer must read the exact SHA, the BNA-2 spec, this plan, `full-dimension-review-protocol.md`, `runtime-deep-review-checklist.md`, and installed Babylon/Havok source. Review D1-D6 with emphasis on:

- Source graph boundary and escape/alias/symlink behavior;
- single Candidate admission/replay authority and no raw bypass;
- public-API audit completeness/restoration;
- byte-exact replay and cleanup precedence;
- CLI stdout/stderr/exit/redaction;
- Cloud Ridge/current consumer clean break;
- formal RuntimeHost still closed before allocation;
- no BNA-3/BNA-4/BNA-5/BNA-6 capability overclaim.

Write `docs/reviews/2026-08-29-babylon-native-authoring-production-closure-review.md` with metadata, commands/exits, findings blocks, D1-D6 coverage, and GO/NO-GO. A GO requires no open P0/P1/P2. Any confirmed bug gets a new focused RED before a fix.

- [ ] **Step 6: Update durable truth only after GO**

Mark BNA-2 engineering closure in `docs/18-refactor-progress-and-backlog.md`; leave BNA-3 through BNA-8 and BWB-3+ open. Update the long design's BNA-2 pointer/status without claiming formal package, Runtime Havok/Surface admission, hosted isolation, AI success rate, Capture, Route/Nav, or `goTo`.

- [ ] **Step 7: Commit closure evidence**

```bash
git add scripts/lib/test-gate-manifest.ts docs/18-refactor-progress-and-backlog.md \
  docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md \
  docs/reviews/2026-08-29-babylon-native-authoring-production-closure-review.md
git commit -m "docs: close BNA2 production checks"
```

- [ ] **Step 8: Rebase/merge-check and publish through PR**

```bash
git fetch origin
git log --oneline --left-right --cherry-pick HEAD...origin/main
git status --short --branch
git push origin codex/bna2-production-closure-design
```

If `origin/main` changed in an affected authority, perform a semantic three-way merge and rerun only invalidated gates before updating the review SHA. Merge PR #47 only after CI and the independent GO apply to the exact pushed head. Delete no remote branch unless explicitly requested.

## Final Acceptance Matrix

| Requirement | Owning task | Required evidence |
|---|---|---|
| Fixed workspace, no user config/symlink/escape | PC-10A | workspace/source adversarial tests |
| One exact Babylon import dialect | PC-05 + PC-10A | profile constant test + resolved import tests |
| Strict typecheck and no-side-effect temporary bundle | PC-10B | type/export/concurrency/cleanup tests |
| Candidate precondition before Build/Registration | PC-20B | Build-not-called adversarial tests |
| One mandatory authority audit | PC-20B | camera/physics/action/observer/render/dispose matrix |
| Host-owned seed and closed Build return | PC-20A | LCG continuity + non-undefined return tests |
| Frozen Spawn/static Collider Contribution | PC-20A | migrated Foundation tests |
| Two isolated replay Candidates and exact bytes | PC-30 | drift/order/identity tests |
| Cleanup failure precedence and no handles | PC-30 | create/build/audit/dispose matrix |
| Stable DTO, relative locations, no leaked paths | PC-40A | result parser/redaction tests |
| CLI 0/1/2 and one-line JSON | PC-40B | real subprocess tests |
| Cloud Ridge default pure Module, no Controller | PC-50A | export/source census + app/browser tests |
| Runtime consumer uses audited admission | PC-50B | runtime tests + BNA2 verifier |
| Formal RuntimeHost still fail-closed | PC-50B/PC-90 | BNA1+BNA2 clean-break verifier |
| No false BNA-3/BNA-4/BNA-5/BNA-6 claim | PC-90 | docs diff + independent D1-D6 review |

## Explicitly Deferred After This Plan

- BNA-3: persistent content-addressed Module Bundle, Dependency/Asset Lock, Package/Receipt, WorldBuildIdentity binding.
- BNA-4: formal RuntimeHost Native admission, real Havok attach, Spawn support, Surface admission, Subject/Camera/fixed Tick publication, Host-owned collision overlay.
- BNA-5: Worker/process/origin sandbox, timeout/kill, network/credential/multi-tenant isolation.
- BNA-6: same-reference model generation, bounded repair, visual/manual evaluation, product GO/NO-GO.
- BNA-7/BNA-8: Capture/Route/Nav/`goTo`, Native full reload/incremental authoring semantics.
- BWB-3+: block screenshots, collider derivation, corpus and model-facing success evidence.

Completion of BNA-2 must not silently start or partially emulate any deferred phase.

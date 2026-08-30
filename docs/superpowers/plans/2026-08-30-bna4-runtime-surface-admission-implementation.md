# BNA-4 Verified Native Runtime and Surface Admission Implementation Plan

> Execute against `origin/main@2fd8c1c2694a861e213ad2c72e9cb3aefec087ce` or a descendant containing
> the BNA-3 final evidence commit. Preserve the current-only clean break.

**Goal:** Admit an exact verified Babylon Native WorldPackage into the single RuntimeHost and shared
Babylon/Havok Gameplay Kernel, with frozen Contribution matching, supported spawn, stable Surface
identity and atomic lifecycle.

**Design:**
`docs/superpowers/specs/2026-08-30-bna4-runtime-surface-admission-design.md`

**Verification policy:** Write and run the focused failing test before each implementation step. Run
only affected package tests while editing. Run affected full gates once after the candidate tree is
stable; offload the final exact-SHA full gate and independent deep review to Cursor Cloud.

## 1. Boundaries and file ownership

- RuntimeHost source-neutral configuration and transaction:
  `packages/runtime-host/src/runtime-host.ts`, `runtime-host-lifecycle.test.ts`, exports.
- Formal verified Native input, loader and Package adapters:
  new `packages/runtime-babylon/src/babylon-native-package-runtime.ts` and focused test.
- Surface/spawn admission:
  new `packages/runtime-babylon/src/babylon-native-surface-admission.ts` and focused test.
- actual Candidate replay, Havok proxies and shared Kernel:
  `packages/runtime-babylon/src/babylon-world-runtime.ts`, `runtime.test.ts` and focused conformance
  tests.
- formal example/composition root:
  `apps/native-scene-playground/` only after the contracts above are green.
- status and review evidence:
  BNA-4 review, BNA long design and `docs/18-refactor-progress-and-backlog.md` only at BNA4-90.

Do not change Canonical compiler geometry, Runtime Browser Protocol, Gameplay state ownership,
CharacterMovement policy, Camera policy, Native authoring syntax, WorldPackage V1 schema or BNA-3
locks merely to make Runtime admission easier.

## 2. Task BNA4-00 — freeze design and implementation graph

**Files**

- Add: `docs/superpowers/specs/2026-08-30-bna4-runtime-surface-admission-design.md`
- Add: `docs/superpowers/plans/2026-08-30-bna4-runtime-surface-admission-implementation.md`
- Modify: `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
  only to link this implementation authority if the link is absent.

**Steps**

1. Verify every BNA-4 statement against current RuntimeHost, Runtime Babylon, WorldPackage,
   Native admission, installed Babylon/Havok source and WRC-1 owner map.
2. Search for placeholders, obsolete SHAs, a second Runtime proposal and raw compatibility language.
3. Run:

```bash
git diff --check
rg -n "TODO|TBD|PLACEHOLDER|later decide|兼容旧|legacy fallback" \
  docs/superpowers/specs/2026-08-30-bna4-runtime-surface-admission-design.md \
  docs/superpowers/plans/2026-08-30-bna4-runtime-surface-admission-implementation.md
```

4. Commit:

```bash
git add docs/superpowers/specs/2026-08-30-bna4-runtime-surface-admission-design.md \
  docs/superpowers/plans/2026-08-30-bna4-runtime-surface-admission-implementation.md
git commit -m "docs(bna4): freeze runtime surface admission"
```

## 3. Task BNA4-10 — source-neutral RuntimeHost and owned initial candidate

**Consumes:** exact `RuntimeWorldConfigurationV1`.  
**Produces:** one full-union Adapter descriptor and atomic port ownership.  
**Blocks:** BNA4-30 and all formal Native Runtime integration.

### Step 1: write failing RuntimeHost tests

Modify `packages/runtime-host/src/runtime-host-lifecycle.test.ts`:

- replace the two `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` expectations with successful
  Native initial create and replacement using the same fake Adapter/WorldPort harness as Canonical;
- assert the Adapter receives the exact Native Scene Source and World Build Identity;
- assert replacement preflight sees current Canonical/Native unions without narrowing;
- force `WorldSession.create()` to fail after Adapter port creation and prove `port.dispose()` runs
  exactly once;
- force initial binding/readiness failure and prove complete candidate cleanup; and
- retain tampered Native Package/config parse rejection before Adapter allocation.

Run:

```bash
pnpm exec vitest run packages/runtime-host/src/runtime-host-lifecycle.test.ts
```

Expected RED: Native configuration is rejected and the initial port is not disposed after a later
session failure.

### Step 2: implement the clean break

Modify `packages/runtime-host/src/runtime-host.ts`:

- make `RuntimeWorldAdapterDescriptorV1.sceneSource` the full `RuntimeSceneSourceV1`;
- delete `requireCanonicalRuntimeConfiguration` and all calls;
- retain strict Native Package/config identity parsing;
- transfer the created port into a candidate owner immediately;
- on every post-create failure, dispose the candidate/port once and preserve the stable public Host
  diagnostic; and
- do not duplicate replacement transaction logic.

Export only the existing canonical names from `packages/runtime-host/src/index.ts`; no V2 alias.

### Step 3: verify and commit

```bash
pnpm exec vitest run packages/runtime-host/src/runtime-host-lifecycle.test.ts \
  packages/runtime-host/src/runtime-host.test.ts
pnpm --filter @whitebox-world/runtime-host exec tsc --noEmit
git diff --check
git commit -am "feat(runtime): admit native scene descriptors"
```

## 4. Task BNA4-20 — formal verified-Package input

**Consumes:** `VerifiedBabylonNativeWorldPackageDirectoryV1` and Host loader.  
**Produces:** package-derived module request, locked asset resolver, budget and preflight result.  
**Blocks:** actual runtime Candidate replay.

### Step 1: add RED package-input tests

Create `packages/runtime-babylon/src/babylon-native-package-runtime.test.ts`. Use the existing
`createBabylonNativeWorldPackageTestInputV1()` fixture to construct and verify a package. Assert:

- the loader receives exact Bundle ref/manifest/dependency lock and equal but non-aliased bytes;
- loader invocation count is exactly one;
- the budget equals Package `maximumVertices/maximumTriangles/maximumColliders`;
- each declared asset returns exact locked metadata and a fresh byte copy;
- undeclared refs fail closed with a stable diagnostic;
- descriptor/Package root, Scene Source, Bundle ref, Bootstrap and World Build Identity mismatches
  fail before loader or Engine allocation; and
- loader failure and invalid returned module do not expose private error text or paths.

Expected RED: no formal package input helper exists.

### Step 2: implement package preflight

Create `packages/runtime-babylon/src/babylon-native-package-runtime.ts` with:

- `BabylonNativeSceneModuleLoadRequestV1`;
- `BabylonNativeSceneModuleLoaderV1`;
- one internal `prepareBabylonNativeRuntimePackageV1()`;
- one Package-derived `BabylonNativeLockedAssetResolverV1`; and
- stable internal failure types/codes consumed by `BabylonWorldRuntime`.

Add `@whitebox-world/world-package` as a direct dependency of `runtime-babylon`. Do not export a
second authoring API or accept raw module/assets/budget arguments.

### Step 3: verify and commit

```bash
pnpm exec vitest run packages/runtime-babylon/src/babylon-native-package-runtime.test.ts
pnpm --filter @whitebox-world/runtime-babylon exec tsc --noEmit
git diff --check
git add packages/runtime-babylon pnpm-lock.yaml
git commit -m "feat(runtime): prepare verified native packages"
```

## 5. Task BNA4-30 — replay and exact Contribution match

**Consumes:** prepared Package source and one Candidate Scene.  
**Produces:** an audited actual Contribution identical to the Package.  
**Blocks:** Surface/Havok allocation.

### Step 1: rewrite Native runtime RED tests

Update the Native cases in `packages/runtime-babylon/src/runtime.test.ts` to use a verified package
and loader. Add instrumentation for initialization stages and prove:

- the exact package succeeds and reports the locked Contribution/hash;
- changed module geometry, collider order, material ratio, spawn or Scene Module ID rejects with
  `WORLDKIT_NATIVE_SCENE_RUNTIME_CONTRIBUTION_MISMATCH`;
- mismatch stops before `havok`, `subjects`, `camera` and `ready` stages;
- a module authority mutation still rejects before those stages and disposes the Candidate Scene;
- a loader returning a different Module ref/ID rejects; and
- two creates replay independently and produce the same Contribution hash.

Expected RED: the raw runtime source accepts the caller Module and has no packaged exact-match gate.

### Step 2: replace the raw branch

Modify `packages/runtime-babylon/src/babylon-world-runtime.ts`:

- replace raw Native source fields with verified Package + loader;
- call BNA4-20 preflight and loader;
- invoke `admitBabylonNativeSceneCandidateV1()` once in the actual Candidate Scene;
- compare canonical Contribution bytes and hash with the verified Package and receipt identity;
- preserve shared Runtime Bootstrap matching; and
- publish the Native admission callback only after exact match.

Do not enable Havok or construct Runtime entities before the match.

### Step 3: verify and commit

```bash
pnpm exec vitest run packages/runtime-babylon/src/babylon-native-package-runtime.test.ts \
  packages/runtime-babylon/src/runtime.test.ts
git diff --check
git commit -am "feat(runtime): replay packaged native contribution"
```

## 6. Task BNA4-40 — Surface profile and supported spawn

**Consumes:** exact frozen Contribution, Registry Lock and controlled Subject descriptor.  
**Produces:** admitted Surface records and spawn support used by private Havok proxies.  
**Blocks:** formal readiness and BWB-4.

### Step 1: create pure RED geometry tests

Create `packages/runtime-babylon/src/babylon-native-surface-admission.test.ts` covering asymmetric
triangles and both winding orders. Include:

- flat support at exact feet Y;
- barycentric support on a non-axis-aligned triangle;
- overlapping supports selecting the topmost eligible face;
- edge/vertex points with deterministic tolerance behavior;
- missing, floating, underground and outside spawn;
- `not-traversable` collider under spawn;
- downward/vertical/too-steep triangles;
- duplicate/missing traversal lock membership;
- an initial capsule obstructed by a higher triangle; and
- stable collider/surface/subshape IDs in the result.

Expected RED: no Native Surface admission function exists.

### Step 2: implement pure Surface admission

Create `packages/runtime-babylon/src/babylon-native-surface-admission.ts`:

- use Babylon `Vector3` for triangle math;
- resolve only the current built-in locked Traversal Surface Profile;
- select subject-slope-compatible upward faces using controlled Subject `maxSlopeDegrees`;
- compute deterministic XZ point-in-triangle and interpolated support Y;
- enforce exact feet support within `0.0001 m` and initial capsule clearance; and
- return immutable Host-private records or stable diagnostics, never provider handles.

### Step 3: attach Havok proxies and prove support

Modify `babylon-world-runtime.ts` and existing physics/query tests:

- run Surface admission before Havok;
- create one private Mesh/shape/aggregate per admitted collider;
- retain blocking `not-traversable` colliders without Surface publication;
- use the frozen metadata for query/support projection;
- dispose aggregate, supplied shape and private Mesh exactly once in the designed order; and
- prove disposing the visual proxy does not remove collision.

Run focused real-Havok tests including flat support, step traversal and ledge departure.

### Step 4: verify and commit

```bash
pnpm exec vitest run packages/runtime-babylon/src/babylon-native-surface-admission.test.ts \
  packages/runtime-babylon/src/runtime.test.ts \
  packages/runtime-babylon/src/babylon-character-body-port.conformance.test.ts \
  packages/runtime-babylon/src/traversal-runtime-support-conformance.test.ts
git diff --check
git commit -am "feat(runtime): admit native havok surfaces"
```

## 7. Task BNA4-50 — one formal composition path and clean break

**Consumes:** source-neutral RuntimeHost descriptor and formal Babylon Package source.  
**Produces:** the Cloud Ridge example on the real RuntimeHost path, with no raw Native caller.

### Step 1: add migration/clean-break RED assertions

Extend `apps/native-scene-playground/src/native-package-migration.test.ts` and Runtime clean-break
tests to reject:

- `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`;
- Native Runtime source keys `module`, `assets` and `budget`;
- direct `BabylonWorldRuntime.create()` in the Native Playground;
- parallel `createNativeRuntime*`/legacy/V2 entry points; and
- unverified package construction at the Runtime boundary.

### Step 2: implement one Adapter composition root

Add a Native Playground Adapter factory that:

- owns a map from exact `worldPackageRef` to a verified Package;
- loads the exact emitted Module Bundle through the Host loader;
- creates `BabylonWorldRuntime` from the formal Package source;
- exposes the existing `GameplayWorldPortV1` and readiness barrier; and
- disposes the Runtime through the WorldSession lifecycle.

Build Cloud Ridge's development Package through the existing BNA-3 trusted package builder. Keep the
Module pure. Correct its spawn marker to exact Surface feet Y and rebuild all Package identities;
do not patch the Runtime to tolerate the airborne marker.

### Step 3: delete the raw path

Delete old raw option types, helpers, tests and imports in the same tree. Update the one Native
Playground call site and docs. Do not keep a compatibility overload.

### Step 4: verify and commit

```bash
pnpm exec vitest run apps/native-scene-playground/src/native-package-migration.test.ts \
  apps/native-scene-playground/src/cloud-ridge-scene.test.ts \
  packages/runtime-babylon/src/runtime-clean-break.test.ts
pnpm build:native-scene
git diff --check
git commit -am "feat(native): route cloud ridge through runtime host"
```

## 8. Task BNA4-60 — atomic lifecycle and real-runtime evidence

### Step 1: add adversarial integration cases

Add or extend focused RuntimeHost/Babylon integration tests for:

- initial create success and ready publication;
- initial partial failure at loader/Scene/admission/Havok/Subject/Camera/readiness;
- Canonical -> Native, Native -> Canonical and Native -> Native replacement;
- failed replacement preserving exact old publication and active handles;
- reset restoring the same spawn/support/Camera without rerunning the Module;
- 30/60/120-like render cadence producing identical authoritative hashes;
- two hosts sharing one Package but no mutable Runtime state; and
- disposal where one owned disposer throws while later resources are still attempted.

### Step 2: repair ownership at the closest boundary

Fix only the owner revealed by each RED test. Use an explicit idempotent owned-resource stack when
needed. Do not swallow cleanup failure, replace deterministic order with `Promise.all`, or use Scene
disposal as proof of body/shape ownership.

### Step 3: run affected gates once

```bash
pnpm exec vitest run packages/runtime-host/src/runtime-host-lifecycle.test.ts \
  packages/runtime-babylon/src/babylon-native-package-runtime.test.ts \
  packages/runtime-babylon/src/babylon-native-surface-admission.test.ts \
  packages/runtime-babylon/src/runtime.test.ts
pnpm typecheck
pnpm test:studio
pnpm build
pnpm build:native-scene
pnpm verify:native-scene-playground
pnpm verify:bna1-clean-break
pnpm verify:unreleased-clean-break
git diff --check
```

Commit only after all affected evidence is green:

```bash
git commit -am "test(bna4): close native runtime lifecycle"
```

## 9. Task BNA4-90 — exact-SHA closure

### Step 1: write the candidate review

Create `docs/reviews/2026-08-30-bna4-runtime-surface-admission-review.md` using the repository's
full-dimension protocol and runtime-deep checklist. Include:

- exact candidate SHA and base;
- D1 through D6;
- installed Babylon `9.23.0` and Havok `1.3.14` source evidence;
- Package/Contribution/Surface/Havok cutoffs;
- create/replace/reset/dispose and cleanup evidence;
- Canonical regression evidence; and
- every command with exit/result.

### Step 2: independent Cursor Cloud gates and review

Push the exact candidate SHA. Launch two separate Cloud Agents using
`cursor-grok-4.6-xhigh-fast`:

1. full affected/full repository gates on the exact SHA;
2. independent Mode B + runtime-deep review on the same exact SHA.

A GO is valid only for that SHA. Fix each confirmed P0/P1/P2 with a focused RED-to-GREEN test, rerun
only invalidated gates, then issue a new candidate SHA and new exact-SHA review.

### Step 3: switch truth only after GO

Update:

- `docs/18-refactor-progress-and-backlog.md` to mark BNA-4 complete;
- the long Native design current-fact table;
- this plan with completion evidence; and
- the BNA-4 review with final Cloud run IDs/results.

Do not mark BNA-5/BNA-6/BNA-7/BNA-8 or BWB-4 complete.

### Step 4: PR and merge

Create a focused PR, merge into `main`, fetch, and prove:

```bash
git merge-base --is-ancestor <final-product-sha> origin/main
git status --short --branch
```

Record the PR, merge SHA and ancestry proof, then create the next small WRC-1 branch from the merged
`origin/main`.

## 10. Stop conditions

Stop implementation and return to design only if:

- verified Package data cannot prove an identity required before Module execution;
- supporting spawn would require a second support owner or a change to PR #41 movement authority;
- the Host loader would need to become persistent JSON or provider API;
- Babylon/Havok installed source contradicts the ownership/disposal sequence; or
- a required change creates a second Runtime, compatibility path or Native-specific Gameplay state.

Ordinary test failures, engine edge cases, fixture migrations and cleanup defects are implementation
work, not reasons to weaken the design or postpone the current-only clean break.


# SDK Audit Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the confirmed correctness and contract-integrity findings in the 2026-08-20 SDK audits, append evidence-backed dispositions, merge to `main`, and push.

**Architecture:** Solved layout transforms and the rendered triangle terrain become single authorities; Registry discovery converges on one V3 G Bot product definition; host gates reject states the runtime cannot prove; demo-only transformations and canonical hashing become explicit and closed. Each task is TDD-first and independently committed before the final whole-branch verification.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Babylon.js/Havok, AJV, Vite, Playwright, Git.

**Spec:** `docs/superpowers/specs/2026-08-21-sdk-audit-closure-design.md`

## Global Constraints

- Preserve the existing AI-facing naming rules in `AGENTS.md`; new numeric fields include units and new resource references end in `Ref`.
- Solved Anchor transforms are absolute world-space values. Do not reinterpret their Y component as an offset.
- `forwardDirection: "-z"` remains the asset-forward convention; initial world facing is a separate `spawnSubjectFacingRadians` value.
- Terrain queries match the actual `TL-BL-TR` / `TR-BL-BR` triangle diagonal used by render and physics.
- Use the single canonical product Ref `worldkit://subject-definition/humanoid.g-bot@1`; no compatibility alias is required because the SDK is unreleased.
- Do not implement relationships, swimming, five-pass capture, a new camera algorithm, vehicles, NPC behavior, or generic action-catalog work.
- Do not filter `Beta_Joints` by name.
- Every production change starts with a focused failing regression and ends with its focused suite green.
- Original external review text is append-only; disposition sections may be added but existing findings must not be rewritten.

---

### Task 1: Make solved transforms and terrain surface authoritative

**Files:**
- Create: `packages/terrain-surface/package.json`
- Create: `packages/terrain-surface/src/index.ts`
- Create: `packages/terrain-surface/src/terrain-surface.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/layout-solver/package.json`
- Modify: `packages/layout-solver/src/geometry.ts`
- Modify: `packages/layout-solver/src/geometry.test.ts`
- Modify: `packages/compiler/package.json`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`
- Modify: `packages/runtime-babylon/package.json`
- Modify: `packages/runtime-babylon/src/terrain.ts`
- Modify: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `packages/world/package.json`
- Modify: `packages/world/src/terrain.ts`
- Modify: `packages/world/src/scene.test.ts`
- Modify: `scripts/verify-placement-layout.ts`
- Modify generated canonical example artifacts whose hashes or execution fields change.

**Interfaces:**
- Produces: `sampleTriangleHeightfieldSurface(input, pointMetersXZ)` returning height, normal, and slope from the canonical mesh diagonal.
- Produces: `ExecutionSubjectV3.spawnSubjectFacingRadians: number`.
- Consumes: solved Anchor `positionMetersXYZ` and `rotationEulerRadiansXYZ[1]` without terrain resampling.

- [ ] **Step 1: Add RED terrain parity tests**

  Add a non-symmetric 2×2 saddle fixture with heights `[0, 2, 4, 0]` and assert the center samples the canonical triangle at `3m`, including a finite normalized normal and matching slope. Assert Layout, Compiler, Babylon terrain helper, and legacy `Heightfield.sampleHeight()` agree on the same value.

- [ ] **Step 2: Run the focused terrain tests and capture RED**

  Run `pnpm vitest run packages/layout-solver/src/geometry.test.ts packages/compiler/src/compile.test.ts packages/world/src/scene.test.ts` and confirm the current bilinear paths fail the saddle expectation.

- [ ] **Step 3: Implement one shared triangle-surface sampler**

  Create the package-local deterministic helper, declare direct workspace dependencies, and replace duplicated height interpolation. Preserve existing out-of-bounds and finite-value validation at each public adapter boundary.

- [ ] **Step 4: Add RED solved-position and facing tests**

  In Compiler tests, compile a solved Anchor on non-zero/non-flat terrain and assert the Execution spawn position equals the Anchor exactly. Set Anchor Y rotation to `Math.PI / 2` and assert `spawnSubjectFacingRadians` is preserved. In Runtime tests, assert construction and reset both retain that yaw and its derived forward vector.

- [ ] **Step 5: Implement absolute spawn projection and runtime yaw**

  Copy `spawnAnchor.transform.positionMetersXYZ` directly, project the Anchor Y rotation into `spawnSubjectFacingRadians`, initialize `MotionKernelRuntimeV1.yawRadians` from it, and restore it during reset. Keep `forwardDirection: "-z"` unchanged.

- [ ] **Step 6: Strengthen placement verification**

  Migrate the placement fixture or verifier to a non-zero height case and assert exact solved-position parity plus non-zero facing parity. Regenerate only deterministic artifacts affected by the contract change.

- [ ] **Step 7: Run Task 1 gates and commit**

  Run focused suites, `pnpm typecheck`, `pnpm verify:placement-layout`, `pnpm verify:canonical`, and `git diff --check`. Commit as `fix: unify solved transforms and terrain surface`.

---

### Task 2: Converge G Bot Registry discovery on one product definition

**Files:**
- Modify: `packages/subject-registry/src/built-in-subject-definitions.ts`
- Modify: `packages/subject-registry/src/built-in-resource-manifests.ts`
- Modify: `packages/subject-registry/src/subject-resource-registry.ts`
- Modify: `packages/subject-registry/src/subject-registry.test.ts`
- Modify: `assets/registry/subject-definitions/catalog.json`
- Modify: G Bot Authoring example and deterministic artifacts under `examples/authoring/` and `artifacts/examples/`.
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: `packages/runtime-babylon/src/capability-runtime.test.ts`
- Modify: G Bot verifier expectations and generated evidence when hashes change.

**Interfaces:**
- Produces: one V3 `worldkit://subject-definition/humanoid.g-bot@1` containing capability assembly, camera/seat sockets, and `hand.right`.
- Removes: `worldkit://subject-definition/humanoid.g-bot.ground@1` from public discovery.
- Guarantees: CLI and Browser discovery return the same canonical Ref and Registry hash.

- [ ] **Step 1: Add RED Registry/discovery tests**

  Assert the exact G Bot Definition Ref set contains only `humanoid.g-bot@1`; assert CLI-style and Browser capability lists resolve the same resource/hash; assert the Definition contains `FirstPersonView`, `ThirdPersonTarget`, `CameraTarget3D`, `LookAhead`, `SeatAlignment`, and `hand.right` exactly once.

- [ ] **Step 2: Run Registry, Browser, and capability tests and capture RED**

  Run `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts apps/playground/src/worldkit-browser-api.test.ts packages/runtime-babylon/src/capability-runtime.test.ts`.

- [ ] **Step 3: Merge the product definition and remove the duplicate**

  Upgrade the canonical `@1` definition to V3 capability shape, preserve its product asset/Rig/Animation/Collider refs, merge all approved sockets, delete `.ground@1`, and update Registry lock hashes through the existing canonical lock implementation.

- [ ] **Step 4: Migrate all consumers and artifacts**

  Update examples, runtime tests, verifier inputs, explain output, and deterministic artifacts. Do not introduce an alias or migration layer.

- [ ] **Step 5: Run Task 2 gates and commit**

  Run focused suites, `pnpm typecheck`, `pnpm verify:g-bot-subject`, `pnpm verify:rigged-subject`, `pnpm verify:canonical`, and `git diff --check`. Commit as `fix: unify g bot product discovery`.

---

### Task 3: Make spawn, composition, and capability gates truthful

**Files:**
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/world/src/scene.ts`
- Modify: `packages/world/src/scene.test.ts`
- Modify: `packages/testkit/src/spawn-safety.ts`
- Modify: `packages/testkit/src/testkit.test.ts`
- Create or modify: a pure composition-gate helper under `scripts/lib/` with focused tests.
- Modify: `scripts/export-scene-plan.ts`
- Modify: `scripts/validate-visual-package.ts`
- Modify: `apps/playground/vite.config.mjs`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`
- Modify: capability Registry statuses only where the runtime demonstrably lacks an implementation.
- Modify deterministic scene manifests/reports only when required by the new trusted-host gate.

**Interfaces:**
- Produces: deterministic spawn-overlap diagnostics for blocked water and static blocking objects.
- Produces: a trusted-host composition decision derived from persisted report inputs and current plan identity.
- Produces: `validateSubjectPackage` diagnostics that cover unavailable relationship/runtime requirements and do not overclaim package validity.

- [ ] **Step 1: Add RED blocked-spawn tests**

  Add Canonical and outdoor fixtures whose spawn point lies inside blocked water and inside a static blocking object footprint; assert stable diagnostics and compile failure. Add allowed fixtures for outside-water and explicitly walkable surface cases.

- [ ] **Step 2: Implement shared spawn-footprint checks**

  Reuse existing boundary geometry helpers where possible. Keep `blocked`, `walkable`, and `swimmable` distinct; do not add swimming behavior. Reject only evidence the compiler can prove from current Schema.

- [ ] **Step 3: Add RED composition lifecycle tests**

  Assert a reference-guided scene with a missing, stale, or `pass: false` report cannot receive `workflowStage: "verified"`, cannot write an opening frame, and cannot pass visual finalization. Assert a current passing report remains accepted.

- [ ] **Step 4: Implement trusted-host composition gating**

  Extract a pure report validation helper. Bind the report to the current plan/lock inputs available in the existing format, reject `pass: false`, and make export/finalize/write routes consume that helper instead of a client boolean. Do not redesign the composition algorithm.

- [ ] **Step 5: Add RED package-capability validation tests**

  Assert packages that require unavailable seat/tether relationship behavior or an unavailable runtime kernel/profile return stable diagnostics. Assert the canonical G Bot baseline package remains valid. Add a behavior test before changing any catalog `runtimeStatus`.

- [ ] **Step 6: Tighten package validation and honest statuses**

  Validate the runtime resources actually consumed by the current capability runtime. Correct demonstrably false `implemented` statuses, but retain velocity-chase when its generic Director behavior satisfies the current profile contract.

- [ ] **Step 7: Run Task 3 gates and commit**

  Run focused Compiler/World/Testkit/Browser/script tests, `pnpm test:scenes`, `pnpm typecheck`, `pnpm plan:scene:check -- --scene world-08170639-54db`, and `git diff --check`. Commit as `fix: enforce truthful sdk quality gates`.

---

### Task 4: Make demo overlays and canonical hashing explicit

**Files:**
- Modify: `apps/playground/package.json`
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: Browser diagnostics/receipt types and tests only as required to expose overlay identity.
- Modify: `packages/protocol/src/canonical-json.ts`
- Modify: `packages/protocol/src/canonical-json.test.ts`
- Modify lockfile through `pnpm install --lockfile-only` only if dependency metadata changes it.

**Interfaces:**
- Produces: an explicit deterministic capability-demo overlay descriptor/identity returned with the loaded result; input Authoring Spec remains unmodified.
- Produces: canonical JSON rejection for non-plain objects, `Map`, `Date`, Set, and typed arrays.

- [ ] **Step 1: Add RED overlay tests**

  Freeze a source Authoring Spec, apply water/glide demo options, and assert the source remains deeply equal and frozen. Assert the result carries an explicit overlay ID and describes the applied spawn/budget transformation; no overlay yields no descriptor.

- [ ] **Step 2: Implement explicit immutable overlay results**

  Preserve the existing demo behavior but return it as an explicit host transformation with deterministic identity and diagnostics. Ensure CLI build continues to consume the unmodified source.

- [ ] **Step 3: Add RED canonical-object tests**

  Assert `canonicalJsonStringify`/hash rejects `Map`, `Set`, `Date`, typed arrays, class instances, and null-prototype objects with stable path-aware errors; arrays and plain objects remain accepted.

- [ ] **Step 4: Implement plain-object enforcement and direct dependency**

  Check object prototypes before key sorting. Add `@whitebox-world/subject-registry` as a direct Playground workspace dependency and update lock metadata using pnpm.

- [ ] **Step 5: Run Task 4 gates and commit**

  Run focused Authoring Loader/Protocol/Browser tests, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Commit as `fix: expose host overlays and harden canonical json`.

---

### Task 5: Append audit dispositions, perform whole-branch review, merge, and push

**Files:**
- Modify append-only: `docs/reviews/2026-08-20-sdk-full-audit.md`
- Modify append-only: `docs/reviews/2026-08-20-sdk-protocol-gates-terrain-audit.md`
- Modify append-only: `docs/reviews/2026-08-20-real-model-binding-review.md`
- Modify: `docs/18-refactor-progress-and-backlog.md` only if implementation status materially changes.

**Interfaces:**
- Produces: one disposition row per original finding with `fixed`, `deferred`, `rejected`, or `already closed`, plus commit/test evidence.
- Produces: a clean feature branch that can be fast-forwarded or merged into `main` and pushed without unrelated files.

- [ ] **Step 1: Independently review the combined branch**

  Compare the exact base-to-head diff against the accepted design, AGENTS rules, both external audits, and the runtime deep-review checklist. Fix confirmed P0-P2 regressions through a new RED-GREEN round before documenting closure.

- [ ] **Step 2: Append dispositions without rewriting reviewer text**

  Record what changed, what was intentionally deferred, what was rejected as unsupported by evidence, and which earlier findings were already closed. Include exact test/verifier commands and final commit hashes.

- [ ] **Step 3: Run the complete verification matrix**

  Run `pnpm typecheck`, `pnpm test`, `pnpm test:scenes`, `pnpm build`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, and `pnpm verify:g-bot-subject`. Run `git diff --check` and verify no verifier server/temp/backup residue remains.

- [ ] **Step 4: Commit documentation and integration evidence**

  Stage only the three review documents and any approved progress entry. Commit as `docs: disposition sdk audit findings`.

- [ ] **Step 5: Merge to main, reverify, push, and clean worktree**

  Confirm the feature branch descends from the current `main`, integrate it into `main`, rerun the full verification matrix on the merged tree, push `main`, confirm local/remote SHA equality, then remove only the owned audit-closure worktree and branch.

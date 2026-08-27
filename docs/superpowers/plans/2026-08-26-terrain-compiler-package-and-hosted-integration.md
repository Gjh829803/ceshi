# Terrain Compiler Package and Hosted Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote signed Height Intent compilation into `@whitebox-world/terrain-compiler`, establish durable terrain asset discovery, and make image-driven terrain a receipt-bound default stage of the hosted `agent:world` workflow.

**Architecture:** Land two independently verified commits. The first is a behavior-preserving package and asset-ownership migration. The second adds a closed median-datum profile, extends the existing unified Planner task with a scene prompt and Height Intent PNG, preserves Builder output separately, and lets a trusted Host finalizer atomically publish the final AuthoringSpec before existing build/capture gates.

**Tech Stack:** TypeScript 5.9, pnpm workspaces, Vitest, Node.js ESM, shell workflow orchestration, bundled Vite self-checks, sharp PNG decode, Canonical AuthoringSpec V4.

**Spec:** `docs/superpowers/specs/2026-08-26-terrain-compiler-package-and-asset-ownership-design.md`

## Global Constraints

- Work only in `.worktrees/terrain-generation` on `codex/terrain-generation`; merge into `main` only after the final gates pass and the user explicitly approves integration.
- Keep package promotion and hosted integration as two separate commits.
- Runtime never reads planning PNG bytes; only final metric Authoring samples enter build/capture.
- Planner owns image semantics, Builder owns exact world scale/structure, the package owns deterministic conversion, and trusted Host owns validation and publication.
- Do not add Provider, Gemini, LWDP, S3, Babylon, Havok, Browser, Runtime, or credential dependencies to `@whitebox-world/terrain-compiler`.
- Keep `pnpm terrain:intent:compile` and its flags/exit behavior stable.
- Do not silently fall back to procedural terrain in the hosted path.
- Preserve all existing Green Sahara and terrain-experiment artifacts.
- Apply TDD for every behavior change: write the real behavior test, run it red for the intended reason, implement minimally, then rerun green.

---

### Task 1: Freeze the package public boundary

**Files:**
- Create: `packages/terrain-compiler/package.json`
- Create: `packages/terrain-compiler/src/index.ts`
- Create: `packages/terrain-compiler/src/index.test.ts`
- Move: `scripts/terrain-height-intent/*.ts` into responsibility directories under `packages/terrain-compiler/src/`
- Modify: `package.json`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Produces: package root export `compileTerrainHeightIntent(input: CompileTerrainHeightIntentInput): Promise<CompileTerrainHeightIntentResult>` and its input/result/report/diagnostic types.
- Keeps private: decode, projection, filters, resampling, constraint mutation, CLI parsing, and filesystem publication.

- [ ] **Step 1: Write the failing package-boundary test**

```ts
import * as terrainCompiler from "@whitebox-world/terrain-compiler";

it("exports only the supported Height Intent compiler boundary", () => {
  expect(Object.keys(terrainCompiler).sort()).toEqual([
    "compileTerrainHeightIntent",
  ]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec vitest run packages/terrain-compiler/src/index.test.ts`

Expected: FAIL because the workspace package does not exist.

- [ ] **Step 3: Add the private package and move implementation with no algorithm changes**

Use one export map:

```json
"exports": { ".": "./src/index.ts" }
```

Declare direct dependencies on `@whitebox-world/authoring`, `@whitebox-world/protocol`, `@whitebox-world/terrain-surface`, and `sharp`. Extract the current inline compile input object as `CompileTerrainHeightIntentInput`. Update ESM-relative imports and the root CLI target, and move every test-gate path without changing census count.

- [ ] **Step 4: Run package and CLI tests GREEN**

Run: `pnpm exec vitest run packages/terrain-compiler/src/**/*.test.ts scripts/lib/test-gate-census.test.ts`

Expected: all moved terrain tests and public-boundary test pass.

- [ ] **Step 5: Run package boundary checks**

Run: `pnpm verify:workspace-boundaries && pnpm test:census && pnpm typecheck`

Expected: exit `0` for all commands.

### Task 2: Establish durable terrain discovery and curated assets

**Files:**
- Create: `packages/terrain-compiler/README.md`
- Create: `assets/terrain-height-intent/README.md`
- Create: `assets/terrain-height-intent/golden-exemplars.json`
- Create: accepted family-specific PNGs under `assets/terrain-height-intent/exemplars/`
- Modify: `AGENTS.md`
- Modify: `.codex/skills/worldkit-spatial-planner/references/terrain-height-intent-prompt.md`
- Modify: current terrain specs/reviews with dated promotion notes

**Interfaces:**
- Produces: one canonical human/AI discovery chain and a hash-locked accepted-exemplar manifest.
- Consumes: measured experiment evidence; a candidate remains in `artifacts/terrain-experiments` unless its manifest row is explicitly `status: "accepted"`.

- [ ] **Step 1: Write a failing manifest behavior test**

Create `packages/terrain-compiler/src/exemplar-manifest.test.ts` that reads the real manifest and, for every row, asserts a closed terrain family, `status === "accepted"`, an existing repository-relative PNG path, and a literal SHA-256 match.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec vitest run packages/terrain-compiler/src/exemplar-manifest.test.ts`

Expected: FAIL because the manifest does not exist.

- [ ] **Step 3: Add the manifest, accepted family assets, and canonical documentation**

Use this manifest envelope:

```json
{
  "schemaVersion": 1,
  "kind": "worldkit-terrain-height-intent-golden-exemplars",
  "exemplars": []
}
```

Populate only evidence-backed family-specific rows and record source experiment, encoding profile, prompt role, and limitations. Add `AGENTS.md` entry points for package, CLI, Planner prompt, manifest, experiments, and formal scene artifacts.

- [ ] **Step 4: Run manifest and link checks GREEN**

Run: `pnpm exec vitest run packages/terrain-compiler/src/exemplar-manifest.test.ts scripts/planner-skill.test.ts`

Expected: all tests pass and every accepted asset hash matches.

### Task 3: Verify and commit the package-only milestone

**Files:**
- Modify: `docs/superpowers/specs/2026-08-26-terrain-compiler-package-and-asset-ownership-design.md` status
- Include: implementation plan and package/discovery changes

**Interfaces:**
- Produces: first reviewed commit with no hosted workflow behavior change.

- [ ] **Step 1: Reproduce the Green Sahara migration baseline into a temporary directory**

Run the stable root CLI against the committed selected raster and Builder Authoring; compare generated Authoring/report bytes with the frozen migration baseline using `/usr/bin/cmp`.

- [ ] **Step 2: Run milestone gates**

Run:

```bash
pnpm verify:workspace-boundaries
pnpm test:census
pnpm exec vitest run packages/terrain-compiler/src/**/*.test.ts scripts/planner-skill.test.ts
pnpm typecheck
```

- [ ] **Step 3: Review exact diff and forbidden imports**

Run: `rg -n "@google|gemini|lwdp|s3|babylon|havok|runtime" packages/terrain-compiler || true`

Expected: no forbidden production imports.

- [ ] **Step 4: Commit milestone 1**

```bash
git add AGENTS.md package.json pnpm-lock.yaml packages/terrain-compiler assets/terrain-height-intent scripts/lib/test-gate-manifest.ts .codex/skills/worldkit-spatial-planner/references docs/superpowers docs/reviews
git commit -m "refactor: promote terrain compiler package"
```

### Task 4: Add the closed median-datum profile

**Files:**
- Create: `packages/terrain-compiler/src/raster/normalize-signed-height-raster.ts`
- Create: `packages/terrain-compiler/src/raster/normalize-signed-height-raster.test.ts`
- Modify: `packages/terrain-compiler/src/compile-terrain-height-intent.ts`
- Modify: corresponding compiler tests and `src/index.ts`

**Interfaces:**
- Produces: `compileTerrainHeightIntent({ sourcePngBytes, authoringSpec, normalizationProfileId })`.
- Requires: `normalizationProfileId: "signed-diverging-blue-gray-orange-median-datum@1"`.
- Report adds profile ID, filtered median, applied offset, input/output range, and clamped count.

- [ ] **Step 1: Write failing literal normalization tests**

Cover `[0.4, 0.5, 0.6] -> [-0.1, 0, 0.1]`, asymmetric even-count median, negative offset, clamp after offset, non-finite rejection, and input immutability. Name each wrong production mutation it catches.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run packages/terrain-compiler/src/raster/normalize-signed-height-raster.test.ts`

Expected: FAIL because the median-datum normalizer is missing.

- [ ] **Step 3: Implement deterministic median-datum normalization**

```ts
export const TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE =
  "signed-diverging-blue-gray-orange-median-datum@1" as const;

export function normalizeSignedHeightRasterV1(
  values: ArrayLike<number>,
): NormalizedSignedHeightRasterV1;
```

Sort a copy for median calculation, subtract the median from every sample, clamp only to `[-1, 1]`, and return measurements without mutating the input.

- [ ] **Step 4: Run normalization tests GREEN**

Run the focused normalizer tests, then current compiler tests to prove the package boundary remains intact.

- [ ] **Step 5: Write current compiler RED tests, implement the closed orchestration, and rerun GREEN**

Assert a globally high but varied raster compiles around `baseHeightMeters`, the report records exact normalization measurements, migration baseline hashes remain unchanged, and the public input exposes no caller-selectable profile.

### Task 5: Extend Planner outputs and self-check

**Files:**
- Modify: `scripts/agent-planner-self-check.ts`
- Modify: `scripts/agent-planner-self-check.test.ts`
- Regenerate: `.codex/skills/worldkit-spatial-planner/scripts/self-check.mjs`
- Modify: `.codex/skills/worldkit-spatial-planner/SKILL.md`
- Modify: `.codex/skills/worldkit-spatial-planner/references/terrain-height-intent-prompt.md`
- Modify: `scripts/run-spatial-world-agent.sh`
- Modify: `scripts/planner-skill.test.ts`
- Modify: `scripts/agent-self-check.test.ts`

**Interfaces:**
- Planner self-check adds required `--terrain-prompt` and `--terrain-intent` paths.
- Receipt version advances and binds `terrainHeightIntentPromptHash`, `terrainHeightIntentPngHash`, and projection measurements.

- [ ] **Step 1: Add failing source/bundled parity scenarios**

Create real tiny PNG fixtures for valid signed variation, constant raster, invalid off-ramp colors, non-square dimensions, and stale/missing prompt. Assert returned diagnostics and exact source/bundle receipt parity.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run scripts/agent-planner-self-check.test.ts scripts/planner-skill.test.ts`

Expected: FAIL because the new arguments and receipt fields are absent.

- [ ] **Step 3: Implement Planner validation and update the maintained Skill contract**

Reuse the self-check's real PNG decoder and the package's frozen projection constants without importing package/runtime code into the standalone bundle. Validate square/opaque/bounded bytes, residuals, sign range, near-constant behavior, prompt sections, and receipt hashes.

- [ ] **Step 4: Regenerate the bundled checker and run parity GREEN**

Run:

```bash
pnpm generate:agent-self-check
pnpm check:agent-self-check
pnpm exec vitest run scripts/agent-planner-self-check.test.ts scripts/agent-self-check.test.ts scripts/planner-skill.test.ts
```

- [ ] **Step 5: Update Planner launch contract**

Declare the scene prompt and PNG as outputs of the existing Planner task, include accepted exemplar assets as read-only context, replay the new self-check on Host, and make plan-only require all new files.

### Task 6: Add trusted Host terrain finalization

**Files:**
- Create: `scripts/finalize-scene-terrain.ts`
- Create: `scripts/finalize-scene-terrain.test.ts`
- Modify: `scripts/run-spatial-world-agent.sh`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: workflow tests that exercise the launcher

**Interfaces:**
- Consumes: fresh Planner receipt, Height Intent PNG, Builder receipt, `authoring.builder.json`, Scene Brief, and implementation-map draft.
- Produces atomically: `authoring.json`, `terrain-height-intent-report.json`, `terrain-compilation-manifest.json`, and `final-authoring-self-check.json`.

- [ ] **Step 1: Write failing real-filesystem finalizer tests**

Cover successful publication, Planner hash mismatch, Builder hash mismatch, blocking terrain diagnostics, final self-check failure, pre-existing output refusal/explicit retry behavior, and injected publication failure leaving no partial final set.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run scripts/finalize-scene-terrain.test.ts`

Expected: FAIL because the finalizer is missing.

- [ ] **Step 3: Implement the thin Host finalizer**

Import only package API plus existing Authoring/protocol validators. Hash and validate all inputs, call the current compiler, construct a canonical manifest, stage sibling files, validate staged final Authoring with the source Builder checker, then promote the complete set transactionally.

- [ ] **Step 4: Run finalizer tests GREEN**

Run focused finalizer, compiler, and Builder-check tests.

- [ ] **Step 5: Rewire Builder and downstream stage order**

Make Builder write and self-check `authoring.builder.json`; after Host receipt parity call the finalizer; pass only final `authoring.json` to implementation-map finalization, Canonical build, Route validation, and capture. Build-only rejects old Planner receipts and missing terrain artifacts before launching Builder.

### Task 7: Expose terrain stages and artifacts in Studio

**Files:**
- Modify: `apps/studio/server.mjs`
- Modify: `apps/studio/server.test.mjs`
- Modify: `apps/studio/preview-bootstrap.mjs` and focused tests if its required-artifact model consumes Authoring inputs
- Modify: hosted workflow documentation

**Interfaces:**
- Produces distinct UI/API artifacts for Planner prompt/image, Builder Authoring, terrain report/manifest, final Authoring, and final self-check.

- [ ] **Step 1: Add failing status/artifact matrix tests**

Assert missing terrain image is a Planner-stage failure, Builder-only output is not preview-ready, compiler diagnostics are visible, and the final coherent set advances to Canonical build/capture status.

- [ ] **Step 2: Run Studio tests and verify RED**

Run: `pnpm test:studio`

- [ ] **Step 3: Update phase definitions, artifact paths, labels, and readiness rules**

Keep `authoring.builder.json` and `authoring.json` distinct. Never let preview bootstrap select Builder input when final Authoring is missing.

- [ ] **Step 4: Run Studio tests GREEN**

Run: `pnpm test:studio`

### Task 8: Run integrated real-case verification

**Files:**
- Update/preserve: `artifacts/scenes/green-sahara-caravan/**`
- Update/preserve: `apps/playground/public/scene-plans/green-sahara-caravan/**`
- Preserve: `artifacts/terrain-experiments/016-green-sahara-caravan/**`

**Interfaces:**
- Produces: one inspectable real hosted-equivalent artifact chain and rendered opening evidence using final terrain.

- [ ] **Step 1: Bring the frozen Green Sahara planner artifacts to the new receipt contract**

Use the selected raw Height Intent and its exact prompt as the Planner terrain outputs, preserving hashes and provenance. Preserve the old experiment copies.

- [ ] **Step 2: Preserve Builder Authoring and run trusted Host finalization**

Copy the exact pre-terrain formal Authoring to `authoring.builder.json`, replay Builder validation, run the Host finalizer, and inspect normalization and constraint diagnostics.

- [ ] **Step 3: Run downstream gates**

Run final implementation-map creation, `worldkit build`, required Route validation, `worldkit capture`, and `validate-entry-third-person.py` against final `authoring.json`.

- [ ] **Step 4: Verify determinism**

Run finalization into a clean temporary directory and byte-compare final Authoring, report, and manifest content fields that are intentionally run-independent.

### Task 9: Full verification and integration commit

**Files:**
- All milestone 2 source, tests, docs, and real-case evidence

**Interfaces:**
- Produces: second branch commit with hosted integration complete and no merge to `main`.

- [ ] **Step 1: Run focused and repository gates**

```bash
pnpm verify:workspace-boundaries
pnpm test:census
pnpm test
pnpm test:studio
pnpm typecheck
pnpm build
pnpm check:agent-self-check
```

- [ ] **Step 2: Run secret and forbidden-dependency scans**

Confirm no private token/config path, token value, Provider import, or Runtime import entered the package, artifacts, logs, prompts, or Git diff.

- [ ] **Step 3: Review acceptance criteria against fresh evidence**

Check every item in the design spec section 14 and record any scoped caveat instead of hiding it.

- [ ] **Step 4: Commit milestone 2**

```bash
git add AGENTS.md package.json pnpm-lock.yaml packages/terrain-compiler scripts apps/studio .codex/skills/worldkit-spatial-planner docs artifacts/scenes/green-sahara-caravan apps/playground/public/scene-plans/green-sahara-caravan artifacts/terrain-experiments/016-green-sahara-caravan
git commit -m "feat: integrate image-driven terrain generation"
```

- [ ] **Step 5: Verify branch state**

Run `git status --short --branch`, `git log -2 --oneline`, and compare upstream state. Do not merge into `main`.

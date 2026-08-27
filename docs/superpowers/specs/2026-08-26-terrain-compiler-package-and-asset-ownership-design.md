# Terrain Compiler Package, Asset Ownership, and Hosted Pipeline Integration Design

**Status:** Approved

**Date:** 2026-08-26

**Scope:** Promote the proven signed Height Intent Host compiler into its intended workspace package, establish durable terrain asset ownership, then integrate Height Intent generation and deterministic compilation into the hosted scene-generation pipeline.

## 1. Context

The signed Height Intent vertical slice initially lived under
`scripts/terrain-height-intent/`. That was an intentional incubation boundary: the
implementation plan required the Host probe to remain a script until its
Canonicalization and Constraint behavior passed the Development Gate without
introducing Provider or Runtime dependencies.

That condition is now satisfied:

- PNG decode, signed color projection, scalar filtering, resampling, metric mapping,
  quantization, Authoring constraint derivation, constraint application, compilation,
  reporting, and CLI publication have focused contract coverage.
- The compiler has been exercised by multiple terrain experiments and a formal Green
  Sahara scene case.
- Compiled output has passed deterministic replay and downstream Authoring/runtime
  validation for the supported slice.
- A second formal consumer is now required: the trusted Host scene-generation pipeline,
  in addition to direct CLI use.

The authoritative terrain pipeline design already reserves
`packages/terrain-compiler` and the package name
`@whitebox-world/terrain-compiler` for this responsibility. Keeping the proven
implementation indefinitely under `scripts/` would now obscure its ownership,
allow root-only dependency leakage, and make supported APIs indistinguishable from
one-off orchestration.

Package promotion and hosted integration are two ordered milestones. The package move
must first prove byte-equivalent behavior in an isolated commit. Only that verified
package API may then become a dependency of the hosted workflow in a second commit.
This keeps an organizational migration from hiding pipeline or algorithm changes.

## 2. Goals

1. Establish one durable, engine-independent owner for deterministic Height Intent
   compilation.
2. Keep the public package surface intentionally small while allowing internal
   algorithms to evolve.
3. Preserve the existing root CLI command and behavior during promotion.
4. Give human developers and AI agents one canonical discovery map for code, prompts,
   fixtures, reference exemplars, experiments, and formal scene artifacts.
5. Prevent experimental images from silently becoming universal prompt references or
   compiler fixtures.
6. Preserve the frozen Planner, Host, Compiler, Runtime, and artifact authority
   boundaries.
7. Make Height Intent a normal, receipt-bound Planner output for new hosted outdoor
   worlds, then compile it on the trusted Host before Canonical build and capture.
8. Remove manual case-local preprocessing from the production path by freezing a
   deterministic, versioned datum-normalization profile.
9. Fail closed with inspectable artifacts when image generation, terrain compilation,
   final Authoring validation, Route validation, or capture cannot satisfy its owner.

## 3. Non-goals

- Milestone 1 does not change Height Intent encoding, normalization, clipping,
  smoothing, quantization, constraint priority, or Authoring output semantics.
- Milestone 2 replaces the private incubation API with one current normalization and
  compilation contract after Milestone 1 equivalence passes. No compatibility alias or
  selectable legacy behavior remains.
- It does not add Image2, Gemini, LWDP, S3, Babylon, Havok, Browser, or Runtime
  dependencies to the compiler.
- It does not create new public Authoring Schema or Source IDs.
- It does not split the implementation into `core`, `cli`, `provider`, or `runtime`
  packages. A split is justified only by independent versioning, dependencies,
  publication, or multiple implementations.
- It does not rewrite historical plans and reviews as if the implementation had always
  lived in a package. Historical documents receive a concise promotion note when needed;
  their original evidence remains intact.
- It does not add an automatic Planner Repair or Builder Repair task after Host terrain
  compilation. A failed Host gate ends the attempt with diagnostics.
- It does not make generated PNG pixels authoritative Runtime data. Only constrained,
  metric Authoring height samples published by the trusted Host enter downstream build.

## 4. Decision

Promote the deterministic implementation to one private workspace package:

```text
packages/terrain-compiler/
  package.json
  README.md
  src/
    index.ts
    compile-terrain-height-intent.ts
    canonicalization/
      decode-png.ts
      project-signed-rgb.ts
      summarize-projection.ts
    raster/
      prefilter-scalar-raster.ts
      resample-scalar-raster.ts
      map-height-meters.ts
      quantize-height-samples.ts
    constraints/
      terrain-constraint-types.ts
      derive-authoring-constraints.ts
      apply-terrain-constraints.ts
    cli/
      run-terrain-height-intent-cli.ts
      main.ts
    *.test.ts or responsibility-local *.test.ts
```

The package is private and source-consumed like the existing workspace packages. It
uses an explicit package export map:

```json
{
  "name": "@whitebox-world/terrain-compiler",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

The public package entry exports only the Host compilation boundary and the result,
report, diagnostic, and input types needed to call it. Projection, filtering,
resampling, constraint mutation, PNG decoding, and CLI helpers remain package-private.
They keep focused tests but are not supported cross-package APIs.

The root command remains stable:

```text
pnpm terrain:intent:compile
```

Its implementation target moves from `scripts/terrain-height-intent/cli.ts` to the
package's `src/cli/main.ts`. The CLI is not exported as a package subpath and is not a
separate protocol. Root orchestration may invoke it, while programmatic consumers use
the package root export.

This follows pnpm's workspace dependency model, in which every package declares the
libraries it imports directly, and Node's package export-map model, in which supported
entry points are explicit and internal modules remain encapsulated:

- https://pnpm.io/workspaces
- https://nodejs.org/api/packages.html#package-entry-points

## 5. Dependency Direction

Initial direct runtime dependencies are limited to what the implementation imports:

```text
@whitebox-world/terrain-compiler
  -> @whitebox-world/authoring
  -> @whitebox-world/protocol
  -> @whitebox-world/terrain-surface
  -> sharp
```

The actual `package.json` must declare those dependencies directly using
`workspace:*` for workspace packages. Test-only dependencies continue to come from the
repository's established test harness unless workspace-boundary verification requires
a direct development declaration.

Forbidden dependencies and imports:

```text
Image provider / Gemini / LWDP / S3
Planner task execution
Babylon / Havok / Runtime adapters
Browser capture
scene-owned artifact paths
private runtime configuration or credentials
```

The dependency direction remains:

```text
Planner or Host image generation
  -> untrusted PNG bytes + frozen AuthoringSpec
  -> @whitebox-world/terrain-compiler
  -> trusted compiled AuthoringSpec + structured report
  -> existing Canonical Compiler and Runtime path
```

Runtime never reads the planning image. The compiler never invokes the image provider.

## 6. Public API Boundary

The supported API is one current semantic operation:

```ts
compileTerrainHeightIntent(
  input: CompileTerrainHeightIntentInput,
): Promise<CompileTerrainHeightIntentResult>
```

The package root exports:

- `compileTerrainHeightIntent`;
- `CompileTerrainHeightIntentInput`;
- `CompileTerrainHeightIntentResult`;
- `TerrainHeightIntentCompileReport`;
- the closed diagnostic types required to consume the report.

The package root does not export:

- raw PNG decode helpers;
- individual raster filters or resamplers;
- constraint mutation helpers;
- CLI parsing or filesystem publication;
- test factories;
- provider-specific profiles.

This prevents an incidental implementation pipeline from becoming a permanent
multi-entry public API. A future caller needing a lower-level operation must first
establish a stable independent contract and a second real consumer.

### 6.1 Closed hosted normalization

Milestone 2 adds a closed Host profile rather than exposing arbitrary image-processing
knobs:

```text
signed-diverging-blue-gray-orange-median-datum@1
```

Its deterministic operation order is:

1. decode PNG into canonical opaque sRGB bytes;
2. project onto the frozen signed blue-gray/orange-gray ramp;
3. apply the existing scalar-space low-pass filter before downsampling;
4. subtract the filtered scalar median so ordinary generated ground becomes ratio `0`;
5. clamp only values outside the signed transport domain `[-1, +1]`;
6. resample into the Builder-declared terrain grid;
7. map negative and positive ratios into the Builder-declared metric range around the
   explicit `baseHeightMeters` datum;
8. apply Host-derived Water, Spawn, Landmark support, Route, slope, and quantization
   constraints in the existing priority order.

Global world elevation remains Builder-owned through `baseHeightMeters` and world
height bounds. The image expresses local relief around that datum. Median centering
therefore fixes the common model bias where the entire generated raster is elevated,
without asking the image to own absolute world altitude. The profile does not stretch
each image to fill its range and does not use case-specific clipping constants.

The report adds the profile ID, filtered median, applied offset, pre/post-normalization
range, clamped sample count, and all existing projection and constraint evidence. The
profile and measurements participate in the output hash and compilation manifest.

The package exposes no caller-selectable normalization mode. The single current
operation always applies this closed profile; new behavior requires an intentional
contract change rather than an optional boolean, loose numeric parameter bag, or
legacy fallback.

## 7. Asset Taxonomy and Ownership

Terrain-generation assets are separated by authority and lifecycle rather than file
format.

### 7.1 Compiler conformance fixtures

Location:

```text
packages/terrain-compiler/fixtures/
```

These are deliberately small, hand-authored or frozen inputs used by deterministic
tests. They may include asymmetric PNGs, malformed inputs, expected canonical hashes,
and constraint fixtures. They are package-owned, versioned with code, and must not be
used as aesthetic prompt references merely because they are easy to find.

### 7.2 Planner prompt and semantic instructions

Location:

```text
.codex/skills/worldkit-spatial-planner/references/terrain-height-intent-prompt.md
```

The Planner Skill remains the owner because the prompt defines image-generation
semantics. The compiler README links to it, but the package does not import, copy, or
execute it.

### 7.3 Curated prompt exemplars

Location:

```text
assets/terrain-height-intent/
  README.md
  golden-exemplars.json
  exemplars/<terrain-family>/<exemplar-id>.png
```

Only explicitly accepted cross-run visual references are copied here. The manifest is
the authority and records at least:

- stable `id`;
- `terrainFamily`;
- repository-relative `imagePath`;
- `sha256`;
- `encodingProfile`;
- `promptRole`;
- `status: "accepted"` as an explicit admission marker;
- provenance pointing to the source experiment and prompt;
- limitations describing where the exemplar must not be reused.

Development candidates remain in their experiment directories and never enter the
golden manifest. There is no single universal exemplar until benchmark evidence
supports one. A canyon reference is not silently reused for dunes, wetlands, plateaus,
or other terrain families. Missing family coverage is represented explicitly rather
than filled with the nearest-looking image.

### 7.4 Terrain experiments

Location:

```text
artifacts/terrain-experiments/<case-id>/
```

Experiments own prompt variants, generated candidates, normalization receipts,
compiled candidates, reports, runtime snapshots, comparisons, and their local README.
They are evidence, not supported APIs and not automatically approved prompt exemplars.

### 7.5 Formal scene artifacts

Location:

```text
artifacts/scenes/<scene-id>/
apps/playground/public/scene-plans/<scene-id>/
```

These remain receipt-bound outputs of the formal Planner/Builder/Host workflow. They
must not be moved into the package or exemplar library simply to make a demonstration
easier to find.

## 8. Hosted Pipeline Integration

### 8.1 Authority-preserving stage order

The new normal hosted path is:

```text
Unified Planner Codex task
  -> Scene Brief
  -> World Plan
  -> Entry Whitebox Target
  -> exact scene Height Intent prompt
  -> raw Height Intent PNG
  -> Planner self-check receipt

Canonical Builder Codex task
  -> authoring.builder.json
  -> implementation-map.draft.json
  -> Builder self-check receipt

Trusted Host terrain compilation
  -> @whitebox-world/terrain-compiler
  -> final authoring.json
  -> terrain-height-intent-report.json
  -> terrain-compilation-manifest.json
  -> final-authoring-self-check.json

Existing trusted Host gates
  -> finalized implementation map
  -> Canonical build
  -> trusted Route validation when required
  -> runtime capture and entry validation
  -> optional styled outputs
```

This keeps image semantics with Planner, exact world scale and structural geometry with
Builder, deterministic image-to-height conversion with the package, publication and
receipt binding with the trusted Host, and rendering/physics with existing Runtime
adapters.

The integration creates no additional Codex or external T2I job. The existing unified
Planner task invokes built-in image generation one additional time after it has written
the Scene Brief and World Plan. Cloud and local backends continue through
`scripts/agents/run-codex-task.mjs` with one Planner task and one Builder task.

### 8.2 Planner output contract

New hosted Planner runs declare these semantic outputs plus the self-check receipt:

```text
artifacts/scenes/<scene-id>/scene-brief.md
artifacts/scenes/<scene-id>/terrain-height-intent-prompt.md
apps/playground/public/scene-plans/<scene-id>/world-plan.png
apps/playground/public/scene-plans/<scene-id>/entry-whitebox-target.png
apps/playground/public/scene-plans/<scene-id>/terrain-height-intent.png
artifacts/scenes/<scene-id>/planner-self-check.json
```

The Planner writes the Brief and World Plan first, derives the exact scene prompt from
the maintained Skill reference, and generates one Height Intent PNG in the World Plan's
orientation and complete-world extent. It may use an accepted terrain-family exemplar
from `assets/terrain-height-intent/golden-exemplars.json` only as an encoding-style
reference. User images and the World Plan remain the spatial authorities. An accepted
canyon exemplar, for example, is not supplied to a dune world.

The Planner self-check version advances and binds hashes for the new prompt and image.
It verifies at minimum:

- readable, bounded, square, opaque PNG bytes;
- the declared signed encoding profile;
- residual, signed range, and non-finite-pixel thresholds;
- absence of an empty or near-constant raster unless the Brief explicitly describes
  essentially flat terrain;
- prompt inclusion of orientation, terrain ownership, static exclusions, depressions,
  entry/connectivity, and negative constraints;
- exact receipt freshness for all Planner outputs.

Semantic topology and object exclusion remain Planner responsibilities and are checked
through the same task's self-repair loop. The Host never starts a separate image repair
job.

### 8.3 Builder input and output contract

The Builder receives the Height Intent PNG as an immutable image asset alongside the
Brief, World Plan, Entry target, and user references. It uses that raster to choose
coherent bounds, grid, datum, height range, terrain ownership, Landmark exclusions, and
placements. It does not decode pixels, write metric height samples, normalize the image,
or alter the Height Intent asset.

The Builder writes the pre-terrain document to:

```text
artifacts/scenes/<scene-id>/authoring.builder.json
```

instead of overloading `authoring.json`. Its existing receipt is calculated against
that exact file. This preserves the Builder-delivered input independently from the
trusted Host-compiled final AuthoringSpec and makes provenance inspectable.

### 8.4 Trusted Host compilation and publication

A thin Host orchestration script imports `@whitebox-world/terrain-compiler`; it does
not duplicate domain algorithms or execute the developer CLI as a subprocess. It:

1. validates Planner and Builder receipt freshness;
2. reads the immutable Height Intent PNG and `authoring.builder.json`;
3. invokes the closed normalization/compilation profile;
4. writes the final `authoring.json`, compiler report, and compilation manifest into
   sibling temporary files;
5. runs source-equivalent Builder/Authoring validation against the final AuthoringSpec;
6. atomically promotes the complete successful output set;
7. only then allows implementation-map finalization, Canonical build, Route validation,
   or capture.

The compilation manifest binds:

- `sceneId` and run ID;
- compiler package/profile version;
- Planner receipt hash;
- raw Height Intent PNG hash;
- Builder receipt and `authoring.builder.json` hashes;
- final `authoring.json`, report, and final self-check hashes.

The Host uses the final `authoring.json` for implementation-map finalization and all
downstream gates. No downstream command consumes `authoring.builder.json` or the PNG.

### 8.5 Command modes and compatibility

- `pnpm agent:world` generates, compiles, validates, builds, and captures the terrain by
  default for new hosted outdoor worlds.
- `pnpm agent:world:plan` now finishes only after the Height Intent prompt, PNG, and
  updated Planner receipt are complete.
- `pnpm agent:world:build` consumes those frozen Planner outputs and fails clearly when
  they are absent or stale.
- Existing development CLI behavior remains under `pnpm terrain:intent:compile`.
- The hosted workflow is private and unreleased, so it uses a clean Planner receipt
  version break rather than permanent aliases or silent procedural fallback. An old
  plan must be replanned before using the new build-only path.

Builder-procedural terrain remains a supported SDK authoring capability outside this
hosted path. The hosted path does not silently fall back to it when Height Intent fails,
because a visually flat fallback would falsely report successful image-driven terrain.

### 8.6 Failure, retry, and freshness behavior

- Planner image or self-check failure ends the Planner task after its bounded in-task
  repair cycles.
- Missing or stale Planner terrain outputs stop before Builder launch.
- Builder receipt failure stops before Host terrain compilation.
- Terrain compiler blocking diagnostics preserve the raw PNG, Builder AuthoringSpec,
  and failed report, but do not publish final `authoring.json` or downstream artifacts.
- Final Authoring self-check failure preserves diagnostics and stops before Canonical
  build; it does not create another Builder task.
- Route, Runtime, or capture failure follows the existing hosted workflow policy and is
  corrected by a new user/queue-triggered attempt.
- Retries use scene/run-keyed temporary paths and never reuse a successful report whose
  bound input hashes changed.
- Studio status and artifact APIs expose Planner Height Intent, Builder Authoring,
  terrain report/manifest, final Authoring, and final self-check as distinct artifacts.

No failure deletes historical completed outputs merely to hide a failed attempt. The
active attempt publishes a coherent final set or no final set.

## 9. AI and Human Discoverability

Discovery uses a short chain of canonical indexes rather than duplicated prose:

1. Root `AGENTS.md` receives a concise **Terrain generation canonical entry points**
   section naming the package, root CLI, Planner prompt, exemplar manifest,
   experiments, and formal artifacts.
2. `packages/terrain-compiler/README.md` is the code-owner entry point. It documents
   purpose, public API, CLI example, data flow, dependency boundary, failure model,
   test command, and links to the asset owners.
3. `assets/terrain-height-intent/README.md` explains exemplar admission and links to the
   machine-readable manifest.
4. Each experiment keeps a local README with inputs, outputs, measured conclusion, and
   whether any candidate was promoted to the exemplar library.
5. Current authoritative specs link to the package. Historical incubation documents retain
   their original paths and add a dated promotion note.

The canonical wording should include stable search terms used by both developers and
agents: `terrain compiler`, `Height Intent`, `signed height raster`, `terrain raster`,
`heightfield`, `normalization`, `terrain constraints`, `golden exemplar`, and
`terrain experiment`.

No generated index is introduced in the first migration. The manifest and README set
are small enough to review directly. If the number of exemplar families or compiler
profiles grows materially, generation and schema validation may be added as a separate
change.

## 10. Migration Rules

1. Move implementation and tests with history-preserving file moves where practical.
2. Add the package manifest and explicit root export before changing consumers.
3. Update internal imports to package-local relative imports with the repository's ESM
   conventions.
4. Change the root CLI target without changing command spelling or flags.
5. Update the test gate manifest from old script paths to package paths; do not reduce
   census coverage.
6. Run dependency-boundary checks and remove root dependencies only when a repository
   search proves no remaining root-owned consumer imports them.
7. Add README and canonical indexes in the same change so the move never lands without
   discoverability.
8. Seed the exemplar manifest conservatively. Experiments remain experiments unless an
   acceptance decision and hash are recorded.
9. Add promotion notes to current docs that otherwise claim the tool still lives under
   `scripts/terrain-height-intent/`.
10. Do not delete or rewrite the existing Green Sahara and terrain experiment outputs
    during package migration.
11. Land and verify the package-only milestone before modifying Planner/Builder/Studio
    workflow behavior.
12. Add the closed profile with failing normalization tests before wiring the hosted caller.
13. Advance Planner receipts and artifact status definitions together; do not allow the
    CLI pipeline and Studio to disagree about which terrain artifacts are required.
14. Preserve Builder output as `authoring.builder.json` and reserve `authoring.json` for
    the trusted Host-finalized document.
15. Make build-only reject pre-integration Planner receipts explicitly instead of
    interpreting missing Height Intent as flat terrain.

## 11. Failure and Compatibility Model

- Existing CLI exit behavior, argument validation, atomic output publication, report
  format, and diagnostic codes remain compatible.
- The private-workspace package exposes one current programmatic API and no aliases for
  unreleased development iterations.
- Package promotion must be byte-stable for the same input PNG, AuthoringSpec, and CLI
  flags. Any byte difference is a migration failure unless separately designed and
  approved.
- No compatibility alias remains at `scripts/terrain-height-intent/`. The stable
  compatibility boundary is the root command and package API, not the old source path.
- Errors remain structured compiler/CLI diagnostics; the package must not convert
  validation failures into partial successful terrain output.
- Hosted compilation is fail-closed. It never skips datum normalization or falls back
  to Builder-procedural terrain.
- The final AuthoringSpec, terrain report, compilation manifest, and final self-check are
  one publication unit. A partial unit is not a successful scene attempt.

## 12. Alternatives Considered

### Keep the implementation under `scripts/`

Rejected as the long-term owner. It would preserve the smallest diff but continue to
hide a reusable domain boundary among one-off Host utilities and would not enforce
direct package dependencies or a supported import surface.

### Split core and CLI into separate packages

Rejected for the current phase. The CLI has no independent release, dependency, or
implementation lifecycle, and a second package would add navigation and maintenance
cost without improving an actual boundary. The CLI remains a private adapter inside the
single package.

### Put prompts and all generated images inside the compiler package

Rejected because it collapses Planner semantics, experimental evidence, and deterministic
compiler ownership. It would also encourage runtime or compiler code to depend on
provider-era assets.

### Keep all reference images only inside experiments

Rejected because experiments do not express acceptance or cross-case reuse. A small
hash-locked exemplar manifest provides a deliberate promotion boundary without treating
every candidate as canonical.

### Generate Height Intent in a separate T2I or repair job

Rejected because it would introduce another stochastic stage, another retry/unknown
outcome boundary, and an opportunity for spatial drift. The unified Planner already
owns the Brief and World Plan and can generate the raster from those same authorities in
its existing bounded task.

### Ask the Builder to author or repair the Height Intent image

Rejected because it collapses Planner image semantics into Builder geometry authority.
The Builder may interpret the frozen image when selecting world coordinates, but it
must not edit Planner assets.

### Silently use procedural terrain when Height Intent fails

Rejected because the workflow would report image-driven terrain while rendering a
different source. Procedural terrain remains available through direct SDK authoring,
not as an implicit hosted error recovery path.

## 13. Responsibility Graph

Architecture, public exports, dependency direction, asset admission rules, and final
integration remain Main Agent responsibilities until the package contract is stable.

| ID | Goal and independently verifiable deliverable | `depends_on` | `blocks` | Exclusive ownership and exact integration | Required verification evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| TC-0 | Freeze this package/API/asset/integration design | none | TC-1, TC-3 | owns this spec; current Host implementation and terrain design -> approved migration and integration contract | source-path audit, dependency and pipeline audit, design self-review, user approval | `main-agent-only` |
| TC-1 | Create `@whitebox-world/terrain-compiler` and move deterministic code/tests without behavior change | TC-0 | TC-2, TC-4 | owns `packages/terrain-compiler/**`; current script modules -> package root API and private internals | existing focused tests at new paths, import/export audit, exact public surface test, workspace-boundary check | `sequential` |
| TC-2 | Preserve root CLI compatibility and test census | TC-1 | TC-4 | owns root `terrain:intent:compile` target and terrain entries in `scripts/lib/test-gate-manifest.ts`; package CLI adapter -> unchanged command behavior | adversarial CLI tests, atomic publication checks, `test:census`, unchanged help/flags/exit behavior | `sequential` |
| TC-3 | Establish canonical AI discovery and asset admission | TC-0 | TC-4 | owns package README, root AGENTS discovery section, `assets/terrain-height-intent/**`, and current-doc promotion notes; experiments + acceptance decisions -> hash-locked exemplar index | JSON/schema or structural validation, SHA-256/path verification, link audit, secret/private-path scan | `parallel-safe` |
| TC-4 | Prove package migration equivalence and create the first commit boundary | TC-1, TC-2, TC-3 | TC-5, TC-6 | owns migration evidence and package-only commit; same Green Sahara inputs -> byte-identical compiled AuthoringSpec/report and valid downstream output | focused 52-test terrain lane, workspace boundaries, test census, relevant typecheck, deterministic replay, Authoring validation, no Provider/Runtime dependency | `main-agent-only` |
| TC-5 | Replace the incubation API with the closed median-datum compiler contract | TC-4 | TC-7 | owns package API/report/profile tests only; raw signed raster + Builder Authoring -> normalized constrained final Authoring and report | failing-before global-offset case, asymmetric sign case, mostly-high/mostly-low cases, clamp and determinism coverage, exact root-export test | `sequential` |
| TC-6 | Extend unified Planner outputs and self-check for scene prompt plus Height Intent PNG | TC-4 | TC-7 | owns Planner Skill/prompt/checker, root hosted-workflow rules, launcher Planner output declarations, accepted exemplar context, and receipt version; Brief + World Plan + references -> hash-bound prompt/image | positive fixture, malformed/constant/off-profile/stale image negatives, bundled/source checker parity, cloud/local closed-output tests | `sequential` |
| TC-7 | Preserve Builder input, run trusted Host terrain finalization, then continue existing build gates | TC-5, TC-6 | TC-8, TC-9 | owns `authoring.builder.json` boundary, Host orchestration script, compilation manifest, launcher stage order, and final Authoring self-check; frozen Planner + Builder outputs -> atomic final Authoring unit | pipeline failure injection, receipt/hash mismatch, atomic promotion/rollback, build-only stale-plan rejection, Canonical/Route/capture ordering tests | `main-agent-only` |
| TC-8 | Expose the new stages and artifacts consistently in Studio | TC-7 | TC-9 | owns Studio phase/artifact/status mappings and tests; launcher artifacts -> distinct visible Planner terrain, Builder source, compiler report, final Authoring states | server/API tests, preview bootstrap tests, missing/failed/complete artifact matrices | `sequential` |
| TC-9 | Prove the integrated hosted path and create the second commit boundary | TC-7, TC-8 | none | owns final integration evidence and integration commit; one new real image-driven case -> Planner through runtime capture | focused tests, planner/builder parity, workspace boundaries, test census, typecheck, relevant builds, full `agent:world` case, report/hash inspection, rendered opening evidence | `main-agent-only` |

## 14. Acceptance Criteria

The package and hosted integration are complete only when all of the following are true:

- `@whitebox-world/terrain-compiler` is the only code owner for deterministic Height
  Intent compilation.
- The package exposes exactly one supported root entry point and no accidental internal
  subpaths.
- `pnpm terrain:intent:compile` keeps its existing flags and behavior.
- Existing focused terrain tests pass from package-owned paths without a census loss.
- Workspace dependency checks prove all imported libraries are direct dependencies.
- A same-input Green Sahara replay produces byte-identical compiled JSON and report.
- The package has no Provider, credential, Browser, Babylon, Havok, or Runtime imports.
- Compiler fixtures, Planner prompt references, curated exemplars, experiments, and
  formal scene outputs have distinct documented owners.
- Every accepted exemplar path exists and matches the manifest SHA-256.
- Root `AGENTS.md` and package README provide a complete discovery chain without
  duplicating the full design.
- Existing uncommitted scene and experiment artifacts remain intact.
- New full and plan-only hosted runs produce a scene-specific Height Intent prompt and
  raw PNG inside the existing Planner task and bind both in its replayed receipt.
- Builder receives but cannot modify the frozen Height Intent asset, and its exact
  Authoring output remains preserved as `authoring.builder.json`.
- Trusted Host compilation records median-datum measurements and publishes an atomic
  final Authoring/report/manifest/self-check unit before Canonical build.
- Build-only rejects missing or stale new Planner terrain artifacts without procedural
  fallback.
- Studio exposes the raw Planner terrain proposal, Builder input, compiler evidence, and
  final Authoring state separately.
- A real integrated scene runs through Canonical build, required Route validation,
  runtime capture, and entry validation using the final compiled height samples.
- Package-only promotion and pipeline integration remain separate reviewed commits;
  integration into `main` happens only after all final gates pass.

## 15. Deferred Follow-ups

The following require separate designs after the package and hosted-integration
milestones:

1. Define a versioned exemplar manifest schema and automated admission tooling if the
   library grows beyond a small reviewed set.
2. Introduce lower-level compiler exports only when a second real consumer establishes
   a stable independent contract.
3. Split Source plugins, Refiner implementations, or Runtime adapters only when their
   dependencies and lifecycles genuinely diverge.
4. Add terrain-family-specific normalization or amplitude profiles only after a frozen
   Development/Holdout benchmark proves that the median-datum default is insufficient.
5. Add automatic generation retry only if the provider path gains safe request-level
   idempotency and the workflow defines a new bounded attempt contract.

# Signed Height Intent Compiler V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Host-only deterministic compiler that turns one generated signed-color terrain PNG plus an existing AuthoringSpec V4 into validated metric `heightSamplesMeters` and an auditable report.

**Architecture:** Keep image generation and Provider configuration in the Planner/Host. A scoped tool under `scripts/terrain-height-intent/` decodes PNG bytes, projects the frozen continuous blue-gray/orange-gray ramp to signed scalar values, applies deterministic scalar-space low-pass filtering before downsampling into the Authoring terrain grid, applies only unambiguous hard constraints already present in AuthoringSpec V4, and writes a new AuthoringSpec copy. The Runtime, Babylon, Havok, public Source union, and Planner three-file contract do not change in V0.

**Tech Stack:** TypeScript, Node.js 23, Vitest, `sharp@0.35.4` for Host-only PNG decoding, existing `@whitebox-world/authoring`, `@whitebox-world/protocol`, and `@whitebox-world/terrain-surface` contracts.

**Spec:** `docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md`

## Global Constraints

- The generated PNG is an untrusted macro-shape prior and never enters Runtime.
- Use the frozen ramp `RGB(32,64,208) -> RGB(128,128,128) -> RGB(224,96,32)` and project to `-1..+1`.
- Image top maps to world `-Z`; image right maps to world `+X`; row-major samples remain X-fastest.
- Downsampling prefilters the signed scalar field, never the RGB transport image, and records the exact pixel radii in the report. Protected constraints run after filtering/resampling and are never blurred away.
- Reuse AuthoringSpec V4 `world.bounds.heightRangeMeters`, terrain `baseHeightMeters`, grid, Water nodes, Spatial Regions, Routes, and required constraints; do not add a competing terrain-control schema.
- Require explicit `baseHeightMeters` for V0 so the datum is not inferred from a private relief default.
- Water/shore constraints outrank spawn, static Landmark support, and primary Route constraints.
- Only fixed or explicit `initialTransform` placement may become a V0 support target. Missing placement evidence is a blocking Diagnostic, never a guessed position.
- V0 writes `grid.heightSamplesMeters` into a copy of the AuthoringSpec; it does not add a public Terrain Source ID.
- Keep all new Host tool files under `scripts/terrain-height-intent/`; do not add them to `scripts/lib`.
- Every source file remains provider-free and engine-free. Only the PNG decoder imports `sharp`.
- Use TDD for each task, register every new test in `scripts/lib/test-gate-manifest.ts`, and keep `pnpm typecheck` green.

---

## File Map

| File | Responsibility |
| --- | --- |
| `scripts/terrain-height-intent/project-signed-rgb.ts` | Existing pure RGB-to-signed-ratio projection core |
| `scripts/terrain-height-intent/decode-png.ts` | Bounded PNG decode and canonical opaque sRGB byte buffer |
| `scripts/terrain-height-intent/summarize-projection.ts` | Residual, range, and smoothness measurements |
| `scripts/terrain-height-intent/prefilter-scalar-raster.ts` | Deterministic separable box low-pass before downsampling |
| `scripts/terrain-height-intent/resample-scalar-raster.ts` | Deterministic X-fastest bilinear resampling |
| `scripts/terrain-height-intent/map-height-meters.ts` | Piecewise signed-ratio to metric-height mapping |
| `scripts/terrain-height-intent/terrain-constraint-types.ts` | Internal V0 constraint and Diagnostic contracts |
| `scripts/terrain-height-intent/derive-authoring-constraints.ts` | AuthoringSpec V4 to unambiguous Host constraints |
| `scripts/terrain-height-intent/apply-terrain-constraints.ts` | Priority-ordered Water, Spawn, Landmark support, and Route edits |
| `scripts/terrain-height-intent/compile-height-intent.ts` | Pure orchestration returning compiled spec and report |
| `scripts/terrain-height-intent/cli.ts` | File I/O, atomic publication, and command-line validation |
| `scripts/terrain-height-intent/*.test.ts` | Focused contract coverage beside each responsibility |

### Task 1: Canonical PNG Decode and Projection Report

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `scripts/terrain-height-intent/decode-png.ts`
- Create: `scripts/terrain-height-intent/decode-png.test.ts`
- Create: `scripts/terrain-height-intent/summarize-projection.ts`
- Create: `scripts/terrain-height-intent/summarize-projection.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: PNG `Uint8Array` and the existing `projectSignedHeightIntentRgbV0()`.
- Produces:

```ts
export interface CanonicalTerrainIntentRgbV0 {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly rgbBytes: Uint8Array;
  readonly sourcePngHash: `sha256:${string}`;
  readonly canonicalRgbHash: `sha256:${string}`;
}

export async function decodeTerrainIntentPngV0(
  sourcePngBytes: Uint8Array,
): Promise<CanonicalTerrainIntentRgbV0>;

export interface TerrainIntentProjectionSummaryV0 {
  readonly minimumHeightRatio: number;
  readonly medianHeightRatio: number;
  readonly maximumHeightRatio: number;
  readonly meanRampResidualRgbUnits: number;
  readonly p95RampResidualRgbUnits: number;
  readonly meanNeighborDeltaRatio: number;
  readonly p95NeighborDeltaRatio: number;
}

export function summarizeTerrainIntentProjectionV0(
  projection: SignedHeightIntentProjectionV0,
): TerrainIntentProjectionSummaryV0;
```

- [x] **Step 1: Add failing decode tests**

Create a 2x2 opaque PNG from raw ramp anchors with `sharp`, assert exact width/height/RGB bytes, and add rejection cases for non-square input, alpha, animated/multipage input, and more than `16_777_216` pixels.

```ts
const sourcePngBytes = await sharp(new Uint8Array([
  32, 64, 208, 128, 128, 128,
  176, 112, 80, 224, 96, 32,
]), { raw: { width: 2, height: 2, channels: 3 } }).png().toBuffer();
const decoded = await decodeTerrainIntentPngV0(sourcePngBytes);
expect(decoded.rgbBytes).toEqual(new Uint8Array([
  32, 64, 208, 128, 128, 128,
  176, 112, 80, 224, 96, 32,
]));
```

- [x] **Step 2: Run the decode test and confirm RED**

Run: `pnpm exec vitest run scripts/terrain-height-intent/decode-png.test.ts`

Expected: FAIL because `decode-png.ts` does not exist.

- [x] **Step 3: Add the pinned Host dependency and minimal decoder**

Run: `pnpm add -w sharp@0.35.4`

Configure `sharp` with `limitInputPixels: 16_777_216`, reject non-square, alpha, and `pages !== 1`, call `toColourspace("srgb").removeAlpha().raw()`, and hash both original PNG bytes and canonical RGB bytes with `sha256Bytes`.

- [x] **Step 4: Add failing deterministic summary tests**

Use an asymmetric 3x2 signed field and assert nearest-rank p95, median, and horizontal-plus-vertical neighbor deltas. The test must distinguish row-major X-fastest order from transposed order.

- [x] **Step 5: Implement the summary without sorting caller-owned arrays**

Copy values before sorting, define nearest-rank percentile index as
`Math.max(0, Math.ceil(ratio * length) - 1)`, and reject empty or dimension-mismatched projections.

- [x] **Step 6: Run focused tests and typecheck**

Run: `pnpm exec vitest run scripts/terrain-height-intent/decode-png.test.ts scripts/terrain-height-intent/summarize-projection.test.ts scripts/terrain-height-intent/project-signed-rgb.test.ts`

Run: `pnpm typecheck`

Expected: all pass.

- [x] **Step 7: Commit the decoder boundary**

```bash
git add package.json pnpm-lock.yaml scripts/terrain-height-intent scripts/lib/test-gate-manifest.ts
git commit -m "feat: decode signed terrain intent images"
```

### Task 2: Deterministic Grid Resampling and Metric Mapping

**Files:**
- Create: `scripts/terrain-height-intent/prefilter-scalar-raster.ts`
- Create: `scripts/terrain-height-intent/prefilter-scalar-raster.test.ts`
- Create: `scripts/terrain-height-intent/resample-scalar-raster.ts`
- Create: `scripts/terrain-height-intent/resample-scalar-raster.test.ts`
- Create: `scripts/terrain-height-intent/map-height-meters.ts`
- Create: `scripts/terrain-height-intent/map-height-meters.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: signed row-major scalar samples and Authoring terrain resolution/height bounds.
- Produces:

```ts
export interface ScalarRasterV0 {
  readonly columns: number;
  readonly rows: number;
  readonly values: Float32Array;
}

export function prefilterScalarRasterForDownsampleV0(
  input: ScalarRasterV0,
  targetResolutionVerticesXY: readonly [columns: number, rows: number],
): ScalarRasterV0 & {
  readonly radiusPixelsXY: readonly [number, number];
};

export function resampleScalarRasterBilinearV0(
  input: ScalarRasterV0,
  outputResolutionVerticesXZ: readonly [columns: number, rows: number],
): ScalarRasterV0;

export function mapSignedHeightRatiosToMetersV0(input: {
  readonly heightRatios: Float32Array;
  readonly minimumHeightMeters: number;
  readonly datumHeightMeters: number;
  readonly maximumHeightMeters: number;
}): Float32Array;
```

- [x] **Step 1: Write failing low-pass and asymmetric resampling tests**

Use an impulse and a constant asymmetric field to prove the separable box filter suppresses source-pixel aliasing, preserves constant edges, is inactive when neither axis downsamples, does not mutate input, and records exact radii. Use a 3x2 source where each corner and edge has a distinct value to assert exact bilinear corners, center interpolation, X-fastest output order, one-column/one-row rejection, non-finite rejection, and identical-input deterministic replay.

- [x] **Step 2: Run resampling tests and confirm RED**

Run: `pnpm exec vitest run scripts/terrain-height-intent/prefilter-scalar-raster.test.ts scripts/terrain-height-intent/resample-scalar-raster.test.ts`

Expected: FAIL because the modules are missing.

- [x] **Step 3: Implement deterministic scalar prefilter and native bilinear resampling**

Derive each box radius from half the endpoint-aligned source-to-target scale, use separable prefix sums with clipped-edge normalization, and return caller-independent storage. Then map output `column/(columns-1)` and `row/(rows-1)` into source coordinates, interpolate X before rows, and write output at `row * columns + column`. Do not use `sharp.resize`; decoding is the only libvips-owned operation and filtering happens after RGB-to-scalar projection.

- [x] **Step 4: Write failing piecewise meter-mapping tests**

```ts
expect(Array.from(mapSignedHeightRatiosToMetersV0({
  heightRatios: new Float32Array([-1, -0.5, 0, 0.5, 1]),
  minimumHeightMeters: -20,
  datumHeightMeters: 0,
  maximumHeightMeters: 60,
}))).toEqual([-20, -10, 0, 30, 60]);
```

Also reject `minimum >= datum`, `datum >= maximum`, ratios outside `-1..1`, and non-finite values.

- [x] **Step 5: Implement piecewise mapping and verify GREEN**

For negative ratios interpolate `minimumHeightMeters -> datumHeightMeters`; for positive ratios interpolate `datumHeightMeters -> maximumHeightMeters`.

Run: `pnpm exec vitest run scripts/terrain-height-intent/prefilter-scalar-raster.test.ts scripts/terrain-height-intent/resample-scalar-raster.test.ts scripts/terrain-height-intent/map-height-meters.test.ts`

Expected: all pass.

- [x] **Step 6: Commit scalar canonicalization**

```bash
git add scripts/terrain-height-intent scripts/lib/test-gate-manifest.ts
git commit -m "feat: map terrain intent to metric grids"
```

### Task 3: Derive Only Unambiguous AuthoringSpec V4 Constraints

**Files:**
- Create: `scripts/terrain-height-intent/terrain-constraint-types.ts`
- Create: `scripts/terrain-height-intent/derive-authoring-constraints.ts`
- Create: `scripts/terrain-height-intent/derive-authoring-constraints.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: a parsed `AuthoringSpecV4` and the single Terrain node.
- Produces:

```ts
export type TerrainConstraintV0 =
  | Readonly<{
      id: string;
      kind: "water-basin";
      boundary: WaterBoundarySpecV2;
      waterLevelMeters: number;
      depthMeters: number;
      shoreWidthMeters: number;
    }>
  | Readonly<{
      id: string;
      kind: "flatten-region";
      pointsMetersXZ: readonly Vec2[];
      targetHeightMeters: number;
      falloffWidthMeters: number;
      role: "spawn";
    }>
  | Readonly<{
      id: string;
      kind: "flatten-footprint";
      centerMetersXZ: Vec2;
      sizeMetersXZ: Vec2;
      falloffWidthMeters: number;
      role: "landmark-support";
    }>
  | Readonly<{
      id: string;
      kind: "route-slope";
      pointsMetersXZ: readonly Vec2[];
      widthMeters: number;
      maximumSlopeDegrees: number;
    }>;

export interface DerivedTerrainConstraintsV0 {
  readonly terrainEntityId: string;
  readonly constraints: readonly TerrainConstraintV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}

export function deriveTerrainConstraintsFromAuthoringV4(
  spec: AuthoringSpecV4,
): DerivedTerrainConstraintsV0;
```

- [x] **Step 1: Write a focused Authoring fixture and failing derivation tests**

Base it on `examples/authoring/placement-coastal-world.json`. Assert:

- Water node becomes `water-basin`.
- Startup spawn's required `inside-region` plus fixed/initial Y becomes `flatten-region`.
- Required `within-slope-limit` plus matching Route becomes `route-slope`.
- A `landmark.*` Prototype with required `supported-by` and fixed/initial placement becomes `flatten-footprint` using its primitive XZ bounds.
- Missing explicit `terrain.source.baseHeightMeters` is blocking.
- Missing spawn placement evidence, missing Region/Route references, ambiguous multiple Terrain nodes, and a solved Landmark with no initial transform are blocking rather than guessed.
- Preferred constraints do not become hard terrain edits.

- [x] **Step 2: Run derivation tests and confirm RED**

Run: `pnpm exec vitest run scripts/terrain-height-intent/derive-authoring-constraints.test.ts`

Expected: FAIL because the derivation module is missing.

- [x] **Step 3: Implement stable ID-ordered derivation**

Sort output by fixed priority `water-basin`, `flatten-region`, `flatten-footprint`, `route-slope`, then by `id`. Reuse Authoring types and Prototype dimensions; do not parse semantic meaning from display names.

- [x] **Step 4: Verify derivation and public Schema non-change**

Run: `pnpm exec vitest run scripts/terrain-height-intent/derive-authoring-constraints.test.ts packages/authoring/src/authoring-v4.test.ts`

Expected: all pass and the AuthoringSpec V4 schema file remains unchanged.

- [x] **Step 5: Commit the Authoring adapter**

```bash
git add scripts/terrain-height-intent scripts/lib/test-gate-manifest.ts
git commit -m "feat: derive terrain constraints from authoring"
```

### Task 4: Apply Priority-Ordered Terrain Constraints

**Files:**
- Create: `scripts/terrain-height-intent/apply-terrain-constraints.ts`
- Create: `scripts/terrain-height-intent/apply-terrain-constraints.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: metric raster, exact world bounds, and `TerrainConstraintV0[]`.
- Produces:

```ts
export interface TerrainConstraintDeltaV0 {
  readonly constraintId: string;
  readonly changedSampleCount: number;
  readonly maximumAbsoluteDeltaMeters: number;
}

export interface ApplyTerrainConstraintsResultV0 {
  readonly heightSamplesMeters: Float32Array;
  readonly deltas: readonly TerrainConstraintDeltaV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}

export function applyTerrainConstraintsV0(input: {
  readonly centerMetersXZ: Vec2;
  readonly sizeMetersXZ: Vec2;
  readonly resolutionVerticesXZ: readonly [number, number];
  readonly heightSamplesMeters: Float32Array;
  readonly constraints: readonly TerrainConstraintV0[];
}): ApplyTerrainConstraintsResultV0;
```

- [x] **Step 1: Write adversarial failing tests**

Cover asymmetric rectangular grids, polygon Spawn flattening, circle/ellipse/polygon Water, a Landmark footprint at the world edge, a bent Route, Water overlapping Route, reversed constraint input order, impossible height-range edits, and repeated execution. Assert Water wins overlap, Spawn wins Landmark/Route, Landmark wins Route, and input arrays are not mutated.

- [x] **Step 2: Run constraint tests and confirm RED**

Run: `pnpm exec vitest run scripts/terrain-height-intent/apply-terrain-constraints.test.ts`

Expected: FAIL because the solver module is missing.

- [x] **Step 3: Implement Water, flatten, and footprint operations**

Rasterize in world XZ. Water sets the core bed no higher than
`waterLevelMeters - depthMeters` and blends only within `shoreWidthMeters`. Spawn uses its declared target height. Landmark support samples the pre-edit center height and flattens the primitive footprint plus one grid-cell surface guard to that value, so triangle interpolation at the exact footprint edge remains supported.

- [x] **Step 4: Implement Route corridor projection**

Project each sample onto the nearest Route segment. Clamp centerline vertex height changes with forward and backward passes using
`maximumDeltaMeters = tan(maximumSlopeDegrees) * segmentLengthMeters`; assign the interpolated centerline target across half the declared Route width plus a one-cell slope-validation guard. Collinear segmented Routes keep the nearest-segment height; genuinely bent Routes use the compatible multi-segment height envelope to avoid a discontinuity at the bend. Skip samples already locked by a higher-priority constraint.

- [x] **Step 5: Validate final slope and edit budget**

Use `sampleTriangleHeightfieldSurface` from `@whitebox-world/terrain-surface` to sample the complete Route width. Emit blocking `TERRAIN_INTENT_ROUTE_SLOPE_UNSATISFIED` when any sample exceeds the declared limit plus `0.25` degrees. Emit per-constraint deltas and reject non-finite output.

- [x] **Step 6: Run focused tests and typecheck**

Run: `pnpm exec vitest run scripts/terrain-height-intent/apply-terrain-constraints.test.ts packages/terrain-surface/src/terrain-surface.test.ts`

Run: `pnpm typecheck`

Expected: all pass.

- [x] **Step 7: Commit the constraint solver**

```bash
git add scripts/terrain-height-intent scripts/lib/test-gate-manifest.ts
git commit -m "feat: constrain generated terrain heightfields"
```

### Task 5: Pure Compiler and Host CLI

**Files:**
- Create: `scripts/terrain-height-intent/compile-height-intent.ts`
- Create: `scripts/terrain-height-intent/compile-height-intent.test.ts`
- Create: `scripts/terrain-height-intent/cli.ts`
- Create: `scripts/terrain-height-intent/cli.test.ts`
- Modify: `package.json`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: original PNG bytes plus a parsed AuthoringSpec V4.
- Produces:

```ts
export interface TerrainHeightIntentCompileReportV0 {
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  readonly terrainEntityId: string;
  readonly sourcePngHash: `sha256:${string}`;
  readonly canonicalRgbHash: `sha256:${string}`;
  readonly inputAuthoringSpecHash: `sha256:${string}`;
  readonly outputAuthoringSpecHash?: `sha256:${string}`;
  readonly projection: TerrainIntentProjectionSummaryV0;
  readonly prefilter?: Readonly<{
    kind: "separable-box";
    radiusPixelsXY: readonly [number, number];
  }>;
  readonly constraintDeltas: readonly TerrainConstraintDeltaV0[];
  readonly diagnostics: readonly TerrainIntentDiagnosticV0[];
}

export async function compileTerrainHeightIntentV0(input: {
  readonly sourcePngBytes: Uint8Array;
  readonly authoringSpec: AuthoringSpecV4;
}): Promise<{
  readonly report: TerrainHeightIntentCompileReportV0;
  readonly compiledAuthoringSpec?: AuthoringSpecV4;
}>;
```

- [x] **Step 1: Write failing end-to-end compiler tests**

Create a 9x9 PNG and a 5x5 Authoring fixture with explicit `baseHeightMeters`, world height range, Water, Spawn Region, Landmark support, and a required Route. Assert the report records the scalar prefilter, the returned copy contains 25 finite `heightSamplesMeters`, the input object remains byte-equivalent, hashes replay exactly, and any blocking Diagnostic omits `compiledAuthoringSpec`.

- [x] **Step 2: Run compiler tests and confirm RED**

Run: `pnpm exec vitest run scripts/terrain-height-intent/compile-height-intent.test.ts`

Expected: FAIL because the orchestrator is missing.

- [x] **Step 3: Implement orchestration and AuthoringSpec injection**

Decode, project, summarize, apply the reported scalar-space low-pass for the target resolution, resample to `grid.resolutionCellsXZ`, map using
`world.bounds.heightRangeMeters[0]`, explicit `source.baseHeightMeters`, and
`world.bounds.heightRangeMeters[1]`, derive/apply constraints, clone the AuthoringSpec, and set only the matching Terrain node's `grid.heightSamplesMeters` to ordinary finite numbers.

- [x] **Step 4: Write failing CLI tests**

Use `mkdtemp` and spawn the CLI with:

```bash
pnpm terrain:intent:compile -- \
  --image /absolute/input.png \
  --authoring /absolute/world.json \
  --output-authoring /absolute/world.compiled.json \
  --report /absolute/terrain-height-intent-report.json
```

Assert missing args, relative paths, symlinks, overwrite without `--force`, malformed PNG, invalid AuthoringSpec, and blocking Diagnostics fail without partially publishing either output.

- [x] **Step 5: Implement exact-path atomic CLI publication**

Add root script:

```json
"terrain:intent:compile": "tsx scripts/terrain-height-intent/cli.ts"
```

Write sibling temporary files with `open(..., "wx")`, fsync, then rename the compiled AuthoringSpec first and report last. On pre-report failure remove only this invocation's exact temporary files and restore exact backups. Serialize with `stringifyCanonicalJson` plus one trailing newline.

- [x] **Step 6: Verify compiler, CLI, census, and typecheck**

Run: `pnpm exec vitest run scripts/terrain-height-intent/compile-height-intent.test.ts scripts/terrain-height-intent/cli.test.ts scripts/lib/test-gate-census.test.ts`

Run: `pnpm typecheck`

Expected: all pass.

- [x] **Step 7: Commit the V0 Host compiler**

```bash
git add package.json scripts/terrain-height-intent scripts/lib/test-gate-manifest.ts
git commit -m "feat: compile signed terrain intent rasters"
```

### Task 6: Canyon Development Case and Scoped Completion Gates

**Files:**
- Create: `artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.json`
- Create: `artifacts/terrain-experiments/013-grand-canyon-courier/terrain-height-intent-report-v0.json`
- Create: `artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.compiled.json`
- Modify: `artifacts/terrain-experiments/013-grand-canyon-courier/README.md`
- Modify: `docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md`

**Interfaces:**
- Consumes: the frozen V4 signed-color candidate and a valid Canyon AuthoringSpec V4 fixture.
- Produces: one reproducible Development report and compiled AuthoringSpec; neither is a production or Runtime claim.

- [x] **Step 1: Author a minimal valid Canyon V0 fixture**

Use one Terrain with explicit `baseHeightMeters`, a non-square world extent, an asymmetric grid, fixed/initial Spawn evidence, a central Route with a required `within-slope-limit`, and left/right static Landmark supports. Do not add Water because the source case declares none.

- [x] **Step 2: Compile the frozen V4 image**

Run:

```bash
pnpm terrain:intent:compile -- \
  --image artifacts/terrain-experiments/013-grand-canyon-courier/height-intent-image2-v4-signed-color.png \
  --authoring artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.json \
  --output-authoring artifacts/terrain-experiments/013-grand-canyon-courier/authoring-v0.compiled.json \
  --report artifacts/terrain-experiments/013-grand-canyon-courier/terrain-height-intent-report-v0.json
```

Expected: report status `passed`, stable hashes, finite sample count equal to the declared grid, Spawn and Route Diagnostics passing, and no Water output.

- [x] **Step 3: Prove the V5 negative fixture is rejected or materially repaired**

Run the same CLI into temporary output paths using `height-intent-image2-v5-signed-color.png`. Accept only one of these measured outcomes:

- blocking macro-topology/sign Diagnostic with no compiled output; or
- passed output whose report shows non-zero Spawn/Support constraint deltas and whose protected regions satisfy their declared heights/slopes.

Do not select V4 merely because it looks better.

- [x] **Step 4: Run scoped completion gates**

Run: `pnpm exec vitest run scripts/terrain-height-intent/*.test.ts scripts/lib/test-gate-census.test.ts scripts/planner-skill.test.ts`

Run: `pnpm check:agent-self-check`

Run: `pnpm typecheck`

Run: `git diff --check`

Expected: all pass. No Runtime, physics, Browser, or build claim is made in this plan.

- [x] **Step 5: Record the package promotion decision**

Update the design spec with the measured result. Keep the tool under `scripts/terrain-height-intent/` if the Development Case fails or the interfaces change. Propose `@whitebox-world/terrain-compiler` only if Tasks 1-6 pass without adding Provider or Runtime dependencies.

- [x] **Step 6: Commit the Development evidence**

```bash
git add artifacts/terrain-experiments/013-grand-canyon-courier docs/superpowers/specs/2026-08-17-terrain-authoring-pipeline-design.md
git commit -m "test: validate canyon terrain intent compilation"
```

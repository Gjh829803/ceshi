# Babylon-only Three.js Retirement Implementation Plan

**Goal:** Remove every live Three.js dependency and implementation from the SDK while preserving the Canonical Babylon/Havok gameplay, scene-planning, opening-composition, Studio preview, and whitebox tri-view workflows.

**Architecture:** `@whitebox-world/camera` remains the single provider-neutral Camera Domain package. `@whitebox-world/runtime-babylon` and the Babylon-backed Playground artifact renderer are the only engine integration owners. The Legacy Three/Rapier runtime cluster is deleted only after Babylon proves parity for every active product route. Static subject intake becomes GLB-first; checked-in GLBs remain protected by Registry/hash/load verification.

**Acceptance boundary:** No tracked package manifest, lockfile, TypeScript/JavaScript source, active workflow document, or generated active site imports or advertises Three.js. Historical decision records may name the retired provider only to explain the migration; business identifiers such as `xier120.three-wheel` are not provider references.

## Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership and integration point | Stable input -> output contract | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TR0 | Freeze the Babylon-only boundary, baseline current artifacts, and add this executable plan | none | TR1-TR7 | Main agent: this plan, Camera spec, `docs/18-refactor-progress-and-backlog.md`; no runtime edits | current `main` audit -> authoritative deletion/migration set and zero-provider scan | clean baseline, exact reverse-dependency inventory, current artifact gates | main-agent-only |
| TR1 | Remove Three math from the Canonical outdoor importer and World geometry surface | TR0 | TR2, TR5 | `apps/playground/src/outdoor-scene-gameplay-loader.ts`, its tests, `packages/world/src/terrain.ts`, terrain tests | OutdoorSceneDefinition + typed geometry -> unchanged AuthoringSpec/ExecutionPlan/plan hashes | nested asymmetric TRS, Euler order, invalid transform, six-scene import, terrain data tests | parallel-safe |
| TR2 | Implement a Babylon-backed artifact renderer with opening frame, composition mask/report, planning views, and prototype tri-views | TR0, TR1 | TR3, TR5, TR6 | Playground artifact renderer and Babylon render helpers only; integrates at `main.ts` artifact-only branch through `PlaygroundArtifactRenderer` | compiled outdoor scene + frozen metadata -> same automation API and artifact paths | lifecycle/throw cleanup tests, 6/6 artifact route, rendered plan/opening/tri-view inspection | sequential |
| TR3 | Retire the Legacy runtime cluster and clean-break `@whitebox-world/camera` | TR2 | TR5, TR6 | delete `packages/core`, `physics`, `subjects`, `animation`; rebuild `packages/camera`; delete `sdk-world-adapter`; manifests/tsconfig references | frozen Camera package boundary -> provider-neutral Camera Domain exports and no Legacy consumer | package graph negative tests, typecheck, tests, build, `pnpm why three -r` | sequential |
| TR4 | Make static subject intake GLB-first and remove the Three FBX bake implementation | TR0 | TR6 | root bake scripts, `scripts/lib/static-subject-bake*`, asset-intake active docs; checked-in GLB bytes and manifests are read-only inputs | admitted GLB + Registry metadata -> unchanged hash/load/disposal verification | `verify:xier120-subjects`, malformed/hash mismatch negatives, two-instance asset runtime tests | parallel-safe |
| TR5 | Move scene and artifact verification to Babylon/Havok | TR1, TR2, TR3 | TR7 | scene tests, geometry conformance, outdoor verifier, Studio capture route; no Schema changes | same scene catalog and automation contracts -> Babylon-only numeric/browser/rendered evidence | Primitive/water/terrain generation matrix, `test:scenes`, 6/6 gameplay + artifact, Studio preview/capture, asymmetric terrain parity | sequential |
| TR6 | Remove active dual-runtime guidance and attach delivery to the authoritative backlog | TR2, TR3, TR4 | TR7 | `AGENTS.md`, README, active architecture/docs, architecture site source; historical reviews remain evidence only | verified implementation -> one Babylon-only onboarding/workflow and Camera task graph | active-doc scan, built site scan, link checks, status claims matched to evidence | sequential |
| TR7 | Integrate, review, commit, and push `main` | TR3-TR6 | none | Main agent owns final diff, evidence report, merge/push | integrated branch -> reviewed `origin/main` with rerunnable evidence | full gates, runtime deep review, mode-B full-dimension review, finding disposition, remote SHA check | main-agent-only |

## Test-first execution details

### TR1: Canonical math and geometry

1. Add failing importer tests for nested non-uniform transforms, multi-axis rotation, negative determinant, and stable rejection of non-decomposable transforms.
2. Replace Three math with installed Babylon math APIs; keep the serialized coordinate/unit contract unchanged.
3. Add a failing test proving `TerrainSurface.toGeometryData()` is the only public geometry output, then remove `toBufferGeometry()` and its Three/WebGPU shim.
4. Run focused importer/world tests and compare all six scene hashes before proceeding.

### TR2: Babylon artifact ownership

1. Add failing artifact-contract tests for every `PlaygroundArtifactRenderer` method and cleanup after partial construction.
2. Construct the artifact route through the same compiled outdoor input and Babylon resource loader as gameplay; do not create a second scene compiler or gameplay authority.
3. Implement deterministic orthographic planning cameras, opening composition capture, semantic/instance mask readback, and prototype-local front/right/back tri-views.
4. Keep plan locks, prompts, source images, manifests, and artifact paths stable. Any rendered pixel drift is reviewed visually and never hidden by automatic golden replacement.

### TR3: Camera clean break and Legacy deletion

1. Add a package-boundary test that rejects renderer/physics/browser imports from `@whitebox-world/camera`.
2. Replace the old Rig export with the frozen provider-neutral Camera Profile, Context, View Preference, Selection Decision, diagnostic, and pure selection contracts from the Camera design.
3. Switch the artifact route to Babylon, then delete `SdkWorldAdapter` and the unreferenced Legacy packages atomically.
4. Remove Rapier only after reverse-dependency and lockfile checks prove no live consumer remains.

### TR4: GLB-first asset intake

1. Preserve committed GLBs and their current Registry/hash verification.
2. Remove repository-owned FBX conversion commands and tests; document GLB as the admitted runtime source format and external conversion as provenance, not SDK runtime behavior.
3. Verify all 19 Xier120 assets load, instantiate independently, and dispose under Babylon.

### TR5-TR7: integration and evidence

Run focused tests after each slice, then the complete gates:

The focused geometry gate must cover every currently admitted Babylon primitive, circle/ellipse,
convex and concave polygon water, both polygon winding orders, invalid polygon rejection,
asymmetric rectangular terrain, instance isolation, and disposal. It verifies generated bounds,
area, metadata, render/height sampling, and Havok Collider alignment without inventing support for
primitive kinds absent from the Canonical Schema.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:scenes
pnpm build
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm verify:outdoor-gameplay
pnpm verify:xier120-subjects
for scene in grassland sunlit-flower-bay world-08170639-54db; do
  pnpm plan:check -- --scene "$scene"
done
pnpm why three -r
pnpm why @dimforge/rapier3d-compat -r
```

`plan:check` 只面向实际拥有冻结 Plan 源的三个场景；其余 Catalog 场景不得伪造 Plan。
`plan:scene:check` 与 `visual:check` 在基线 `5755b40` 已因持久化 `world-spec.json` /
Composition identity 漂移而失败，因此本迁移使用 base/candidate 同命令对拍并把该债保留在
Backlog，不把已有失败冒充 Babylon 回归，也不自动重写 Golden 或降低 Composition 阈值。
迁移本身的 rendered acceptance 由 `verify:outdoor-gameplay` 的六场景 Gameplay +
artifact-only 双通道和人工截图检查承担。

The final census uses provider-specific dependency/import patterns rather than a raw `three` substring, so valid English prose and `three-wheel` resource IDs are not damaged.

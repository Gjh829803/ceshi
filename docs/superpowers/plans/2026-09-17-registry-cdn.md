# Asset Registry and CDN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute tasks with tests and scoped reviews; preserve the user's current worktree.

**Goal:** Separate engine presets from content; deliver versioned Registry, immutable CDN publication, selective locked downloading, and real consumer integration.
**Architecture:** Existing subject JSON remains content authoring authority. Engine preset-content owns tuning and composes content facts through a versioned adapter. Published manifests and artifacts are self-contained, queried via v1 Registry; project locks and a hash cache select and verify only required resources.
**Tech Stack:** Node 22+ ESM, existing TypeScript/JSON/Ajv, Three/Vite, Node test runner and Vitest; no new external service dependency.
**Spec:** asset-library/docs/registry-cdn-roadmap.md

## Global Constraints
- Work only in the existing codex/subject-library-demo worktree; preserve prior uncommitted changes.
- Keep all existing subject IDs and binary bytes. Never recreate the removed assets/ source.
- Keep one authority per editable field; preserve current effective runtime values during migration.
- Engine preset data stays in packages/preset-content/config per its AGENTS.md. Runtime algorithms and production asset policy do not change.
- Registry only declares data/contracts; no remote controller code execution.
- Unknown compatibility/readiness remains unknown. Model preview is not runtime evidence.
- Build and test a deployable publication locally; no cloud jobs, uploads, DNS or production deployment.
- Use direct installed node binaries, not pnpm auto-install. Do not commit unrelated/user changes; working-tree review artifacts capture task scope.

### Task 1: Split content facts and engine tuning
**Files:** packages/preset-content/config/{presets,integrations,generated}/; packages/preset-content/src/assets/host-adapter.mjs plus declarations/export; library subject profiles/assemblies/schema/tools/presets.mjs and whitebox.mjs; existing preset authority tests.
**Interfaces:** composeAssetCatalog(entries) -> full Host entries from content-only Whitebox entries plus engine-owned tuning; runtimeAssetContext(assetIds) -> {runtime_id,runtime_version,adapter_id,adapter_version,preset_digest,overrides_digest,supported_contracts}. Provide a pure composeContentSpec(assetId,contentFacts) for remote manifests. Keep generated package snapshots and public specs byte-equivalent in values.
**Ownership:** seat, envelope, actual wheel layout/radius/width/hub, subject collision/ground-contact facts stay content; game speed/response/powertrain/braking and camera/input presets move engine. Record explicit field paths and conflict rejection.
- [x] Save effective catalog and seven generated JSON snapshots before edits. Add a regression proving changing engine camera/handling does not alter content metadata/artifact identity, while changing content geometry updates composition.
- [x] Observe old authority failing this contract, implement field split and adapter; do not overwrite physical facts from tuning.
- [x] Remove mutable engine presets from content subject profiles/shared entries; keep only content profile docs and external runtime requirement refs.
- [x] Run preset source authority, camera/discovery, seating and type checks; report exact before/after value equivalence and all changed files.
Example contract:
```js
const before = composeContentSpec(id, facts);
assert.equal(before.speed, engineTuning.speed);
assert.deepEqual(before.seat, facts.seat);
assert.throws(() => composeContentSpec(id, {...facts, unexpectedOverride:true}), /CONTENT/);
```

### Task 2: Versioned protocol package (parent)
**Files:** packages/asset-contracts/{package.json,index.mjs,index.d.mts,schemas/v1.schema.json,tests/contracts.test.mjs}; generated library/client/contracts/; scripts/assets/sync-asset-contracts.mjs; package dependency and lock entries.
**Interfaces:** contract_version='1.0.0'. Registry descriptor, Manifest, Artifact, SearchRequest/Response, CompatibilityRequest/Response, ResolveRequest, ProjectLock, RegistryError. schema validation rejects malformed IDs/hash/paths/versions; canonical metadata JSON hashing excludes transport URLs.
- [x] Define protocol shapes in the scoped interface document before Tasks 3/4 consume them.
- [x] Test missing versions, unsafe manifest/storage paths, malformed hashes, unknown contract major and valid examples.
- [x] Export browser-safe constants/types/schema; Node schema validator uses existing Ajv. Generate exact standalone contract copy for library tools/client and check drift.

### Task 3: Immutable publisher and Registry API
**Files:** library/tools/publish.mjs,registry.mjs,registry-server.mjs plus tests/publication.test.mjs,registry.test.mjs; library resources publication metadata; no client/viewer/Host edits.
**Interfaces:** publishLibrary(root,{output,audience:'internal'|'public'}) returns Registry descriptor; createRegistryHandler(publishedRoot,{artifactBaseUrl?}) -> HTTP handler; Registry v1 per interface document. Metadata store may be generated JSON; HTTP requests never scan source assets.
- [x] Test a two-subject fixture with a shared runtime artifact, a source-only attachment, versions, a dependency and a cycle. Same-version mutation must fail before publication changes.
- [x] Export allowlisted runtime/preview closure only; preserve logical identity, exclude source/intake/migrations and engine tuning. Add immutable manifest and release indexes, write current descriptor last.
- [x] Implement paginated search, versioned describe, truthful compatibility, transitive resolve lock, artifact location and strict static publication serving. Historical snapshot resolution must survive current pointer updates.
- [x] Verify separate metadata/CDN origins, range/HEAD/cache policy, missing/unknown versions, cycle/conflict rejection and no source file disclosure.
Example behavior:
```js
const page = await api.search({limit:1});
assert.equal(page.items.length,1);
const lock = await api.resolve({assets:[{asset_id:'creature.horse',version:'0.1.0'}],purpose:'runtime'});
assert.equal(lock.artifacts.some(a=>a.role==='source'),false);
```

### Task 4: Registry client and selective lock/cache loader
**Files:** library/client/registry-client.mjs,materialize.mjs plus declarations if needed; library/tools/asset-cli.mjs; tests/client.test.mjs.
**Interfaces:** RegistryClient({registryUrl,artifactBaseUrl?,fetch?}) methods searchAssets/describeAsset/checkCompatibility/resolveAssembly/locateArtifact; materializeAssets(lock,{client,cacheRoot,outputRoot?,offline:false}) -> verified file map. SHA cache entries never enter Git.
- [x] Tests prove search/describe/resolve download zero GLB bytes, fetching a selected root downloads only transitive runtime closure, parallel same hash deduplicates, corrupt cache is repaired online and rejected offline.
- [x] Validate exact manifest bytes against lock, lock consistency and artifact hash/length. Lock has no expiring URLs. Support controlled artifact locations, bounded requests and atomic cache writes.
- [x] Cache selected manifests for verified offline replays. Missing cache or unavailable selected source errors explicitly.
- [x] CLI supports search, describe, resolve with manifest input, fetch lock with offline flag; no cloud write operation.

### Task 5: Consumer integration, viewer, delivery verification (parent)
**Files:** Host library-source/asset-resources/compiler/discovery startup; Playground Vite catalog; library/client/asset-library.mjs viewer app; serve/library CLI; cloud capsule closure; docs/CI/test census.
**Interfaces:** ASSET_REGISTRY_URL selects v1 protocol; ASSET_ARTIFACT_BASE_URL configures CDN independently; legacy ASSET_LIBRARY_ROOT/URL remain explicit authoring/dev adapter only (no fallback). Existing Agent tools remain policy scoped; source transport metadata is stripped from shipped public catalog.
- [x] Integrate engine composeAssetCatalog and remote selected metadata, then preserve frozen policy/world identities.
- [x] Add project asset manifest/lock to actual Creator candidate output and Playground selected scene delivery; generate only needed resource mappings.
- [x] Viewer reads Registry pages/details and published resources; show engine preset ownership/provider status accurately. Standalone published preview cannot require original authoring directory.
- [x] Wire local publication/Registry commands, generated contract checks and focused tests into existing repo workflows.
- [x] Verify one real humanoid/horse or dragon flow: search without media, lock, fetch from separate CDN, browser preview and Creator compile with original source inaccessible. Check endpoint relocation preserves lock and tamper fails.
- [x] Run library/Host/preset/consumer tests, typecheck, lint, boundary/census, runtime and Playground builds; independent final review; record exact limitations.

## Review map
Task1 -> Task5: content-only Host entries compose via engine adapter.
Task2 -> Task3/4/5: all wire shapes in protocol-interface.md, no guessed fields.
Task3 -> Task4: published immutable references and Registry HTTP endpoints.
Task4 -> Task5: selective verified downloader and manifest-to-consumer adapter.
Shared root package/lock/CI files are parent-owned; subagents report required edits.

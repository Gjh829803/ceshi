# BNA-3 Native Bundle、WorldPackage 与 Receipt Implementation Plan

> **For Codex:** Execute this plan with focused RED-to-GREEN slices. Do not begin
> product implementation until the base branch contains merged PR #53 and the
> post-merge applicability census below has confirmed that the reviewed BNA-3
> ownership and package boundaries still hold.

**Goal:** Turn one BNA-2-admitted Babylon Native source graph into a deterministic,
content-addressed WorldPackage whose Module Bundle, Dependency Lock, Asset Lock,
Authoring Attempt, Check Result, frozen Contribution, Runtime Bootstrap, Package
Root, WorldBuildIdentity and Build Receipt form one byte-exact closure, while
keeping formal Native Runtime admission fail-closed for BNA-4.

**Architecture:** Preserve one WorldPackage/Receipt/Store/Host-policy implementation.
`WorldPackageManifestV1.sceneSource` becomes the sole closed discriminator between
Canonical and Babylon Native packages. Babylon-free persistent Native contracts live
in `@whitebox-world/runtime-contracts`; `@whitebox-world/native-babylon` remains the
single construction/audit/replay owner; `@whitebox-world/world-package` remains a
pure synchronous Root/Receipt/Directory owner; one asynchronous Host entry under
`scripts/native-scene/` owns filesystem, installed dependency resolution, persistent
bundling, asset accounting and replay orchestration. No Native-specific package
implementation, compiler path, Runtime authority, Provider promotion or compatibility
alias is introduced.

**Primary authorities:**

- `docs/decisions/0007-canonical-and-babylon-native-authoring-lanes.md`
- `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- `docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md`
- `docs/superpowers/specs/2026-08-30-bna3-native-package-receipt-design.md`
- `docs/reviews/2026-08-30-bna3-native-package-receipt-design-review.md`
- `docs/reviews/full-dimension-review-protocol.md`
- `docs/reviews/runtime-deep-review-checklist.md`

**Required base:** The implementation branch must be synchronized with the latest
`origin/main` after PR #53 is merged. Record that base SHA in the first implementation
commit and re-run the consumer census before changing contracts. A design-only draft
may exist before then, but no product code or generated artifact may be committed on
the older base.

**Post-PR #53 applicability census:** The implementation base is
`origin/main@d537f4e9a0a05a448afc9d68681eb42ce31dc04a`. Compared with the design-review
base `b19f9e4be0cb56fc132cff656ade994df4e88a31`, the merged tree changes 102 files but
does not change `packages/world-package/**`, `packages/native-babylon/**`, or
`scripts/native-scene/**`. Its relevant Runtime-contract change makes
`jumpVariantPolicy` a required member of every Runtime Control Feel and updates the
RuntimeHost test harness. BNA-3 must preserve that complete Bootstrap value and must
not project, default, or strip the new field. This change does not introduce a second
Package, Bundle, Contribution, Runtime or Native admission owner, so the reviewed
BNA-3 ownership decision remains applicable. The historical Mode A GO remains scoped
to its recorded design SHA; BNA3-90 independently reviews the final implementation
tree instead of reusing that GO as implementation evidence.

**Implementation discipline:**

- current-only clean break: no deprecated re-export, overload fallback, V2 parallel
  format, optional old/new field pair or implicit Canonical default;
- one state owner and one parser per persistent concept;
- equality uses `===` / `!==`; nil/empty checks use lodash `isNil` / `isEmpty`;
- every imported dependency is direct in the importing workspace package;
- every behavior change starts with a failing focused reproducer;
- after a slice, run only its focused tests plus typecheck/diff checks whose inputs
  changed; run full gates once on the final exact SHA in Cursor Cloud;
- do not change Havok, Subject, Camera, Input, fixed Tick or Runtime Candidate
  construction in BNA-3.

## 1. Frozen decisions carried into implementation

1. There is one `WorldPackageManifestV1`, one Build Receipt parser, one directory
   verifier, one Store, one signature policy and one Host Compatibility policy.
2. `sceneSource.kind` is the only Lane discriminator. A Native Package never contains
   or invents a Canonical ExecutionPlan/IR/Layout identity.
3. `createCanonicalWorldPackageV1` and
   `createBabylonNativeWorldPackageV1` are the two explicit Lane builders over the one
   Package contract. The ambiguous `createWorldPackageV1` symbol is deleted.
4. The sole asynchronous Host orchestration entry is
   `scripts/native-scene/build-trusted-world-package.ts` exporting
   `buildTrustedBabylonNativeWorldPackageV1`. BNA3-10, BNA3-20 and BNA3-30 provide
   helpers to this file and must not introduce another high-level build entry.
5. The Runtime-contract layer owns exact, accessor-free, Babylon-free parsers,
   canonical bytes and hashes for Bundle, Dependency Lock, Asset Lock, Native Check
   Result and Native Contribution. `@whitebox-world/native-babylon` consumes them and
   does not re-export compatibility aliases.
6. The Native Module Bundle identity is derived only from its validated Bundle hash:
   `package://native-scene-module/sha256/<64 lowercase hex>`.
7. `@babylonjs/havok` is excluded from the Native Module Dependency Lock. It remains
   BNA-4 Runtime authority.
8. The Build Receipt and `WorldBuildIdentityV1` remain post-Root transport metadata.
   They never enter the Root inventory or a second approximate Root.
9. BNA-3 accepts only completed Authoring Attempt results and passed BNA-2 checks. It
   publishes no diagnostic Package for rejected/tool-error results.
10. APA is still proposed. BNA-3 consumes either a future APA-published asset or a
    manually admitted repository Golden with the same current BNA-2 admission,
    publication and class-build evidence fields. It does not create provisional APA
    envelopes.

## 2. Dependency-aware work graph

| ID | Goal / independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Input -> output / integration point | Required evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BNA3-00A | Freeze Babylon-free persistent Native contracts and source-neutral World Resource Lock | merged PR #53, BNA-1, BNA-2 | 00B, 10, 20, 30 | responsibility-named `packages/runtime-contracts/src/native-scene-*.ts` files, renamed resource-lock owner, affected exports; delete matching persistent owners from `native-babylon` | current persistent values -> exact parsed/frozen/hashable contracts | hostile-data matrix, hash/ref tests, package boundary test, zero old lock symbols | `main-agent-only` |
| BNA3-00B | Clean-break WorldPackage Manifest/Receipt/build input to one `sceneSource` union | 00A | 00C, 40, 50 | `packages/world-package/src/package-types.ts`, `package-contract.ts`, `package-build.ts`, `index.ts` | Canonical-only public contract -> shared shell + two closed members | parser/build RED-GREEN, Root-after-identity tests, public export census | `main-agent-only` |
| BNA3-00C | Migrate every Canonical Package consumer and delete old symbols/fields | 00B | 40, 50, 60, 90 | compiler/authoring/validation/scripts/apps consumers and fixtures; no Native behavior | old names/top-level fields -> explicit Canonical member narrowing | repository census zero, Canonical package/CLI/route regression | `sequential` |
| BNA3-10 | Produce one deterministic persistent Module Bundle artifact and one lock-bound Manifest finalizer from the admitted BNA-2 graph | 00A | 30, 40 | `scripts/native-scene/module-bundle.ts` and focused tests; replace old ephemeral implementation rather than wrap it | admitted graph -> immutable Bundle bytes/source inventory; artifact + frozen lock/profile facts -> manifest/hash | isolated-root byte equality, source/chunk/path/tamper/default-export/cleanup tests | `sequential` |
| BNA3-20 | Resolve a closed installed-tree Dependency Lock | 00A | 30, 40, 60 | `scripts/native-scene/dependency-lock.ts`, root `yaml` dependency, lock tests | admitted external imports + pnpm lock + installed manifests/files -> parsed lock/hash | version/integrity/missing/order/workspace tests; Havok exclusion | `parallel-safe` after 00A; integrate sequentially |
| BNA3-30 | Close Asset Lock, Authoring Attempt, Check and Registry membership into one frozen pure-builder input | 10, 20 | 40 | `scripts/native-scene/asset-lock.ts`, `native-package-input.ts`, Host test support; no public Package builder | frozen Host facts + selected/published assets + source/bundle/replay -> exact frozen pure-builder input | selected/resolved/locked/packaged equality, two-replay asset ledger equality, failed Attempt/Check and cleanup tests | `sequential` |
| BNA3-40 | Build deterministic Native Root, post-Root identity and Receipt, then own the sole trusted Host orchestration entry | 00C, 10, 20, 30 | 50, 60, 90 | Native member of `packages/world-package/src/package-build.ts`, `scripts/native-scene/build-trusted-world-package.ts`, contract/build/Host tests | frozen pure input -> `WorldPackageDirectoryV1`; trusted world directory -> verified directory | repeat/reordered input byte equality, per-file tamper, self-reference/closure/world-fact/cleanup tests | `main-agent-only` |
| BNA3-50 | Verify/read/store/sign both Package members through one source-neutral implementation | 40 | 60, 90 | `package-directory.ts`, `store.ts`, file adapter/signing/CLI consumers | arbitrary directory bytes -> closed verified union or stable fail-closed error | Canonical parity, Native hostile directory, atomic store/idempotence/read-after-write/signing tests | `sequential` |
| BNA3-60 | Admit Package identity at Runtime preflight while preserving BNA-4 capability rejection | 50 | 90, BNA-4 | RuntimeHost/package loader preflight and tests only; no adapter/Scene/Candidate changes | verified Native member -> exact source configuration then pre-allocation capability rejection | spies prove no module evaluation, factory, adapter, Engine, Scene or Candidate allocation | `main-agent-only` |
| BNA3-90 | Exact-tree gates, independent review, PR/merge and truth update | 00A..60 | BNA-4..8, BWB-3 | review, backlog/status docs and evidence only | exact candidate SHA -> scoped BNA-3 GO/NO-GO | Cursor Cloud affected/full gates, D1-D6, clean tree, merged main ancestry | `main-agent-only` |

Critical path:

```text
merged PR #53
  -> BNA3-00A -> BNA3-00B -> BNA3-00C
             \-> BNA3-10 -----------\
             \-> BNA3-20 ------------> BNA3-30 -> BNA3-40 -> BNA3-50
                                                           -> BNA3-60 -> BNA3-90
```

`BNA3-10` and `BNA3-20` may be developed independently only after BNA3-00A is
committed. They share no implementation files. Their integration and the single Host
entry remain main-agent-owned.

## 3. BNA3-00A — Persistent contracts and World Resource Lock

### Files

- Create responsibility-named files rather than one protocol monolith:
  - `packages/runtime-contracts/src/native-scene-module-bundle.ts`
  - `packages/runtime-contracts/src/native-scene-module-bundle.test.ts`
  - `packages/runtime-contracts/src/native-scene-dependency-lock.ts`
  - `packages/runtime-contracts/src/native-scene-dependency-lock.test.ts`
  - `packages/runtime-contracts/src/native-scene-asset-lock.ts`
  - `packages/runtime-contracts/src/native-scene-asset-lock.test.ts`
  - `packages/runtime-contracts/src/native-scene-diagnostics.ts`
  - `packages/runtime-contracts/src/native-scene-diagnostics.test.ts`
  - `packages/runtime-contracts/src/native-scene-contribution.ts`
  - `packages/runtime-contracts/src/native-scene-contribution.test.ts`
- Rename: `packages/runtime-contracts/src/canonical-resource-lock.ts` to
  `packages/runtime-contracts/src/world-resource-lock.ts`
- Update: `packages/runtime-contracts/src/index.ts`
- Update: `packages/runtime-contracts/package.json`
- Update/delete persistent definitions in:
  - `packages/native-babylon/src/assets.ts`
  - `packages/native-babylon/src/contribution.ts`
  - `packages/native-babylon/src/diagnostics.ts`
  - `packages/native-babylon/src/index.ts`
  - `packages/native-babylon/src/host.ts`
  - associated tests and all imports
- Update direct consumers of the renamed resource-lock contract.

### Step 1: Write RED contract tests

Add exact tests for:

- `WorldResourceLockEntryV1` and `WORLD_RESOURCE_KINDS_V1`, including existing
  Subject kinds plus `traversal-surface-profile`, `gameplay-bootstrap`,
  `world-runtime-bootstrap`, `native-scene`, `native-scene-api`,
  `native-scene-profile` and `static-geometry-asset`;
- canonical ordering and duplicate `(resourceKind, resourceRef)` rejection;
- Bundle Manifest source/file inventories, source graph hash, entry path, profile
  hashes, seed and Dependency/Asset Lock hashes;
- Dependency Lock exact entries and `runtime-external` / `bundle-toolchain` usage;
- Asset Lock exact entries, imported geometry metadata, legal/provenance fields and
  canonical sorting;
- Check Result and Contribution hostile objects, canonical bytes and hashes after
  moving their owner;
- validated `NativeSceneModuleBundleRefV1` derivation and inverse root/hash checks;
- accessor, symbol, prototype, sparse array, duplicate JSON field, `-0`, zero/upper
  case/malformed hash, unsafe path, missing/extra field and unknown discriminator
  rejection;
- deep freeze and defensive byte copies.

Run:

```bash
pnpm vitest run packages/runtime-contracts/src/native-scene-*.test.ts \
  packages/runtime-contracts/src/runtime-contracts.test.ts
```

Expected RED: missing exports/types/parsers and old resource-lock names remain.

### Step 2: Implement the sole persistent contract owner

Define exact V1 contracts with no Babylon or Node imports:

- `BabylonNativeSceneModuleBundleManifestV1`;
- `BabylonNativeDependencyLockV1`;
- `BabylonNativeAssetLockV1`;
- `NativeSceneModuleBundleRefV1`;
- migrated `BabylonNativeStaticGeometryImportMetadataV1`;
- migrated `NativeSceneDiagnosticV1`, `NativeSceneCheckResultV1`,
  `BabylonNativeSceneContributionV1` and their existing parsers/hashes.

The Bundle Manifest includes a canonical source inventory and
`sourceGraphHash`. The completed Attempt's `authoredSourceHash` will later equal this
hash; it must not equal an arbitrary Vite output filename. The Dependency Lock includes
its own `lockfileHash` and sorted entries. Hash functions hash parsed canonical objects,
not raw caller objects.

Migrate `native-babylon` to imports from Runtime Contracts. Do not leave a deprecated
re-export. Keep Babylon-facing candidate/registration and asset resolver interfaces in
`native-babylon`; only their persistent data members move.

### Step 3: Rename the resource-lock owner in one pass

Replace:

- `CanonicalResourceLockEntryV1` -> `WorldResourceLockEntryV1`;
- `CanonicalResourceKindV1` -> `WorldResourceKindV1`;
- `canonicalResourceLockEntriesV1` -> `worldResourceLockEntriesV1`;
- `CANONICAL_RESOURCE_KINDS_V1` -> `WORLD_RESOURCE_KINDS_V1`.

Update all source/tests/generated fixtures together and delete the former file and
exports. The Compiler may still produce this source-neutral contract; it does not own
the name.

### Step 4: Add boundary/census proof

Extend the existing unreleased clean-break or package-boundary verifier so that:

- `runtime-contracts` has no Babylon/Node/Vite/TypeScript import;
- `world-package` never imports `native-babylon`;
- `native-babylon` contains no second persistent parser/type owner;
- all four old resource-lock symbols are absent from source exports and consumers.

Run:

```bash
pnpm vitest run packages/runtime-contracts/src/native-scene-*.test.ts \
  packages/native-babylon/src/package-boundary.test.ts
pnpm typecheck
git diff --check
```

### Step 5: Commit

```bash
git add packages/runtime-contracts packages/native-babylon packages/compiler \
  packages/authoring packages/validation scripts apps package.json pnpm-lock.yaml
git commit -m "feat(package): freeze native persistent contracts"
```

## 4. BNA3-00B — One WorldPackage Scene Source union

### Files

- Update: `packages/world-package/src/package-types.ts`
- Update: `packages/world-package/src/package-contract.ts`
- Update: `packages/world-package/src/package-build.ts`
- Update: `packages/world-package/src/package-directory.ts` types only as needed
- Update: `packages/world-package/src/index.ts`
- Update: `packages/world-package/package.json`
- Update: package contract/build fixtures and tests.

### Step 1: Write RED manifest and receipt tests

Add tests proving:

- Manifest has one shared shell and one required `sceneSource` member;
- Canonical member accepts only its Authoring/IR/Plan/Layout fields;
- Native member accepts only Bundle/Lock/Attempt/Check/Contribution hashes and fixed
  Package paths;
- no Canonical-only identity remains at Manifest top level;
- `resources` contains only immutable external Registry/asset bytes and excludes
  Gameplay/Runtime Bootstrap, Plan, Bundle, locks, Contribution, Check and Manifest
  files owned by the Package Root;
- `assertWorldPackageBuildReceiptV1` reconstructs the source-specific
  `WorldBuildIdentityV1` member from Manifest data;
- Identity/Receipt/integrity/signature paths remain excluded from Root;
- mixed members, missing discriminator, implicit Canonical fallback, old top-level
  fields and cross-Lane paths reject.

Run:

```bash
pnpm vitest run packages/world-package/src/package-contract.test.ts \
  packages/world-package/src/package-build.test.ts
```

Expected RED: current Manifest is Canonical-only and old public names remain.

### Step 2: Implement the current-only public contract

- introduce `WorldPackageSceneSourceV1` closed union;
- move Canonical fields into its Canonical member;
- add the Native member exactly as frozen by the design;
- keep gameplay/runtime hashes, registry lock, world bounds, resource budget, legal,
  compatibility and resources in the shared shell;
- remove Gameplay and Runtime Bootstrap pseudo-resource rows from the current
  Canonical `resources` list; their paths/hashes remain Root-bound and their
  Registry identity remains in `lockedResources`;
- split resolved build resource inputs into explicit Canonical and Native types;
- replace `canonicalWorldPackageManifestV1` with
  `canonicalizeWorldPackageManifestV1`;
- replace `canonicalWorldPackageFileIntegrityEntriesV1` with
  `canonicalizeWorldPackageFileIntegrityEntriesV1`;
- rename `canonicalWorldPackageSignatureEnvelopeV1` to
  `canonicalizeWorldPackageSignatureEnvelopeV1` because it means JCS
  canonicalization, not the Canonical Scene Source;
- rename `canonicalWorldPackageDirectoryForStoreV1` to
  `canonicalizeWorldPackageDirectoryForStoreV1` for the same reason;
- rename the Canonical builder/input/context to
  `createCanonicalWorldPackageV1`, `CreateCanonicalWorldPackageV1Input` and
  `CanonicalWorldPackageBuildContextV1`;
- create `WorldPackageSharedBuildContextV1` with no Lane-specific fields;
- freeze `FrozenBabylonNativeWorldPackageBuildInputV1`, but do not export
  `createBabylonNativeWorldPackageV1` until BNA3-40 implements it completely; no stub,
  throwing placeholder or runtime fallback is accepted in an intermediate merge
  candidate.

This explicitly closes design-review P3 item 1.

### Step 3: Prove root/identity order

Keep one helper that:

1. freezes Root files;
2. derives integrity entries;
3. hashes the Root;
4. derives Package Ref and source-specific WorldBuildIdentity;
5. creates Build Receipt and transport files.

Neither Lane builder may duplicate these steps. Add a negative test that injecting any
transport file into Root rejects before Receipt publication.

### Step 4: Focused GREEN

```bash
pnpm vitest run packages/world-package/src/package-contract.test.ts \
  packages/world-package/src/package-build.test.ts \
  packages/world-package/src/package-directory.test.ts \
  packages/world-package/src/store.test.ts
pnpm typecheck
git diff --check
```

### Step 5: Commit

```bash
git add packages/world-package
git commit -m "refactor(package): add closed scene source manifest"
```

## 5. BNA3-00C — Canonical consumer clean break

### Files

Update every consumer found by repository census, including:

- `packages/authoring-host/**`
- `packages/validation/**`
- `scripts/lib/file-world-package.ts`
- `scripts/lib/trusted-world-package.ts`
- `scripts/lib/route-validation-runner.ts`
- `scripts/lib/world-package-cli.ts`
- `scripts/lib/headless-runtime-session.ts`
- `scripts/lib/world-change-publication-recovery.ts`
- `scripts/lib/durable-world-change-runtime.ts`
- `apps/studio/**`
- all WorldPackage fixtures, generated evidence and tests.

### Step 1: Capture the RED census

Add/extend a mechanical test that fails while any of these remain:

```text
createWorldPackageV1
CreateWorldPackageV1Input
WorldPackageBuildContextV1
CanonicalResourceLockEntryV1
CanonicalResourceKindV1
canonicalResourceLockEntriesV1
CANONICAL_RESOURCE_KINDS_V1
ResolvedWorldPackageResourceArtifactV1
WorldPackageGameplayBootstrapMembershipInputV1
assertWorldPackageGameplayBootstrapMembershipV1
canonicalWorldPackageManifestV1
canonicalWorldPackageFileIntegrityEntriesV1
canonicalWorldPackageSignatureEnvelopeV1
canonicalWorldPackageDirectoryForStoreV1
```

Also reject public Manifest reads of top-level `authoringSpecHash`,
`normalizedWorldIrHash`, `executionPlanHash`, `layoutSolveReportHash` or Canonical Plan
path.

### Step 2: Migrate by explicit narrowing

Canonical-only consumers must assert
`verified.kind === "canonical-execution-plan"` or narrow
`receipt.manifest.sceneSource.kind`. Source-neutral consumers read only shared fields.
Do not use optional chaining, property-existence inference or a default branch to hide
an unhandled Native member.

Split the old membership assertion into explicit Canonical and Native functions. Only
implement the Canonical function in this slice; the Native function lands with BNA3-40.

### Step 3: Focused parity proof

Run the focused Package, authoring-host, validation subject, CLI/file adapter and route
tests affected by the census, then:

```bash
pnpm typecheck
pnpm verify:unreleased-clean-break
git diff --check
```

Do not run root `pnpm test` here; it is delegated once at BNA3-90.

### Step 4: Commit

```bash
git add packages scripts apps
git commit -m "refactor(package): migrate canonical package consumers"
```

## 6. BNA3-10 — Deterministic persistent Module Bundle

### Files

- Replace/refactor: `scripts/native-scene/ephemeral-bundle.ts`
- Create: `scripts/native-scene/module-bundle.ts`
- Create: `scripts/native-scene/module-bundle.test.ts`
- Update: `scripts/native-scene/native-scene-check.ts`
- Update: `scripts/native-scene/source-admission.ts` and tests only to expose the exact
  admitted source/external-import inventory; do not change admission rules.

### Step 1: RED deterministic artifact tests

Test two independently created temporary roots with identical admitted sources. Assert
byte-exact equality for:

- source inventory and `sourceGraphHash`;
- `native/scene.mjs` bytes and hash;
- any closed chunk/static inventory;
- the emitted immutable Bundle artifact before locks exist;
- external import inventory and fixed entry path.

Then finalize each artifact with identical fixture Dependency/Asset Lock hashes,
Bootstrap seed and profile facts, and assert Bundle Manifest bytes/hash equality. A
changed lock hash must change only the final Manifest/hash, never the already emitted
Bundle entry bytes or source graph hash.

Add negative fixtures for source order, path escape, sourcemap/absolute path leakage,
unlisted chunk/static file, bundle tamper, named Runtime export and cleanup failure.

### Step 2: Extract one bundler implementation

Create one low-level bundler from the admitted BNA-2 `ts.Program` and exact source
snapshot. Both the trusted-local checker and persistent Package Host call it. It owns:

- strict TypeScript diagnostics;
- the existing external allowlist;
- Vite/Rollup target/options;
- source snapshot and output inventory;
- single default export validation;
- temporary root cleanup.

The checker evaluates the temporary entry and discards files. The persistent Host
copies the same returned immutable bytes into the future Package. The helper returns
Bundle bytes, source/file inventories, source graph hash and actual external imports;
it does not invent lock hashes that do not yet exist. A pure Manifest finalizer in this
same file accepts the parsed Dependency/Asset Lock hashes plus frozen Bootstrap/Profile
facts after BNA3-20/30 have resolved them. Do not shell out to the CLI and do not
maintain an ephemeral and persistent bundler configuration.

### Step 3: GREEN and cleanup proof

```bash
pnpm vitest run scripts/native-scene/module-bundle.test.ts \
  scripts/native-scene/ephemeral-bundle.test.ts \
  scripts/native-scene/native-scene-check.test.ts
pnpm typecheck
git diff --check
```

Delete the old file/API if the refactor makes it obsolete; do not keep a wrapper solely
for compatibility.

### Step 4: Commit

```bash
git add scripts/native-scene
git commit -m "feat(native): build deterministic module bundles"
```

## 7. BNA3-20 — Installed-tree Dependency Lock

### Files

- Create: `scripts/native-scene/dependency-lock.ts`
- Create: `scripts/native-scene/dependency-lock.test.ts`
- Update: root `package.json` and `pnpm-lock.yaml` with direct `yaml` dependency if the
  implementation parses `pnpm-lock.yaml` through that mature parser.

### Step 1: RED lock resolver matrix

Fixtures must cover:

- installed `@babylonjs/core`, `@whitebox-world/native-babylon`, optional Block Profile,
  TypeScript, Vite and Rollup;
- exact package versions and package manifest hashes;
- exact pnpm lockfile hash and resolution integrity;
- deterministic installed package file inventory hash, including workspace package
  source but excluding nested `node_modules`, caches, VCS and generated temp files;
- runtime-external versus bundle-toolchain usage;
- missing manifest, wrong version, tampered installed file, wrong lock integrity,
  duplicate entry, nondeterministic enumeration and symlink escape;
- `@babylonjs/havok` and an unused allowed package both absent;
- a Module external import without a corresponding locked package rejected.

### Step 2: Implement from admitted usage, not allowlist breadth

The resolver consumes the admitted source graph's actual external import specifiers.
It adds the toolchain packages actually used by the frozen bundler. It reads the exact
workspace lockfile and installed package manifests/files, derives the closed parsed
`BabylonNativeDependencyLockV1`, then hashes it. A Module does not self-report versions
or paths.

`packageManifestHash` hashes canonical parsed `package.json` data.
`packageIntegrityHash` hashes a canonical file-integrity inventory of the exact
installed package content. The lockfile's own byte hash is also frozen at lock level;
registry resolution integrity must match the selected package entry. Workspace package
entries use the real workspace package tree inventory rather than inventing an npm
tarball integrity.

### Step 3: GREEN

```bash
pnpm vitest run scripts/native-scene/dependency-lock.test.ts
pnpm typecheck
git diff --check
```

### Step 4: Commit

```bash
git add scripts/native-scene package.json pnpm-lock.yaml
git commit -m "feat(native): lock module dependencies"
```

## 8. BNA3-30 — Asset/Attempt closure and frozen Package input

### Files

- Create: `scripts/native-scene/asset-lock.ts`
- Create: `scripts/native-scene/asset-lock.test.ts`
- Create: `scripts/native-scene/native-package-input.ts`
- Create: `scripts/native-scene/native-package-input.test.ts`
- Update shared Native test support only; do not create a high-level Package entry in
  this slice.

### Step 1: RED asset ledger tests

Wrap the BNA-2 locked asset resolver for each replay and record only successfully
resolved `assetResourceRef` values. Test:

- both isolated replay ledgers are byte-exact equal;
- Attempt selected refs, resolved refs, Asset Lock entries and Package asset inputs are
  exact set equal;
- publication receipt ref/hash from Attempt equals the Asset Lock entry;
- locked bytes, manifest/admission/publication/class-build hashes and import metadata
  match the resolver value;
- license/provenance and redistribution policy close;
- missing/extra/reordered/duplicate assets, mutated returned bytes, rejected asset
  resolution and manual `scene-shell` reject.

### Step 2: RED Authoring/Bootstrap closure tests

Before any Root exists, reject unless:

- Route decision is `babylon-native`;
- Attempt ref/hash/route ref/hash/Brief/source input/seed/profile match;
- completed Result's Attempt hash matches and its `authoredSourceRef` is the selected
  `sceneModuleRef` while `authoredSourceHash` equals Bundle `sourceGraphHash`;
- Native Check is passed and binds the same module ref;
- replay Contribution hash matches the frozen Contribution;
- Bootstrap and World Runtime Bootstrap have exactly equal
  `initialControlledEntityId`;
- Bootstrap `gameplayBootstrapRef` matches Gameplay and World Runtime Bootstrap;
- Bootstrap seed equals Attempt seed and Manifest seed source;
- Host-supplied `worldId`, `worldBounds` and `resourceBudget` are exact parsed facts;
  Spawn/vertices are inside bounds and actual counts stay within budget, but no value is
  derived back from Contribution geometry or BNA-2's check budget;
- Registry Lock is the exact transitive closure of Gameplay, Runtime, Native API,
  Profile, Module, traversal profiles and selected assets.

This closes design-review P3 items 3 and 4.

### Step 3: Freeze the sole pure-builder input

`prepareFrozenBabylonNativeWorldPackageBuildInputV1` owns the Host-side closure up to
the pure WorldPackage boundary:

```text
workspace read
-> BNA-2 source admission
-> deterministic Bundle artifact
-> installed dependency lock from actual external imports
-> selected/published Asset Lock
-> finalize lock-bound Bundle Manifest
-> two isolated candidate replays with asset ledgers
-> route/attempt/result/check/contribution/registry/world-fact closure
-> FrozenBabylonNativeWorldPackageBuildInputV1
```

It accepts no preloaded callback, caller-provided Contribution, arbitrary Package Root
or CLI JSON. On every throw/rejection it disposes both Candidate leases and temporary
roots, returns no Package Ref and never writes the store. It does not export a second
Package builder or call the not-yet-implemented pure Native builder.

The final `buildTrustedBabylonNativeWorldPackageV1` orchestration file is exclusively
owned by BNA3-40, where the pure builder exists. BNA3-10/20/30 helpers remain
lower-level and cannot publish a Package. This explicit file ownership closes
design-review P3 item 2 without a forward dependency.

### Step 4: GREEN

```bash
pnpm vitest run scripts/native-scene/asset-lock.test.ts \
  scripts/native-scene/native-package-input.test.ts \
  packages/native-babylon/src/runtime-replay.test.ts
pnpm typecheck
git diff --check
```

### Step 5: Commit

```bash
git add scripts/native-scene
git commit -m "feat(native): close trusted package build inputs"
```

## 9. BNA3-40 — Native WorldPackage Root, Identity, Receipt and trusted Host entry

### Files

- Update: `packages/world-package/src/package-build.ts`
- Update: `packages/world-package/src/package-build.test.ts`
- Update: `packages/world-package/src/package-contract.ts`
- Update: `packages/world-package/src/package-contract.test.ts`
- Update: `packages/world-package/src/test-fixture.ts`
- Create: `scripts/native-scene/build-trusted-world-package.ts`
- Create: `scripts/native-scene/build-trusted-world-package.test.ts`
- Add a Native test fixture beside the existing package fixture; do not create a
  production example asset pipeline.

### Step 1: RED pure-builder closure tests

Build the same frozen Native input twice and with reordered input collections. Assert
byte-exact equality of every Root file, integrity entries, Package Root/Ref,
WorldBuildIdentity bytes/hash and Build Receipt bytes.

Assert the Root contains exactly the frozen layout from the design and excludes all
transport/signature paths. Tamper each component hash/path/member and require failure
before a Package Ref is returned.

### Step 2: Implement `createBabylonNativeWorldPackageV1`

The pure builder:

- re-parses all persistent inputs and copies all byte buffers;
- calls explicit Native membership closure;
- writes Bootstrap, Bundle manifest/entry, locks, Contribution, Check, Route, Attempt,
  Result, Registry, Gameplay/Runtime, resources and legal files;
- creates the Native `sceneSource` member from hashes of the actual Root-bound files;
- calls the same shared Root -> Identity -> Receipt helper as Canonical;
- sets Native `WorldBuildIdentityV1.sceneSourceIdentity` to only Bootstrap, Bundle and
  Contribution hashes;
- returns `assembleWorldPackageDirectoryV1` output and never touches filesystem.

### Step 3: Adversarial Root/world-fact tests

Cover:

- Identity/Receipt/integrity injected into Root;
- Native Root containing Canonical Plan/IR/Layout files;
- Canonical Root containing `native/` or `authoring/scene-authoring-*` files;
- Bundle ref/hash mismatch;
- Bootstrap/Attempt seed drift;
- controlled entity drift;
- out-of-bounds Spawn/vertex and actual usage over budget;
- failed Check/Attempt and Contribution mismatch;
- transport metadata mutation after Root creation.

### Step 4: Wire the only trusted Host pipeline

`buildTrustedBabylonNativeWorldPackageV1` is now the only high-level asynchronous Host
entry and owns this exact order:

```text
workspace read
-> BNA-2 source admission
-> deterministic Bundle artifact
-> installed dependency lock from actual external imports
-> selected/published Asset Lock
-> finalize lock-bound Bundle Manifest
-> two isolated candidate replays with asset ledgers
-> prepareFrozenBabylonNativeWorldPackageBuildInputV1
-> createBabylonNativeWorldPackageV1
-> verifyWorldPackageDirectoryV1
-> return immutable directory
```

It must not duplicate parser/hash/root logic, accept a prebuilt Contribution or shell
out to the CLI. Add throwing-bundle, dependency mismatch, first/second replay failure,
pure-builder failure and verifier failure tests that prove Candidate/temp cleanup and
absence of Store publication.

### Step 5: GREEN

```bash
pnpm vitest run packages/world-package/src/package-build.test.ts \
  packages/world-package/src/package-contract.test.ts \
  scripts/native-scene/build-trusted-world-package.test.ts
pnpm typecheck
git diff --check
```

### Step 6: Commit

```bash
git add packages/world-package scripts/native-scene
git commit -m "feat(package): build native package receipts"
```

## 10. BNA3-50 — Unified verifier, file adapter, Store and signing

### Files

- Update: `packages/world-package/src/package-directory.ts`
- Update: `packages/world-package/src/package-directory.test.ts`
- Update: `packages/world-package/src/store.ts`
- Update: `packages/world-package/src/store.test.ts`
- Update: `scripts/lib/file-world-package.ts` and tests
- Update: `scripts/lib/world-package-signing.ts` and tests
- Update: `scripts/lib/world-package-cli.ts` and tests only where shared read/inspect
  output must expose `sceneSource.kind`.

### Step 1: RED verified-union tests

Add `VerifiedCanonicalWorldPackageDirectoryV1` and
`VerifiedBabylonNativeWorldPackageDirectoryV1` expectations. Native verification must
reconstruct and expose parsed immutable Bootstrap, Bundle/hash/ref, locks, completed
Attempt, passed Check, Contribution and copied asset bytes. It must never expose Module
callbacks or Babylon handles.

### Step 2: Refactor one verifier with source-specific delegates

The shared verifier owns:

- exact directory/root/transport/signature file sets;
- canonical JSON/UTF-8 and file integrity;
- Manifest/Receipt/Identity/Host compatibility;
- legal resources and immutable byte maps.

Then it dispatches exactly once on `manifest.sceneSource.kind`:

- Canonical delegate replays Normalizer/Compiler as today;
- Native delegate parses all Native Root files and replays hashes, membership, exact
  set and world-fact predicates without evaluating Module or creating Candidate.

Return a discriminated union with `kind` at the verified result. No optional Plan fields
and no caller property probing.

### Step 3: Store/file/signing atomicity

Run the same Store/File/Signature code for either member. Add tests for:

- write-temp -> fsync/close where existing adapter supports it -> atomic rename ->
  read-after-write verify;
- concurrent identical bytes idempotence;
- same Ref with different bytes fail-closed;
- partial write and rename failure cleanup;
- Native signatures cover the same Root hash/Package identity as Canonical;
- shared CLI inspect output reports source kind and source-specific hashes without
  pretending Native is runnable.

### Step 4: GREEN

```bash
pnpm vitest run packages/world-package/src/package-directory.test.ts \
  packages/world-package/src/store.test.ts \
  scripts/lib/file-world-package.test.ts \
  scripts/lib/world-package-signing.test.ts \
  scripts/lib/world-package-cli.test.ts
pnpm typecheck
git diff --check
```

### Step 5: Commit

```bash
git add packages/world-package scripts/lib
git commit -m "feat(package): verify and store both scene sources"
```

## 11. BNA3-60 — RuntimeHost package preflight, still fail-closed

### Files

- Update: `packages/runtime-host/src/runtime-host.ts`
- Update/add focused RuntimeHost package-preflight tests
- Update: `scripts/lib/headless-runtime-session.ts` only if it owns Package-to-runtime
  configuration projection.
- Do not update Babylon adapter, Havok, Subject, Camera, input or render loop.

### Step 1: RED allocation-boundary test

Provide a verified Native WorldPackage and spies for:

- Module loader/evaluation;
- Runtime adapter factory;
- Candidate factory;
- Babylon Engine/Scene allocation.

Expected behavior is a stable BNA-4 capability rejection while every spy remains zero.
Tampered Package/identity/dependency lock must reject even earlier with the appropriate
Package/preflight diagnostic.

### Step 2: Implement source projection without activation

Allow the loader/preflight layer to recognize the verified Native union member and
construct only the source-neutral plain configuration identity from the verified
Bootstrap and Bundle Ref. Keep
`WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`, updating its text to state that BNA-3
Package identity is present but BNA-4 Gameplay Surface/Runtime admission remains
required. The rejection remains before adapter/Candidate/Module evaluation.

Do not relax BNA-1's fail-closed branch and do not add an experimental fallback to the
formal Host.

### Step 3: Runtime-deep focused GREEN

Run the new boundary test plus affected RuntimeHost lifecycle and Canonical replacement
tests. Include malformed identity, adapter-throw and current-session-preservation
fixtures where their inputs changed.

```bash
pnpm vitest run packages/runtime-host/src/runtime-host.test.ts
pnpm verify:bna1-clean-break
pnpm typecheck
git diff --check
```

The BNA-1 clean-break verifier may require an intentional current-fact update: it must
continue proving no Native Candidate allocation, not falsely require absence of a
formal Native Package member now owned by BNA-3.

### Step 4: Commit

```bash
git add packages/runtime-host scripts/lib scripts/verification
git commit -m "feat(runtime): preflight native package identity"
```

## 12. BNA3-90 — Exact-tree closure, review, PR and merge

### Step 1: Focused evidence census

Before heavy gates:

```bash
git status --short
git diff --check
pnpm verify:unreleased-clean-break
pnpm verify:bna1-clean-break
pnpm verify:bna2-clean-break
pnpm typecheck
```

Run each affected focused suite once. Do not repeat a gate already subsumed by a broader
passing gate on the same tree.

### Step 2: Commit candidate docs/evidence truth

Create:

- `docs/reviews/2026-08-30-bna3-native-package-receipt-review.md`

Update:

- `docs/18-refactor-progress-and-backlog.md` only after implementation evidence is
  complete, initially marking the candidate as awaiting exact-SHA Cloud review;
- long Native design current-state table without claiming BNA-4/Havok/playability;
- this plan's evidence matrix with exact commit SHA and command exits.

Do not change frozen plan/lock artifacts or claim BWB-3/BNA-4 completion.

### Step 3: Dispatch exact-SHA Cursor Cloud gates

Use separate Cloud Agents at the same pushed candidate SHA:

1. affected/full gates: frozen install, self-check, typecheck, Studio/independent/root
   tests, both builds, BNA clean breaks, Package/Native focused verifiers and clean tree;
2. independent Mode B + runtime-deep review: D1-D6, installed Babylon/Havok source
   checks where engine semantics are asserted, package/root/identity/lock/atomicity,
   current-only census and Runtime pre-allocation rejection.

Require full acceptance signals and retrieve final reports through the Cursor API. A GO
is valid only for that exact SHA. Any product change invalidates it and requires a new
exact-SHA run; a documentation-only truth update reruns only diff/link checks.

### Step 4: Resolve findings narrowly

For each P0/P1/P2 or failing gate:

1. verify against current source;
2. write a failing focused reproducer;
3. repair at the closest publication boundary;
4. run affected focused gates;
5. push a new SHA and obtain fresh exact-SHA review/gate evidence.

Do not weaken parsers, bypass Source Admission or add aliases to silence tests.

### Step 5: PR and merge

Create/update the BNA-3 PR, ensure the required GitHub check passes, merge to `main`,
fetch `origin/main`, and prove the reviewed implementation SHA is an ancestor. Then make
the smallest truth-only follow-up if needed to mark BNA-3 complete with PR/review/SHA
links. Leave BNA-4 through BNA-8 and BWB-3+ open.

## 13. Final acceptance matrix

| Requirement | Owner task | Proof |
| --- | --- | --- |
| One current Manifest/Receipt/Store/Host policy | 00B, 50 | union parser, export/census, Canonical+Native fixtures |
| No old builder/resource-lock/JCS names | 00A..00C | exact repository census zero |
| Deterministic persistent Bundle | 10 | isolated-root byte equality and tamper tests |
| Exact installed dependency closure | 20 | lockfile+installed-tree tests; Havok exclusion |
| Exact selected/resolved/locked/packaged assets | 30 | dual replay ledger and negative matrix |
| Route/Attempt/Result/Check/Contribution closure | 30, 40 | failed-result/hash mismatch tests |
| Root then Identity/Receipt, no self-reference | 00B, 40, 50 | transport exclusion and replay tests |
| Canonical behavior preserved | 00C, 50 | compiler replay, package/route/CLI gates |
| Runtime still rejects before allocation | 60 | zero-call spies and lifecycle regression |
| No BNA-4/Havok/Subject/Camera authority drift | 60, 90 | runtime-deep review and source census |
| Exact-SHA engineering GO | 90 | Cloud gate receipt + independent review |
| Merged truth | 90 | reviewed SHA ancestry in `origin/main`, backlog links |

## 14. Explicit non-goals

- no Native Runtime Scene publication, Havok Shape/Aggregate, Subject, Camera, Input,
  fixed Tick or Surface Admission;
- no Hosted isolation, Tenant hard cap or arbitrary-code security claim;
- no Provider call, generated asset production, APA provisional protocol or
  `scene-shell` packaging;
- no AI generation success benchmark, visual Capture, Route/Nav Evidence or `goTo`;
- no BWB-3 screenshots or BWB-4 Collider/Havok integration;
- no WorldChangeSet/incremental Native edit path;
- no Three.js endpoint, internal compiler translation or parallel Native Package
  implementation;
- no compatibility aliases or V1/V2 coexistence.

The next permitted product step after an accepted BNA-3 merge is BNA-4: consume the
verified Native member through the shared RuntimeHost/Babylon/Havok Gameplay Kernel,
replay actual Contribution against the Receipt and atomically publish one SDK-owned
session.

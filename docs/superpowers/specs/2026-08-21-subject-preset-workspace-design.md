# Subject Preset Workspace and Versioned Publishing Design

- Status: implemented; amended for the P1.5 authority model
- Date: 2026-08-21
- Target branch after verification: `main`
- Development branch: `feature/subject-preset-workspace`
- Upstream architecture: [`2026-08-20-character-camera-capability-integration-design.md`](./2026-08-20-character-camera-capability-integration-design.md)
- Subject foundation: [`2026-08-19-extensible-subject-authoring-design.md`](./2026-08-19-extensible-subject-authoring-design.md)

## 1. Decision

Add one authoring workspace for selecting a Subject Package's Motion algorithm and tuning its Control Feel, Control deadzone, and Camera Profiles. The workspace saves named local versions, chooses one local default, exports a locked publication candidate, promotes that candidate to immutable Registry resource versions, and selects one exact public default per stable Subject Definition id from a Git-controlled catalog.

P1.5 owns the final authority split: Motion Profiles select an algorithm and carry no numeric parameter bag; Control Feel owns movement speeds, acceleration/deceleration, turn rate, jump behavior and response exponent; Control owns only input interpretation such as `moveDeadzoneRatio`; Camera owns framing. Subject Preset publication must preserve this split rather than recreating Motion tuning as an overlay.

The browser remains an untrusted preview and authoring client. It may read files selected by the user, store local drafts, and download JSON, but it must not write the repository, invoke Git, commit, push, or merge. A local CLI performs validation, deterministic planning, and explicit repository writes on a non-`main` branch. Git review, verification, and merge remain the authority that turns a candidate into the public default.

The same workspace also provides a first subject-onboarding flow. A contributor supplies a typed onboarding manifest and a self-contained GLB or a supported whitebox assembly. The CLI validates asset facts, selects registered capability presets, generates Registry resources and Playground resolver entries, and produces an exact review plan before writing.

## 2. Product model

The system has six lifecycle stages. Their names and permissions must remain distinct.

```text
Working Draft
  mutable, browser-local, may be incomplete
      ↓ save named version
Local Preset Version
  immutable browser-local snapshot
      ↓ choose
Local Default Pointer
  one exact local preset per Subject Definition id and source hash
      ↓ export
Publication Candidate
  portable, immutable, locked, untrusted JSON
      ↓ validate / plan / promote on a branch
Registry Resource Versions
  immutable Control Feel, Control, Camera and Subject Definition resources;
  exact Motion selections remain reusable
      ↓ update Git-controlled pointer and merge
Public Default
  one exact Subject Definition Ref and Hash per Subject Definition id on `main`
```

The public default is not “the newest version” and Runtime must never guess it from a numeric suffix. It is selected by an explicit catalog entry. Existing worlds continue to reference exact resource Refs and remain reproducible.

## 3. Scope

### 3.1 Included

- Exact default/optional/fallback Motion Profile selections. Motion Profiles are bag-free algorithm selectors and are never numerically derived.
- Control Feel tuning for the closed P1.5 Ground/Air vocabulary, including speed, acceleration/deceleration, turn rate, jump behavior and response exponent.
- Control input tuning for the current Runtime's `moveDeadzoneRatio`. Structural input-space and facing policies remain Registry-authored.
- Every compatible Camera Rig Profile, with independent tuning per profile rather than one global tuning object.
- Named local versions, a local default pointer, restore, compare, duplicate, rename and delete operations.
- Migration from current fragmented `worldkit.motion-draft.v4.*`, `worldkit.camera-tuning.v4.*`, subject selection and camera-preference keys.
- Export and import of a strict publication-candidate JSON envelope.
- Candidate validation, deterministic plan generation and explicit promotion CLI.
- Immutable Registry Profile and Subject Definition versions.
- A Git-controlled public-default catalog.
- A typed Subject Onboarding Manifest, validation, planning and generation for supported asset/whitebox subjects.
- Playground panels for tuning, local versions, publication evidence and subject onboarding.
- Stable Browser APIs for reading baseline closure, selecting exact locked Feel/Control Refs, applying Camera session preview, and exporting snapshots.
- Tests proving local isolation, resource-lock integrity, Runtime support, deterministic promotion and all-six existing Subject Package compatibility.

### 3.2 Excluded

- Browser, Studio or Runtime endpoints that commit, push, merge, create a GitHub PR, or write `main`.
- Automatic installation of new Motion Kernels, Camera Algorithms, arbitrary JavaScript, WASM or provider code.
- Editing Camera Context rule logic or Relationship transactions in the first candidate schema.
- Promoting Runtime-unsupported or draft-only parameters.
- Automatically upgrading other Subject Definitions that happen to share a base Profile.
- Treating preview relationship stripping as canonical validation.
- Full arbitrary-rig retargeting, compound vehicle physics, Mount Runtime, powered flight, underwater motion or multiplayer control.

## 4. Local workspace data

### 4.1 `SubjectPresetWorkingDraftV1`

```ts
interface SubjectPresetWorkingDraftV1 {
  kind: "worldkit-subject-preset-working-draft";
  schemaVersion: 1;
  draftId: string;
  subjectDefinitionId: string;
  baseSubjectDefinitionRef: string;
  baseSubjectDefinitionContentHash: string;
  selectedMotionProfileRef: string;
  selectedControlFeelProfileRef: string;
  selectedControlProfileRef: string;
  selectedCameraPreferenceRef: string | null;
  controlFeelOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  controlOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  cameraOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  createdAtIso: string;
  updatedAtIso: string;
}
```

The working draft stores all Camera Profile overrides, not just the currently selected profile. Storage is keyed by exact Subject Definition Ref and content hash. A hash mismatch never silently applies an old draft to a changed Registry baseline.

### 4.2 `SubjectPresetLocalVersionV1`

A named local version contains the same semantic payload plus:

```ts
interface SubjectPresetLocalVersionV1 {
  kind: "worldkit-subject-preset-local-version";
  schemaVersion: 1;
  localVersionId: string;
  displayName: string;
  notes: string;
  sourceDraftId: string;
  contentHash: string;
  content: SubjectPresetSemanticContentV1;
  createdAtIso: string;
}
```

The semantic content is canonicalized and hashed. Rename and notes do not alter the semantic hash. Saving never overwrites another local version; editing after restore creates a working draft again.

### 4.3 `SubjectPresetLocalDefaultPointerV1`

```ts
interface SubjectPresetLocalDefaultPointerV1 {
  schemaVersion: 1;
  subjectDefinitionId: string;
  baseSubjectDefinitionRef: string;
  baseSubjectDefinitionContentHash: string;
  localVersionId: string;
}
```

`subjectDefinitionId` is copied from the locked
`RegistrySubjectDefinitionV3.id` and is stable across versions of the same
definition. Candidate/default-catalog validation rejects a pointer whose exact
Ref resolves to a different `id`, and rejects duplicate defaults for one id.

At startup the pointer applies only if all identities and hashes still match. Otherwise the workspace retains the data, disables automatic application, and displays a migration warning.

### 4.4 Storage boundary

Local persistence lives in `apps/playground/src/subject-preset-local.ts`, not in `main.ts`. It owns serialization, parsing, migration, quota/storage failures and canonical local hashes. `main.ts` consumes a typed repository interface and never reads arbitrary localStorage JSON directly.

The first migration reads the existing V4 motion and camera keys once, creates one working draft, preserves every compatible Camera Profile key it can resolve, and records the idempotent receipt key `worldkit.subject-preset-migration.v1`. The old global camera preference is copied into the selected subject's draft only. Successfully migrated V4 key names are recorded in the receipt and are not reread. Malformed or hash-incompatible legacy data is retained only as a diagnostic; it is never applied.

## 5. Runtime tuning authority

### 5.1 Motion and Control Feel

Motion is selection-only. A `MotionProfileV1` identifies the locked Kernel/algorithm and semantic motion tags; it exposes no `parameters`, `safetyLimits` or `authoringRanges` fields. All Motion publication roles must therefore use `preserve` in Candidate V1.

Control Feel is the numeric movement-authority lane, but Runtime consumes it only as an exact locked `control-feel-profile` Ref/hash embedded in the Execution Plan. A local draft may hold proposed numeric differences for the centralized P1.5 vocabulary; those values do not change the running subject until `promote` materializes a new Registry resource and the resulting locked Ref is selected. Runtime snapshots publish the active Control Feel Ref, never a second transient numeric overlay.

### 5.2 Control

Control is a separate, narrow authoring surface.

```ts
interface ControlTuningV1 {
  moveDeadzoneRatio?: number;
}
```

This is the exact draft field later materialized into a `ControlProfileV1`. Digital and analog longitudinal/lateral intent is resolved once, and `hasForwardControlIntentV1` consumes the same locked deadzone and Control Feel response exponent as command compilation. Runtime and Browser expose no Feel/Control numeric setter or getter. This prevents one Profile Ref/hash from producing multiple physical behaviors and keeps the Registry Lock reproducible.

### 5.3 Camera

Camera tuning remains per Camera Rig Profile. Local data stores a map keyed by exact Camera Rig Profile Ref and hash. Switching profiles restores that profile's own override map. Runtime validates the centralized Camera parameter vocabulary, algorithm support, safety limits, semantic invariants and modifier composition.

The workspace labels conditional parameters truthfully. A control is disabled or annotated when the active algorithm, `headingSource`, or `recenterMode` cannot consume it. No slider may claim “applied” without Runtime snapshot or trace evidence.

Named-version restore uses one atomic `applySubjectPresetTuning` Runtime request containing `selectedControlFeelProfileRef`, `selectedControlProfileRef`, all Camera overrides keyed by exact Profile Ref/hash, and the Camera preference. Runtime first validates the selected Feel against `availableControlFeels`, requires the exact compiled Control Ref, validates every Camera entry, and only then changes state. Feel/Control numeric draft maps are deliberately absent from this request. Camera keeps its session-preview setters because its transient view state is separately published in the Camera snapshot.

## 6. Publication candidate

### 6.1 Envelope

```ts
interface SubjectPresetCandidateV1 {
  kind: "worldkit-subject-preset-candidate";
  schemaVersion: 1;
  semanticContent: {
    candidateId: string;
    subjectDefinitionId: string;
    base: {
      subjectDefinitionRef: string;
      subjectDefinitionContentHash: string;
      registryLock: readonly SubjectPresetResourceLockEntryV1[];
      registryLockHash: string;
    };
    selections: {
      motionRoles: {
        default: MotionPublicationRoleV1;
        optional: readonly MotionPublicationRoleV1[];
        fallback: MotionPublicationRoleV1;
      };
      controlFeel: {
        profileRef: string;
        contentHash: string;
        disposition: "derive" | "preserve";
      };
      control: {
        profileRef: string;
        contentHash: string;
        disposition: "derive" | "preserve";
      };
      cameraContextProfileRef: string;
      defaultCameraRigProfileRef: string;
    };
    overrides: {
      controlFeelByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
      controlByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
      cameraByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
      cameraPublicationBySourceProfileRef: Readonly<Record<string, {
        sourceContentHash: string;
        disposition: "derive" | "preserve";
      }>>;
    };
    publication: {
      mode: "subject-scoped-derivatives";
      publicDefaultEnabled: true;
    };
  };
  provenance: {
    displayName: string;
    notes: string;
    createdAtIso: string;
    sourceCommit: string;
  };
  evidence: {
    harnessProfileRef: string;
    passedCheckIds: readonly string[];
    runtimeBuild: string;
  };
  semanticContentHash: string;
}
```

`subjectDefinitionId` must equal the locked base Subject Definition's `id`;
candidate import derives and verifies it instead of trusting free-form input.
`NumericProfileOverrideV1` is
`{ baseResourceRef, baseContentHash, values }`, where `values` is a closed
numeric parameter map. `MotionPublicationRoleV1` records the exact source
Ref/hash; Candidate V1 requires its disposition to remain `preserve`. Numeric
derivation is available on the selected Control Feel and Control lanes. Only `semanticContent`
participates in `semanticContentHash`. Provenance is validated but can change
without changing proposed Registry resources.

The sole closure authority is the pure
`resolveSubjectPresetClosureV1(registry, subjectDefinitionRef)` function in
`subject-registry`. It traverses the exact Subject Definition;
default/optional/fallback Motion Profiles and Kernels; Control Feel and Control Profiles; Camera
Context, every reachable Rig Profile, Algorithm and Modifier; Medium, Harness,
Pose and Render resources; and asset, rig, animation and collider dependencies.
It rejects cycles and missing refs, deduplicates by Ref, sorts lexicographically
and emits exact locked hashes. Browser export calls this function through a
read-only baseline API and never builds a lock from UI summaries.

Every Camera override must target a Profile reachable from the locked Camera
Context. Promotion materializes each entry marked `derive`, copies the Camera
Context, and rewrites only default, first-person and rule Profile refs that
point at those sources. Rule conditions, priorities, modifiers and Algorithm
refs remain unchanged. Entries marked `preserve` retain exact shared refs.

`defaultCameraRigProfileRef` must be reachable from the baseline Context. If
it differs from the baseline default, the copied Context explicitly replaces
its default with that source's resolved public Ref: the derived Ref when its
disposition is `derive`, otherwise the exact preserved Ref. The keys of
`cameraByProfileRef` must equal exactly the reachable source Profiles marked
`derive`; a preserved Profile cannot have overrides, and a derived Profile
must have at least one override. Modifier-only rules need no synthetic Camera
Profile entry. Any mismatch is rejected rather than ignored.

Control Feel V1 permits only the selected locked Control Feel Profile. Its
override map must be empty when `preserve`, or contain exactly that Ref/hash
when `derive`; promotion materializes one subject-scoped Control Feel Profile.

Control V1 permits only the selected locked Control Profile. If
`controlByProfileRef` contains an override, its sole key must equal
`selections.control.profileRef`, the disposition must be `derive`, promotion
creates one subject-scoped Control Profile, and the new Subject Definition
points to it. With `preserve`, the override map must be empty and the exact
source Ref remains. Extra Control Profile entries are rejected.

### 6.2 Strict validation

The candidate parser rejects:

- unknown fields or unknown override names;
- candidate ids outside `^[a-z0-9][a-z0-9-]{2,63}$`, invalid UTF-8/ISO
  timestamps, non-40-hex source commits, and oversized names/notes;
- duplicate, missing, forged or stale Registry lock entries;
- non-finite values, unsafe values or values outside declared Runtime support;
- Motion/Control command-kind incompatibility;
- Camera algorithm, modifier or parameter-invariant violations;
- preview-only Subject Definitions or relationship-stripped preview clones;
- reserved implementations;
- forged or malformed browser-reported harness provenance;
- arbitrary paths, URIs, scripts or executable payloads.

Default, optional and fallback Motion roles are always recorded and must be
`preserve`; numeric Motion derivation is rejected. The plan validates every
reachable Kernel and role, while retaining explicitly
declared safe-stop fallbacks that intentionally emit no active command.

## 7. Versioned promotion

### 7.1 CLI

```text
pnpm worldkit subject-preset validate <candidate.json> [--json]
pnpm worldkit subject-preset plan <candidate.json> --output <plan.json> [--json]
pnpm worldkit subject-preset promote <candidate.json> --plan <plan.json> --harness-receipt <receipt.json> --write [--json]
```

`validate` and `plan` are read-only. Browser-reported harness evidence is
informational provenance and never satisfies publication. `plan` generates a
candidate-specific fixture that must pass ordinary Runtime/harness gates before
merge. `promote` is the only Registry-mutating command and requires:

- read-only Git inspection proves a symbolic branch exists and is not `main`;
- detached HEAD, unknown repositories and unborn branches are rejected;
- tracked worktree is clean before the transaction;
- Candidate `sourceCommit` equals the exact clean feature-branch HEAD;
- candidate base lock matches the current Registry;
- the supplied plan hash matches a freshly recomputed plan;
- a trusted Harness Receipt covers every required check in the locked Harness
  Profile and exactly binds the Candidate semantic hash, plan hash,
  `sourceCommit`, and `git:<sourceCommit>` Runtime build;
- every target is a normalized repository-relative logical path with no
  absolute, drive, UNC, URI, `..` or symlink component and is in a static
  Registry/asset allowlist;
- target resource versions do not exist;
- every target preimage and proposed postimage SHA-256 still matches the plan;
- the complete generated Registry can be constructed and validated before commit;
- `--write` is explicitly supplied.

The command may invoke read-only Git queries (`rev-parse`, `symbolic-ref`
and `status`) to enforce the repository boundary. It never stages, commits,
switches branches, pushes, merges or uses network credentials. Branch and clean
state are rechecked before creating the transaction and before final rename.
Candidate, plan and Harness Receipt inputs must be outside the repository or inside ignored
`.codex-tmp/subject-presets/`.

Files are generated in a same-volume temporary directory, validated there and
promoted with the existing transactional artifact helper. Existing preimages
are retained for rollback. Failure restores byte-identical originals and
removes new targets.

### 7.2 Subject-scoped derived resources

Normal publication creates subject-scoped Control Feel, Control and Camera Profile versions. Motion Profiles remain exact reusable algorithm selections. Shared algorithms, Kernels and generic base Profiles remain reusable. Tuning one subject therefore cannot mutate another subject's effective defaults.

Deterministic derived identities use the Subject Definition id plus role, for example:

```text
worldkit://control-feel-profile/subject.vehicle.four-wheel.arcade.default@1
worldkit://control-profile/subject.vehicle.four-wheel.arcade.default@1
worldkit://camera-profile/subject.vehicle.four-wheel.arcade.chase-surface-fast@1
worldkit://camera-context/subject.vehicle.four-wheel.arcade.default@1
worldkit://subject-definition/vehicle.four-wheel.arcade@2
```

Subsequent promotions increment exact versions after rechecking the current catalogs. The plan records every source and target Ref and Hash. Profile values are fully materialized Registry resources; Runtime does not gain a second overlay dialect.

### 7.3 Public default catalog

Add `assets/registry/subject-defaults/catalog.json` with strict
`SubjectDefaultCatalogV1` parsing and a dedicated
`SubjectDefaultRegistryV1` constructed against the already locked Subject
Registry:

```json
{
  "schemaVersion": 1,
  "defaults": [
    {
      "subjectDefinitionId": "vehicle.four-wheel.arcade",
      "subjectDefinitionRef": "worldkit://subject-definition/vehicle.four-wheel.arcade@2",
      "subjectDefinitionContentHash": "sha256:..."
    }
  ]
}
```

Entries are canonically sorted and unique by `subjectDefinitionId`. The exact
Ref must resolve to a Subject Definition with the same `id`, and its exact
hash must match. A missing entry means no public default.
`publicDefaultEnabled: false` creates versioned resources but leaves the
catalog unchanged. This file is Git-controlled selection metadata, not an
immutable world resource. It may change in `main`; history comes only from
Git. Browser discovery exposes the current public default and exact available
versions; it never infers “latest.”

## 8. Workspace UX

The large tuning workspace has five areas:

1. **Subject and baseline** — selected Subject Package, public default Ref/version/hash, local-default status and validation state.
2. **Tuning** — Motion selection plus Control Feel, Control and Camera tabs; compatible Camera Profiles stay independently editable.
3. **Local versions** — save named version, duplicate, rename, compare, restore, set local default and delete.
4. **Evidence** — live Runtime support, committed snapshot values, harness results and warnings for conditional/draft-only parameters.
5. **Publish** — compare with public default, export strict candidate, show CLI commands and promotion status. It never offers “push main.”

Comparison shows changed values grouped by Profile and labels each as inherited, locally overridden, Runtime-applied or unsupported. Restoring a version updates Runtime atomically or leaves the previous stable state with a diagnostic.

## 9. Subject onboarding

### 9.1 Manifest

Contributors create `assets/subjects/<category>/<subject-id>/onboarding.manifest.json`:

```ts
interface SubjectOnboardingManifestV1 {
  kind: "worldkit-subject-onboarding";
  schemaVersion: 1;
  id: string;
  version: number;
  displayName: string;
  authoringAvailability: "recommended" | "advanced" | "experimental";
  category: "human" | "animal" | "vehicle" | "prop" | "composite";
  bodyTopology: string;
  semanticClassId: string;
  source:
    | {
        kind: "rigged-biped-glb";
        relativeLocalPath: string;
        licenseSpdxId: string;
        redistributionPolicy: "allowed" | "internal-only" | "prohibited";
        skeletonRootBoneName: string;
        sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
        sourceClipNameByActionId: Readonly<
          Record<"idle" | "walk" | "run" | "jump", string>
        >;
        assetPartRotationEulerRadiansXYZ: Vec3;
      }
    | {
        kind: "whitebox-assembly";
        parts: readonly PrimitiveVisualPartInputV2[];
        licenseSpdxId: string;
        redistributionPolicy: "allowed" | "internal-only" | "prohibited";
      };
  coordinateConvention: CoordinateConventionV1;
  assembly: {
    onboardingTemplateId:
      | "ground-humanoid"
      | "forward-steer"
      | "wheeled-arcade"
      | "surface-slide"
      | "water-surface"
      | "unpowered-glide";
    motionProfileRef: string;
    controlProfileRef: string;
    cameraContextProfileRef: string;
    collider:
      | { kind: "profile"; colliderProfileRef: string }
      | { kind: "derive"; colliderDerivationProfileRef: string };
    mediumProfileRef: string;
    harnessProfileRef: string;
  };
  sockets: readonly SubjectSocketInputV2[];
}
```

For `rigged-biped-glb`, `relativeLocalPath` is required, is resolved from
the manifest directory, and must not be absolute, contain `..`, be a URI or
cross a symlink. Whitebox manifests cannot contain a source path. The tooling
template id is a closed CLI template, not a Registry resource or implementation
id; its complete generated capability/topology mapping is shown in the plan.
The manifest may select only registered Runtime-supported capabilities and
cannot name implementation IDs or executable code.

### 9.2 Supported first slice

- primitive `box/capsule/sphere/cylinder` whitebox subjects with static visual
  binding and local sockets;
- strictly preflighted rigged biped GLBs with exactly one asset part, one
  Skeleton, one explicit root, all 17 canonical bone mappings, explicit
  `idle/walk/run/jump` in-place clips and no forbidden root/hips position
  animation;
- whitebox assemblies using implemented ground, forward-steer, wheeled, slide,
  water-surface or unpowered-glide Kernels and a command-compatible Control
  Profile;
- reuse of existing Motion Kernels, Camera Algorithms, Medium, Harness, Pose and Render Profiles;
- subject-specific asset, rig, animation, collider, sockets and Subject Definition resources where required.

Generated canonical definitions have empty `relationshipCapabilityRefs`.
Seat, Mount and Tether selections fail with
`ONBOARDING_RELATIONSHIP_CAPABILITY_UNSUPPORTED`; Playground relationship
preview clones are never publishable definitions. Static GLB, arbitrary
Mixamo-compatible assets, automatic retargeting, multiple Skeletons, multiple
asset parts and root-motion assets are excluded. Unsupported inputs fail with
structured diagnostics and do not generate partial Registry entries. Rigged
assets also require rendered mesh and Bone Socket QA, not inventory alone.

### 9.3 CLI and workspace flow

```text
pnpm worldkit subject onboard validate <manifest.json> [--json]
pnpm worldkit subject onboard plan <manifest.json> --output <plan.json> [--json]
pnpm worldkit subject onboard generate <manifest.json> --plan <plan.json> --write [--json]
```

The browser onboarding panel guides users through asset selection,
coordinate/pivot facts, rig/action mapping, tooling-template selection, default
camera resolution and a preflight report. It exports the manifest and may
preview a compatible local GLB, but repository generation remains the CLI's
job. The plan displays the resolved Context, default Camera Profile, Algorithm
and Socket requirements.

For rigged GLB input, generation computes and records byte length, SHA-256,
inventory and bounds; creates asset/action sidecars and Registry resources;
copies the approved GLB into the versioned Playground public location; updates
the same-origin resolver mapping; creates a V3 Subject Definition; optionally
adds the public-default entry; and generates a minimal example plus
Registry/resolver/Runtime fixtures. Whitebox input skips asset/rig/animation
resources. All writes are planned, allowlisted and transactional.

### 9.4 Source-only FBX inventory

The twelve supplied FBX files under
`07_world_model/引擎编辑器/模型资产/载具` are committed as source-only assets
with an exact inventory catalog containing source id, original filename, byte
length, SHA-256, coarse class, `format: "fbx"`,
`runtimeStatus: "source-only"` and `conversionRequired: true`. Blend and backup files are not
copied. The Playground onboarding panel lists these sources, but they do not
appear as runnable Subject Definitions and are not passed to Babylon. A later
approved conversion must produce a self-contained GLB and pass the relevant
onboarding contract before the public default can point at it.

## 10. Browser and CLI interfaces

Add or extend the following engine-neutral Registry/Runtime interfaces:

```text
getSubjectPresetBaseline
listCompatibleProfiles
applySubjectPresetTuning
getSubjectSnapshot
getCameraSnapshot
```

Local version CRUD, compare, migration, candidate construction and download are
Playground-owned services and are not part of the cross-host Browser/Runtime
API. Browser profile discovery publishes identity and compatibility for Control
Feel/Control, not generic numeric parameter bags. Their authoring ranges and
draft values stay in the Playground authoring module and candidate pipeline.
Registry baseline/closure, exact Ref selection, Camera session preview, atomic
receipts and snapshots belong in typed public contracts. No public API exposes
localStorage, a filesystem path, Git credential or Registry mutation.

## 11. Failure behavior

- Storage unavailable/full: keep the live draft in memory, display “not persisted,” and never claim a local version was saved.
- Local hash drift: preserve data, disable auto-application, offer compare/export, and require an explicit rebase.
- Runtime profile/Camera rejection: keep the previous committed state and show the exact diagnostic.
- Candidate source drift: fail validation before planning.
- Promotion conflict or stale plan: write nothing.
- Any generated Registry failure: roll back every created or modified file.
- Onboarding asset mismatch: fail before resolver/catalog changes.
- Git inspection cannot prove a clean symbolic non-`main` branch: fail before
  generating transaction bytes.

## 12. Test and acceptance plan

### Local workspace

- multiple named versions round-trip Motion selection, Control Feel, Control and multiple Camera Profile overrides;
- local default applies only to the exact subject/hash baseline;
- V4 fragmented keys migrate once and malformed values fail safely;
- storage exceptions do not crash Runtime or claim persistence;
- comparison accurately classifies inherited, changed, Runtime-supported and draft-only values.

### Runtime

- every displayed live Control Feel/Control/Camera slider produces measurable Snapshot or trajectory evidence;
- Control deadzone and Control Feel response changes produce deterministic differences;
- switching Camera Profiles restores isolated tuning;
- reset and subject switch restore declared baseline/local default without leaking state;
- fixed input with identical seed, resource lock and preset is deterministic.

### Candidate and promotion

- semantic hash is deterministic and excludes provenance fields;
- full dependency closure is exact, sorted and immutable;
- forged hash, source drift, unknown field, unsupported parameter, unsafe value and reserved implementation are rejected;
- `validate` and `plan` never mutate files;
- `promote` rejects `main`, dirty tracked worktree, missing `--write`, stale plan and target version collision;
- transaction failure restores all original catalog bytes;
- generated Profiles, Context, Subject Definition and public-default entry rebuild the Registry successfully;
- older resource versions and exact world references remain unchanged.

### Onboarding

- self-contained asset hash/inventory/bounds are reproduced exactly;
- all twelve source-only FBX files have exact byte/hash inventory entries and
  remain excluded from runnable Subject discovery;
- external GLB URIs, unsupported rigs, missing clips, invalid coordinates, unsafe paths and absent licenses are rejected;
- generated resolver entry remains same-origin and hash-locked;
- new Definition appears in discovery, validates, launches with its default camera, accepts compatible tuning and runs its dedicated harness;
- two instances prove asset, skeleton, animation, physics, camera target and disposal isolation where applicable.

### Repository gates

- the six frozen Subject Definition refs asserted by capability discovery and
  the seven exact Camera Profile refs in the camera catalog continue to
  initialize safely;
- `pnpm typecheck`, `pnpm test`, `pnpm test:studio`, `pnpm build`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, and `pnpm verify:g-bot-subject` pass;
- browser QA covers local save/restore/default, multi-camera isolation, candidate export, subject switch and refresh persistence;
- final implementation receives independent code review with no unresolved Critical or Important finding.

## 13. Delivery and Git policy

Implementation occurs on `feature/subject-preset-workspace`. After all gates and review pass, the branch is merged into local `main` and pushed to `origin/main`, as explicitly authorized by the user. The feature itself never automates that merge or stores GitHub credentials.

Public default updates created later follow the same branch/review workflow. Rollback creates a normal Git change that points the public-default catalog back to an existing exact Subject Definition Ref and Hash.

### 13.1 Initial public-default migration

The existing local export
`subject-animal-quadruped.worldkit-authoring.json` is a legacy authoring
snapshot, not a publication candidate. The implementation imports it through an
explicit V4 legacy adapter, resolves the exact quadruped baseline and produces
the first strict candidate. Its approved differences are:

- Camera `orbit.medium@1`: target height `1.25 → 1.35`, collision retraction
  `30 → 4.5`, collision recovery `6 → 3.25`;
- Control Feel `ground-air.humanoid.default@1`: turn rate `2.2 → 2.4` and
  jump speed `4.5 → 3.1`.

All five retained values are Runtime-consumed and remain subject to centralized
safety/authoring ranges. The legacy `maximumBodyLeanRadians` value is not
carried forward because it is outside the P1.5 Ground/Air Control Feel contract.
Promotion creates subject-scoped Control Feel and Camera derivative resources,
a copied Camera Context, a new exact quadruped Subject Definition version and
the first quadruped public-default entry. The exact Motion and Control resources,
the original shared Profiles and the `@1` definition remain unchanged.

## 14. Frozen decisions

1. Motion selection and Control Feel, Control and Camera tuning are all included.
2. Multiple Camera Profiles are stored independently.
3. Local drafts, named local versions, local defaults, candidates, Registry versions and public defaults are distinct types.
4. Registry resources are append-only by version; existing `@N` resources are never overwritten.
5. Public default selection is explicit and Git-controlled; Runtime never infers latest.
6. Publication normally creates subject-scoped Control Feel, Control and Camera derivative Profiles; Motion remains an exact reusable algorithm selection.
7. Browser code cannot write the repository or Git.
8. Promotion and onboarding writes require explicit CLI `--write`, a non-`main` branch, a clean baseline, an exact plan and a transaction.
9. New subjects reuse registered algorithms and archetype Profiles; onboarding cannot install implementation code.
10. Unsupported or draft-only parameters cannot be promoted as official defaults.

# GLB Admission Profile Design

**Status:** implemented by `ASSET-GLB-01` in the same follow-up change; no Runtime or Registry contract change.

## Outcome

WorldKit will add the official Khronos `gltf-validator` as a trusted-host asset-intake gate, alongside the existing glTF-Transform and Babylon checks. It will not replace either one:

- Khronos Validator owns glTF 2.0 / GLB structural and accessor correctness.
- glTF-Transform owns deterministic build-time reading, modularization, pruning, unpartitioning, and writing.
- WorldKit owns self-containment, extension policy, product-profile inventory, budgets, Hash/length locking, coordinate convention evidence, and Registry closure.
- Babylon keeps its current final Runtime admission, actual loaded inventory, cache, instance isolation, and disposal checks. It does not import or execute Khronos Validator.

This closes a real gap in the current pipeline: `NodeIO.readBinary()` proves that glTF-Transform can parse an input, while the Runtime parser and Babylon loader prove only the subset they consume. Neither is the authoritative glTF 2.0 conformance validator.

## Current integration evidence

- `scripts/lib/modular-subject-source.ts` parses raw GLB JSON, rejects external URIs, reads through a singleton glTF-Transform `NodeIO`, validates WorldKit rig/content rules, and computes the modular inventory.
- `scripts/lib/modular-subject-runtime-bundle.ts` reads locked Model and Clip bytes, assembles animations, runs `prune({ keepAttributes: true })` plus `unpartition()`, writes deterministic GLB bytes, and re-inspects inventory.
- `packages/runtime-babylon/src/subject-asset-cache.ts` verifies descriptor format, limits, byte length, Hash, GLB container shape, self-containment, indexed triangles, forbidden Runtime content, actual Babylon inventory, cache lifecycle, and disposal.
- Current consumable Model, Clip, Runtime Bundle, and Static Subject GLBs use no glTF extensions. The G Bot source archive records `KHR_materials_specular`, but that archive declares `runtimeConsumption: "forbidden"` and is not a Runtime asset.

## Trusted boundary and call order

`validateGlbAdmissionV1()` belongs in a new Node-only `scripts/lib/glb-admission.ts`. It accepts already-read immutable bytes; it never accepts a filesystem path, URL, Registry ref, or resolver callback.

For incoming locked artifacts:

1. The caller checks declared byte length and SHA-256 against the immutable source manifest.
2. `validateGlbAdmissionV1()` performs the cheap GLB envelope and byte-budget checks.
3. It invokes Khronos `validateBytes(bytes, { format: "glb", writeTimestamp: false, maxIssues: 0 })` with no external-resource loader.
4. It rejects any Khronos error and normalizes all reported issue evidence deterministically.
5. It applies WorldKit self-containment and extension policy directly to the GLB JSON.
6. It obtains the existing glTF-Transform inventory and applies the selected WorldKit product profile.
7. Only a passing result may reach modular recovery/assembly, Registry Lock, or generated-artifact promotion.

For generated Model, Clip, or Runtime Bundle bytes, steps 2–6 run again after `NodeIO.writeBinary()` and before Hash/length/inventory are published. A valid source does not imply a valid generated output.

Runtime fetch and instantiation keep their current order and diagnostic codes. A build-time receipt must never bypass `SubjectAssetCacheV1` Hash, length, actual inventory, cache, or disposal gates.

## Versioned profiles

The first closed union is `GlbAdmissionProfileIdV1`:

| Profile | Extension allowlist | Required WorldKit inventory |
|---|---|---|
| `subject-source-archive.v1` | explicit per-source archive declaration; currently only G Bot may declare `KHR_materials_specular` | structurally valid and self-contained; always `runtimeConsumption: "forbidden"`; no Runtime publication |
| `subject-rigged-model.v1` | empty | at least one Mesh; zero Animation Clips; zero Cameras/Lights; at most one Skin/Skeleton; finite transforms; unique joint root when present |
| `subject-animation-clip.v1` | empty | exactly one named Animation Clip; zero Meshes/Materials/Textures/Cameras/Lights; target Rig signature matches the Model |
| `subject-runtime-bundle.v1` | empty | at least one Mesh; exactly one Skin/Skeleton for rigged bundles; exact ordered action names; zero Cameras/Lights/external URIs; inventory and Rig signature equal the manifest |
| `subject-static-ready.v1` | empty | at least one indexed triangle Mesh; zero Skins/Bones/Animations/Cameras/Lights; finite positive bounds; inventory within the Static budget |

An extension is admitted only when it appears in the profile allowlist, is declared consistently in `extensionsUsed` / `extensionsRequired`, and the pinned Khronos Validator reports it as supported. `UNSUPPORTED_EXTENSION` is informational upstream, so WorldKit's allowlist remains a separate fail-closed gate. Adding an extension requires a new reviewed profile version or explicit source-archive declaration; it is not inferred from what Babylon happens to load.

All GLB profiles reject every `buffers[*].uri` and `images[*].uri`, including data URIs. WorldKit's binary asset contract requires payloads in the GLB container, not merely network-independent JSON.

## Deterministic receipt and diagnostics

On success the admission function returns `GlbAdmissionReceiptV1` with:

- `kind: "glb-admission-receipt"`, `schemaVersion: 1`, and `profileId`;
- original `byteLengthBytes` and `contentHash`;
- exact `validatorName: "Khronos glTF Validator"` and runtime-reported `validatorVersion`;
- sorted `extensionsUsed` and `extensionsRequired`;
- the existing normalized WorldKit inventory;
- Khronos issue counts by severity and a stable issue list containing only severity, code, JSON pointer, and resource URI;
- `isSelfContained: true` and `admitted: true`.

The receipt omits timestamps, absolute paths, stack traces, arbitrary validator messages, and host-specific ordering. Receipt bytes use the existing canonical JSON key sorter. A stale receipt is rejected when its Hash, byte length, profile ID, validator version, or inventory differs from the current artifact/checker result.

The implementation owns these Node-tool diagnostics without changing public Runtime codes:

| Code | Owner / meaning |
|---|---|
| `GLB_ADMISSION_ENVELOPE_INVALID` | WorldKit; invalid magic/version/declared length/chunk structure |
| `GLB_ADMISSION_VALIDATOR_ERROR` | Khronos report contains one or more Error issues |
| `GLB_ADMISSION_VALIDATOR_FAILURE` | validator threw, returned malformed data, or its version/support API was unavailable |
| `GLB_ADMISSION_EXTERNAL_URI_FORBIDDEN` | WorldKit self-containment gate found any Buffer/Image URI |
| `GLB_ADMISSION_EXTENSION_UNSUPPORTED` | extension is undeclared, outside the selected allowlist, required but unsupported, or otherwise inconsistent |
| `GLB_ADMISSION_PROFILE_MISMATCH` | structurally valid GLB violates the selected Model/Clip/Bundle/Static semantic profile |
| `GLB_ADMISSION_INVENTORY_MISMATCH` | computed inventory differs from the locked manifest/receipt |
| `GLB_ADMISSION_LIMIT_EXCEEDED` | bytes or profile inventory exceed a frozen Host budget |

Warnings and Information remain evidence by default, not global failures. A profile may promote a named issue code to failure only with a focused fixture and rationale. This avoids making admissions change merely because a future validator release reclassifies unrelated advisory output; upgrading the exact validator version is itself a reviewed receipt migration.

## Malformed fixture matrix

Fixtures are generated in tests from a minimal valid in-memory GLB; they are not copied third-party assets.

| Fixture | Required outcome |
|---|---|
| wrong magic, GLB v1, forged total length | `GLB_ADMISSION_ENVELOPE_INVALID` before validator allocation |
| unaligned/truncated chunk, missing/duplicate/non-first JSON chunk, invalid UTF-8/JSON | envelope or validator error; never glTF-Transform/Babylon success |
| unresolved accessor/bufferView, accessor outside buffer, invalid index, invalid sparse accessor | `GLB_ADMISSION_VALIDATOR_ERROR` |
| NaN accessor data, non-unit quaternion, invalid animation sampler/channel | `GLB_ADMISSION_VALIDATOR_ERROR` |
| external Buffer URI, external Image URI, Buffer/Image data URI | `GLB_ADMISSION_EXTERNAL_URI_FORBIDDEN`; no filesystem/network callback |
| undeclared extension, disallowed extension, required unsupported extension | `GLB_ADMISSION_EXTENSION_UNSUPPORTED` |
| Camera/Light in consumable profile | `GLB_ADMISSION_PROFILE_MISMATCH` |
| non-indexed or non-triangle primitive in consumable profile | `GLB_ADMISSION_PROFILE_MISMATCH` |
| Model containing Animation, Clip containing Mesh, Static containing Skin/Animation | `GLB_ADMISSION_PROFILE_MISMATCH` |
| duplicate/empty Clip names or Clip target missing from Model Rig | existing modular profile error wrapped as `GLB_ADMISSION_PROFILE_MISMATCH` |
| correct bytes with forged manifest inventory | `GLB_ADMISSION_INVENTORY_MISMATCH` |
| correct bytes above byte/mesh/vertex/triangle/bone/clip budget | `GLB_ADMISSION_LIMIT_EXCEEDED` before promotion |
| valid bytes in forward/reversed test order and repeated process runs | byte-identical normalized receipt and no retained cross-case state |

At least one fixture must be accepted by glTF-Transform but rejected by Khronos Validator; otherwise the new dependency has not demonstrated independent value. At least one fixture must pass Khronos Validator but fail a WorldKit profile, proving the authority split.

## Dependency and lifecycle decision

- Pin the official `gltf-validator` package exactly at `2.0.0-dev.3.10` in root `devDependencies`; Node-only scripts are the direct consumer. Do not bundle it into Browser, Runtime, Registry, or authoring packages.
- The adapter queries `version()` and `supportedExtensions()` rather than hard-coding either result. The exact returned version is frozen in every receipt.
- The module is loaded once and validation is serialized in the first implementation. No per-asset worker, network fetch, or unconstrained batch concurrency is allowed until peak memory is measured on G Bot's 6.7 MB Runtime Bundle and a representative Static batch.
- The validator API exposes no caller-owned disposable object. The adapter retains no bytes, reports, or cross-case mutable state after each Promise settles. glTF-Transform `Document` ownership remains with existing functions and their explicit property disposal/transforms; Babylon `AssetContainer` ownership remains unchanged.
- A validator upgrade requires rerunning the full committed GLB corpus, comparing normalized receipt diffs, and explicitly accepting any new or reclassified issue. A floating range is forbidden.

## Dependency-aware implementation graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Input → output / integration point | Required evidence | Mode |
|---|---|---|---|---|---|---|---|
| `GLB-A1` | Add pinned Node-only dependency and typed adapter | this design | `GLB-A2`, `GLB-A3` | root dependency files; `scripts/lib/glb-admission.ts` | immutable bytes + profile → deterministic receipt or owned diagnostic | version/support API fixture; no Browser bundle import | sequential, main-agent-only |
| `GLB-A2` | Freeze malformed and authority-split matrix | `GLB-A1` | `GLB-A4` | `scripts/lib/glb-admission.test.ts` fixtures | generated byte mutations → exact diagnostics | every matrix row; glTF-Transform-pass/Khronos-fail and Khronos-pass/WorldKit-fail cases | sequential, main-agent-only |
| `GLB-A3` | Wire source and generated artifact gates | `GLB-A1` | `GLB-A4` | modular source/runtime-bundle scripts and focused tests | raw/Model/Clip/Bundle bytes → admission before transform or promotion | G Bot + Golden unchanged outputs; tamper and stale-receipt RED/GREEN | sequential, main-agent-only |
| `GLB-A4` | Corpus and lifecycle verification | `GLB-A2`, `GLB-A3` | Registry use by new assets | verifier and ledger only | every committed consumable GLB → accepted receipt inventory | exact corpus count, peak-memory observation, deterministic rerun, typecheck/test/build | main-agent-only |

Architecture, diagnostic naming, profile versions, dependency choice, and final integration remain main-agent-owned. No worker may independently broaden the extension allowlist, warning promotion list, Runtime formats, or Registry contract.

## Explicit non-goals

- No FBX/DCC conversion, geometry repair, material rewrite, axis/Pivot inference, or automatic warning suppression.
- No validator execution during Browser loading, capture, gameplay, or per-instance creation.
- No replacement of original byte Hash/length, glTF-Transform inventory, Babylon actual-inventory validation, rendered orientation/Pivot QA, or manual interaction evidence.
- No admission of Draco, Meshopt, KTX2, material extensions, external resources, cameras, or lights merely because Khronos Validator recognizes them.

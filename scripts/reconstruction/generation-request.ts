import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  decideSceneAuthoringRouteV1,
  hashNativeBlockGenerationRequestV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  type NativeBlockGenerationBudgetV1,
  type NativeBlockGenerationRequestV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
import {
  gameplayBootstrapCanonicalBytesV1,
  parseGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256Bytes, sha256CanonicalJson, stringifyCanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import { hashWorldReconstructionCaseV1, hashWorldReconstructionEvaluationProfileV1, parseWorldReconstructionCaseV1, parseWorldReconstructionEvaluationProfileV1, worldReconstructionEvidenceProfileClosureMatchesV1, type WorldReconstructionAttemptIndexV1, type WorldReconstructionCaseV1, type WorldReconstructionEvaluationProfileV1 } from "@whitebox-world/validation";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  hashBabylonNativeSceneBootstrapV1,
  parseBabylonNativeSceneBootstrapV1,
  parseWorldRuntimeBootstrapV1,
  worldRuntimeBootstrapCanonicalBytesV1,
  worldResourceLockEntriesV1,
  type BabylonNativeSceneBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldPackageWorldBoundsV1,
  parseWorldPackageWorldBoundsV1,
  type WorldPackageWorldBoundsV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil, sortBy } from "lodash-es";

import {
  parseNativeBlockRepairInstructionV1,
  type NativeBlockRepairInstructionV1,
} from "./repair-request.js";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from
  "../native-scene/admission-budget.js";

const OUTPUTS = ["scene.ts", "native-block-authoring.json", "native-resources.json"] as const;
function repairContextPaths(
  priorAttemptIndex: 0 | 1 | 2,
  evidenceKind: NativeBlockRepairInstructionV1["priorEvidence"]["kind"],
): readonly string[] {
  const root = `attempts/${priorAttemptIndex}`;
  const common = [
    `${root}/source/scene.ts`,
    `${root}/source/native-block-authoring.json`,
    `${root}/source/native-resources.json`,
    `${root}/generation-request.json`,
    `${root}/attempt-result.json`,
  ];
  if (evidenceKind === "native-check-result") {
    return Object.freeze([...common, `${root}/native-check-result.json`]);
  }
  if (evidenceKind === "ground-analysis-report") {
    return Object.freeze([
      ...common,
      `${root}/native-check-result.json`,
      `${root}/logical-ground-model.json`,
      `${root}/ground-analysis-report.json`,
      `${root}/ground-analysis-diagnostics.json`,
    ]);
  }
  if (evidenceKind === "opening-composition-gate-result") {
    return Object.freeze([
      ...common,
      `${root}/rejected-capture/opening-composition-gate-result.json`,
      `${root}/rejected-capture/opening.png`,
      `${root}/rejected-capture/opening-observation.json`,
      `${root}/rejected-capture/world-side.png`,
      `${root}/rejected-capture/world-top-down.png`,
      `${root}/rejected-capture/collider-overlay.png`,
      `${root}/rejected-capture/collider-overlay-observation.json`,
      `${root}/rejected-capture/spawn-support-observation.json`,
      `${root}/rejected-capture/scripted-traversal.json`,
    ]);
  }
  return Object.freeze([
    ...common,
    `${root}/evaluation.json`,
    `${root}/capture/opening.png`,
    `${root}/capture/opening-observation.json`,
    `${root}/capture/collider-overlay.png`,
    `${root}/capture/collider-overlay-observation.json`,
    `${root}/capture/spawn-support-observation.json`,
    `${root}/capture/scripted-traversal.json`,
  ]);
}

function repairTaskProtocol(priorAttemptIndex: 0 | 1 | 2): string {
  const root = `inputs/attempts/${priorAttemptIndex}`;
  return `Repair attempt protocol:
- Begin from the immutable prior source at ${root}/source/scene.ts, ${root}/source/native-block-authoring.json, and ${root}/source/native-resources.json.
- Read context/repair-instruction.json first. For every diagnostic, execute its repairAction.instruction against the declared targetId and operation; do not substitute a change to names, tags, materials, or logical subshape ids unless that exact action requests it.
- Use priorEvidence.kind to select exactly one evidence source. For native-check-result, read ${root}/native-check-result.json. For evaluation-result, read ${root}/evaluation.json and ${root}/capture/. For opening-composition-gate-result, read ${root}/rejected-capture/opening-composition-gate-result.json and ${root}/rejected-capture/. For ground-analysis-report, read ${root}/ground-analysis-report.json, ${root}/ground-analysis-diagnostics.json, and ${root}/logical-ground-model.json.
- The selected priorEvidence narrows the reported defect; it does not suspend any other frozen Case requirement. Before editing, reread context/case.json and preserve every still-valid expected semantic silhouette, opening-composition region, anchor, depth order, Spawn/support, Collider, topology, and fixed-input traversal constraint.
- Inspect opening.png and collider-overlay.png before editing only when the selected evidence kind has Capture artifacts. Ground Analysis runs before Capture; repair its named source Blocks and measured footprint, clearance, connectivity, or traversal support directly from the three ground JSON artifacts.
- For a Ground Analysis connectivity or step failure, preserve every required target's elevation, semantic silhouette, acceptanceTargetRef, fixed pass-check meaning, and the full frozen opening composition in context/case.json.expected.openingComposition even though no prior Capture exists. Do not flatten or lower the destination merely to make it reachable; add or adjust explicit visible tread, ramp, landing, or support Blocks between the reported components.
- Repair ground with Blocks in the correct existing ground or route visual group. Never extend a ridge, cliff, landmark, structure, or background visual group toward Spawn merely to connect support; the Host measures opening depth order from each complete visual group's bounds, so such an extension changes formal composition evidence.
- If the smallest repair for one diagnostic would violate another frozen Case requirement, choose a geometry change that satisfies both. Do not trade a Package/Ground gate failure for a predictable Capture/evaluation failure.
- Every Block added by a Ground Analysis repair must itself have continuous face-contact support down to an existing root support. Do not leave floating steps, unsupported columns, hidden foundations, invisible floors, or air walls.
- A visual repair must produce a visible geometry change in the evidence view named by the diagnostic. Move, add, or remove actual Blocks in the declared target while preserving its semantic identity; a metadata-only change is not a repair.
- Group opening-composition diagnostics by targetId before editing. Build one constraint table per target from the complete expected region bounds, anchor, and depth order in context/case.json plus the complete observed normalizedBounds, normalizedCenter, and depth order in ${root}/rejected-capture/opening-observation.json. Solve every reported axis together and preserve axes already inside tolerance; never stop after fixing only the largest drift row.
- Screen projection is perspective-coupled. A target edge clipped at 0 or 10000 means the target extends beyond the captured frame. For vertical clipping, adjust the target's near-camera footprint/depth and height together instead of only raising or lowering its crown. When widening a target, add mass at comparable camera depth and height so a horizontal repair does not create a new vertical or anchor failure.
- Do not reassign an existing Block's visualGroupId merely to change measured group bounds, ordering, or coverage. Keep prior group membership stable unless the diagnostic explicitly reports a missing or incorrect semantic binding; names, group ids, identity colors, and bindings are not substitutes for visible geometry.
- Do not change the Case, Profile, or acceptance thresholds. The diagnostic expected value, actual value, allowed threshold, exceeded amount, and correction direction are frozen evidence, not authoring suggestions.
- Write a complete revised replacement only to the three declared output paths. Never mutate the prior source, evidence, frozen owners, or thresholds.`;
}

export const NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1 = 1_800;
export const NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1 = Object.freeze({
  maximumBlockCount: 2_000,
  ...BNA2_WHITEBOX_ADMISSION_BUDGET_V1,
  maximumOutputBytes: 4_000_000,
  timeoutSeconds: NATIVE_BLOCK_RECONSTRUCTION_FORMAL_TIMEOUT_SECONDS_V1,
} satisfies NativeBlockGenerationBudgetV1);
export const NATIVE_BLOCK_RECONSTRUCTION_DEFAULT_CLOUD_S3_ROOT_V1 =
  "s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const CURRENT_NATIVE_SCENE_API_REF = "worldkit://native-scene-api/babylon@1";
const CURRENT_NATIVE_BLOCK_PROFILE_REF = "worldkit://native-block-profile/whitebox.blocks@1";
const CURRENT_NATIVE_TRUST_PROFILE_REF = "worldkit://trust-profile/trusted-local@1";
const CURRENT_NATIVE_TRUST_PROFILE_HASH = sha256CanonicalJson({
  id: "trusted-local",
  version: 1,
}) as Sha256HashV1;
const FORMAL_ROUTER_REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;

export function deriveNativeBlockGenerationRouterRequestIdV1(input: Readonly<{
  caseId: string;
  runId: string;
  attemptIndex: WorldReconstructionAttemptIndexV1;
}>): string {
  const readable =
    `native-block-generation-${input.caseId}-${input.runId}-attempt-${input.attemptIndex}`;
  if (FORMAL_ROUTER_REQUEST_ID_PATTERN.test(readable)) return readable;
  const identityHash = sha256CanonicalJson({
    caseId: input.caseId,
    runId: input.runId,
    attemptIndex: input.attemptIndex,
  }).slice("sha256:".length, "sha256:".length + 20);
  const bounded =
    `native-block-generation-${input.caseId.slice(0, 32)}-${identityHash}-a${input.attemptIndex}`;
  if (!FORMAL_ROUTER_REQUEST_ID_PATTERN.test(bounded)) {
    throw new TypeError(
      "Generation router request identity exceeds the formal router contract.",
    );
  }
  return bounded;
}

export interface WorldReconstructionHostRoutePolicyV1 {
  readonly requiredCapabilityRefs: readonly string[];
  readonly requestedSourceKind: "canonical" | "babylon-native";
  readonly nativeTrustAdmitted: boolean;
}

export function decideNativeBlockReconstructionRouteV1(
  reconstructionCaseInput: unknown,
  routePolicy: WorldReconstructionHostRoutePolicyV1,
): SceneAuthoringRouteDecisionV1 {
  const reconstructionCase = parseWorldReconstructionCaseV1(
    reconstructionCaseInput,
  );
  return decideSceneAuthoringRouteV1({
    id: `${reconstructionCase.id}-route`,
    sceneBriefRef: reconstructionCase.sceneBriefRef,
    sceneBriefHash: reconstructionCase.sceneBriefHash,
    trustProfileRef: CURRENT_NATIVE_TRUST_PROFILE_REF,
    trustProfileHash: CURRENT_NATIVE_TRUST_PROFILE_HASH,
    requiredCapabilityRefs: routePolicy.requiredCapabilityRefs,
    requestedSourceKind: routePolicy.requestedSourceKind,
    nativeTrustAdmitted: routePolicy.nativeTrustAdmitted,
    referenceDrivenDistinctiveSilhouette:
      reconstructionCase.referenceInputs.length > 0 &&
      reconstructionCase.expected.semanticSilhouetteTargets.length > 0,
  });
}

export interface PrepareNativeBlockGenerationTaskV1Input {
  readonly case: WorldReconstructionCaseV1;
  readonly profile: WorldReconstructionEvaluationProfileV1;
  readonly routeDecision: SceneAuthoringRouteDecisionV1;
  readonly runId: string;
  readonly attemptIndex: WorldReconstructionAttemptIndexV1 | number;
  readonly backend: "cloud" | "local";
  readonly cloudOutputS3Root?: string;
  readonly runDirectoryPath: string;
  readonly inputDirectoryPath: string;
  readonly taskInstructionPath: string;
  readonly builderSkillPath: string;
  readonly nativeSceneApiPath: string;
  readonly nativeSceneProfilePath: string;
  readonly blockProfilePath: string;
  readonly hostClosureRootPath: string;
  readonly gameplayBootstrapPath: string;
  readonly worldRuntimeBootstrapPath: string;
  readonly worldRuntimeBootstrapRef: string;
  readonly worldBoundsPath: string;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly bootstrapId: string;
  readonly sceneModuleRef: string;
  readonly seed: number;
  readonly budgets: NativeBlockGenerationBudgetV1;
  readonly repairInstruction?: NativeBlockRepairInstructionV1;
}

export interface PreparedNativeBlockGenerationTaskV1 {
  readonly generationRequest: NativeBlockGenerationRequestV1;
  readonly generationRequestHash: Sha256HashV1;
  readonly attempt: SceneAuthoringAttemptV1;
  readonly attemptHash: Sha256HashV1;
  readonly routerRequestId: string;
  readonly routerTaskPayloadHash: Sha256HashV1;
  readonly backend: "cloud" | "local";
  readonly routerExecutablePath: string;
  readonly routerArguments: readonly string[];
  readonly runDirectoryPath: string;
  readonly taskWorkspacePath: string;
  readonly stagingDirectoryPath: string;
  readonly sourceDirectoryPath: string;
  readonly bootstrap: BabylonNativeSceneBootstrapV1;
  readonly bootstrapBytes: Uint8Array;
  readonly gameplayBootstrapBytes: Uint8Array;
  readonly worldRuntimeBootstrapBytes: Uint8Array;
  readonly worldBoundsBytes: Uint8Array;
  readonly hostClosure: NativeBlockGenerationHostClosureV1;
  readonly hostClosureBytes: Uint8Array;
  readonly frozenOwnerIdentities: WorldReconstructionFrozenOwnerIdentitiesV1;
}

export interface WorldReconstructionFrozenOwnerIdentitiesV1 {
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly worldBoundsHash: Sha256HashV1;
  readonly bootstrapInputHash: Sha256HashV1;
}

export function resolveWorldReconstructionFrozenOwnerIdentitiesV1(input: Readonly<{
  reconstructionCase: unknown;
  evaluationProfile: unknown;
  gameplayBootstrap: unknown;
  worldRuntimeBootstrap: unknown;
  worldBounds: unknown;
  bootstrap: unknown;
}>): WorldReconstructionFrozenOwnerIdentitiesV1 {
  const reconstructionCase = parseWorldReconstructionCaseV1(input.reconstructionCase);
  const evaluationProfile = parseWorldReconstructionEvaluationProfileV1(input.evaluationProfile);
  const gameplayBootstrap = parseGameplayBootstrapV1(input.gameplayBootstrap);
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(input.worldRuntimeBootstrap);
  const worldBounds = parseWorldPackageWorldBoundsV1(input.worldBounds);
  const bootstrap = parseBabylonNativeSceneBootstrapV1(input.bootstrap);
  const evaluationProfileHash = hashWorldReconstructionEvaluationProfileV1(evaluationProfile);
  if (
    reconstructionCase.evaluationProfileHash !== evaluationProfileHash ||
    !worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, evaluationProfile) ||
    worldRuntimeBootstrap.gameplayBootstrapRef !== gameplayBootstrap.resourceRef ||
    worldRuntimeBootstrap.gameplayBootstrapHash !== gameplayBootstrap.contentHash ||
    bootstrap.gameplayBootstrapRef !== gameplayBootstrap.resourceRef ||
    bootstrap.initialControlledEntityId !== worldRuntimeBootstrap.initialControlledEntityId ||
    !isEqual(
      bootstrap.gravityMetersPerSecondSquaredXYZ,
      worldRuntimeBootstrap.gravityMetersPerSecondSquaredXYZ,
    ) ||
    !isEqual(bootstrap.initialCamera, {
      mode: worldRuntimeBootstrap.initialCamera.mode,
      pitchRadians: worldRuntimeBootstrap.initialCamera.pitchRadians,
      distanceMeters: worldRuntimeBootstrap.initialCamera.distanceMeters,
      fovDegrees: worldRuntimeBootstrap.initialCamera.fovDegrees,
      targetHeightMeters: worldRuntimeBootstrap.initialCamera.targetHeightMeters,
    })
  ) {
    throw new TypeError("World reconstruction frozen owner identity closure failed.");
  }
  return Object.freeze({
    caseHash: hashWorldReconstructionCaseV1(reconstructionCase),
    evaluationProfileHash,
    gameplayBootstrapHash: gameplayBootstrap.contentHash,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    worldBoundsHash: hashWorldPackageWorldBoundsV1(worldBounds),
    bootstrapInputHash: hashBabylonNativeSceneBootstrapV1(bootstrap),
  });
}

export interface NativeBlockGenerationHostClosureV1 {
  readonly kind: "native-block-generation-host-closure";
  readonly schemaVersion: 1;
  readonly gameplayBootstrapRef: string;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrapResolvedVersion: string;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly worldBoundsHash: Sha256HashV1;
  readonly initialControlledEntityId: string;
}

export interface ResolvedNativeBlockGenerationResourceV1 {
  readonly kind: "worldkit-resolved-resource";
  readonly schemaVersion: 1;
  readonly resourceKind: "native-scene-api" | "native-scene-profile" | "native-block-profile";
  readonly resourceRef: string;
  readonly resolvedVersion: string;
  readonly contentHash: Sha256HashV1;
}

interface CanonicalRootV1 {
  readonly requestedPath: string;
  readonly realPath: string;
}

interface FrozenFileV1 { readonly relativePath: string; readonly bytes: Uint8Array; readonly hash: Sha256HashV1; }

function frozenCanonicalFile(relativePath: string, bytes: Uint8Array): FrozenFileV1 {
  return Object.freeze({ relativePath, bytes, hash: sha256Bytes(bytes) as Sha256HashV1 });
}

function exactPlainRecord(
  input: unknown,
  fields: readonly string[],
  description: string,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) throw new TypeError(`Invalid ${description}.`);
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(`Invalid ${description}.`);
  }
  return record;
}

export function parseResolvedNativeBlockGenerationResourceV1(
  bytes: Uint8Array,
  resourceKind: ResolvedNativeBlockGenerationResourceV1["resourceKind"],
  expectedRef: string,
): ResolvedNativeBlockGenerationResourceV1 {
  const record = exactPlainRecord(
    JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    ["kind", "schemaVersion", "resourceKind", "resourceRef", "resolvedVersion", "contentHash"],
    `${resourceKind} resolved resource descriptor`,
  );
  if (
    record.kind !== "worldkit-resolved-resource" ||
    record.schemaVersion !== 1 ||
    record.resourceKind !== resourceKind ||
    typeof record.resourceRef !== "string" ||
    typeof record.resolvedVersion !== "string" ||
    typeof record.contentHash !== "string" ||
    !new RegExp(`^worldkit://${resourceKind}/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?@([1-9][0-9]*)$`).test(record.resourceRef) ||
    !record.resourceRef.endsWith(`@${record.resolvedVersion}`) ||
    record.resourceRef !== expectedRef ||
    !SHA256_PATTERN.test(record.contentHash)
  ) throw new TypeError(`Invalid ${resourceKind} resolved resource descriptor.`);
  const resolution = Object.freeze({
    kind: "worldkit-resolved-resource",
    schemaVersion: 1,
    resourceKind,
    resourceRef: record.resourceRef,
    resolvedVersion: record.resolvedVersion,
    contentHash: record.contentHash as Sha256HashV1,
  });
  const canonicalBytes = new TextEncoder().encode(stringifyCanonicalJson(resolution));
  if (
    bytes.length !== canonicalBytes.length ||
    bytes.some((value, index) => value !== canonicalBytes[index])
  ) {
    throw new TypeError(`Invalid ${resourceKind} resolved resource descriptor canonical bytes.`);
  }
  return resolution;
}

export function parseNativeBlockGenerationHostClosureV1(
  input: unknown,
): NativeBlockGenerationHostClosureV1 {
  const record = exactPlainRecord(input, [
    "kind",
    "schemaVersion",
    "gameplayBootstrapRef",
    "gameplayBootstrapHash",
    "worldRuntimeBootstrapRef",
    "worldRuntimeBootstrapResolvedVersion",
    "worldRuntimeBootstrapHash",
    "worldBoundsHash",
    "initialControlledEntityId",
  ], "Native Block generation Host closure");
  if (
    record.kind !== "native-block-generation-host-closure" ||
    record.schemaVersion !== 1 ||
    typeof record.gameplayBootstrapRef !== "string" ||
    !/^worldkit:\/\/gameplay-bootstrap\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/.test(record.gameplayBootstrapRef) ||
    typeof record.worldRuntimeBootstrapRef !== "string" ||
    !/^worldkit:\/\/world-runtime-bootstrap\/[a-z0-9][a-z0-9.-]*@[1-9][0-9]*$/.test(record.worldRuntimeBootstrapRef) ||
    typeof record.worldRuntimeBootstrapResolvedVersion !== "string" ||
    !/^[1-9][0-9]*$/.test(record.worldRuntimeBootstrapResolvedVersion) ||
    !record.worldRuntimeBootstrapRef.endsWith(`@${record.worldRuntimeBootstrapResolvedVersion}`) ||
    typeof record.gameplayBootstrapHash !== "string" ||
    !SHA256_PATTERN.test(record.gameplayBootstrapHash) ||
    typeof record.worldRuntimeBootstrapHash !== "string" ||
    !SHA256_PATTERN.test(record.worldRuntimeBootstrapHash) ||
    typeof record.worldBoundsHash !== "string" ||
    !SHA256_PATTERN.test(record.worldBoundsHash) ||
    typeof record.initialControlledEntityId !== "string" ||
    record.initialControlledEntityId.length === 0
  ) throw new TypeError("Invalid Native Block generation Host closure.");
  return Object.freeze({
    kind: "native-block-generation-host-closure",
    schemaVersion: 1,
    gameplayBootstrapRef: record.gameplayBootstrapRef,
    gameplayBootstrapHash: record.gameplayBootstrapHash as Sha256HashV1,
    worldRuntimeBootstrapRef: record.worldRuntimeBootstrapRef,
    worldRuntimeBootstrapResolvedVersion: record.worldRuntimeBootstrapResolvedVersion,
    worldRuntimeBootstrapHash: record.worldRuntimeBootstrapHash as Sha256HashV1,
    worldBoundsHash: record.worldBoundsHash as Sha256HashV1,
    initialControlledEntityId: record.initialControlledEntityId,
  });
}

export function deriveNativeBlockGenerationBootstrapV1(input: Readonly<{
  reconstructionCase: WorldReconstructionCaseV1;
  gameplayBootstrap: unknown;
  worldRuntimeBootstrap: unknown;
  worldBounds: unknown;
  bootstrapId: string;
  sceneModuleRef: string;
  nativeSceneApiRef: string;
  nativeSceneProfileRef: string;
  seed: number;
}>): Readonly<{
  bootstrap: BabylonNativeSceneBootstrapV1;
  worldBounds: WorldPackageWorldBoundsV1;
}> {
  const reconstructionCase = parseWorldReconstructionCaseV1(input.reconstructionCase);
  const gameplay = parseGameplayBootstrapV1(input.gameplayBootstrap);
  const runtime = parseWorldRuntimeBootstrapV1(input.worldRuntimeBootstrap);
  const worldBounds = parseWorldPackageWorldBoundsV1(input.worldBounds);
  const controlledRuntimeSubjects = runtime.subjectRuntimeDescriptors.filter(
    (subject) => subject.entityId === runtime.initialControlledEntityId,
  );
  const controlledGameplayEntities = gameplay.entityDescriptors.filter(
    (entity) => entity.id === runtime.initialControlledEntityId,
  );
  if (
    runtime.gameplayBootstrapRef !== gameplay.resourceRef ||
    runtime.gameplayBootstrapHash !== gameplay.contentHash ||
    runtime.subjectRuntimeDescriptors.length !== 1 ||
    controlledRuntimeSubjects.length !== 1 ||
    controlledGameplayEntities.length !== 1 ||
    controlledGameplayEntities[0]!.entityDefinitionRef !==
      controlledRuntimeSubjects[0]!.subjectDefinitionRef ||
    runtime.initialCamera.targetEntityId !== runtime.initialControlledEntityId
  ) throw new TypeError("Native generation Gameplay/Runtime owner closure failed.");
  const bootstrap = parseBabylonNativeSceneBootstrapV1({
    kind: "babylon-native-scene-bootstrap",
    schemaVersion: 1,
    id: input.bootstrapId,
    sceneModuleRef: input.sceneModuleRef,
    nativeSceneApiRef: input.nativeSceneApiRef,
    nativeSceneProfileRef: input.nativeSceneProfileRef,
    gameplayBootstrapRef: gameplay.resourceRef,
    initialControlledEntityId: runtime.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ: runtime.gravityMetersPerSecondSquaredXYZ,
    initialCamera: {
      mode: runtime.initialCamera.mode,
      pitchRadians: runtime.initialCamera.pitchRadians,
      distanceMeters: runtime.initialCamera.distanceMeters,
      fovDegrees: runtime.initialCamera.fovDegrees,
      targetHeightMeters: runtime.initialCamera.targetHeightMeters,
    },
    seed: input.seed,
    spawnMarkerId: reconstructionCase.expected.spawnSupport.spawnMarkerId,
  });
  return Object.freeze({ bootstrap, worldBounds });
}

function relativeWithin(root: string, candidate: string, description: string): string {
  const relativePath = path.relative(root, candidate);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new TypeError(`${description} is outside its declared root: ${candidate}`);
  }
  return relativePath.split(path.sep).join("/");
}

async function canonicalRoot(requestedPath: string, description: string): Promise<CanonicalRootV1> {
  const resolved = path.resolve(requestedPath);
  const metadata = await lstat(resolved);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new TypeError(`${description} must be one canonical non-symbolic-link directory.`);
  }
  return Object.freeze({ requestedPath: resolved, realPath: await realpath(resolved) });
}

async function freezeFile(root: CanonicalRootV1, candidate: string): Promise<FrozenFileV1> {
  const requestedCandidate = path.resolve(candidate);
  const relativePath = relativeWithin(root.requestedPath, requestedCandidate, "Generation input");
  const metadata = await lstat(requestedCandidate);
  if (metadata.isSymbolicLink()) throw new TypeError(`Generation input must not be a symbolic link: ${relativePath}`);
  if (!metadata.isFile()) throw new TypeError(`Generation input must be a regular file: ${relativePath}`);
  const canonicalCandidate = await realpath(requestedCandidate);
  const canonicalRelativePath = relativeWithin(root.realPath, canonicalCandidate, "Generation input");
  if (canonicalRelativePath !== relativePath) {
    throw new TypeError(`Generation input resolves through a symbolic link: ${relativePath}`);
  }
  const bytes = await readFile(requestedCandidate);
  const after = await lstat(requestedCandidate);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    after.dev !== metadata.dev ||
    after.ino !== metadata.ino ||
    after.size !== metadata.size ||
    after.mtimeMs !== metadata.mtimeMs ||
    after.ctimeMs !== metadata.ctimeMs ||
    await realpath(requestedCandidate) !== canonicalCandidate
  ) {
    throw new TypeError(`Generation input changed while being frozen: ${relativePath}`);
  }
  return { relativePath, bytes, hash: sha256Bytes(bytes) as Sha256HashV1 };
}

function canonicalJsonHash(file: FrozenFileV1): Sha256HashV1 {
  try {
    return sha256CanonicalJson(
      JSON.parse(new TextDecoder().decode(file.bytes)),
    ) as Sha256HashV1;
  } catch {
    throw new TypeError("Repair prior evidence identity closure failed.");
  }
}

async function copyFrozenFile(taskWorkspacePath: string, file: FrozenFileV1): Promise<void> {
  const destination = path.join(taskWorkspacePath, "inputs", file.relativePath);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  // The copied content comes from the byte snapshot, never a second read of the mutable input.
  await writeFile(destination, file.bytes, { flag: "wx", mode: 0o600 });
}

async function ensureCanonicalDirectoryChain(root: CanonicalRootV1, candidate: string): Promise<string> {
  const requestedCandidate = path.resolve(candidate);
  const relativePath = relativeWithin(root.requestedPath, requestedCandidate, "Generation output");
  let requestedCurrent = root.requestedPath;
  let realCurrent = root.realPath;
  for (const segment of relativePath.split("/")) {
    requestedCurrent = path.join(requestedCurrent, segment);
    realCurrent = path.join(realCurrent, segment);
    try {
      const metadata = await lstat(requestedCurrent);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new TypeError(`Generation output ancestor must be a canonical directory: ${requestedCurrent}`);
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await mkdir(requestedCurrent, { mode: 0o700 });
    }
    if (await realpath(requestedCurrent) !== realCurrent) {
      throw new TypeError(`Generation output ancestor resolves through a symbolic link: ${requestedCurrent}`);
    }
  }
  return realCurrent;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeFrozenFileExclusive(root: string, file: FrozenFileV1): Promise<void> {
  const destination = path.join(root, file.relativePath);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, file.bytes, { flag: "wx", mode: 0o600 });
}

function asRef(relativePath: string): string { return `inputs/${relativePath}`; }

export async function prepareNativeBlockGenerationTaskV1(
  input: PrepareNativeBlockGenerationTaskV1Input,
): Promise<PreparedNativeBlockGenerationTaskV1> {
  const cloudOutputS3Root = input.backend === "cloud"
    ? input.cloudOutputS3Root
    : undefined;
  if (
    input.backend === "cloud" &&
    (typeof cloudOutputS3Root !== "string" ||
      !/^s3:\/\/[a-z0-9][a-z0-9.-]*\/.+[^/]$/.test(cloudOutputS3Root))
  ) {
    throw new TypeError("Cloud generation requires a canonical absolute S3 output root.");
  }
  if (input.backend === "local" && input.cloudOutputS3Root !== undefined) {
    throw new TypeError("Local generation must not declare a cloud S3 output root.");
  }
  const reconstructionCase = parseWorldReconstructionCaseV1(input.case);
  const profile = parseWorldReconstructionEvaluationProfileV1(input.profile);
  if (reconstructionCase.evaluationProfileRef !== "evaluation-profile.json" || reconstructionCase.evaluationProfileHash !== hashWorldReconstructionEvaluationProfileV1(profile)) throw new TypeError("Case/Profile identity closure failed.");
  if (!worldReconstructionEvidenceProfileClosureMatchesV1(reconstructionCase, profile)) {
    throw new TypeError("Case/Evaluation Profile required Evidence Profile closure failed.");
  }
  if (reconstructionCase.referenceInputs.some((reference) => reference.mediaType === "application/json")) throw new TypeError("Native generation references must be images.");
  if (
    input.attemptIndex !== 0 && input.attemptIndex !== 1 &&
    input.attemptIndex !== 2 && input.attemptIndex !== 3
  ) throw new TypeError("Native generation supports initial attempt 0 and repair attempts 1 through 3.");
  if (input.attemptIndex === 0 && input.repairInstruction !== undefined) {
    throw new TypeError("Initial generation attempt must not declare a repair instruction.");
  }
  if (input.attemptIndex > 0 && input.repairInstruction === undefined) {
    throw new TypeError("Repair generation attempt requires one repair instruction.");
  }
  const repairInstruction = input.repairInstruction === undefined
    ? undefined
    : parseNativeBlockRepairInstructionV1(input.repairInstruction);
  if (
    repairInstruction !== undefined &&
    repairInstruction.nextAttemptIndex !== input.attemptIndex
  ) {
    throw new TypeError("Repair instruction next Attempt identity mismatch.");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.runId)) {
    throw new TypeError("Generation runId must be one stable lowercase identity part.");
  }
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(input.bootstrapId)) {
    throw new TypeError("Native Block bootstrapId must be one stable lowercase identity.");
  }
  const suppliedRouteDecision = parseSceneAuthoringRouteDecisionV1(input.routeDecision);
  if (
    suppliedRouteDecision.sceneBriefRef !== reconstructionCase.sceneBriefRef ||
    suppliedRouteDecision.sceneBriefHash !== reconstructionCase.sceneBriefHash
  ) throw new TypeError("Route Decision and Case Scene Brief identity closure failed.");
  const routeDecision = decideNativeBlockReconstructionRouteV1(
    reconstructionCase,
    {
      requiredCapabilityRefs: suppliedRouteDecision.requiredCapabilityRefs,
      requestedSourceKind: "babylon-native",
      nativeTrustAdmitted: true,
    },
  );
  if (
    routeDecision.decision.kind !== "babylon-native" ||
    !isEqual(routeDecision, suppliedRouteDecision)
  ) {
    throw new TypeError("Native generation Route Decision does not match the trusted recomputed decision.");
  }
  const inputRoot = await canonicalRoot(input.inputDirectoryPath, "Generation input root");
  const hostClosureRoot = await canonicalRoot(input.hostClosureRootPath, "Host closure root");
  const caseRoot = await canonicalRoot(path.dirname(inputRoot.requestedPath), "Generation Case root");
  const requestedRunDirectoryPath = path.resolve(input.runDirectoryPath);
  if (path.basename(requestedRunDirectoryPath) !== input.runId) {
    throw new TypeError("Generation runId must match the run directory name.");
  }
  relativeWithin(caseRoot.requestedPath, requestedRunDirectoryPath, "Generation run directory");
  const repairContextFiles = repairInstruction === undefined
    ? []
    : await (async () => {
      const runRoot = await canonicalRoot(
        requestedRunDirectoryPath,
        "Generation repair run root",
      );
      return Promise.all(repairContextPaths(
        repairInstruction.priorAttemptIndex,
        repairInstruction.priorEvidence.kind,
      ).map((relativePath) =>
        freezeFile(runRoot, path.join(runRoot.requestedPath, relativePath))
      ));
    })();
  if (repairInstruction !== undefined) {
    const repairContextByPath = new Map(
      repairContextFiles.map((file) => [file.relativePath, file] as const),
    );
    const priorRoot = `attempts/${repairInstruction.priorAttemptIndex}`;
    const priorEvidenceRelativePath = repairInstruction.priorEvidence.kind ===
        "evaluation-result"
      ? `${priorRoot}/evaluation.json`
      : repairInstruction.priorEvidence.kind ===
          "opening-composition-gate-result"
        ? `${priorRoot}/rejected-capture/opening-composition-gate-result.json`
        : repairInstruction.priorEvidence.kind === "ground-analysis-report"
          ? `${priorRoot}/ground-analysis-report.json`
          : `${priorRoot}/native-check-result.json`;
    const priorEvidence = repairContextByPath.get(priorEvidenceRelativePath);
    const priorGenerationRequest = repairContextByPath.get(
      `${priorRoot}/generation-request.json`,
    );
    const priorAttemptResultFile = repairContextByPath.get(
      `${priorRoot}/attempt-result.json`,
    );
    if (
      priorEvidence === undefined ||
      canonicalJsonHash(priorEvidence) !==
        repairInstruction.priorEvidence.resultHash ||
      !repairInstruction.priorEvidence.resultRef.endsWith(
        `/${priorEvidenceRelativePath}`,
      )
    ) {
      throw new TypeError("Repair prior evidence identity closure failed.");
    }
    if (
      priorGenerationRequest?.hash !== repairInstruction.priorGenerationRequestHash
    ) {
      throw new TypeError("Repair prior generation identity closure failed.");
    }
    const priorAttemptResult = parseSceneAuthoringAttemptResultV1(
      JSON.parse(new TextDecoder().decode(priorAttemptResultFile?.bytes)),
    );
    if (
      priorAttemptResult.outcome !== "completed" ||
      priorAttemptResult.authoredSourceRef !== repairInstruction.priorSourceRef ||
      priorAttemptResult.authoredSourceHash !== repairInstruction.priorSourceHash
    ) {
      throw new TypeError("Repair prior source identity closure failed.");
    }
  }
  const [sceneBrief, taskInstruction, builderSkill, nativeSceneApi, nativeSceneProfile, blockProfile, gameplaySource, runtimeSource, registryLockSource, ...references] = await Promise.all([
    freezeFile(inputRoot, path.resolve(inputRoot.requestedPath, reconstructionCase.sceneBriefRef)),
    freezeFile(inputRoot, input.taskInstructionPath),
    freezeFile(inputRoot, input.builderSkillPath),
    freezeFile(inputRoot, input.nativeSceneApiPath),
    freezeFile(inputRoot, input.nativeSceneProfilePath),
    freezeFile(inputRoot, input.blockProfilePath),
    freezeFile(hostClosureRoot, input.gameplayBootstrapPath),
    freezeFile(hostClosureRoot, input.worldRuntimeBootstrapPath),
    freezeFile(hostClosureRoot, path.join(hostClosureRoot.requestedPath, "registry-lock.json")),
    ...reconstructionCase.referenceInputs.map((reference) => freezeFile(inputRoot, path.resolve(inputRoot.requestedPath, reference.inputRef))),
  ]);
  const effectiveTaskInstruction = repairInstruction === undefined
    ? taskInstruction
    : (() => {
      const source = new TextDecoder().decode(taskInstruction.bytes).trimEnd();
      const bytes = new TextEncoder().encode(
        `${source}\n\n${repairTaskProtocol(repairInstruction.priorAttemptIndex)}\n`,
      );
      return Object.freeze({
        relativePath: taskInstruction.relativePath,
        bytes,
        hash: sha256Bytes(bytes) as Sha256HashV1,
      });
    })();
  if (sceneBrief.hash !== reconstructionCase.sceneBriefHash) throw new TypeError("Frozen Scene Brief bytes do not match the Case hash.");
  const gameplayBootstrap = parseGameplayBootstrapV1(
    JSON.parse(new TextDecoder().decode(gameplaySource.bytes)),
  );
  const worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(
    JSON.parse(new TextDecoder().decode(runtimeSource.bytes)),
  );
  const admittedResourceLocks = worldResourceLockEntriesV1(
    JSON.parse(new TextDecoder().decode(registryLockSource.bytes)),
  );
  const admittedGameplayRows = admittedResourceLocks.filter((row) =>
    row.resourceKind === "gameplay-bootstrap" &&
    row.resourceRef === gameplayBootstrap.resourceRef
  );
  const admittedRuntimeRows = admittedResourceLocks.filter((row) =>
    row.resourceKind === "world-runtime-bootstrap" &&
    row.resourceRef === input.worldRuntimeBootstrapRef
  );
  if (
    admittedGameplayRows.length !== 1 ||
    admittedGameplayRows[0]!.contentHash !== gameplayBootstrap.contentHash ||
    admittedRuntimeRows.length !== 1 ||
    admittedRuntimeRows[0]!.contentHash !== worldRuntimeBootstrap.contentHash ||
    !input.worldRuntimeBootstrapRef.endsWith(`@${admittedRuntimeRows[0]!.resolvedVersion}`)
  ) {
    throw new TypeError("Generation Host owner resources are not admitted by the selected Registry Lock.");
  }
  const nativeSceneApiResolution = parseResolvedNativeBlockGenerationResourceV1(
    nativeSceneApi.bytes,
    "native-scene-api",
    CURRENT_NATIVE_SCENE_API_REF,
  );
  const nativeSceneProfileResolution = parseResolvedNativeBlockGenerationResourceV1(
    nativeSceneProfile.bytes,
    "native-scene-profile",
    BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  );
  const blockProfileResolution = parseResolvedNativeBlockGenerationResourceV1(
    blockProfile.bytes,
    "native-block-profile",
    CURRENT_NATIVE_BLOCK_PROFILE_REF,
  );
  const derived = deriveNativeBlockGenerationBootstrapV1({
    reconstructionCase,
    gameplayBootstrap,
    worldRuntimeBootstrap,
    worldBounds: input.worldBounds,
    bootstrapId: input.bootstrapId,
    sceneModuleRef: input.sceneModuleRef,
    nativeSceneApiRef: nativeSceneApiResolution.resourceRef,
    nativeSceneProfileRef: nativeSceneProfileResolution.resourceRef,
    seed: input.seed,
  });
  const bootstrapBytes = new TextEncoder().encode(stringifyCanonicalJson(derived.bootstrap));
  const bootstrap = frozenCanonicalFile("native-scene.bootstrap.json", bootstrapBytes);
  if (bootstrap.hash !== hashBabylonNativeSceneBootstrapV1(derived.bootstrap)) {
    throw new TypeError("Canonical Bootstrap materialization hash mismatch.");
  }
  const gameplay = frozenCanonicalFile(
    "gameplay-bootstrap.json",
    gameplayBootstrapCanonicalBytesV1(gameplayBootstrap),
  );
  const runtime = frozenCanonicalFile(
    "world-runtime-bootstrap.json",
    worldRuntimeBootstrapCanonicalBytesV1(worldRuntimeBootstrap),
  );
  const worldBounds = frozenCanonicalFile(
    "world-bounds.json",
    new TextEncoder().encode(stringifyCanonicalJson(derived.worldBounds)),
  );
  if (worldBounds.hash !== hashWorldPackageWorldBoundsV1(derived.worldBounds)) {
    throw new TypeError("Canonical World Bounds materialization hash mismatch.");
  }
  const hostClosure = parseNativeBlockGenerationHostClosureV1({
    kind: "native-block-generation-host-closure",
    schemaVersion: 1,
    gameplayBootstrapRef: gameplayBootstrap.resourceRef,
    gameplayBootstrapHash: gameplayBootstrap.contentHash,
    worldRuntimeBootstrapRef: input.worldRuntimeBootstrapRef,
    worldRuntimeBootstrapResolvedVersion: admittedRuntimeRows[0]!.resolvedVersion,
    worldRuntimeBootstrapHash: worldRuntimeBootstrap.contentHash,
    worldBoundsHash: worldBounds.hash,
    initialControlledEntityId: worldRuntimeBootstrap.initialControlledEntityId,
  });
  const hostClosureFile = frozenCanonicalFile(
    "host-closure.json",
    new TextEncoder().encode(stringifyCanonicalJson(hostClosure)),
  );
  const frozenOwnerIdentities = resolveWorldReconstructionFrozenOwnerIdentitiesV1({
    reconstructionCase,
    evaluationProfile: profile,
    gameplayBootstrap,
    worldRuntimeBootstrap,
    worldBounds: derived.worldBounds,
    bootstrap: derived.bootstrap,
  });
  if (
    repairInstruction !== undefined &&
    !isEqual(repairInstruction.frozenOwnerIdentities, frozenOwnerIdentities)
  ) {
    throw new TypeError("Repair instruction frozen owner identity closure failed.");
  }
  for (let index = 0; index < references.length; index += 1) {
    if (references[index]!.hash !== reconstructionCase.referenceInputs[index]!.contentHash) throw new TypeError("Frozen reference bytes do not match the Case hash.");
  }
  const builderBundle = builderSkill.relativePath.endsWith("builder-skill/SKILL.md") ? await Promise.all([
    freezeFile(inputRoot, path.join(path.dirname(input.builderSkillPath), "references/native-block-output-contract.md")),
    freezeFile(inputRoot, path.join(path.dirname(input.builderSkillPath), "scripts/self-check.mjs")),
  ]) : [];
  const taskInputFiles = [sceneBrief, effectiveTaskInstruction, builderSkill, nativeSceneApi, nativeSceneProfile, blockProfile, registryLockSource, bootstrap, gameplay, runtime, worldBounds, hostClosureFile, ...builderBundle, ...references, ...repairContextFiles];
  const routeDecisionHash = hashSceneAuthoringRouteDecisionV1(routeDecision);
  const repairInstructionFile = repairInstruction === undefined
    ? undefined
    : frozenCanonicalFile(
      "repair-instruction.json",
      new TextEncoder().encode(stringifyCanonicalJson(repairInstruction)),
    );
  const contextInputs = sortBy([nativeSceneApi, nativeSceneProfile, blockProfile, registryLockSource, bootstrap, gameplay, runtime, worldBounds, hostClosureFile, builderSkill, ...builderBundle, ...repairContextFiles]
    .map((file) => ({ inputRef: asRef(file.relativePath), contentHash: file.hash }))
    .concat([
      { inputRef: "context/case.json", contentHash: sha256CanonicalJson(reconstructionCase) as Sha256HashV1 },
      { inputRef: "context/evaluation-profile.json", contentHash: hashWorldReconstructionEvaluationProfileV1(profile) },
      { inputRef: "context/scene-authoring-route-decision.json", contentHash: routeDecisionHash },
      ...(repairInstructionFile === undefined
        ? []
        : [{ inputRef: "context/repair-instruction.json", contentHash: repairInstructionFile.hash }]),
    ]), ({ inputRef }) => inputRef);
  const workspaceContextManifest = { kind: "native-block-generation-context", schemaVersion: 1, inputs: contextInputs };
  const workspaceContextManifestHash = sha256CanonicalJson(workspaceContextManifest) as Sha256HashV1;
  const generationRequest: NativeBlockGenerationRequestV1 = {
    kind: "native-block-generation-request", schemaVersion: 1,
    id: `${reconstructionCase.id}.${input.runId}.attempt-${input.attemptIndex}`,
    routeDecisionRef: `worldkit://scene-authoring-route-decision/${routeDecision.id}@1`, routeDecisionHash,
    sceneBriefRef: reconstructionCase.sceneBriefRef, sceneBriefHash: reconstructionCase.sceneBriefHash,
    referenceInputs: reconstructionCase.referenceInputs.map((reference) => ({ ...reference })) as NativeBlockGenerationRequestV1["referenceInputs"],
    codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: sha256CanonicalJson({ resourceRef: "worldkit://codex-execution-profile/formal@1", model: "gpt-5.6-sol", reasoningEffort: "xhigh" }) as Sha256HashV1,
    taskInstructionRef: asRef(effectiveTaskInstruction.relativePath), taskInstructionHash: effectiveTaskInstruction.hash,
    builderSkillRef: asRef(builderSkill.relativePath), builderSkillHash: builderSkill.hash,
    workspaceContextManifestRef: "context/workspace-context-manifest.json", workspaceContextManifestHash,
    contextInputs, nativeSceneApiRef: nativeSceneApiResolution.resourceRef, nativeSceneApiHash: nativeSceneApiResolution.contentHash,
    nativeSceneProfileRef: nativeSceneProfileResolution.resourceRef, nativeSceneProfileHash: nativeSceneProfileResolution.contentHash,
    blockProfileRef: blockProfileResolution.resourceRef, blockProfileHash: blockProfileResolution.contentHash,
    bootstrapInputRef: asRef(bootstrap.relativePath), bootstrapInputHash: bootstrap.hash,
    seed: input.seed, budgets: input.budgets, declaredOutputPaths: OUTPUTS,
  };
  const generationRequestHash = hashNativeBlockGenerationRequestV1(generationRequest);
  const attempt: SceneAuthoringAttemptV1 = {
    kind: "scene-authoring-attempt", schemaVersion: 1, id: `${reconstructionCase.id}-${input.runId}-attempt-${input.attemptIndex}`,
    sceneAuthoringRouteDecisionRef: generationRequest.routeDecisionRef, sceneAuthoringRouteDecisionHash: routeDecisionHash,
    sceneBriefRef: generationRequest.sceneBriefRef, sceneBriefHash: generationRequest.sceneBriefHash,
    sourceInput: { kind: "babylon-native", bootstrapInputRef: generationRequest.bootstrapInputRef, bootstrapInputHash: generationRequest.bootstrapInputHash, generationRequestRef: `generation-request.json`, generationRequestHash },
    selectedAssetResources: [], seed: input.seed, authoringProfileRef: routeDecision.decision.authoringProfileRef,
    acceptanceTargetRefs: reconstructionCase.acceptanceTargetRefs, requiredEvidenceProfileRefs: reconstructionCase.requiredEvidenceProfileRefs,
  };
  const contextFiles: readonly (readonly [string, unknown])[] = [
    ["case.json", reconstructionCase],
    ["evaluation-profile.json", profile],
    ["scene-authoring-route-decision.json", routeDecision],
    ["generation-request.json", generationRequest],
    ["attempt.json", attempt],
    ...(repairInstruction === undefined
      ? []
      : [["repair-instruction.json", repairInstruction] as const]),
    ["workspace-context-manifest.json", workspaceContextManifest],
  ] as const;
  const routerRequestId = deriveNativeBlockGenerationRouterRequestIdV1({
    caseId: reconstructionCase.id,
    runId: input.runId,
    attemptIndex: input.attemptIndex,
  });
  const routerArguments = [
    "--backend", input.backend, "--repo-root", ".", "--task-id", routerRequestId,
    "--stage", "native-block-generation", "--job-name", `Native Block Generation ${reconstructionCase.id}`,
    "--request-id", routerRequestId, "--execution-profile", "formal", "--submit-attempts", "1",
    "--timeout-seconds", String(generationRequest.budgets.timeoutSeconds),
    "--instruction-file", `attempts/${input.attemptIndex}/.task/inputs/${taskInstruction.relativePath}`,
    "--context", `attempts/${input.attemptIndex}/.task/inputs`, "--context", `attempts/${input.attemptIndex}/.task/context`,
    ...references.flatMap((reference, index) => ["--asset", `reference-${index}::attempts/${input.attemptIndex}/.task/inputs/${reference.relativePath}::file::${reconstructionCase.referenceInputs[index]!.mediaType}`]),
    "--output", `scene.ts::attempts/${input.attemptIndex}/.staging/scene.ts::text/typescript`,
    "--output", `native-block-authoring.json::attempts/${input.attemptIndex}/.staging/native-block-authoring.json::application/json`,
    "--output", `native-resources.json::attempts/${input.attemptIndex}/.staging/native-resources.json::application/json`,
    ...(input.backend === "cloud" ? ["--output-s3-prefix", `${cloudOutputS3Root}/${reconstructionCase.id}/${input.runId}/attempt-${input.attemptIndex}`] : []),
  ];
  const routerTaskPayloadHash = sha256CanonicalJson({ request: generationRequest, routerRequestId, routerArguments }) as Sha256HashV1;
  const runDirectoryPath = await ensureCanonicalDirectoryChain(caseRoot, requestedRunDirectoryPath);
  const runRoot = Object.freeze({ requestedPath: runDirectoryPath, realPath: runDirectoryPath });
  const attemptsRoot = await ensureCanonicalDirectoryChain(runRoot, path.join(runDirectoryPath, "attempts"));
  const attemptRoot = path.join(attemptsRoot, String(input.attemptIndex));
  if (await pathExists(attemptRoot)) {
    throw new TypeError(`Generation Attempt must be fresh; attempt already exists: ${input.attemptIndex}`);
  }
  const publicationStagingPath = await mkdtemp(path.join(attemptsRoot, `.attempt-${input.attemptIndex}.prepare-`));
  try {
    const stagedTaskWorkspacePath = path.join(publicationStagingPath, ".task");
    const stagedContextDirectoryPath = path.join(stagedTaskWorkspacePath, "context");
    await Promise.all([
      mkdir(stagedTaskWorkspacePath, { recursive: true, mode: 0o700 }),
      mkdir(stagedContextDirectoryPath, { recursive: true, mode: 0o700 }),
      mkdir(path.join(publicationStagingPath, ".staging"), { mode: 0o700 }),
    ]);
    await Promise.all(taskInputFiles.map((file) => copyFrozenFile(stagedTaskWorkspacePath, file)));
    await Promise.all(contextFiles.map(async ([name, value]) => {
      const bytes = new TextEncoder().encode(stringifyCanonicalJson(value));
      await writeFile(path.join(stagedContextDirectoryPath, name), bytes, { flag: "wx", mode: 0o600 });
      if (sha256Bytes(bytes) !== sha256CanonicalJson(value)) {
        throw new TypeError(`Frozen context hash mismatch: ${name}`);
      }
    }));
    const durableInputs = [
      nativeSceneApi,
      nativeSceneProfile,
      blockProfile,
      registryLockSource,
      bootstrap,
      gameplay,
      runtime,
      worldBounds,
      hostClosureFile,
    ];
    await Promise.all(durableInputs.map((file) => writeFrozenFileExclusive(
      path.join(publicationStagingPath, "inputs"),
      file,
    )));
    await Promise.all([
      writeFrozenFileExclusive(publicationStagingPath, frozenCanonicalFile(
        "scene-authoring-route-decision.json",
        new TextEncoder().encode(stringifyCanonicalJson(routeDecision)),
      )),
      writeFrozenFileExclusive(publicationStagingPath, frozenCanonicalFile(
        "generation-request.json",
        new TextEncoder().encode(stringifyCanonicalJson(generationRequest)),
      )),
      writeFrozenFileExclusive(publicationStagingPath, frozenCanonicalFile(
        "attempt.json",
        new TextEncoder().encode(stringifyCanonicalJson(attempt)),
      )),
    ]);
    if (await pathExists(attemptRoot)) {
      throw new TypeError(`Generation Attempt must be fresh; attempt already exists: ${input.attemptIndex}`);
    }
    await rename(publicationStagingPath, attemptRoot);
  } catch (error) {
    await rm(publicationStagingPath, { recursive: true, force: true });
    throw error;
  }
  const taskWorkspacePath = path.join(attemptRoot, ".task");
  const stagingDirectoryPath = path.join(attemptRoot, ".staging");
  const sourceDirectoryPath = path.join(attemptRoot, "source");
  return Object.freeze({
    generationRequest,
    generationRequestHash,
    attempt,
    attemptHash: hashSceneAuthoringAttemptV1(attempt),
    routerRequestId,
    routerTaskPayloadHash,
    backend: input.backend,
    routerExecutablePath: path.resolve("scripts/agents/run-codex-task.mjs"),
    routerArguments: Object.freeze(routerArguments),
    runDirectoryPath,
    taskWorkspacePath,
    stagingDirectoryPath,
    sourceDirectoryPath,
    bootstrap: derived.bootstrap,
    bootstrapBytes,
    gameplayBootstrapBytes: gameplay.bytes,
    worldRuntimeBootstrapBytes: runtime.bytes,
    worldBoundsBytes: worldBounds.bytes,
    hostClosure,
    hostClosureBytes: hostClosureFile.bytes,
    frozenOwnerIdentities,
  });
}

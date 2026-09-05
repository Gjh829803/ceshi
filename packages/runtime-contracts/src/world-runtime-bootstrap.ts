import Ajv2020 from "ajv/dist/2020.js";
import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1,
  HUMANOID_ANIMATION_SEMANTIC_FAMILIES_V1,
  SUBJECT_RESOURCE_KINDS_V1,
  isBipedBoneIdV1,
  isGroundHumanoidActionIdV1,
  isSubjectBodyTopologyV2,
  type AutomaticLocomotionPresentationKeyV1,
  type BipedBoneIdV1,
  type GroundHumanoidActionIdV1,
  type HumanoidAnimationSemanticFamilyV1,
  type SubjectBodyTopologyV2,
  type SubjectPresentationPolicyV1,
} from "@whitebox-world/subject-contracts";
import type {
  GaitV2,
  MobilityModeV2,
  VerticalPhaseV2,
} from "@whitebox-world/gameplay-contracts";
import {
  createActionPresentationRegistryV1,
  type ActionPresentationBindingV1,
} from "@whitebox-world/subject-actions";
import type { LockedRootMotionSourceV1 } from "@whitebox-world/character-movement";
import { isNil } from "lodash-es";

import {
  CAMERA_RIG_PARAMETER_NAMES_V1,
  type CameraRigParameterNameV1,
  type CameraRigParametersV1,
} from "./camera-parameter-contract";
import type { WheeledArcadeControlFeelParametersV1 } from
  "./control-feel-parameter-contract";
import worldRuntimeBootstrapSchema from "./world-runtime-bootstrap-v1.schema.json";

export type RuntimeVec3V1 = readonly [x: number, y: number, z: number];

export interface RuntimeSubjectAssetInventoryV1 {
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  skeletonCount: number;
  boneCount: number;
  animationClipNames: readonly string[];
}

export interface RuntimeSubjectAssetV1 {
  readonly subjectAssetRef: string;
  readonly artifactContentHash: string;
  readonly byteLength: number;
  readonly mediaType: "model/gltf-binary";
  readonly format: "glb";
  readonly inventory: RuntimeSubjectAssetInventoryV1;
}

export interface RuntimeRigProfileV1 {
  readonly rigProfileRef: string;
  readonly bodyTopology: "biped";
  readonly skeletonRootBoneName: string;
  readonly requiredBoneIds: readonly BipedBoneIdV1[];
  readonly sourceNodeNameByBoneId: Readonly<Record<BipedBoneIdV1, string>>;
}

export interface RuntimeAnimationBindingV1 {
  readonly actionId: GroundHumanoidActionIdV1;
  readonly sourceClipName: string;
  readonly semanticFamily: HumanoidAnimationSemanticFamilyV1;
  readonly automaticPresentationKeys:
    readonly AutomaticLocomotionPresentationKeyV1[];
  readonly loopMode: "repeat" | "once";
  readonly playbackSpeedRatio: number;
  readonly blendDurationSeconds: number;
  readonly rootMotionMode: "in-place";
}

export interface RuntimeAnimationSetV1 {
  animationSetRef: string;
  subjectAssetRef: string;
  rigProfileRef: string;
  defaultActionId: GroundHumanoidActionIdV1;
  requiredActionIds: readonly GroundHumanoidActionIdV1[];
  animationBindings: readonly RuntimeAnimationBindingV1[];
}

export interface RuntimeSubjectCapsuleV1 {
  kind: "capsule";
  radiusMeters: number;
  heightMeters: number;
  centerOffsetFromSubjectOriginMetersXYZ: RuntimeVec3V1;
}

export interface RuntimeColliderProfileV1 {
  readonly colliderProfileRef: string;
  readonly supportedBodyTopologies: readonly SubjectBodyTopologyV2[];
  readonly collider: RuntimeSubjectCapsuleV1;
}

export type RuntimeSubjectVisualPrimitiveV1 =
  | Readonly<{ kind: "box"; sizeMetersXYZ: RuntimeVec3V1 }>
  | Readonly<{ kind: "sphere"; radiusMeters: number }>
  | Readonly<{ kind: "cylinder"; radiusMeters: number; heightMeters: number }>
  | Readonly<{ kind: "capsule"; radiusMeters: number; heightMeters: number }>;

export interface RuntimeSubjectVisualPrimitivePartV1 {
  readonly id: string;
  readonly kind: "primitive";
  readonly shape: RuntimeSubjectVisualPrimitiveV1;
  readonly localTransform: Readonly<{
    positionMetersXYZ: RuntimeVec3V1;
    rotationEulerRadiansXYZ: RuntimeVec3V1;
  }>;
  readonly semanticTags: readonly string[];
}

export interface RuntimeSubjectVisualAssetPartV1 {
  readonly id: string;
  readonly kind: "asset";
  readonly subjectAssetRef: string;
  readonly localTransform: Readonly<{
    positionMetersXYZ: RuntimeVec3V1;
    rotationEulerRadiansXYZ: RuntimeVec3V1;
    scaleXYZ: RuntimeVec3V1;
  }>;
  readonly appearance: Readonly<{ mode: "whitebox-neutral" }>;
  readonly semanticTags: readonly string[];
}

export type RuntimeSubjectVisualPartV1 =
  | RuntimeSubjectVisualPrimitivePartV1
  | RuntimeSubjectVisualAssetPartV1;

export interface RuntimeSubjectLocalSocketV1 {
  readonly id: string;
  readonly kind: "local";
  readonly localTransform: Readonly<{
    positionMetersXYZ: RuntimeVec3V1;
    rotationEulerRadiansXYZ: RuntimeVec3V1;
  }>;
  readonly semanticTags: readonly string[];
}

export interface RuntimeSubjectBoneSocketV1 {
  readonly id: string;
  readonly kind: "bone";
  readonly boneId: BipedBoneIdV1;
  readonly offsetTransform: Readonly<{
    positionMetersXYZ: RuntimeVec3V1;
    rotationEulerRadiansXYZ: RuntimeVec3V1;
  }>;
  readonly semanticTags: readonly string[];
}

export type RuntimeSubjectSocketV1 =
  | RuntimeSubjectLocalSocketV1
  | RuntimeSubjectBoneSocketV1;

export type RuntimeSubjectVisualBindingV1 =
  | Readonly<{ mode: "static" }>
  | Readonly<{
      mode: "rigged";
      rigProfileRef: string;
      animationSetRef: string;
    }>;

export type RuntimeMovementMediumV1 = "ground" | "water" | "air";
export type RuntimeMotionCommandKindV1 =
  | "planar-vector"
  | "throttle-steer"
  | "flight-attitude"
  | "none";

export interface RuntimeMotionProfileV1 {
  resourceRef: string;
  contentHash: string;
  motionKernelRef: string;
  motionTags: readonly string[];
}

export interface RuntimeMotionKernelDefinitionV1 {
  resourceRef: string;
  implementationId:
    | "free-ground"
    | "forward-steer"
    | "wheeled-arcade"
    | "surface-slide"
    | "water-surface"
    | "unpowered-glide"
    | "powered-flight";
  commandKind: RuntimeMotionCommandKindV1;
  supportedMediums: readonly RuntimeMovementMediumV1[];
  fallbackMotionProfileRef: string;
  deterministic: true;
}

export interface RuntimeControlProfileV1 {
  resourceRef: string;
  contentHash: string;
  commandKind: RuntimeMotionCommandKindV1;
  inputSpace: "camera-relative" | "subject-local" | "flight-frame" | "none";
  facingPolicy:
    | "align-to-move"
    | "align-to-view"
    | "steering-derived"
    | "flight-derived"
    | "fixed";
  lateralMovementPolicy: "allowed" | "forbidden";
  moveDeadzoneRatio: number;
}

export interface RuntimeCameraRigProfileV1 {
  resourceRef: string;
  contentHash: string;
  baseMode:
    | "first-person"
    | "free-orbit"
    | "stable-follow"
    | "speed-chase"
    | "flight-horizon";
  algorithmRef: string;
  headingSource: "view" | "target-forward" | "target-velocity";
  reverseHeadingPolicy: "follow-velocity" | "preserve-target-forward";
  recenterMode: "off" | "forward-motion" | "always";
  preferredSocketIds: readonly string[];
  parameters: CameraRigParametersV1;
  authoringRanges?: Readonly<Partial<Record<
    CameraRigParameterNameV1,
    Readonly<{ minimum: number; maximum: number; step: number }>
  >>>;
}

export interface RuntimeCameraModifierProfileV1 {
  readonly resourceRef: string;
  readonly parameterOverrides:
    Readonly<Partial<RuntimeCameraRigProfileV1["parameters"]>>;
  readonly headingSourceOverride?: RuntimeCameraRigProfileV1["headingSource"];
  readonly reverseHeadingPolicyOverride?:
    RuntimeCameraRigProfileV1["reverseHeadingPolicy"];
  readonly recenterModeOverride?: RuntimeCameraRigProfileV1["recenterMode"];
}

export interface RuntimeCameraContextRuleV1 {
  readonly id: string;
  readonly priority: number;
  readonly when: Readonly<{
    relationshipRoles?: readonly ("none" | "rider" | "driver" | "passenger" | "tethered")[];
    locomotionStatuses?: readonly ("active" | "suspended")[];
    mobilityModes?: readonly MobilityModeV2[];
    gaits?: readonly GaitV2[];
    verticalPhases?: readonly VerticalPhaseV2[];
    requiredActiveActionRefs?: readonly string[];
    actionInterruptibility?: "interruptible" | "non-interruptible";
    motionKernelRefs?: readonly string[];
    requiredMotionTags?: readonly string[];
    movementMediums?: readonly RuntimeMovementMediumV1[];
    minimumSpeedMetersPerSecond?: number;
    maximumSpeedMetersPerSecond?: number;
    requiredSocketIds?: readonly string[];
    requiredCameraContextTags?: readonly string[];
  }>;
  readonly cameraRigProfileRef?: string;
  readonly cameraModifierRefs?: readonly string[];
}

export interface RuntimeSubjectCapabilityAssemblyV1 {
  authoringAvailability: "recommended" | "advanced" | "experimental";
  physicsBodyProfileRef: string;
  locomotionProfileRef: string;
  defaultMotionProfile: RuntimeMotionProfileV1;
  optionalMotionProfiles: readonly RuntimeMotionProfileV1[];
  fallbackMotionProfile: RuntimeMotionProfileV1;
  motionKernels: readonly RuntimeMotionKernelDefinitionV1[];
  controlProfile: RuntimeControlProfileV1;
  cameraContext: {
    resourceRef: string;
    defaultCameraRigProfileRef: string;
    firstPersonCameraRigProfileRef?: string;
    rules: readonly RuntimeCameraContextRuleV1[];
    cameraRigProfiles: readonly RuntimeCameraRigProfileV1[];
    cameraModifierProfiles: readonly RuntimeCameraModifierProfileV1[];
  };
  mediumProfile: Readonly<{
    resourceRef: string;
    air: Readonly<{ gravityRatio: number; linearDragPerSecond: number }>;
  }>;
  readonly relationshipProfiles: readonly (
    | Readonly<{
        resourceRef: string;
        relationshipType: "mountedOn";
        requiredRiderSocketIds: readonly string[];
        requiredMountSocketIds: readonly string[];
        controlTransferMode: "keep-rider" | "to-mount" | "none";
        cameraTargetRole: "controlled-entity" | "rider" | "mount";
        maximumMountDistanceMeters?: number;
      }>
    | Readonly<{
        resourceRef: string;
        relationshipType: "seat";
        requiredOccupantSocketIds: readonly string[];
        requiredSeatSocketIds: readonly string[];
      }>
    | Readonly<{
        resourceRef: string;
        relationshipType: "tether";
        requiredTetheredSocketIds: readonly string[];
        requiredTetherAnchorSocketIds: readonly string[];
      }>
  )[];
  readonly harnessProfileRef: string;
  readonly requiredHarnessCheckIds: readonly string[];
  readonly actionOrPoseSetRef: string;
  readonly renderBindingProfileRef: string;
}

export interface RuntimeSubjectMountSlotV1 {
  readonly id: string;
  readonly kind: "mount-slot";
  readonly mode: "stand";
  readonly mountSocketId: string;
  readonly riderSubjectOriginOffsetMetersXYZ: RuntimeVec3V1;
  readonly dismountCandidateOffsetsMetersXYZ: readonly RuntimeVec3V1[];
}

export interface RuntimeSubjectColliderV1 extends RuntimeSubjectCapsuleV1 {
  massKilograms: number;
  maxSlopeDegrees: number;
  maxStepHeightMeters: number;
}

export interface RuntimeSubjectLocomotionV1 {
  readonly allowWalk: boolean;
  readonly allowRun: boolean;
  readonly allowJump: boolean;
}

export interface RuntimeControlFeelV1 {
  resourceRef: string;
  contentHash: string;
  walkSpeedMetersPerSecond: number;
  runSpeedMetersPerSecond: number;
  jumpSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  moveResponseExponent: number;
  airControlRatio: number;
  coyoteTimeSeconds: number;
  jumpBufferSeconds: number;
  variableJumpHoldSeconds: number;
  jumpHoldGravityRatio: number;
  jumpReleaseGravityRatio: number;
  wheeledArcade?: WheeledArcadeControlFeelParametersV1;
}

export interface RuntimeSubjectDescriptorV1 {
  readonly entityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: Sha256HashV1;
  readonly bodyTopology: SubjectBodyTopologyV2;
  readonly semanticClassId: string;
  readonly forwardDirection: "-z";
  readonly visualParts: readonly RuntimeSubjectVisualPartV1[];
  readonly visualBinding: RuntimeSubjectVisualBindingV1;
  readonly presentationPolicy?: SubjectPresentationPolicyV1;
  readonly sockets: readonly RuntimeSubjectSocketV1[];
  readonly mountSlots: readonly RuntimeSubjectMountSlotV1[];
  readonly collider: RuntimeSubjectColliderV1;
  readonly locomotion: RuntimeSubjectLocomotionV1;
  readonly locomotionCapabilityRef: string;
  readonly locomotionCapabilityHash: Sha256HashV1;
  readonly physicsBodyProfileRef: string;
  readonly locomotionProfileRef: string;
  readonly controlFeel: RuntimeControlFeelV1;
  readonly availableControlFeels: readonly RuntimeControlFeelV1[];
  readonly capabilityAssembly: RuntimeSubjectCapabilityAssemblyV1;
}

export const RUNTIME_RESOURCE_KINDS_V1 = Object.freeze([
  ...SUBJECT_RESOURCE_KINDS_V1,
  "gameplay-bootstrap",
] as const);

export type RuntimeResourceKindV1 = typeof RUNTIME_RESOURCE_KINDS_V1[number];

export interface RuntimeResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: RuntimeResourceKindV1;
  readonly resolvedVersion: string;
  readonly contentHash: Sha256HashV1;
}

export interface RuntimeActionPresentationRegistryV1 {
  readonly schemaVersion: 1;
  readonly bindings: readonly ActionPresentationBindingV1[];
  readonly rootMotionSources: readonly LockedRootMotionSourceV1[];
}

export interface WorldRuntimeInitialCameraV1 {
  readonly mode: "first-person" | "third-person";
  readonly cameraEntityId: string;
  readonly targetEntityId: string;
  readonly targetSocketId?: string;
  readonly cameraRigProfileRef: string;
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly targetHeightMeters: number;
  readonly fovDegrees: number;
  readonly manualSwitchAllowed: boolean;
}

export interface WorldRuntimeBootstrapBodyV1 {
  readonly kind: "world-runtime-bootstrap";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly gameplayBootstrapRef: string;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly initialControlledEntityId: string;
  readonly gravityMetersPerSecondSquaredXYZ: RuntimeVec3V1;
  readonly initialCamera: WorldRuntimeInitialCameraV1;
  readonly subjectAssets: readonly RuntimeSubjectAssetV1[];
  readonly rigProfiles: readonly RuntimeRigProfileV1[];
  readonly animationSets: readonly RuntimeAnimationSetV1[];
  readonly colliderProfiles: readonly RuntimeColliderProfileV1[];
  readonly actionPresentationRegistry: RuntimeActionPresentationRegistryV1;
  readonly subjectRuntimeDescriptors: readonly RuntimeSubjectDescriptorV1[];
  readonly runtimeResourceLockEntries: readonly RuntimeResourceLockEntryV1[];
}

export interface WorldRuntimeBootstrapV1 extends WorldRuntimeBootstrapBodyV1 {
  readonly contentHash: Sha256HashV1;
}

const validateWorldRuntimeBootstrap = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(worldRuntimeBootstrapSchema);

function invalid(detail?: string): never {
  throw new RangeError(
    `Value must match the closed WorldRuntimeBootstrapV1 schema${
      detail === undefined ? "." : `: ${detail}`
    }`,
  );
}

function snapshotData(input: unknown): unknown {
  if (isNil(input)) return invalid();
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || Object.is(input, -0)) invalid();
    return input;
  }
  if (Array.isArray(input)) {
    if (
      Reflect.getPrototypeOf(input) !== Array.prototype ||
      Reflect.ownKeys(input).some((key) => typeof key === "symbol") ||
      Object.getOwnPropertyNames(input).length !== input.length + 1
    ) invalid();
    const result: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (isNil(descriptor) || !descriptor.enumerable || !("value" in descriptor)) {
        invalid();
      }
      result.push(snapshotData(descriptor.value));
    }
    return result;
  }
  if (typeof input !== "object" || Reflect.getPrototypeOf(input) !== Object.prototype) {
    return invalid();
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (
      typeof key !== "string" ||
      isNil(descriptor) ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) invalid();
    result[key] = snapshotData(descriptor.value);
  }
  return result;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  return Object.freeze(value);
}

function compareIdentity(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalCollection<Row>(
  rows: readonly Row[],
  identity: (row: Row) => string,
): readonly Row[] {
  const identities = rows.map(identity);
  if (
    identities.some((id) => id.length === 0) ||
    new Set(identities).size !== identities.length
  ) invalid();
  return [...rows].sort((left, right) =>
    compareIdentity(identity(left), identity(right))
  );
}

function canonicalActionPresentationRegistry(
  input: RuntimeActionPresentationRegistryV1,
): RuntimeActionPresentationRegistryV1 {
  const admitted = createActionPresentationRegistryV1(input);
  const rootMotionSources = input.rootMotionSources.map((source) => {
    const admittedSource = admitted.resolveRootMotionSource(
      source.resourceRef,
      source.contentHash,
    );
    if (isNil(admittedSource)) invalid();
    return admittedSource;
  });
  return {
    schemaVersion: 1,
    bindings: admitted.bindings,
    rootMotionSources: canonicalCollection(
      rootMotionSources,
      (source) => source.resourceRef,
    ),
  };
}

function validateRuntimeVocabularies(
  source: WorldRuntimeBootstrapBodyV1,
): void {
  for (const profile of source.rigProfiles) {
    if (
      profile.requiredBoneIds.some((boneId) => !isBipedBoneIdV1(boneId)) ||
      Object.keys(profile.sourceNodeNameByBoneId).some(
        (boneId) => !isBipedBoneIdV1(boneId),
      )
    ) invalid();
  }
  for (const animationSet of source.animationSets) {
    if (
      !isGroundHumanoidActionIdV1(animationSet.defaultActionId) ||
      animationSet.requiredActionIds.some(
        (actionId) => !isGroundHumanoidActionIdV1(actionId),
      ) ||
      animationSet.animationBindings.some((binding) =>
        !isGroundHumanoidActionIdV1(binding.actionId) ||
        !HUMANOID_ANIMATION_SEMANTIC_FAMILIES_V1.includes(
          binding.semanticFamily,
        ) ||
        binding.automaticPresentationKeys.some((key) =>
          !AUTOMATIC_LOCOMOTION_PRESENTATION_KEYS_V1.includes(key)
        )
      )
    ) invalid();
  }
  for (const profile of source.colliderProfiles) {
    if (
      profile.supportedBodyTopologies.some(
        (topology) => !isSubjectBodyTopologyV2(topology),
      )
    ) invalid();
  }
  for (const subject of source.subjectRuntimeDescriptors) {
    const assetPartCount = subject.visualParts.filter(
      (part) => part.kind === "asset",
    ).length;
    if (
      !isSubjectBodyTopologyV2(subject.bodyTopology) ||
      subject.sockets.some((socket) =>
        socket.kind === "bone" && !isBipedBoneIdV1(socket.boneId)
      ) ||
      (subject.visualBinding.mode === "static" && assetPartCount > 1) ||
      (subject.visualBinding.mode === "rigged" && assetPartCount !== 1)
    ) invalid();
    const presentationPolicy = subject.presentationPolicy;
    const visualBinding = subject.visualBinding;
    if (presentationPolicy?.kind === "fixed-action") {
      if (visualBinding.mode !== "rigged") invalid();
      const animationSet = visualBinding.mode === "rigged"
        ? source.animationSets.find(({ animationSetRef }) =>
            animationSetRef === visualBinding.animationSetRef)
        : undefined;
      if (!animationSet?.animationBindings.some(({ actionId }) =>
        actionId === presentationPolicy.actionId)) invalid();
    }
    if (presentationPolicy?.kind === "fixed-locomotion" &&
        visualBinding.mode === "rigged") {
      const animationSet = source.animationSets.find(({ animationSetRef }) =>
        animationSetRef === visualBinding.animationSetRef);
      if (animationSet === undefined || !animationSet.animationBindings.some(
        ({ automaticPresentationKeys }) =>
          automaticPresentationKeys.includes(
            presentationPolicy.presentationKey,
          ),
      )) invalid();
    }
    for (const modifier of subject.capabilityAssembly.cameraContext
      .cameraModifierProfiles) {
      if (
        Object.keys(modifier.parameterOverrides).some((name) =>
          !CAMERA_RIG_PARAMETER_NAMES_V1.includes(
            name as CameraRigParameterNameV1,
          )
        )
      ) invalid();
    }
  }
}

function canonicalBody(
  input: unknown,
): WorldRuntimeBootstrapBodyV1 {
  const snapshot = snapshotData(input);
  if (
    typeof snapshot !== "object" ||
    isNil(snapshot) ||
    Array.isArray(snapshot) ||
    Object.hasOwn(snapshot, "contentHash") ||
    !validateWorldRuntimeBootstrap({
      ...snapshot,
      contentHash: `sha256:${"0".repeat(64)}`,
    })
  ) invalid(JSON.stringify(validateWorldRuntimeBootstrap.errors));
  const source = snapshot as WorldRuntimeBootstrapBodyV1;
  validateRuntimeVocabularies(source);
  const subjectRuntimeDescriptors = canonicalCollection(
    source.subjectRuntimeDescriptors,
    (subject) => subject.entityId,
  );
  const subjectIds = new Set(
    subjectRuntimeDescriptors.map((subject) => subject.entityId),
  );
  if (
    !subjectIds.has(source.initialControlledEntityId) ||
    !subjectIds.has(source.initialCamera.targetEntityId)
  ) invalid();
  if (source.initialCamera.targetSocketId !== undefined) {
    const targetSubject = subjectRuntimeDescriptors.find(({ entityId }) =>
      entityId === source.initialCamera.targetEntityId);
    if (targetSubject === undefined || !targetSubject.sockets.some(({ id }) =>
      id === source.initialCamera.targetSocketId)) invalid();
  }

  const runtimeResourceLockEntries = canonicalCollection(
    source.runtimeResourceLockEntries,
    (entry) => `${entry.resourceKind}\u0000${entry.resourceRef}`,
  );
  const gameplayLocks = runtimeResourceLockEntries.filter(
    (entry) => entry.resourceKind === "gameplay-bootstrap",
  );
  if (
    gameplayLocks.length !== 1 ||
    gameplayLocks[0]?.resourceRef !== source.gameplayBootstrapRef ||
    gameplayLocks[0]?.contentHash !== source.gameplayBootstrapHash
  ) invalid();

  return deepFreeze({
    ...source,
    subjectAssets: canonicalCollection(
      source.subjectAssets,
      (asset) => asset.subjectAssetRef,
    ),
    rigProfiles: canonicalCollection(
      source.rigProfiles,
      (profile) => profile.rigProfileRef,
    ),
    animationSets: canonicalCollection(
      source.animationSets,
      (set) => set.animationSetRef,
    ),
    colliderProfiles: canonicalCollection(
      source.colliderProfiles,
      (profile) => profile.colliderProfileRef,
    ),
    actionPresentationRegistry: canonicalActionPresentationRegistry(
      source.actionPresentationRegistry,
    ),
    subjectRuntimeDescriptors,
    runtimeResourceLockEntries,
  });
}

export function hashWorldRuntimeBootstrapBodyV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(canonicalBody(input)) as Sha256HashV1;
}

export function createWorldRuntimeBootstrapV1(
  input: WorldRuntimeBootstrapBodyV1,
): WorldRuntimeBootstrapV1 {
  const body = canonicalBody(input);
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

export function parseWorldRuntimeBootstrapV1(
  input: unknown,
): WorldRuntimeBootstrapV1 {
  const snapshot = snapshotData(input);
  if (!validateWorldRuntimeBootstrap(snapshot)) {
    invalid(JSON.stringify(validateWorldRuntimeBootstrap.errors));
  }
  const artifact = snapshot as unknown as WorldRuntimeBootstrapV1;
  const { contentHash, ...bodyInput } = artifact;
  const body = canonicalBody(bodyInput);
  if (
    stringifyCanonicalJson(bodyInput) !== stringifyCanonicalJson(body) ||
    sha256CanonicalJson(body) !== contentHash
  ) invalid();
  return deepFreeze({ ...body, contentHash });
}

export function worldRuntimeBootstrapCanonicalBytesV1(
  input: unknown,
): Uint8Array {
  return canonicalJsonBytes(parseWorldRuntimeBootstrapV1(input));
}

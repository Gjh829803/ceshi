/** Host-only experimental Creator configuration; never import this module in authored scene code. */
import Ajv2020 from "ajv/dist/2020.js";
import {
  BLOCK_PRESET_REFS_V1,
  createBlockWorldManifestV2,
  type BlockMotionPackIdV1,
  type BlockSubjectPresentationPolicyV1,
  type BlockSubjectVisualPartV2,
  type CheckBlockWorldInputV2,
} from "@whitebox-world/block-world";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";
import {
  CAMERA_TUNING_SAFETY_LIMITS_V1,
  createWorldRuntimeBootstrapV1,
  parseBabylonNativeSceneBootstrapV1,
  parseFixedInputV1,
  type FixedInputV1,
} from "@whitebox-world/runtime-contracts";
import { builtInSubjectResourceRegistry, createSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import { createAgentAuthoringCatalogV2 } from "../lib/agent-authoring-catalog.js";
import { DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1 } from "../lib/world-package-resource-resolver.js";

type Vec3 = readonly [number, number, number];
export type CreatorSubjectPartV1 = Extract<BlockSubjectVisualPartV2, { kind: "primitive" }>;
export interface CreatorSceneConfigV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly seed?: number;
  readonly subject:
    | Readonly<{ kind: "pack"; subjectPackId: string; presentation?: BlockSubjectPresentationPolicyV1 }>
    | Readonly<{ kind: "custom-rigid"; parts: readonly CreatorSubjectPartV1[] }>;
  readonly spawn: Readonly<{ positionMetersXYZ: Vec3; facingRadians: number }>;
  readonly camera: Readonly<{ pitchRadians: number; distanceMeters: number; fovDegrees: number; targetHeightMeters: number }>;
  readonly worldBounds: Readonly<{
    centerMetersXZ: readonly [number, number];
    sizeMetersXZ: readonly [number, number];
    heightRangeMeters: readonly [number, number];
  }>;
  readonly visualTargets?: readonly Readonly<{ id: string; name: string; appearancePrompt: string; frontYawRadians?: number }>[];
  readonly exploration?: Readonly<{
    targets: readonly Readonly<{ id: string; positionMetersXYZ: Vec3; toleranceMeters?: number }>[];
    steps?: readonly FixedInputV1[];
  }>;
}

const idSchema = { type: "string", pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$", maxLength: 64 };
const numberSchema = (minimum: number, maximum: number) => ({ type: "number", minimum, maximum });
const tupleSchema = (count: number, minimum: number, maximum: number) => ({
  type: "array", minItems: count, maxItems: count, items: numberSchema(minimum, maximum),
});
const closedObject = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
const positionSchema = tupleSchema(3, -10_000, 10_000);
const angleSchema = numberSchema(-Math.PI * 2, Math.PI * 2);
const cameraLimits = CAMERA_TUNING_SAFETY_LIMITS_V1;
const presentationSchema = { oneOf: [
  closedObject({ kind: { const: "automatic" } }),
  closedObject({ kind: { const: "fixed-action" }, actionId: { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$" } }),
  closedObject({ kind: { const: "fixed-locomotion" }, presentationKey: { enum: [
    "locomotion.suspended", "locomotion.idle", "locomotion.walk", "locomotion.run",
    "locomotion.takeoff", "locomotion.rising", "locomotion.apex", "locomotion.falling", "locomotion.landing",
  ] } }),
] };
const fixedInputSchema = closedObject({
  actions: { type: "array", items: { enum: [
    "move-forward", "move-backward", "move-left", "move-right", "jump", "run", "boost", "brake", "handbrake",
    "primary-action", "secondary-action", "aim", "camera-recenter", "camera-look-back", "camera-shoulder-swap",
  ] } },
  axes: closedObject({ moveXRatio: numberSchema(-1, 1), moveYRatio: numberSchema(-1, 1), throttleRatio: numberSchema(0, 1), brakeRatio: numberSchema(0, 1) }, []),
  ticks: { type: "integer", minimum: 0, maximum: 36_000 },
}, ["actions", "ticks"]);
const partSchema = closedObject({
  id: idSchema, kind: { const: "primitive" },
  shape: { oneOf: [
    closedObject({ kind: { const: "box" }, sizeMetersXYZ: tupleSchema(3, 0.01, 100) }),
    closedObject({ kind: { const: "sphere" }, radiusMeters: numberSchema(0.01, 50) }),
    closedObject({ kind: { enum: ["cylinder", "capsule"] }, radiusMeters: numberSchema(0.01, 50), heightMeters: numberSchema(0.01, 100) }),
  ] },
  positionMetersXYZ: tupleSchema(3, -100, 100),
  rotationEulerRadiansXYZ: tupleSchema(3, -Math.PI * 2, Math.PI * 2),
  colliderContribution: { enum: ["include", "exclude"] },
  semanticTags: { type: "array", minItems: 0, maxItems: 16, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
}, ["id", "kind", "shape", "positionMetersXYZ", "colliderContribution", "semanticTags"]);

/** The exact schema shown to Creator tools. Movement steps additionally use the SDK FixedInputV1 parser. */
export const CREATOR_SCENE_CONFIG_SCHEMA_V1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...closedObject({
    schemaVersion: { const: 1 }, id: idSchema, seed: { type: "integer", minimum: 0, maximum: 0xffff_ffff },
    subject: { oneOf: [
      closedObject({ kind: { const: "pack" }, subjectPackId: { type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$" }, presentation: presentationSchema }, ["kind", "subjectPackId"]),
      closedObject({ kind: { const: "custom-rigid" }, parts: { type: "array", minItems: 1, maxItems: 48, items: partSchema } }),
    ] },
    spawn: closedObject({ positionMetersXYZ: positionSchema, facingRadians: { ...angleSchema,
      description: "Initial subject and orbit-camera heading. Zero looks toward -Z; positive yaw turns toward -X. Horizontal forward is [-sin(yaw), 0, -cos(yaw)]." } }),
    camera: closedObject({
      pitchRadians: numberSchema(cameraLimits.pitchRadians.minimum, cameraLimits.pitchRadians.maximum),
      distanceMeters: numberSchema(0.5, cameraLimits.distanceMeters.maximum),
      fovDegrees: numberSchema(cameraLimits.baseFovDegrees.minimum, cameraLimits.baseFovDegrees.maximum),
      targetHeightMeters: numberSchema(cameraLimits.targetHeightMeters.minimum, cameraLimits.targetHeightMeters.maximum),
    }),
    worldBounds: closedObject({ centerMetersXZ: tupleSchema(2, -10_000, 10_000), sizeMetersXZ: tupleSchema(2, 1, 10_000), heightRangeMeters: tupleSchema(2, -10_000, 10_000) }),
    visualTargets: { type: "array", maxItems: 128, items: closedObject({
      id: idSchema, name: { type: "string", minLength: 1, maxLength: 200 }, appearancePrompt: { type: "string", minLength: 1, maxLength: 8000 }, frontYawRadians: angleSchema,
    }, ["id", "name", "appearancePrompt"]) },
    exploration: closedObject({
      targets: { type: "array", minItems: 1, maxItems: 64, items: closedObject({ id: idSchema, positionMetersXYZ: positionSchema, toleranceMeters: numberSchema(0.1, 20) }, ["id", "positionMetersXYZ"]) },
      steps: { type: "array", maxItems: 512, items: fixedInputSchema },
    }, ["targets"]),
  }, ["schemaVersion", "id", "subject", "spawn", "camera", "worldBounds"]),
} as const;
const validateConfig = new Ajv2020({ allErrors: true, strict: true }).compile(CREATOR_SCENE_CONFIG_SCHEMA_V1);

function invalid(detail: string): never {
  throw new TypeError(`CREATOR_SCENE_CONFIG_INVALID: ${detail}`);
}
function snapshotJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid("numbers must be finite canonical JSON numbers");
    return value;
  }
  if (typeof value !== "object") invalid("expected JSON data");
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype)) invalid("expected plain JSON data");
  const entries = Reflect.ownKeys(value).filter((key) => !isArray || key !== "length").map((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) invalid("expected enumerable JSON values");
    return [key, snapshotJson(descriptor.value)] as const;
  });
  if (isArray) {
    if (entries.length !== value.length || entries.some(([key], index) => key !== String(index))) invalid("expected dense JSON array");
    return entries.map(([, entry]) => entry);
  }
  return Object.fromEntries(entries);
}
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
function requireUniqueIds(rows: readonly { id: string }[], label: string): void {
  if (new Set(rows.map(({ id }) => id)).size !== rows.length) invalid(`${label} IDs must be unique`);
}
export function parseCreatorSceneConfig(input: unknown): CreatorSceneConfigV1 {
  const snapshot = snapshotJson(input);
  if (!validateConfig(snapshot)) invalid(JSON.stringify(validateConfig.errors));
  const config = snapshot as unknown as CreatorSceneConfigV1;
  const bounds = config.worldBounds;
  if (bounds.heightRangeMeters[0] >= bounds.heightRangeMeters[1]) invalid("heightRangeMeters must increase");
  const isInBounds = (position: Vec3) =>
    Math.abs(position[0] - bounds.centerMetersXZ[0]) <= bounds.sizeMetersXZ[0] / 2 &&
    Math.abs(position[2] - bounds.centerMetersXZ[1]) <= bounds.sizeMetersXZ[1] / 2 &&
    position[1] >= bounds.heightRangeMeters[0] && position[1] <= bounds.heightRangeMeters[1];
  if (!isInBounds(config.spawn.positionMetersXYZ)) invalid("spawn must be within worldBounds");
  if (config.subject.kind === "custom-rigid") {
    requireUniqueIds(config.subject.parts, "subject parts");
    if (!config.subject.parts.some(({ colliderContribution }) => colliderContribution === "include")) invalid("custom-rigid needs a collider-contributing part");
  }
  requireUniqueIds(config.visualTargets ?? [], "visualTargets");
  requireUniqueIds(config.exploration?.targets ?? [], "exploration targets");
  for (const target of config.exploration?.targets ?? []) {
    if (!isInBounds(target.positionMetersXYZ)) invalid(`exploration target ${target.id} is outside worldBounds`);
  }
  let totalTicks = 0;
  for (const step of config.exploration?.steps ?? []) totalTicks += parseFixedInputV1(step).ticks;
  if (totalTicks > 36_000) invalid("exploration steps exceed 36,000 total ticks");
  return freezeJson(config);
}

// Host-owned experimental resources extend composition to the SDK's real tuning
// envelope. New refs and Registry-generated hashes preserve built-in identities;
// all camera solving, collision and fixed-tick behavior stay in the shared SDK.
const creatorCameraResources = (() => {
  const baseProfile = builtInSubjectResourceRegistry.resolveCameraRigProfile("worldkit://camera-profile/orbit.medium@1")!;
  const baseContext = builtInSubjectResourceRegistry.resolveCameraContextProfile("worldkit://camera-context/agent.third-person@1")!;
  const firstPerson = builtInSubjectResourceRegistry.resolveCameraRigProfile(baseContext.firstPersonCameraRigProfileRef!)!;
  const profileRef = "worldkit://camera-profile/creator.reference-orbit@1";
  const contextRef = "worldkit://camera-context/creator.reference-orbit@1";
  const registry = createSubjectResourceRegistry([
    builtInSubjectResourceRegistry.resolveCameraRigAlgorithm(baseProfile.algorithmRef)!,
    builtInSubjectResourceRegistry.resolveCameraRigAlgorithm(firstPerson.algorithmRef)!,
    firstPerson,
    { ...baseProfile, id: "creator.reference-orbit", resourceRef: profileRef, authoringAvailability: "experimental",
      parameters: { ...baseProfile.parameters, maximumDistanceMeters: cameraLimits.distanceMeters.maximum,
        minimumPitchRadians: cameraLimits.pitchRadians.minimum, maximumPitchRadians: cameraLimits.pitchRadians.maximum },
      authoringRanges: { ...baseProfile.authoringRanges,
        distanceMeters: { minimum: 0.5, maximum: cameraLimits.distanceMeters.maximum, step: 0.1 },
        pitchRadians: { ...cameraLimits.pitchRadians, step: 0.01 },
        targetHeightMeters: { ...cameraLimits.targetHeightMeters, step: 0.05 } },
    },
    { ...baseContext, id: "creator.reference-orbit", resourceRef: contextRef, authoringAvailability: "experimental", defaultCameraRigProfileRef: profileRef },
  ]);
  return { baseProfile, baseContext, profile: registry.resolveCameraRigProfile(profileRef)!, context: registry.resolveCameraContextProfile(contextRef)! };
})();

/** Resolve existing subject assets/animations on the Host. Scene geometry only comes from scene.ts. */
export function createCreatorBootstraps(input: CreatorSceneConfigV1, inputHash: string) {
  const config = parseCreatorSceneConfig(input);
  if (!/^sha256:[a-f0-9]{64}$/.test(inputHash)) invalid("inputHash must be sha256:<64 lowercase hex digits>");
  const subject = config.subject;
  const pack = subject.kind === "pack" ? createAgentAuthoringCatalogV2().subjectPacks.find(({ id }) => id === subject.subjectPackId) : undefined;
  if (subject.kind === "pack" && pack === undefined) invalid(`unknown or unavailable subjectPackId: ${subject.subjectPackId}`);
  const motionPackId: BlockMotionPackIdV1 = pack?.recommendedSetup.motion.motionPackId ?? "ground.root-standard";
  // This private fixture only asks the existing compiler to resolve Subject capabilities. Its
  // authoring/world geometry is deliberately discarded and cannot reach the Native Runtime.
  const probe: CheckBlockWorldInputV2 = {
    manifest: createBlockWorldManifestV2(Array.from({ length: 81 }, (_, index) => ({
      id: `ground-${String(index).padStart(3, "0")}`, presetRef: BLOCK_PRESET_REFS_V1.walkable,
      shape: "full" as const, positionMetersXYZ: [index % 9 - 4, 0, Math.floor(index / 9) - 4] as const, rotationQuarterTurnsY: 0,
    }))),
    world: { id: config.id, seed: config.seed ?? 1 },
    controlledSubject: {
      kind: "assembly", entityId: "player", visualTargetId: "visual-target-1", yawQuarterTurnsY: 0,
      assembly: {
        id: `${config.id}-subject`,
        baseSubject: subject.kind === "pack" ? { kind: "subject-pack", subjectPackId: subject.subjectPackId } : {
          kind: "custom-mesh", subjectMeshBindingIds: subject.parts.map(({ id }) => id), category: "custom", bodyTopology: "custom",
          semanticClassId: "subject.creator.custom", displayName: "Creator rigid subject", description: "Creator-authored rigid subject with ground movement",
        },
        attachments: [], motion: { motionPackId },
        presentation: subject.kind === "pack" ? subject.presentation ?? { kind: "automatic" } : { kind: "automatic" },
      },
    },
    subjectMeshParts: subject.kind === "custom-rigid" ? subject.parts : [],
    camera: { kind: "pack", entityId: "camera-main", cameraPackId: "third-person.standard", target: { kind: "subject-local-point", positionMetersXYZ: [0, config.camera.targetHeightMeters, 0] }, aspectRatio: 16 / 9 },
    subjectTraversalProfile: { clearanceHeightMeters: 2, footprintRadiusMetersXZ: 0, maximumStepUpMeters: 1, maximumStepDownMeters: 1, maximumAutoSmoothHeightDeltaMeters: 1, maximumAdjacentWalkableHeightDeltaMeters: 2, canStandOnCloud: false },
    spawnStandPositionMetersXYZ: [0, 0.5, 0], requiredTargets: [], requiredGroundTraversalBands: [], visualTargetFacings: [], spaceTransitions: [], requireSingleReachableComponent: false,
  };
  const compiled = compileBlockWorldV2(probe);
  if (!compiled.ok) invalid(`subject resolution failed: ${JSON.stringify(compiled.diagnostics)}`);
  const gameplayBootstrap = compiled.gameplayBootstrap;
  const { contentHash: _probeHash, ...runtimeBody } = compiled.worldRuntimeBootstrap;
  const { baseProfile, baseContext, profile, context } = creatorCameraResources;
  const runtimeBootstrap = createWorldRuntimeBootstrapV1({
    ...runtimeBody,
    initialCamera: { ...runtimeBody.initialCamera, ...config.camera, cameraRigProfileRef: profile.resourceRef },
    subjectRuntimeDescriptors: runtimeBody.subjectRuntimeDescriptors.map(subject => ({
      ...subject, capabilityAssembly: { ...subject.capabilityAssembly, cameraContext: {
        ...subject.capabilityAssembly.cameraContext, resourceRef: context.resourceRef, defaultCameraRigProfileRef: profile.resourceRef,
        cameraRigProfiles: subject.capabilityAssembly.cameraContext.cameraRigProfiles.map(existing => existing.resourceRef !== baseProfile.resourceRef ? existing : {
          ...existing, resourceRef: profile.resourceRef, contentHash: profile.contentHash, parameters: profile.parameters, authoringRanges: profile.authoringRanges!,
        }),
      } },
    })),
    runtimeResourceLockEntries: runtimeBody.runtimeResourceLockEntries.map(lock => {
      const replacement = lock.resourceRef === baseProfile.resourceRef ? profile : lock.resourceRef === baseContext.resourceRef ? context : undefined;
      return replacement === undefined ? lock : { ...lock, resourceRef: replacement.resourceRef, contentHash: replacement.contentHash as typeof lock.contentHash };
    }),
  });
  const nativeBootstrap = parseBabylonNativeSceneBootstrapV1({
    kind: "babylon-native-scene-bootstrap", schemaVersion: 1, id: config.id,
    sceneModuleRef: `worldkit://native-scene/${config.id}@1`, nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
    nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.standard@1",
    gameplayBootstrapRef: gameplayBootstrap.resourceRef, initialControlledEntityId: runtimeBootstrap.initialControlledEntityId,
    gravityMetersPerSecondSquaredXYZ: runtimeBootstrap.gravityMetersPerSecondSquaredXYZ,
    initialCamera: { mode: "third-person", ...config.camera }, seed: config.seed ?? 1, spawnMarkerId: "player-spawn",
  });
  const assetUrls: Record<string, string> = {};
  for (const asset of runtimeBootstrap.subjectAssets) {
    const mapping = DEFAULT_WORLD_PACKAGE_RESOURCE_MAPPING_BY_REF_V1[asset.subjectAssetRef];
    if (mapping === undefined || !mapping.publicUri.startsWith("/subject-assets/")) invalid(`subject asset has no same-origin mapping: ${asset.subjectAssetRef}`);
    assetUrls[asset.subjectAssetRef] = mapping.publicUri;
  }
  return Object.freeze({ runtimeBootstrap, gameplayBootstrap, nativeBootstrap, assetUrls: Object.freeze(assetUrls),
    creatorConfig: Object.freeze({ sceneId: config.id, inputHash, worldBounds: config.worldBounds }),
  });
}

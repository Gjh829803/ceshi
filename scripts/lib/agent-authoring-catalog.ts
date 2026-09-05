import {
  BLOCK_PRESET_REFS_V1,
  BLOCK_PRESET_COLORS_V1,
  BLOCK_SURFACE_PROFILE_REFS_V1,
  BLOCK_CAMERA_PACKS_V1,
  BLOCK_MOTION_PACKS_V1,
  BLOCK_CAMERA_TUNING_LIMITS_V1,
  createBlockWorldManifestV2,
  type BlockSubjectAssemblyDefinitionV1,
  type BlockWorldPackCameraV1,
  type BlockSubjectTraversalProfileV2,
  type BlockWorldControlledSubjectV2,
  resolveBlockSurfaceProfileV1,
} from "@whitebox-world/block-world";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { cameraTuningBoundsV1 } from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type RegistrySubjectDefinitionV3,
} from "@whitebox-world/subject-registry";

import type { SceneBriefMovementModeV1 } from "@whitebox-world/authoring";

type Vector3 = readonly [number, number, number];

export interface AgentAuthoringVisualProxyCuboidV1 {
  readonly id: string;
  readonly centerMetersXYZ: Vector3;
  readonly sizeMetersXYZ: Vector3;
}

export interface AgentAuthoringSubjectPackV2 {
  readonly id: string;
  readonly subjectDefinitionRef: string;
  readonly displayName: string;
  readonly description: string;
  readonly authoringAvailability: "recommended" | "advanced" | "experimental";
  readonly category: RegistrySubjectDefinitionV3["category"];
  readonly bodyTopology: RegistrySubjectDefinitionV3["bodyTopology"];
  readonly semanticTags: readonly string[];
  readonly selectionPolicy: "default" | "explicit-only";
  readonly visualKind: "rigged-model" | "static-model" | "primitive-proxy";
  readonly usageNotes: readonly string[];
  readonly recommendedMotionPackIds: readonly string[];
  readonly recommendedSetup: Readonly<{
    motion: BlockSubjectAssemblyDefinitionV1["motion"];
    presentation: BlockSubjectAssemblyDefinitionV1["presentation"];
    camera: Pick<BlockWorldPackCameraV1, "cameraPackId" | "target">;
  }>;
  readonly compatibleMotionPackIds: readonly string[];
  readonly presentation: Readonly<{
    automatic: true;
    fixedLocomotionPresentationKeys: readonly string[];
    actions: readonly Readonly<{
      actionId: string;
      semanticFamily: string;
      loopMode: "repeat" | "once";
      automaticPresentationKeys: readonly string[];
    }>[];
  }>;
  readonly sockets: readonly Readonly<{
    id: string;
    kind: "local" | "bone";
    semanticTags: readonly string[];
  }>[];
  /** Host-derived from the admitted Runtime Subject collider. Agent must copy exactly. */
  readonly traversalEnvelope: BlockSubjectTraversalProfileV2;
  readonly visualReviewProxy: Readonly<{
    cuboids: readonly AgentAuthoringVisualProxyCuboidV1[];
    boundsMinimumMetersXYZ: Vector3;
    boundsMaximumMetersXYZ: Vector3;
  }>;
}

export interface AgentAuthoringCatalogV2 {
  readonly kind: "worldkit-agent-authoring-catalog";
  readonly schemaVersion: 2;
  readonly registryIdentityHash: `sha256:${string}`;
  readonly subjectPacks: readonly AgentAuthoringSubjectPackV2[];
  readonly motionPacks: readonly Readonly<{
    id: string;
    displayName: string;
    description: string;
    movementModes: readonly SceneBriefMovementModeV1[];
    inputDescription: string;
  }>[];
  readonly cameraPacks: readonly Readonly<{
    id: string;
    displayName: string;
    description: string;
    mode: "first-person" | "third-person";
    defaults: Readonly<{ distanceMeters: number; pitchRadians: number; fovDegrees: number }>;
    tuningRanges: Readonly<Record<"distanceMeters" | "pitchRadians" | "fovDegrees", Readonly<{ minimum: number; maximum: number }>>>;
    recommendedTarget: "eye-socket-or-point" | "visual-center";
    centeredRearCompatible: boolean;
    supportedTargetKinds: readonly [
      "base-subject-socket",
      "base-subject-bounds",
      "assembly-bounds",
      "subject-local-point",
    ];
  }>[];
  readonly surfacePacks: readonly Readonly<{
    id: "normal" | "ice" | "mud";
    surfaceProfileRef: string;
    walkablePresetRef: string;
    whiteboxColorHex: string;
    displayName: string;
    description: string;
    semanticTags: readonly string[];
  }>[];
  readonly customMeshPolicy: Readonly<{
    supportedGeometryKinds: readonly ["box", "sphere", "cylinder"];
    supportsRigging: false;
    attachmentDefaultColliderContribution: "exclude";
    maximumMeshPartCount: 48;
    compatibleMotionPackIds: readonly string[];
    recommendedMotionPackId: "ground.root-standard";
  }>;
  readonly unavailableSubjectPacks: readonly Readonly<{
    subjectDefinitionRef: string;
    diagnostics: readonly string[];
  }>[];
}

let cachedAgentAuthoringCatalogV2: AgentAuthoringCatalogV2 | undefined;

const AGENT_SURFACE_PACK_ROWS_V1 = Object.freeze([
  {
    id: "normal",
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.normal,
    walkablePresetRef: BLOCK_PRESET_REFS_V1.walkable,
    whiteboxColorHex: BLOCK_PRESET_COLORS_V1.walkable,
  },
  {
    id: "ice",
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.ice,
    walkablePresetRef: BLOCK_PRESET_REFS_V1.walkableIce,
    whiteboxColorHex: BLOCK_PRESET_COLORS_V1.walkableIce,
  },
  {
    id: "mud",
    surfaceProfileRef: BLOCK_SURFACE_PROFILE_REFS_V1.mud,
    walkablePresetRef: BLOCK_PRESET_REFS_V1.walkableMud,
    whiteboxColorHex: BLOCK_PRESET_COLORS_V1.walkableMud,
  },
] as const);

function sizeForPrimitiveShape(shape: Record<string, unknown>): Vector3 {
  if (shape.kind === "box") return shape.sizeMetersXYZ as Vector3;
  if (shape.kind === "sphere") {
    const diameter = Number(shape.radiusMeters) * 2;
    return [diameter, diameter, diameter];
  }
  const diameter = Number(shape.radiusMeters) * 2;
  return [diameter, Number(shape.heightMeters), diameter];
}

function transformedAxisAlignedSize(
  size: Vector3,
  rotationEulerRadiansXYZ: Vector3,
  scaleXYZ: Vector3,
): Vector3 {
  const [x, y, z] = rotationEulerRadiansXYZ;
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z),
  ];
  const matrix = [
    cy * cz,
    sx * sy * cz - cx * sz,
    cx * sy * cz + sx * sz,
    cy * sz,
    sx * sy * sz + cx * cz,
    cx * sy * sz - sx * cz,
    -sy,
    sx * cy,
    cx * cy,
  ];
  const scaled: Vector3 = [
    size[0] * Math.abs(scaleXYZ[0]),
    size[1] * Math.abs(scaleXYZ[1]),
    size[2] * Math.abs(scaleXYZ[2]),
  ];
  return [
    Math.abs(matrix[0]!) * scaled[0] + Math.abs(matrix[1]!) * scaled[1] +
      Math.abs(matrix[2]!) * scaled[2],
    Math.abs(matrix[3]!) * scaled[0] + Math.abs(matrix[4]!) * scaled[1] +
      Math.abs(matrix[5]!) * scaled[2],
    Math.abs(matrix[6]!) * scaled[0] + Math.abs(matrix[7]!) * scaled[1] +
      Math.abs(matrix[8]!) * scaled[2],
  ];
}

function visualProxy(
  definition: RegistrySubjectDefinitionV3,
): AgentAuthoringSubjectPackV2["visualReviewProxy"] {
  const cuboids = definition.visualParts.flatMap((part) => {
    const transform = part.localTransform;
    const scale = "scaleXYZ" in transform
      ? transform.scaleXYZ
      : [1, 1, 1] as const;
    const source = part.kind === "asset"
      ? builtInSubjectResourceRegistry.resolveSubjectAsset(part.subjectAssetRef)?.bounds
      : undefined;
    const baseSize: Vector3 | undefined = part.kind === "primitive"
      ? sizeForPrimitiveShape(part.shape as unknown as Record<string, unknown>)
      : source === undefined
        ? undefined
        : [
            source.maximumMetersXYZ[0] - source.minimumMetersXYZ[0],
            source.maximumMetersXYZ[1] - source.minimumMetersXYZ[1],
            source.maximumMetersXYZ[2] - source.minimumMetersXYZ[2],
          ];
    if (baseSize === undefined) return [];
    const sourceCenter: Vector3 = source === undefined
      ? [0, 0, 0]
      : [
          (source.minimumMetersXYZ[0] + source.maximumMetersXYZ[0]) / 2,
          (source.minimumMetersXYZ[1] + source.maximumMetersXYZ[1]) / 2,
          (source.minimumMetersXYZ[2] + source.maximumMetersXYZ[2]) / 2,
        ];
    const centerMetersXYZ: Vector3 = [
      transform.positionMetersXYZ[0] + sourceCenter[0] * scale[0],
      transform.positionMetersXYZ[1] + sourceCenter[1] * scale[1],
      transform.positionMetersXYZ[2] + sourceCenter[2] * scale[2],
    ];
    return [{
      id: part.id,
      centerMetersXYZ,
      sizeMetersXYZ: transformedAxisAlignedSize(
        baseSize,
        transform.rotationEulerRadiansXYZ ?? [0, 0, 0],
        scale,
      ),
    }];
  });
  if (cuboids.length === 0) {
    throw new Error(`AGENT_AUTHORING_VISUAL_PROXY_MISSING: ${definition.resourceRef}`);
  }
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const cuboid of cuboids) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(
        minimum[axis]!,
        cuboid.centerMetersXYZ[axis]! - cuboid.sizeMetersXYZ[axis]! / 2,
      );
      maximum[axis] = Math.max(
        maximum[axis]!,
        cuboid.centerMetersXYZ[axis]! + cuboid.sizeMetersXYZ[axis]! / 2,
      );
    }
  }
  return {
    cuboids,
    boundsMinimumMetersXYZ: minimum,
    boundsMaximumMetersXYZ: maximum,
  };
}

const HOSTED_SUBJECT_FIXTURE_REFS = new Set([
  "worldkit://subject-definition/humanoid.rigged-golden@2",
  "worldkit://subject-definition/humanoid.third-person@1",
  "worldkit://subject-definition/quadruped.ground-proxy@1",
]);

export function traversalEnvelopeFromRuntimeColliderV1(collider: Readonly<{
  readonly radiusMeters: number;
  readonly heightMeters: number;
  readonly maxStepHeightMeters: number;
}>): BlockSubjectTraversalProfileV2 {
  return {
    clearanceHeightMeters: collider.heightMeters,
    footprintRadiusMetersXZ: collider.radiusMeters,
    maximumStepUpMeters: collider.maxStepHeightMeters,
    maximumStepDownMeters: collider.maxStepHeightMeters,
    maximumAutoSmoothHeightDeltaMeters: 1,
    maximumAdjacentWalkableHeightDeltaMeters: 2,
    canStandOnCloud: false,
  };
}

function compilePackProbe(
  definition: RegistrySubjectDefinitionV3,
  motionPackId: keyof typeof BLOCK_MOTION_PACKS_V1,
) {
  const controlledSubject: BlockWorldControlledSubjectV2 = {
    kind: "assembly",
    entityId: "player",
    visualTargetId: "visual-target-1",
    yawQuarterTurnsY: 0,
    assembly: {
      id: `probe-${definition.id.replaceAll(".", "-")}`.slice(0, 80),
      baseSubject: {
        kind: "subject-pack",
        subjectPackId: definition.id,
      },
      attachments: [],
      motion: { motionPackId },
      presentation: { kind: "automatic" },
    },
  };
  const manifest = createBlockWorldManifestV2(
    Array.from({ length: 81 }, (_, index) => {
      const x = index % 9 - 4;
      const z = Math.floor(index / 9) - 4;
      return {
        id: `ground-${String(index).padStart(3, "0")}`,
        presetRef: BLOCK_PRESET_REFS_V1.walkable,
        shape: "full" as const,
        positionMetersXYZ: [x, 0, z] as const,
        rotationQuarterTurnsY: 0,
      };
    }),
  );
  const baseInput = {
    manifest,
    world: { id: "agent-authoring-catalog-probe", seed: 1 },
    controlledSubject,
    camera: {
      kind: "pack" as const,
      entityId: "camera-main",
      cameraPackId: "third-person.standard" as const,
      target: { kind: "base-subject-bounds" as const, heightRatio: 0.65 },
      aspectRatio: 16 / 9,
    },
    spawnStandPositionMetersXYZ: [0, 0.5, 0] as const,
    requiredTargets: [],
    requiredGroundTraversalBands: [],
    visualTargetFacings: [],
    spaceTransitions: [],
    requireSingleReachableComponent: motionPackId !== "flight.powered-standard",
  };
  const provisional = compileBlockWorldV2({
    ...baseInput,
    subjectTraversalProfile: {
      clearanceHeightMeters: 2,
      footprintRadiusMetersXZ: 0,
      maximumStepUpMeters: 1,
      maximumStepDownMeters: 1,
      maximumAutoSmoothHeightDeltaMeters: 1,
      maximumAdjacentWalkableHeightDeltaMeters: 2,
      canStandOnCloud: false,
    },
  });
  if (!provisional.ok) return provisional;
  const descriptor = provisional.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
    ({ entityId }) => entityId === controlledSubject.entityId,
  );
  if (descriptor === undefined) {
    throw new Error(`AGENT_AUTHORING_SUBJECT_DESCRIPTOR_MISSING: ${definition.resourceRef}`);
  }
  return compileBlockWorldV2({
    ...baseInput,
    subjectTraversalProfile: traversalEnvelopeFromRuntimeColliderV1(descriptor.collider),
  });
}

export function createAgentAuthoringCatalogV2(): AgentAuthoringCatalogV2 {
  if (cachedAgentAuthoringCatalogV2 !== undefined) {
    return cachedAgentAuthoringCatalogV2;
  }
  const registryResources = builtInSubjectResourceRegistry
    .listDiscoverableResources();
  const definitions = registryResources.filter(
    (resource): resource is RegistrySubjectDefinitionV3 =>
      resource.kind === "subject-definition",
  );
  const definitionCountById = new Map<string, number>();
  for (const definition of definitions) {
    definitionCountById.set(
      definition.id,
      (definitionCountById.get(definition.id) ?? 0) + 1,
    );
  }
  const registryIdentityHash = sha256CanonicalJson(
    {
      subjectResources: registryResources.map(
        ({ kind, resourceRef, contentHash }) => ({
          kind,
          resourceRef,
          contentHash,
        }),
      ),
      surfacePacks: AGENT_SURFACE_PACK_ROWS_V1.map((row) => ({
        ...row,
        profile: resolveBlockSurfaceProfileV1(row.surfaceProfileRef),
      })),
    },
  ) as `sha256:${string}`;
  const subjectPacks: AgentAuthoringSubjectPackV2[] = [];
  const unavailableSubjectPacks: Array<{
    subjectDefinitionRef: string;
    diagnostics: readonly string[];
  }> = [];
  for (const definition of definitions) {
    if (HOSTED_SUBJECT_FIXTURE_REFS.has(definition.resourceRef)) continue;
    const subjectPackId = definitionCountById.get(definition.id) === 1
      ? definition.id
      : `${definition.id}.v${definition.version}`;
    const admissions = Object.keys(BLOCK_MOTION_PACKS_V1)
      .sort((left, right) => left.localeCompare(right))
      .map((motionPackId) => ({
        motionPackId: motionPackId as keyof typeof BLOCK_MOTION_PACKS_V1,
        result: compilePackProbe(
          { ...definition, id: subjectPackId },
          motionPackId as keyof typeof BLOCK_MOTION_PACKS_V1,
        ),
      }));
    const successfulAdmissions = admissions.filter(({ result }) => result.ok);
    if (successfulAdmissions.length === 0) {
      unavailableSubjectPacks.push({
        subjectDefinitionRef: definition.resourceRef,
        diagnostics: admissions.flatMap(({ motionPackId, result }) =>
          result.diagnostics.map(({ code, message }) =>
            `${motionPackId}: ${code}: ${message}`)),
      });
      continue;
    }
    const animationSet = definition.visualBinding.mode === "rigged"
      ? builtInSubjectResourceRegistry.resolveAnimationSet(
          definition.visualBinding.animationSetRef,
        )
      : undefined;
    const fixedLocomotionPresentationKeys = [...new Set(
      animationSet?.animationBindings.flatMap(
        ({ automaticPresentationKeys }) => automaticPresentationKeys,
      ) ?? [],
    )].sort((left, right) => left.localeCompare(right));
    const admission = successfulAdmissions[0]!.result;
    if (!admission.ok) throw new Error("unreachable");
    const visualKind = definition.visualBinding.mode === "rigged"
      ? "rigged-model"
      : definition.visualParts.some(({ kind }) => kind === "asset")
        ? "static-model"
        : "primitive-proxy";
    // Retain the registered default behavior when it has an explicit Agent pack.
    // Generic ground previews use the rigid-root name for static visuals.
    const defaultMotionPackId = successfulAdmissions.find(({ motionPackId }) =>
      !motionPackId.startsWith("ground.") &&
      BLOCK_MOTION_PACKS_V1[motionPackId].controlFeelProfileRef === definition.profiles.controlFeelProfileRef &&
      BLOCK_MOTION_PACKS_V1[motionPackId].defaultMotionProfileRef === definition.profiles.motion.defaultMotionProfileRef
    )?.motionPackId ?? (visualKind === "rigged-model"
      ? "ground.character-standard" : "ground.root-standard");
    const targetSocket = ["ThirdPersonTarget", "CameraTarget3D"].find((id) =>
      definition.sockets.some((socket) => socket.id === id));
    const usageNotes = visualKind === "rigged-model"
      ? ["Automatic gait animation or fixed playback of a published action; movement is selected independently."]
      : ["Static shape moves as one rigid whole; no gait, wheel, limb, or independent rider animation."];
    if (visualKind === "primitive-proxy") usageNotes.push(
      "Legacy geometry proxy. Select explicitly when a coarse proxy is wanted; prefer a reusable model otherwise.",
    );
    if (defaultMotionPackId === "ground.root-standard" &&
        ["vehicle", "composite"].includes(definition.category)) usageNotes.push(
      "Default setup is a ground preview, not a claim of native driving, riding, or gliding. Choose another compatible Motion Pack explicitly for the intended behavior.",
    );
    subjectPacks.push({
      id: subjectPackId,
      subjectDefinitionRef: definition.resourceRef,
      displayName: definition.aiMetadata.displayName,
      description: visualKind === "primitive-proxy"
        ? `${definition.aiMetadata.displayName}: legacy geometric proxy; choose movement explicitly.`
        : visualKind === "static-model"
          ? `${definition.aiMetadata.displayName}: reusable static model; whole-body motion comes from the selected Motion Pack, not from the model's name.`
          : definition.aiMetadata.description,
      authoringAvailability: definition.authoringAvailability,
      category: definition.category,
      bodyTopology: definition.bodyTopology,
      semanticTags: definition.aiMetadata.semanticTags,
      selectionPolicy: visualKind === "primitive-proxy" || definition.authoringAvailability === "experimental"
        ? "explicit-only"
        : "default",
      visualKind,
      usageNotes,
      recommendedMotionPackIds: [defaultMotionPackId],
      recommendedSetup: {
        motion: { motionPackId: defaultMotionPackId },
        presentation: structuredClone(definition.presentationPolicy ?? { kind: "automatic" }),
        camera: {
          cameraPackId: defaultMotionPackId === "vehicle.stk-kart.arcade"
            ? "third-person.kart-chase" : "third-person.standard",
          target: targetSocket === undefined
            ? { kind: "base-subject-bounds", heightRatio: 0.65 }
            : { kind: "base-subject-socket", socketId: targetSocket },
        },
      },
      compatibleMotionPackIds: successfulAdmissions.map(({ motionPackId }) =>
        motionPackId),
      presentation: {
        automatic: true,
        fixedLocomotionPresentationKeys,
        actions: animationSet?.animationBindings.map(({ actionId, semanticFamily, loopMode, automaticPresentationKeys }) => ({
          actionId, semanticFamily, loopMode, automaticPresentationKeys,
        })) ?? [],
      },
      sockets: definition.sockets.map(({ id, kind, semanticTags }) => ({
        id,
        kind,
        semanticTags,
      })),
      traversalEnvelope: traversalEnvelopeFromRuntimeColliderV1(
        admission.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
          ({ entityId }) => entityId === "player",
        )!.collider,
      ),
      visualReviewProxy: visualProxy(definition),
    });
  }
  cachedAgentAuthoringCatalogV2 = {
    kind: "worldkit-agent-authoring-catalog",
    schemaVersion: 2,
    registryIdentityHash,
    subjectPacks,
    motionPacks: Object.values(BLOCK_MOTION_PACKS_V1)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, displayName, description, movementModes }) => ({
        id,
        displayName,
        description,
        movementModes,
        inputDescription: builtInSubjectResourceRegistry.resolveControlProfile(
          BLOCK_MOTION_PACKS_V1[id].controlProfileRef,
        )!.aiMetadata.description,
      })),
    cameraPacks: Object.values(BLOCK_CAMERA_PACKS_V1)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, displayName, description, mode, defaults, cameraRigProfileRef }) => {
        const parameters = builtInSubjectResourceRegistry.resolveCameraRigProfile(cameraRigProfileRef)!.parameters;
        const ranges = Object.fromEntries(
          (["distanceMeters", "pitchRadians", "fovDegrees"] as const).map((name) => {
            const runtime = cameraTuningBoundsV1(name === "fovDegrees" ? "baseFovDegrees" : name, parameters);
            const authoring = BLOCK_CAMERA_TUNING_LIMITS_V1[name];
            return [name, mode === "first-person" && name === "distanceMeters"
              ? { minimum: 0, maximum: 0 }
              : { minimum: Math.max(runtime.minimum, authoring.minimum), maximum: Math.min(runtime.maximum, authoring.maximum) }];
          }),
        ) as AgentAuthoringCatalogV2["cameraPacks"][number]["tuningRanges"];
        return {
          id,
          displayName,
          description,
          mode,
          defaults,
          tuningRanges: ranges,
          recommendedTarget: mode === "first-person" ? "eye-socket-or-point" as const : "visual-center" as const,
          centeredRearCompatible: mode === "third-person" && id !== "third-person.over-shoulder",
          supportedTargetKinds: [
            "base-subject-socket",
            "base-subject-bounds",
            "assembly-bounds",
            "subject-local-point",
          ] as const,
        };
      }),
    surfacePacks: AGENT_SURFACE_PACK_ROWS_V1.map((row) => {
      const profile = resolveBlockSurfaceProfileV1(row.surfaceProfileRef)!;
      return {
        ...row,
        displayName: profile.aiMetadata.displayName,
        description: profile.aiMetadata.description,
        semanticTags: profile.aiMetadata.semanticTags,
      };
    }),
    customMeshPolicy: {
      supportedGeometryKinds: ["box", "sphere", "cylinder"],
      supportsRigging: false,
      attachmentDefaultColliderContribution: "exclude",
      maximumMeshPartCount: 48,
      compatibleMotionPackIds: Object.keys(BLOCK_MOTION_PACKS_V1).sort(),
      recommendedMotionPackId: "ground.root-standard",
    },
    unavailableSubjectPacks,
  };
  return cachedAgentAuthoringCatalogV2;
}

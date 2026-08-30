import {
  BLOCK_PRESET_REFS_V1,
  createBlockWorldManifestV2,
  type BlockSubjectTraversalProfileV2,
  type BlockWorldControlledSubjectV2,
} from "@whitebox-world/block-world";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
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

export interface AgentAuthoringSubjectV1 {
  readonly subjectDefinitionRef: string;
  readonly displayName: string;
  readonly description: string;
  readonly authoringAvailability: "recommended" | "advanced" | "experimental";
  readonly category: RegistrySubjectDefinitionV3["category"];
  readonly bodyTopology: RegistrySubjectDefinitionV3["bodyTopology"];
  readonly semanticTags: readonly string[];
  readonly executableMovementModes: readonly SceneBriefMovementModeV1[];
  readonly executableCapabilityRefs: readonly string[];
  readonly defaultMotionProfileRef: string;
  readonly motionKernelRef: string;
  readonly camera: Readonly<{
    selectionAuthority: "runtime-camera-context";
    cameraContextProfileRef: string;
    defaultCameraRigProfileRef: string;
    builderOpeningCameraRigRef: "worldkit://camera/third-person.standard@1";
    openingTuningAuthority: "builder-camera-projected-onto-runtime-selected-profile";
    openingTuningParameters: readonly [
      "distanceMeters",
      "targetHeightMeters",
      "pitchRadians",
      "baseFovDegrees",
    ];
  }>;
  /** Host-derived from the admitted Runtime Subject collider. Agent must copy exactly. */
  readonly traversalEnvelope: BlockSubjectTraversalProfileV2;
  readonly visualReviewProxy: Readonly<{
    cuboids: readonly AgentAuthoringVisualProxyCuboidV1[];
    boundsMinimumMetersXYZ: Vector3;
    boundsMaximumMetersXYZ: Vector3;
  }>;
}

export interface AgentAuthoringCatalogV1 {
  readonly kind: "worldkit-agent-authoring-catalog";
  readonly schemaVersion: 1;
  readonly registryIdentityHash: `sha256:${string}`;
  readonly subjects: readonly AgentAuthoringSubjectV1[];
  readonly rejectedSubjects: readonly Readonly<{
    subjectDefinitionRef: string;
    diagnostics: readonly string[];
  }>[];
}

let cachedAgentAuthoringCatalogV1: AgentAuthoringCatalogV1 | undefined;

const MOVEMENT_CAPABILITIES = [
  ["ground-walk", ["worldkit://capability/locomotion.ground@1"]],
  ["ground-slide", ["worldkit://capability/locomotion.surface-slide@1"]],
  ["ground-ride", [
    "worldkit://capability/locomotion.forward-steer@1",
    "worldkit://capability/relationship.mounted-on@1",
  ]],
  ["ground-drive", ["worldkit://capability/locomotion.wheeled@1"]],
  ["water-surface", ["worldkit://capability/locomotion.water-surface@1"]],
  ["flight", ["worldkit://capability/locomotion.unpowered-glide@1"]],
] as const satisfies readonly (readonly [
  SceneBriefMovementModeV1,
  readonly string[],
])[];

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
): AgentAuthoringSubjectV1["visualReviewProxy"] {
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

function compileProbe(subjectDefinitionRef: string) {
  const controlledSubject: BlockWorldControlledSubjectV2 = {
    kind: "registered",
    entityId: "player",
    subjectDefinitionRef,
    visualTargetId: "visual-target-1",
    yawQuarterTurnsY: 0,
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
      entityId: "camera-main",
      pitchRadians: 0.12,
      distanceMeters: 5,
      targetHeightMeters: 1.25,
      fovDegrees: 56,
      aspectRatio: 16 / 9,
    },
    spawnStandPositionMetersXYZ: [0, 0.5, 0] as const,
    requiredTargets: [],
    requiredGroundTraversalBands: [],
    spaceTransitions: [],
    requireSingleReachableComponent: true,
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
    throw new Error(`AGENT_AUTHORING_SUBJECT_DESCRIPTOR_MISSING: ${subjectDefinitionRef}`);
  }
  return compileBlockWorldV2({
    ...baseInput,
    subjectTraversalProfile: traversalEnvelopeFromRuntimeColliderV1(descriptor.collider),
  });
}

export function createAgentAuthoringCatalogV1(): AgentAuthoringCatalogV1 {
  if (cachedAgentAuthoringCatalogV1 !== undefined) {
    return cachedAgentAuthoringCatalogV1;
  }
  const definitions = builtInSubjectResourceRegistry
    .listDiscoverableResources({ kind: "subject-definition" });
  const registryIdentityHash = sha256CanonicalJson(
    definitions.map(({ resourceRef, contentHash }) => ({ resourceRef, contentHash })),
  ) as `sha256:${string}`;
  const subjects: AgentAuthoringSubjectV1[] = [];
  const rejectedSubjects: Array<{
    subjectDefinitionRef: string;
    diagnostics: readonly string[];
  }> = [];
  for (const definition of definitions) {
    const admission = compileProbe(definition.resourceRef);
    if (!admission.ok) {
      rejectedSubjects.push({
        subjectDefinitionRef: definition.resourceRef,
        diagnostics: admission.diagnostics.map(({ code, message }) => `${code}: ${message}`),
      });
      continue;
    }
    const motionProfile = builtInSubjectResourceRegistry.resolveMotionProfile(
      definition.profiles.motion.defaultMotionProfileRef,
    );
    const motionKernel = motionProfile === undefined
      ? undefined
      : builtInSubjectResourceRegistry.resolveMotionKernel(motionProfile.motionKernelRef);
    const cameraContext = builtInSubjectResourceRegistry.resolveCameraContextProfile(
      definition.profiles.cameraContextProfileRef,
    );
    if (motionProfile === undefined || motionKernel?.runtimeStatus !== "implemented" ||
        cameraContext === undefined) {
      rejectedSubjects.push({
        subjectDefinitionRef: definition.resourceRef,
        diagnostics: ["Executable motion or Camera context closure is unavailable."],
      });
      continue;
    }
    const capabilities = new Set([
      ...definition.capabilityRefs,
      ...definition.relationshipCapabilityRefs,
    ]);
    subjects.push({
      subjectDefinitionRef: definition.resourceRef,
      displayName: definition.aiMetadata.displayName,
      description: definition.aiMetadata.description,
      authoringAvailability: definition.authoringAvailability,
      category: definition.category,
      bodyTopology: definition.bodyTopology,
      semanticTags: definition.aiMetadata.semanticTags,
      executableMovementModes: MOVEMENT_CAPABILITIES
        .filter(([, requiredRefs]) => requiredRefs.every((ref) => capabilities.has(ref)))
        .map(([mode]) => mode),
      executableCapabilityRefs: [
        ...definition.capabilityRefs,
        ...definition.relationshipCapabilityRefs,
      ],
      defaultMotionProfileRef: motionProfile.resourceRef,
      motionKernelRef: motionKernel.resourceRef,
      camera: {
        selectionAuthority: "runtime-camera-context",
        cameraContextProfileRef: cameraContext.resourceRef,
        defaultCameraRigProfileRef: cameraContext.defaultCameraRigProfileRef,
        builderOpeningCameraRigRef: "worldkit://camera/third-person.standard@1",
        openingTuningAuthority:
          "builder-camera-projected-onto-runtime-selected-profile",
        openingTuningParameters: [
          "distanceMeters",
          "targetHeightMeters",
          "pitchRadians",
          "baseFovDegrees",
        ],
      },
      traversalEnvelope: traversalEnvelopeFromRuntimeColliderV1(
        admission.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
          ({ entityId }) => entityId === "player",
        )!.collider,
      ),
      visualReviewProxy: visualProxy(definition),
    });
  }
  cachedAgentAuthoringCatalogV1 = {
    kind: "worldkit-agent-authoring-catalog",
    schemaVersion: 1,
    registryIdentityHash,
    subjects,
    rejectedSubjects,
  };
  return cachedAgentAuthoringCatalogV1;
}

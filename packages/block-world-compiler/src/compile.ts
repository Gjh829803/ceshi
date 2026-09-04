import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type PackageSubjectDefinitionV1,
  type PrimitivePrototypeSpecV4,
  type SubjectPrimitiveShapeSpecV1,
  type WorldNodeSpecV4,
} from "@whitebox-world/authoring";
import {
  blockBoundsMetersV2,
  blockWorldSpaceTransitionDestinationAnchorEntityIdV2,
  blockWorldSpaceTransitionSemanticClassIdV2,
  checkBlockWorldV2,
  resolveBlockCameraPackV1,
  resolveBlockMotionPackV1,
  resolveBlockPresetV1,
  type BlockInstanceV2,
  type BlockPresetDefinitionV1,
  type BlockSubjectPrimitiveShapeV2,
  type BlockSubjectVisualPartV2,
  type BlockWorldPackCameraV1,
} from "@whitebox-world/block-world";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import type {
  SceneBriefImplementationMapDraftV1,
} from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type RegistrySubjectDefinitionV3,
} from "@whitebox-world/subject-registry";

import type {
  BlockWorldCompilerDiagnosticV2,
  CompileBlockWorldInputV2,
  CompileBlockWorldResultV2,
} from "./types.js";
import {
  createBlockWorldRuntimeClustersV2,
  type BlockWorldRuntimeClusterV2,
} from "./clusters.js";

const FOUNDATION_DROP_METERS = 64;
const SUBJECT_NUMBER_QUANTIZATION = 1_000_000_000;

function stableSubjectNumber(value: number): number {
  const quantized = Math.round(value * SUBJECT_NUMBER_QUANTIZATION) /
    SUBJECT_NUMBER_QUANTIZATION;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function stableSubjectVector(
  value: readonly [number, number, number],
): [number, number, number] {
  return value.map(stableSubjectNumber) as [number, number, number];
}

function stableSubjectShape(
  shape: BlockSubjectPrimitiveShapeV2,
): SubjectPrimitiveShapeSpecV1 {
  switch (shape.kind) {
    case "box":
      return { kind: "box", sizeMetersXYZ: stableSubjectVector(shape.sizeMetersXYZ) };
    case "sphere":
      return { kind: "sphere", radiusMeters: stableSubjectNumber(shape.radiusMeters) };
    case "cylinder":
    case "capsule":
      return {
        kind: shape.kind,
        radiusMeters: stableSubjectNumber(shape.radiusMeters),
        heightMeters: stableSubjectNumber(shape.heightMeters),
      };
  }
}

function controlledSubjectDefinitionRef(
  subject: CompileBlockWorldInputV2["controlledSubject"],
): string {
  return subject.kind === "registered"
    ? subject.subjectDefinitionRef
    : `package://subject-definition/${subject.kind === "composed"
      ? subject.definition.id
      : subject.assembly.id}@1`;
}

const HOSTED_SUBJECT_FIXTURE_REFS = new Set([
  "worldkit://subject-definition/humanoid.rigged-golden@2",
  "worldkit://subject-definition/humanoid.third-person@1",
  "worldkit://subject-definition/quadruped.ground-proxy@1",
]);

const ASSEMBLY_CAMERA_TARGET_SOCKET_ID = "AssemblyCameraTarget";

interface ResolvedAssemblyV1 {
  readonly definition: PackageSubjectDefinitionV1;
  readonly targetSocketId: string;
  readonly cameraDistanceMeters: number;
  readonly cameraPitchRadians: number;
  readonly cameraFovDegrees: number;
}

function isPackCamera(
  camera: CompileBlockWorldInputV2["camera"],
): camera is BlockWorldPackCameraV1 {
  return "kind" in camera && camera.kind === "pack";
}

function packageVisualPart(
  part: RegistrySubjectDefinitionV3["visualParts"][number] |
    BlockSubjectVisualPartV2,
): PackageSubjectDefinitionV1["visualParts"][number] {
  if (part.kind === "asset") {
    const transform = "localTransform" in part ? part.localTransform : {
      positionMetersXYZ: part.positionMetersXYZ,
      rotationEulerRadiansXYZ: part.rotationEulerRadiansXYZ ?? [0, 0, 0],
      scaleXYZ: part.scaleXYZ,
    };
    return {
      id: part.id,
      kind: "asset",
      subjectAssetRef: part.subjectAssetRef,
      localTransform: {
        positionMetersXYZ: stableSubjectVector(transform.positionMetersXYZ),
        rotationEulerRadiansXYZ: stableSubjectVector(
          transform.rotationEulerRadiansXYZ ?? [0, 0, 0],
        ),
        scaleXYZ: stableSubjectVector(transform.scaleXYZ),
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: [...part.semanticTags],
    };
  }
  const transform = "localTransform" in part ? part.localTransform : {
    positionMetersXYZ: part.positionMetersXYZ,
    rotationEulerRadiansXYZ: part.rotationEulerRadiansXYZ ?? [0, 0, 0],
  };
  return {
    id: part.id,
    kind: "primitive",
    shape: stableSubjectShape(part.shape),
    localTransform: {
      positionMetersXYZ: stableSubjectVector(transform.positionMetersXYZ),
      rotationEulerRadiansXYZ: stableSubjectVector(
        transform.rotationEulerRadiansXYZ ?? [0, 0, 0],
      ),
    },
    colliderContribution: part.colliderContribution,
    semanticTags: [...part.semanticTags],
  };
}

function axisAlignedPartBounds(
  part: PackageSubjectDefinitionV1["visualParts"][number],
): Readonly<{
  minimumMetersXYZ: readonly [number, number, number];
  maximumMetersXYZ: readonly [number, number, number];
}> {
  const transform = part.localTransform;
  const assetBounds = part.kind === "asset"
    ? builtInSubjectResourceRegistry.resolveSubjectAsset(part.subjectAssetRef)?.bounds
    : undefined;
  const baseSize: readonly [number, number, number] = part.kind === "primitive"
    ? part.shape.kind === "box"
      ? part.shape.sizeMetersXYZ
      : part.shape.kind === "sphere"
        ? [part.shape.radiusMeters * 2, part.shape.radiusMeters * 2,
            part.shape.radiusMeters * 2]
        : [part.shape.radiusMeters * 2, part.shape.heightMeters,
            part.shape.radiusMeters * 2]
    : assetBounds === undefined
      ? [0, 0, 0]
      : [
          assetBounds.maximumMetersXYZ[0] - assetBounds.minimumMetersXYZ[0],
          assetBounds.maximumMetersXYZ[1] - assetBounds.minimumMetersXYZ[1],
          assetBounds.maximumMetersXYZ[2] - assetBounds.minimumMetersXYZ[2],
        ];
  const sourceCenter: readonly [number, number, number] = assetBounds === undefined
    ? [0, 0, 0]
    : [
        (assetBounds.minimumMetersXYZ[0] + assetBounds.maximumMetersXYZ[0]) / 2,
        (assetBounds.minimumMetersXYZ[1] + assetBounds.maximumMetersXYZ[1]) / 2,
        (assetBounds.minimumMetersXYZ[2] + assetBounds.maximumMetersXYZ[2]) / 2,
      ];
  const scale = part.kind === "asset" ? part.localTransform.scaleXYZ : [1, 1, 1] as const;
  const rotation = transform.rotationEulerRadiansXYZ ?? [0, 0, 0];
  const [x, y, z] = rotation;
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z),
  ];
  const matrix = [
    cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
    cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
    -sy, sx * cy, cx * cy,
  ];
  const scaledSize = baseSize.map((value, axis) => value * scale[axis]!) as
    [number, number, number];
  const size: [number, number, number] = [
    Math.abs(matrix[0]!) * scaledSize[0] + Math.abs(matrix[1]!) * scaledSize[1] +
      Math.abs(matrix[2]!) * scaledSize[2],
    Math.abs(matrix[3]!) * scaledSize[0] + Math.abs(matrix[4]!) * scaledSize[1] +
      Math.abs(matrix[5]!) * scaledSize[2],
    Math.abs(matrix[6]!) * scaledSize[0] + Math.abs(matrix[7]!) * scaledSize[1] +
      Math.abs(matrix[8]!) * scaledSize[2],
  ];
  const scaledCenter = sourceCenter.map((value, axis) => value * scale[axis]!) as
    [number, number, number];
  const rotatedCenter: [number, number, number] = [
    matrix[0]! * scaledCenter[0] + matrix[1]! * scaledCenter[1] +
      matrix[2]! * scaledCenter[2],
    matrix[3]! * scaledCenter[0] + matrix[4]! * scaledCenter[1] +
      matrix[5]! * scaledCenter[2],
    matrix[6]! * scaledCenter[0] + matrix[7]! * scaledCenter[1] +
      matrix[8]! * scaledCenter[2],
  ];
  const center = transform.positionMetersXYZ.map((value, axis) =>
    value + rotatedCenter[axis]!) as [number, number, number];
  return {
    minimumMetersXYZ: center.map((value, axis) => value - size[axis]! / 2) as
      [number, number, number],
    maximumMetersXYZ: center.map((value, axis) => value + size[axis]! / 2) as
      [number, number, number],
  };
}

function combinedBounds(
  parts: readonly PackageSubjectDefinitionV1["visualParts"][number][],
): ReturnType<typeof axisAlignedPartBounds> {
  const bounds = parts.map(axisAlignedPartBounds);
  return {
    minimumMetersXYZ: [0, 1, 2].map((axis) =>
      Math.min(...bounds.map(({ minimumMetersXYZ }) => minimumMetersXYZ[axis]!))) as
      [number, number, number],
    maximumMetersXYZ: [0, 1, 2].map((axis) =>
      Math.max(...bounds.map(({ maximumMetersXYZ }) => maximumMetersXYZ[axis]!))) as
      [number, number, number],
  };
}

function resolveAssemblyV1(input: CompileBlockWorldInputV2):
  | Readonly<{ ok: true; value: ResolvedAssemblyV1 }>
  | Readonly<{ ok: false; code: BlockWorldCompilerDiagnosticV2["code"]; message: string }> {
  const subject = input.controlledSubject;
  if (subject.kind !== "assembly") {
    return {
      ok: false,
      code: "BLOCK_WORLD_SUBJECT_ASSEMBLY_INVALID",
      message: "Controlled Subject is not a Subject Assembly.",
    };
  }
  if (!("kind" in input.camera) || input.camera.kind !== "pack") {
    return {
      ok: false,
      code: "BLOCK_WORLD_CAMERA_PACK_INCOMPATIBLE",
      message: "A Subject Assembly requires one explicit Camera Pack.",
    };
  }
  const cameraPack = resolveBlockCameraPackV1(input.camera.cameraPackId);
  const motionPack = resolveBlockMotionPackV1(subject.assembly.motion.motionPackId);
  if (cameraPack === undefined || motionPack === undefined) {
    return {
      ok: false,
      code: cameraPack === undefined
        ? "BLOCK_WORLD_CAMERA_PACK_INCOMPATIBLE"
        : "BLOCK_WORLD_SUBJECT_PACK_INCOMPATIBLE",
      message: "The selected Motion or Camera Pack is unavailable.",
    };
  }
  const meshPartsById = new Map(
    (input.subjectMeshParts ?? []).map((part) => [part.id, part]),
  );
  const base = subject.assembly.baseSubject;
  const availableDefinitions = builtInSubjectResourceRegistry
    .listDiscoverableResources({ kind: "subject-definition" });
  const baseDefinition = base.kind === "subject-pack"
    ? (() => {
        const exactVersioned = availableDefinitions.find((definition) =>
          `${definition.id}.v${definition.version}` === base.subjectPackId);
        if (exactVersioned !== undefined) return exactVersioned;
        const unversioned = availableDefinitions.filter(({ id }) =>
          id === base.subjectPackId);
        return unversioned.length === 1 ? unversioned[0] : undefined;
      })()
    : undefined;
  if (base.kind === "subject-pack" &&
      (baseDefinition === undefined || HOSTED_SUBJECT_FIXTURE_REFS.has(
        baseDefinition.resourceRef,
      ))) {
    return {
      ok: false,
      code: "BLOCK_WORLD_SUBJECT_PACK_UNKNOWN",
      message: `Subject Pack '${base.subjectPackId}' is not admitted for Hosted authoring.`,
    };
  }
  const baseMeshIds = base.kind === "custom-mesh"
    ? base.subjectMeshBindingIds
    : [];
  const attachmentIds = subject.assembly.attachments.map(
    ({ subjectMeshBindingId }) => subjectMeshBindingId,
  );
  const resolvedBaseParts = base.kind === "subject-pack"
    ? baseDefinition!.visualParts.map(packageVisualPart)
    : baseMeshIds.map((id) => packageVisualPart(meshPartsById.get(id)!));
  const attachmentParts = attachmentIds.map((id) =>
    packageVisualPart(meshPartsById.get(id)!));
  const visualParts = [...resolvedBaseParts, ...attachmentParts];
  const partIds = new Set<string>();
  const duplicatePart = visualParts.find(({ id }) => {
    if (partIds.has(id)) return true;
    partIds.add(id);
    return false;
  });
  if (duplicatePart !== undefined) {
    return {
      ok: false,
      code: "BLOCK_WORLD_SUBJECT_MESH_BINDING_DUPLICATE",
      message: "Subject base and attachment part IDs must be unique after assembly.",
    };
  }
  if (base.kind === "custom-mesh" && !resolvedBaseParts.some((part) =>
    part.kind === "primitive" && part.colliderContribution === "include")) {
    return {
      ok: false,
      code: "BLOCK_WORLD_SUBJECT_PACK_INCOMPATIBLE",
      message: "A custom Mesh base requires at least one collider-contributing shape.",
    };
  }
  const sourceSockets: Array<PackageSubjectDefinitionV1["sockets"][number]> =
    baseDefinition?.sockets.map((socket) => structuredClone(socket)) ?? [];
  const target = input.camera.target;
  let targetSocketId: string;
  if (target.kind === "base-subject-socket") {
    if (!sourceSockets.some(({ id }) => id === target.socketId)) {
      return {
        ok: false,
        code: "BLOCK_WORLD_CAMERA_PACK_INCOMPATIBLE",
        message: `Camera target Socket '${target.socketId}' is not published by Subject Pack '${base.kind === "subject-pack" ? base.subjectPackId : "custom-mesh"}'.`,
      };
    }
    targetSocketId = target.socketId;
  } else {
    const bounds = target.kind === "assembly-bounds"
      ? combinedBounds(visualParts)
      : target.kind === "base-subject-bounds"
        ? combinedBounds(resolvedBaseParts)
        : undefined;
    const position = target.kind === "subject-local-point"
      ? target.positionMetersXYZ
      : [
          (bounds!.minimumMetersXYZ[0] + bounds!.maximumMetersXYZ[0]) / 2,
          bounds!.minimumMetersXYZ[1] +
            (bounds!.maximumMetersXYZ[1] - bounds!.minimumMetersXYZ[1]) *
              target.heightRatio,
          (bounds!.minimumMetersXYZ[2] + bounds!.maximumMetersXYZ[2]) / 2,
        ] as const;
    if (sourceSockets.some(({ id }) => id === ASSEMBLY_CAMERA_TARGET_SOCKET_ID)) {
      return {
        ok: false,
        code: "BLOCK_WORLD_CAMERA_PACK_INCOMPATIBLE",
        message: `Subject Pack reserves Camera Socket '${ASSEMBLY_CAMERA_TARGET_SOCKET_ID}'.`,
      };
    }
    sourceSockets.push({
      id: ASSEMBLY_CAMERA_TARGET_SOCKET_ID,
      kind: "local",
      localTransform: {
        positionMetersXYZ: stableSubjectVector(position),
        rotationEulerRadiansXYZ: [0, 0, 0],
      },
      semanticTags: ["camera", "target"],
    });
    targetSocketId = ASSEMBLY_CAMERA_TARGET_SOCKET_ID;
  }
  const source = baseDefinition;
  const presentationPolicy = structuredClone(subject.assembly.presentation);
  const definition: PackageSubjectDefinitionV1 = {
    id: subject.assembly.id,
    version: 1,
    kind: "subject-definition",
    authoringAvailability: "advanced",
    category: base.kind === "subject-pack" ? source!.category : base.category,
    bodyTopology: base.kind === "subject-pack"
      ? source!.bodyTopology
      : base.bodyTopology,
    semanticClassId: base.kind === "subject-pack"
      ? source!.semanticClassId
      : base.semanticClassId,
    coordinateConvention: {
      forwardAxis: "-Z",
      upAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    visualParts,
    visualBinding: source?.visualBinding === undefined
      ? { mode: "static" }
      : structuredClone(source.visualBinding),
    sockets: sourceSockets,
    mountSlots: [],
    colliderPolicy: source?.colliderPolicy === undefined
      ? {
          kind: "derive",
          colliderDerivationProfileRef:
            "worldkit://collider-derivation-profile/vertical-capability-capsule@1",
        }
      : structuredClone(source.colliderPolicy),
    capabilityRefs: [...motionPack.capabilityRefs],
    profiles: {
      physicsBodyProfileRef: motionPack.physicsBodyProfileRef,
      locomotionProfileRef: motionPack.locomotionProfileRef,
      controlFeelProfileRef: motionPack.controlFeelProfileRef,
      allowedControlFeelProfileRefs: [...motionPack.allowedControlFeelProfileRefs],
      motion: {
        defaultMotionProfileRef: motionPack.defaultMotionProfileRef,
        optionalMotionProfileRefs: [...motionPack.optionalMotionProfileRefs],
        fallbackMotionProfileRef: motionPack.fallbackMotionProfileRef,
      },
      controlProfileRef: motionPack.controlProfileRef,
      cameraContextProfileRef: cameraPack.cameraContextProfileRef,
      mediumProfileRef: motionPack.mediumProfileRef,
      harnessProfileRef: source?.profiles.harnessProfileRef ??
        "worldkit://harness-profile/subject.standard@1",
    },
    relationshipCapabilityRefs: [],
    actionOrPoseSetRef: source?.actionOrPoseSetRef ??
      "worldkit://pose-set/static.whitebox@1",
    renderBindingProfileRef: source?.renderBindingProfileRef ??
      "worldkit://render-binding/subject.standard@1",
    presentationPolicy,
    allowedOverridePaths: [],
    aiMetadata: {
      displayName: base.kind === "subject-pack"
        ? `${source!.aiMetadata.displayName} assembly`
        : base.displayName,
      description: base.kind === "subject-pack"
        ? `Subject Assembly based on ${source!.aiMetadata.displayName}.`
        : base.description,
      semanticTags: [...new Set([
        ...(source?.aiMetadata.semanticTags ?? [base.kind, "custom-mesh"]),
        "subject-assembly",
      ])].sort(),
    },
  };
  return {
    ok: true,
    value: {
      definition,
      targetSocketId,
      cameraDistanceMeters: input.camera.tuning?.distanceMeters ??
        cameraPack.defaults.distanceMeters,
      cameraPitchRadians: input.camera.tuning?.pitchRadians ??
        cameraPack.defaults.pitchRadians,
      cameraFovDegrees: input.camera.tuning?.fovDegrees ??
        cameraPack.defaults.fovDegrees,
    },
  };
}

function compilePackageSubjectDefinitions(
  subject: CompileBlockWorldInputV2["controlledSubject"],
  resolvedAssembly?: ResolvedAssemblyV1,
): readonly PackageSubjectDefinitionV1[] {
  if (subject.kind === "registered") return [];
  if (subject.kind === "assembly") {
    if (resolvedAssembly === undefined) {
      throw new Error("BLOCK_WORLD_SUBJECT_ASSEMBLY_INVALID");
    }
    return [resolvedAssembly.definition];
  }
  const source = subject.definition;
  return [{
    id: source.id,
    version: 1,
    kind: "subject-definition",
    allowedOverridePaths: [],
    authoringAvailability: "advanced",
    category: source.category,
    bodyTopology: source.bodyTopology,
    semanticClassId: source.semanticClassId,
    coordinateConvention: {
      forwardAxis: "-Z",
      upAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    visualParts: source.visualParts.map((part) => part.kind === "asset"
      ? {
          id: part.id,
          kind: "asset",
          subjectAssetRef: part.subjectAssetRef,
          localTransform: {
            positionMetersXYZ: stableSubjectVector(part.positionMetersXYZ),
            rotationEulerRadiansXYZ: stableSubjectVector(
              part.rotationEulerRadiansXYZ ?? [0, 0, 0],
            ),
            scaleXYZ: stableSubjectVector(part.scaleXYZ),
          },
          appearance: { mode: "whitebox-neutral" },
          semanticTags: part.semanticTags,
        }
      : {
          id: part.id,
          kind: "primitive",
          shape: stableSubjectShape(part.shape),
          localTransform: {
            positionMetersXYZ: stableSubjectVector(part.positionMetersXYZ),
            rotationEulerRadiansXYZ: stableSubjectVector(
              part.rotationEulerRadiansXYZ ?? [0, 0, 0],
            ),
          },
          colliderContribution: part.colliderContribution,
          semanticTags: part.semanticTags,
        }),
    visualBinding: source.visualBinding.kind === "static"
      ? { mode: "static" }
      : {
          mode: "rigged",
          rigProfileRef: source.visualBinding.rigProfileRef,
          animationSetRef: source.visualBinding.animationSetRef,
        },
    sockets: [],
    mountSlots: [],
    colliderPolicy: source.visualBinding.kind === "rigged"
      ? {
          kind: "profile",
          colliderProfileRef: source.visualBinding.colliderProfileRef,
        }
      : {
          kind: "derive",
          colliderDerivationProfileRef:
            "worldkit://collider-derivation-profile/vertical-character-capsule@1",
        },
    capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
    profiles: {
      physicsBodyProfileRef:
        "worldkit://physics-body-profile/character.capability-medium@1",
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      controlFeelProfileRef:
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      allowedControlFeelProfileRefs: [
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      ],
      motion: {
        defaultMotionProfileRef:
          "worldkit://motion-profile/free-ground.humanoid-medium@1",
        optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
        fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
      },
      controlProfileRef:
        "worldkit://control-profile/planar.camera-relative@1",
      cameraContextProfileRef:
        "worldkit://camera-context/capability-driven.default@1",
      mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
    },
    relationshipCapabilityRefs: [],
    actionOrPoseSetRef: source.visualBinding.kind === "rigged"
      ? source.visualBinding.animationSetRef
      : "worldkit://pose-set/static.whitebox@1",
    renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
    aiMetadata: {
      displayName: source.displayName,
      description: source.description,
      semanticTags: [source.category, source.bodyTopology, "block-world-composed"],
    },
  }];
}

function presetName(preset: BlockPresetDefinitionV1): string {
  return preset.resourceRef
    .slice("worldkit://block-preset/".length)
    .replace(/@1$/, "");
}

function clusterPrototypeKey(cluster: BlockWorldRuntimeClusterV2): string {
  return `${cluster.presetRef}\u0000${cluster.shape}\u0000${cluster.baseSizeMetersXYZ.join(",")}\u0000${cluster.visualGroupId ?? ""}\u0000${cluster.interactionInstanceId ?? ""}\u0000${cluster.initialStateId ?? ""}`;
}

function clusterSemanticClassId(
  cluster: BlockWorldRuntimeClusterV2,
  spaceTransitionIds: ReadonlySet<string>,
): string {
  const preset = resolveBlockPresetV1(cluster.presetRef)!;
  const base = cluster.visualGroupId === undefined
    ? `block.${presetName(preset)}.shape.${cluster.shape}`
    : `block.${presetName(preset)}.shape.${cluster.shape}.visual-group.${cluster.visualGroupId}`;
  return cluster.interactionInstanceId !== undefined &&
      spaceTransitionIds.has(cluster.interactionInstanceId)
    ? blockWorldSpaceTransitionSemanticClassIdV2(
        base,
        cluster.interactionInstanceId,
      )
    : base;
}

function diagnostic(
  code: BlockWorldCompilerDiagnosticV2["code"],
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): BlockWorldCompilerDiagnosticV2 {
  return Object.freeze({
    severity: "error",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details: Object.freeze({ ...details }) }),
  });
}

function boundsForBlocks(blocks: readonly BlockInstanceV2[]) {
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const block of blocks) {
    const bounds = blockBoundsMetersV2(block);
    minimumX = Math.min(minimumX, bounds.minimumMetersXYZ[0]);
    maximumX = Math.max(maximumX, bounds.maximumMetersXYZ[0]);
    minimumY = Math.min(minimumY, bounds.minimumMetersXYZ[1]);
    maximumY = Math.max(maximumY, bounds.maximumMetersXYZ[1]);
    minimumZ = Math.min(minimumZ, bounds.minimumMetersXYZ[2]);
    maximumZ = Math.max(maximumZ, bounds.maximumMetersXYZ[2]);
  }
  const sizeX = Math.max(16, maximumX - minimumX + 9);
  const sizeZ = Math.max(16, maximumZ - minimumZ + 9);
  return Object.freeze({
    centerMetersXZ: [(minimumX + maximumX) / 2, (minimumZ + maximumZ) / 2] as const,
    sizeMetersXZ: [sizeX, sizeZ] as const,
    minimumY,
    maximumY,
    foundationHeightMeters: minimumY - FOUNDATION_DROP_METERS,
  });
}

function compilePrototypes(
  clusters: readonly BlockWorldRuntimeClusterV2[],
  spaceTransitionIds: ReadonlySet<string>,
): Readonly<{
  prototypes: readonly PrimitivePrototypeSpecV4[];
  prototypeIdByKey: ReadonlyMap<string, string>;
}> {
  const clustersByKey = new Map<string, BlockWorldRuntimeClusterV2>();
  for (const cluster of clusters) clustersByKey.set(clusterPrototypeKey(cluster), cluster);
  const prototypeIdByKey = new Map<string, string>();
  const prototypes = [...clustersByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, cluster], index) => {
      const preset = resolveBlockPresetV1(cluster.presetRef)!;
      const id = `block-runtime-${index.toString(36).padStart(3, "0")}`;
      prototypeIdByKey.set(key, id);
      return {
        id,
        version: 1,
        kind: "primitive",
        primitive: "box",
        sizeMetersXYZ: cluster.baseSizeMetersXYZ,
        collisionEnabled: preset.physics.collisionMode === "solid",
        semantic: { classId: clusterSemanticClassId(cluster, spaceTransitionIds) },
      } as const;
    });
  return Object.freeze({
    prototypes: Object.freeze(prototypes),
    prototypeIdByKey,
  });
}

function compileBlockNodes(
  clusters: readonly BlockWorldRuntimeClusterV2[],
  prototypeIdByKey: ReadonlyMap<string, string>,
): readonly WorldNodeSpecV4[] {
  return clusters.map((cluster) => {
    const prototypeId = prototypeIdByKey.get(clusterPrototypeKey(cluster));
    if (prototypeId === undefined) {
      throw new Error("BLOCK_WORLD_CLUSTER_PROTOTYPE_MISSING");
    }
    return {
      id: cluster.entityId,
      kind: "object",
      prototypeRef: `package://prototype/${prototypeId}@1`,
      placement: {
        kind: "fixed",
        transform: {
          positionMetersXYZ: cluster.centerMetersXYZ,
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: cluster.repeatCountXYZ,
        },
      },
    };
  });
}

function implementationMapDraft(
  input: CompileBlockWorldInputV2,
  clusters: readonly BlockWorldRuntimeClusterV2[],
): SceneBriefImplementationMapDraftV1 {
  const runtimeIdsByVisualTargetId = new Map<string, string[]>();
  runtimeIdsByVisualTargetId.set(
    input.controlledSubject.visualTargetId,
    [input.controlledSubject.entityId],
  );
  for (const cluster of clusters) {
    if (cluster.visualGroupId === undefined) continue;
    const ids = runtimeIdsByVisualTargetId.get(cluster.visualGroupId) ?? [];
    ids.push(cluster.entityId);
    runtimeIdsByVisualTargetId.set(cluster.visualGroupId, ids);
  }
  const yawByVisualTargetId = new Map(
    input.visualTargetFacings.map(({ visualTargetId, frontYawQuarterTurnsY }) =>
      [visualTargetId, frontYawQuarterTurnsY] as const),
  );
  yawByVisualTargetId.set(
    input.controlledSubject.visualTargetId,
    input.controlledSubject.yawQuarterTurnsY,
  );
  const frontDirectionForTarget = (visualTargetId: string): readonly [number, number] => {
    const yaw = yawByVisualTargetId.get(visualTargetId);
    const direction = yaw === undefined
      ? undefined
      : ([[0, -1], [-1, 0], [0, 1], [1, 0]] as const)[yaw];
    if (direction === undefined) {
      throw new Error(`BLOCK_WORLD_VISUAL_TARGET_FACING_MISSING: ${visualTargetId}`);
    }
    return direction;
  };
  return Object.freeze({
    kind: "worldkit-scene-brief-implementation-map-draft",
    schemaVersion: 1,
    sceneId: input.world.id,
    authoringSpecId: input.world.id,
    visualTargetMappings: Object.freeze(
      [...runtimeIdsByVisualTargetId.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([visualTargetId, runtimeEntityIds]) => Object.freeze({
          visualTargetId,
          runtimeEntityIds: Object.freeze([...runtimeEntityIds].sort()),
          frontDirectionWorldXZ: Object.freeze(
            [...frontDirectionForTarget(visualTargetId)],
          ) as readonly [number, number],
        })),
    ),
  });
}

function compileAuthoringSpec(
  input: CompileBlockWorldInputV2,
  clusters: readonly BlockWorldRuntimeClusterV2[],
  resolvedAssembly?: ResolvedAssemblyV1,
): AuthoringSpecV4 {
  const bounds = boundsForBlocks(input.manifest.blocks);
  const solidClusterCount = clusters.filter((cluster) =>
    resolveBlockPresetV1(cluster.presetRef)?.physics.collisionMode === "solid").length;
  const spaceTransitionIds = new Set(
    input.spaceTransitions.map(({ id }) => id),
  );
  const { prototypes, prototypeIdByKey } = compilePrototypes(
    clusters,
    spaceTransitionIds,
  );
  const spawn = input.spawnStandPositionMetersXYZ;
  const packCamera = isPackCamera(input.camera);
  const legacyCamera = packCamera ? undefined : input.camera;
  const cameraDistanceMeters = packCamera
    ? resolvedAssembly!.cameraDistanceMeters
    : legacyCamera!.distanceMeters;
  const cameraPitchRadians = packCamera
    ? resolvedAssembly!.cameraPitchRadians
    : legacyCamera!.pitchRadians;
  const cameraFovDegrees = packCamera
    ? resolvedAssembly!.cameraFovDegrees
    : legacyCamera!.fovDegrees;
  const cameraTargetHeightMeters = packCamera ? 1 : legacyCamera!.targetHeightMeters;
  const nodes: WorldNodeSpecV4[] = [
    {
      id: "runtime-foundation",
      kind: "terrain",
      components: {
        terrain: {
          source: {
            kind: "procedural",
            relief: "flat",
            baseHeightMeters: bounds.foundationHeightMeters,
            amplitudeMeters: 0,
          },
          grid: {
            centerMetersXZ: bounds.centerMetersXZ,
            sizeMetersXZ: bounds.sizeMetersXZ,
            resolutionCellsXZ: [2, 2],
          },
          semantic: { classId: "internal.block-world-runtime-foundation" },
        },
      },
    },
    ...compileBlockNodes(clusters, prototypeIdByKey),
    ...input.spaceTransitions.map((transition) => ({
      id: blockWorldSpaceTransitionDestinationAnchorEntityIdV2(transition.id),
      kind: "anchor" as const,
      placement: {
        kind: "fixed" as const,
        transform: {
          positionMetersXYZ: transition.destinationStandPositionMetersXYZ,
          rotationEulerRadiansXYZ: [
            0,
            transition.destinationYawQuarterTurnsY * Math.PI / 2,
            0,
          ] as const,
          scaleXYZ: [1, 1, 1] as const,
        },
      },
      semantic: { classId: `space-transition.destination.${transition.kind}` },
    })),
    {
      id: "spawn-main",
      kind: "anchor",
      placement: {
        kind: "fixed",
        transform: {
          positionMetersXYZ: spawn,
          rotationEulerRadiansXYZ: [
            0,
            input.controlledSubject.yawQuarterTurnsY * Math.PI / 2,
            0,
          ],
          scaleXYZ: [1, 1, 1],
        },
      },
      semantic: { classId: "spawn.block-world.primary" },
    },
    {
      id: input.controlledSubject.entityId,
      kind: "subject",
      subjectDefinitionRef: controlledSubjectDefinitionRef(input.controlledSubject),
      spawnAnchorEntityId: "spawn-main",
    },
    {
      id: input.camera.entityId,
      kind: "camera",
      components: {
        cameraRig: {
          defaultRigRef: "worldkit://camera/third-person.standard@1",
          allowedRigRefs: ["worldkit://camera/third-person.standard@1"],
          target: {
            targetEntityId: input.controlledSubject.entityId,
            targetHeightMeters: cameraTargetHeightMeters,
            ...(resolvedAssembly?.targetSocketId === undefined
              ? {}
              : { targetSocketId: resolvedAssembly.targetSocketId }),
          },
          thirdPerson: {
            pitchRadians: cameraPitchRadians,
            distanceMeters: cameraDistanceMeters,
            targetHeightMeters: cameraTargetHeightMeters,
            fovDegrees: cameraFovDegrees,
            aspectRatio: input.camera.aspectRatio,
          },
          manualSwitchAllowed: false,
        },
      },
    },
  ];
  return {
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    id: input.world.id,
    seed: input.world.seed,
    layout: { solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1" },
    spatial: { regions: [], routes: [], screenRegions: [], traversalAreas: [] },
    world: {
      coordinateSystem: "right-handed-y-up-minus-z-forward",
      bounds: {
        centerMetersXZ: bounds.centerMetersXZ,
        sizeMetersXZ: bounds.sizeMetersXZ,
        heightRangeMeters: [bounds.foundationHeightMeters - 1, bounds.maximumY + 16],
      },
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      environment: { preset: "clear-day" },
      resourceBudget: {
        maxVertices: Math.max(200_000, input.manifest.blocks.length * 24 + 150_000),
        maxTriangles: Math.max(300_000, input.manifest.blocks.length * 12 + 200_000),
        maxColliders: solidClusterCount + 32,
      },
    },
    resources: {
      prototypes,
      subjectDefinitions: compilePackageSubjectDefinitions(
        input.controlledSubject,
        resolvedAssembly,
      ),
    },
    nodes,
    relationships: [],
    rules: [],
    startup: {
      spawnAnchorEntityId: "spawn-main",
      controlledEntityId: input.controlledSubject.entityId,
      cameraEntityId: input.camera.entityId,
    },
    constraints: { placements: [], connectivity: [] },
  };
}

export function compileBlockWorldV2(
  input: CompileBlockWorldInputV2,
): CompileBlockWorldResultV2 {
  const checkReport = checkBlockWorldV2(input);
  if (checkReport.status !== "passed") {
    return Object.freeze({
      ok: false,
      diagnostics: checkReport.diagnostics,
      checkReport,
    });
  }
  if (input.manifest.blocks.some(
    ({ visualGroupId }) => visualGroupId === input.controlledSubject.visualTargetId,
  )) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([diagnostic(
        "BLOCK_WORLD_VISUAL_TARGET_CONFLICT",
        "/controlledSubject/visualTargetId",
        "The primary Subject visual target cannot also identify world blocks.",
      )]),
      checkReport,
    });
  }
  if (isPackCamera(input.camera) && input.controlledSubject.kind !== "assembly") {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([diagnostic(
        "BLOCK_WORLD_CAMERA_PACK_INCOMPATIBLE",
        "/camera",
        "A Camera Pack requires the Subject Assembly contract.",
      )]),
      checkReport,
    });
  }
  const assemblyResolution = input.controlledSubject.kind === "assembly"
    ? resolveAssemblyV1(input)
    : undefined;
  if (assemblyResolution !== undefined && !assemblyResolution.ok) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([diagnostic(
        assemblyResolution.code,
        assemblyResolution.code.startsWith("BLOCK_WORLD_CAMERA")
          ? "/camera"
          : "/controlledSubject/assembly",
        assemblyResolution.message,
      )]),
      checkReport,
    });
  }
  const clusters = createBlockWorldRuntimeClustersV2(input.manifest.blocks);
  const authoringSpec = compileAuthoringSpec(
    input,
    clusters,
    assemblyResolution?.ok === true ? assemblyResolution.value : undefined,
  );
  const normalized = normalizeAuthoringSpecV4(authoringSpec);
  if (!normalized.ok || normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze(normalized.diagnostics.map((row) => ({ ...row }))),
      checkReport,
    });
  }
  const definition = normalized.value.resources.subjectDefinitions.find(
    ({ subjectDefinitionRef }) =>
      subjectDefinitionRef === controlledSubjectDefinitionRef(input.controlledSubject),
  );
  if (definition === undefined) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze([diagnostic(
        "BLOCK_WORLD_INTERNAL_COMPILE_FAILED",
        "/controlledSubject/subjectDefinitionRef",
        "The selected Subject Definition did not resolve during internal compilation.",
      )]),
      checkReport,
    });
  }
  const gameplayBootstrap = createCoreGameplayBootstrapV1({
    worldId: normalized.value.id,
    worldSeed: normalized.value.seed,
    entityDescriptors: [{
      id: input.controlledSubject.entityId,
      entityDefinitionRef: definition.subjectDefinitionRef,
      capabilityRefs: definition.capabilityRefs,
    }],
    initialRelationshipStates: [],
  });
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok) {
    return Object.freeze({
      ok: false,
      diagnostics: Object.freeze(compiled.diagnostics.map((row) => ({ ...row }))),
      checkReport,
    });
  }
  return Object.freeze({
    ok: true,
    diagnostics: Object.freeze([]) as readonly [],
    checkReport,
    authoringSpec: Object.freeze(authoringSpec),
    gameplayBootstrap,
    implementationMapDraft: implementationMapDraft(input, clusters),
    canonicalSceneExecutionPlan: compiled.canonicalSceneExecutionPlan,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
  });
}

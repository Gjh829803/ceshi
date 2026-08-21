import {
  calculatePrimitiveResourceCost,
  deriveVerticalCharacterCapsule,
  type ColliderSourcePartV1,
} from "@whitebox-world/subject-composition";
import type {
  AnimationSetManifestV1,
  RegistrySubjectDefinitionV3,
  RegistrySubjectDefinitionV2,
  RigProfileManifestV1,
  SubjectAssetManifestV1,
  SubjectResourceRegistryV2,
  SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";

import { sha256CanonicalJson } from "./canonical-json";
import { ResourceLockBuilderV1 } from "./resource-lock";
import type {
  AuthoringDiagnostic,
  AuthoringDocumentBase,
  NormalizedSubjectColliderV2,
  NormalizedSubjectDefinitionV2,
  NormalizedSubjectSocketV2,
  NormalizedSubjectVisualPartV2,
  PackageSubjectDefinitionV1,
  SubjectPrimitiveShapeSpecV1,
  Vec3,
} from "./types";

type SubjectDefinitionSourceV2 = PackageSubjectDefinitionV1 | RegistrySubjectDefinitionV2;

export interface NormalizeSubjectDefinitionRequestV2 {
  definition: SubjectDefinitionSourceV2;
  subjectDefinitionRef: string;
  source: "package" | "registry";
  instancePath: string;
  subjectResourceRegistry: SubjectResourceRegistryV2;
  resourceLockBuilder: ResourceLockBuilderV1;
  diagnostics: AuthoringDiagnostic[];
  resourceBudget?: AuthoringDocumentBase["world"]["resourceBudget"];
}

interface NormalizedRiggedVisualResourcesV1 {
  subjectAssetResource: SubjectAssetManifestV1;
  rigProfileResource: RigProfileManifestV1;
  animationSetResource: AnimationSetManifestV1;
}

const REQUIRED_GROUND_ACTION_IDS = ["idle", "jump", "run", "walk"] as const;

type NormalizedCapabilityAssemblyV1 = NonNullable<
  NormalizedSubjectDefinitionV2["capabilityAssembly"]
>;

function addError(
  diagnostics: AuthoringDiagnostic[],
  code: string,
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push({
    severity: "error",
    code,
    instancePath,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function normalizeCapabilityAssemblyV1(
  definition: SubjectDefinitionSourceV2,
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedCapabilityAssemblyV1 | undefined {
  if (!("schemaVersion" in definition) || definition.schemaVersion !== 3) {
    return undefined;
  }
  const subject = definition as RegistrySubjectDefinitionV3;
  const registry = request.subjectResourceRegistry as Partial<SubjectResourceRegistryV3>;
  if (
    typeof registry.resolveMotionProfile !== "function" ||
    typeof registry.resolveMotionKernel !== "function" ||
    typeof registry.resolveControlProfile !== "function" ||
    typeof registry.resolveCameraContextProfile !== "function" ||
    typeof registry.resolveCameraRigProfile !== "function" ||
    typeof registry.resolveCameraRigAlgorithm !== "function" ||
    typeof registry.resolveMediumProfile !== "function" ||
    typeof registry.resolveRelationshipProfile !== "function" ||
    typeof registry.resolveHarnessProfile !== "function" ||
    typeof registry.resolveRenderBindingProfile !== "function"
  ) {
    addError(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      "A schemaVersion 3 Subject Definition requires a capability-driven Subject Registry.",
      { subjectDefinitionRef: subject.resourceRef },
    );
    return undefined;
  }

  const missing = (resourceRef: string, expectedKind: string): void => {
    addError(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `${expectedKind} '${resourceRef}' is not registered at the exact requested version.`,
      { expectedKind, resourceRef },
    );
  };
  const addLock = (resource: Parameters<ResourceLockBuilderV1["addRegistryResource"]>[0]) =>
    request.resourceLockBuilder.addRegistryResource(
      resource,
      request.instancePath,
      request.diagnostics,
    );

  const unavailableRelationshipCapabilityRef = subject.relationshipCapabilityRefs.find(
    (resourceRef) =>
      resourceRef === "worldkit://capability/relationship.mount@1" ||
      resourceRef === "worldkit://capability/relationship.seat@1" ||
      resourceRef === "worldkit://capability/relationship.tether@1",
  );
  if (unavailableRelationshipCapabilityRef !== undefined) {
    addError(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `Relationship capability '${unavailableRelationshipCapabilityRef}' is unavailable in the canonical runtime.`,
      { capabilityRef: unavailableRelationshipCapabilityRef, runtimeStatus: "reserved" },
    );
    return undefined;
  }

  const defaultMotionProfile = registry.resolveMotionProfile(
    subject.profiles.motion.defaultMotionProfileRef,
  );
  const fallbackMotionProfile = registry.resolveMotionProfile(
    subject.profiles.motion.fallbackMotionProfileRef,
  );
  const optionalMotionProfiles = subject.profiles.motion.optionalMotionProfileRefs.flatMap(
    (resourceRef) => {
      const resource = registry.resolveMotionProfile!(resourceRef);
      if (resource === undefined) missing(resourceRef, "Motion Profile");
      return resource === undefined ? [] : [resource];
    },
  );
  if (defaultMotionProfile === undefined) {
    missing(subject.profiles.motion.defaultMotionProfileRef, "Motion Profile");
  }
  if (fallbackMotionProfile === undefined) {
    missing(subject.profiles.motion.fallbackMotionProfileRef, "Fallback Motion Profile");
  }
  const resolvedMotionProfiles = [
    ...(defaultMotionProfile === undefined ? [] : [defaultMotionProfile]),
    ...optionalMotionProfiles,
    ...(fallbackMotionProfile === undefined ? [] : [fallbackMotionProfile]),
  ];
  const motionKernels = [...new Set(
    resolvedMotionProfiles.map((profile) => profile.motionKernelRef),
  )]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((resourceRef) => {
      const resource = registry.resolveMotionKernel!(resourceRef);
      if (resource === undefined) missing(resourceRef, "Motion Kernel");
      return resource === undefined ? [] : [resource];
    });
  const controlProfile = registry.resolveControlProfile(subject.profiles.controlProfileRef);
  if (controlProfile === undefined) missing(subject.profiles.controlProfileRef, "Control Profile");
  const cameraContextProfile = registry.resolveCameraContextProfile(
    subject.profiles.cameraContextProfileRef,
  );
  if (cameraContextProfile === undefined) {
    missing(subject.profiles.cameraContextProfileRef, "Camera Context Profile");
  }
  const mediumProfile = registry.resolveMediumProfile(subject.profiles.mediumProfileRef);
  if (mediumProfile === undefined) missing(subject.profiles.mediumProfileRef, "Medium Profile");
  const harnessProfile = registry.resolveHarnessProfile(subject.profiles.harnessProfileRef);
  if (harnessProfile === undefined) missing(subject.profiles.harnessProfileRef, "Harness Profile");
  const renderBindingProfile = registry.resolveRenderBindingProfile(
    subject.renderBindingProfileRef,
  );
  if (renderBindingProfile === undefined) {
    missing(subject.renderBindingProfileRef, "Render Binding Profile");
  }

  const cameraRigProfileRefs = new Set<string>();
  const cameraModifierProfileRefs = new Set<string>();
  if (cameraContextProfile !== undefined) {
    cameraRigProfileRefs.add(cameraContextProfile.defaultCameraRigProfileRef);
    if (cameraContextProfile.firstPersonCameraRigProfileRef !== undefined) {
      cameraRigProfileRefs.add(cameraContextProfile.firstPersonCameraRigProfileRef);
    }
    for (const rule of cameraContextProfile.rules) {
      if (rule.cameraRigProfileRef !== undefined) {
        cameraRigProfileRefs.add(rule.cameraRigProfileRef);
      }
      for (const modifierRef of rule.cameraModifierRefs ?? []) {
        cameraModifierProfileRefs.add(modifierRef);
      }
    }
  }
  const cameraRigProfiles = [...cameraRigProfileRefs]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((resourceRef) => {
      const resource = registry.resolveCameraRigProfile!(resourceRef);
      if (resource === undefined) missing(resourceRef, "Camera Rig Profile");
      return resource === undefined ? [] : [resource];
    });
  const cameraRigAlgorithms = [...new Set(cameraRigProfiles.map((row) => row.algorithmRef))]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((resourceRef) => {
      const resource = registry.resolveCameraRigAlgorithm!(resourceRef);
      if (resource === undefined) missing(resourceRef, "Camera Rig Algorithm");
      return resource === undefined ? [] : [resource];
    });
  const cameraModifierProfiles = [...cameraModifierProfileRefs]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((resourceRef) => {
      const resource = registry.resolveCameraModifierProfile!(resourceRef);
      if (resource === undefined) missing(resourceRef, "Camera Modifier Profile");
      return resource === undefined ? [] : [resource];
    });

  const relationshipProfileRefs = subject.relationshipCapabilityRefs.flatMap((resourceRef) => {
    if (resourceRef === "worldkit://capability/relationship.mount@1") {
      return ["worldkit://relationship-profile/mount.reserved@1"];
    }
    if (resourceRef === "worldkit://capability/relationship.seat@1") {
      return ["worldkit://relationship-profile/seat.driver@1"];
    }
    if (resourceRef === "worldkit://capability/relationship.tether@1") {
      return ["worldkit://relationship-profile/tether.standard@1"];
    }
    return [];
  });
  const relationshipProfiles = relationshipProfileRefs.flatMap((resourceRef) => {
    const resource = registry.resolveRelationshipProfile!(resourceRef);
    if (resource === undefined) missing(resourceRef, "Relationship Profile");
    return resource === undefined ? [] : [resource];
  });

  if (
    defaultMotionProfile === undefined ||
    fallbackMotionProfile === undefined ||
    motionKernels.length !== new Set(
      resolvedMotionProfiles.map((profile) => profile.motionKernelRef),
    ).size ||
    controlProfile === undefined ||
    cameraContextProfile === undefined ||
    mediumProfile === undefined ||
    harnessProfile === undefined ||
    renderBindingProfile === undefined
  ) {
    return undefined;
  }
  const incompatibleMotionKernel = motionKernels.find(
    (motionKernel) => motionKernel.runtimeStatus !== "implemented",
  );
  if (incompatibleMotionKernel !== undefined) {
    addError(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `Motion Kernel '${incompatibleMotionKernel.resourceRef}' is not implemented by the canonical runtime.`,
      {
        kernelCommandKind: incompatibleMotionKernel.commandKind,
        controlCommandKind: controlProfile.commandKind,
        runtimeStatus: incompatibleMotionKernel.runtimeStatus,
      },
    );
    return undefined;
  }
  const defaultMotionKernel = motionKernels.find(
    (motionKernel) => motionKernel.resourceRef === defaultMotionProfile.motionKernelRef,
  );
  if (
    defaultMotionKernel === undefined ||
    defaultMotionKernel.commandKind !== controlProfile.commandKind
  ) {
    addError(
      request.diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      request.instancePath,
      `Default Motion Kernel '${defaultMotionProfile.motionKernelRef}' and Control Profile '${controlProfile.resourceRef}' use different command kinds.`,
      {
        kernelCommandKind: defaultMotionKernel?.commandKind,
        controlCommandKind: controlProfile.commandKind,
      },
    );
    return undefined;
  }

  [
    defaultMotionProfile,
    ...optionalMotionProfiles,
    fallbackMotionProfile,
    ...motionKernels,
    controlProfile,
    cameraContextProfile,
    ...cameraRigProfiles,
    ...cameraRigAlgorithms,
    ...cameraModifierProfiles,
    mediumProfile,
    ...relationshipProfiles,
    harnessProfile,
    renderBindingProfile,
  ].forEach(addLock);

  return {
    authoringAvailability: subject.authoringAvailability,
    defaultMotionProfile,
    optionalMotionProfiles,
    fallbackMotionProfile,
    motionKernels,
    controlProfile,
    cameraContextProfile,
    cameraRigProfiles,
    cameraRigAlgorithms,
    cameraModifierProfiles,
    mediumProfile,
    relationshipProfiles,
    harnessProfile,
    renderBindingProfile,
    actionOrPoseSetRef: subject.actionOrPoseSetRef,
  };
}

function sortedStrings(values: readonly string[] | undefined): readonly string[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function reportDuplicateIds(
  values: readonly { id: string }[],
  code: "SUBJECT_VISUAL_PART_DUPLICATE" | "SUBJECT_SOCKET_DUPLICATE",
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      addError(diagnostics, code, `${instancePath}/${index}/id`,
        `Duplicate Subject component ID '${value.id}'.`, { id: value.id });
    }
    seen.add(value.id);
  });
}

function normalizeVisualParts(
  definition: SubjectDefinitionSourceV2,
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): readonly NormalizedSubjectVisualPartV2[] {
  reportDuplicateIds(definition.visualParts, "SUBJECT_VISUAL_PART_DUPLICATE",
    `${instancePath}/visualParts`, diagnostics);
  return definition.visualParts
    .map((part, index): NormalizedSubjectVisualPartV2 => {
      if (part.kind === "primitive") {
        return {
          id: part.id,
          kind: "primitive",
          shape: structuredClone(part.shape) as SubjectPrimitiveShapeSpecV1,
          localTransform: {
            positionMetersXYZ: cloneVec3(part.localTransform.positionMetersXYZ),
            rotationEulerRadiansXYZ: cloneVec3(
              part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]),
          },
          colliderContribution: part.colliderContribution,
          semanticTags: sortedStrings(part.semanticTags),
        };
      }
      const scaleXYZ = cloneVec3(part.localTransform.scaleXYZ);
      scaleXYZ.forEach((scale, componentIndex) => {
        if (!Number.isFinite(scale) || scale <= 0) {
          addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
            `${instancePath}/visualParts/${index}/localTransform/scaleXYZ/${componentIndex}`,
            "Asset Part scale components must be positive finite numbers.",
            { subjectAssetRef: part.subjectAssetRef, scaleXYZ });
        }
      });
      return {
        id: part.id,
        kind: "asset",
        subjectAssetRef: part.subjectAssetRef,
        localTransform: {
          positionMetersXYZ: cloneVec3(part.localTransform.positionMetersXYZ),
          rotationEulerRadiansXYZ: cloneVec3(
            part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]),
          scaleXYZ,
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: sortedStrings(part.semanticTags),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeSockets(
  definition: SubjectDefinitionSourceV2,
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): readonly NormalizedSubjectSocketV2[] {
  reportDuplicateIds(definition.sockets, "SUBJECT_SOCKET_DUPLICATE",
    `${instancePath}/sockets`, diagnostics);
  return definition.sockets
    .map((socket): NormalizedSubjectSocketV2 => socket.kind === "local"
      ? {
          id: socket.id,
          kind: "local",
          localTransform: {
            positionMetersXYZ: cloneVec3(socket.localTransform.positionMetersXYZ),
            rotationEulerRadiansXYZ: cloneVec3(
              socket.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]),
          },
          semanticTags: sortedStrings(socket.semanticTags),
        }
      : {
          id: socket.id,
          kind: "bone",
          boneId: socket.boneId,
          offsetTransform: {
            positionMetersXYZ: cloneVec3(socket.offsetTransform.positionMetersXYZ),
            rotationEulerRadiansXYZ: cloneVec3(
              socket.offsetTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]),
          },
          semanticTags: sortedStrings(socket.semanticTags),
        })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resourcesOfKind(
  registry: SubjectResourceRegistryV2,
  kind: "subject-asset" | "rig-profile" | "animation-set" | "collider-profile",
): readonly string[] {
  return registry.listResources()
    .filter((resource) => resource.kind === kind)
    .map((resource) => resource.resourceRef)
    .sort((left, right) => left.localeCompare(right));
}

function resolveRiggedVisualResources(
  definition: SubjectDefinitionSourceV2,
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedRiggedVisualResourcesV1 | undefined {
  const { diagnostics, instancePath, resourceLockBuilder, subjectResourceRegistry } = request;
  if (definition.visualBinding.mode !== "rigged") return undefined;

  const assetParts = definition.visualParts.filter((part) => part.kind === "asset");
  if (assetParts.length !== 1) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualParts`,
      "A rigged Subject Definition requires exactly one Asset Part.",
      { requiredAssetPartCount: 1, assetPartCount: assetParts.length });
  }
  const assetPart = assetParts[0];
  if (assetPart === undefined) return undefined;
  const assetPartIndex = definition.visualParts.indexOf(assetPart);

  const subjectAsset = subjectResourceRegistry.resolveSubjectAsset(assetPart.subjectAssetRef);
  if (subjectAsset === undefined) {
    addError(diagnostics, "SUBJECT_ASSET_NOT_FOUND",
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      `Subject Asset '${assetPart.subjectAssetRef}' is not registered at the exact requested version.`,
      {
        resourceRef: assetPart.subjectAssetRef,
        subjectAssetRef: assetPart.subjectAssetRef,
        availableSubjectAssetRefs: resourcesOfKind(subjectResourceRegistry, "subject-asset"),
      });
  } else {
    resourceLockBuilder.addRegistryResource(subjectAsset,
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`, diagnostics);
  }

  const { rigProfileRef, animationSetRef } = definition.visualBinding;
  const rigProfile = subjectResourceRegistry.resolveRigProfile(rigProfileRef);
  if (rigProfile === undefined) {
    const compatibleRigProfileRefs = subjectResourceRegistry.listResources()
      .filter((resource) => resource.kind === "rig-profile" &&
        resource.compatibleSubjectAssetRefs.includes(assetPart.subjectAssetRef))
      .map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
    addError(diagnostics, "SUBJECT_RIG_PROFILE_NOT_FOUND",
      `${instancePath}/visualBinding/rigProfileRef`,
      `Rig Profile '${rigProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: rigProfileRef, rigProfileRef, compatibleRigProfileRefs });
  } else {
    resourceLockBuilder.addRegistryResource(rigProfile,
      `${instancePath}/visualBinding/rigProfileRef`, diagnostics);
  }

  const animationSet = subjectResourceRegistry.resolveAnimationSet(animationSetRef);
  if (animationSet === undefined) {
    const compatibleAnimationSetRefs = subjectResourceRegistry.listResources()
      .filter((resource) => resource.kind === "animation-set" &&
        resource.subjectAssetRef === assetPart.subjectAssetRef &&
        resource.rigProfileRef === rigProfileRef)
      .map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
    addError(diagnostics, "SUBJECT_ANIMATION_SET_NOT_FOUND",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSetRef}' is not registered at the exact requested version.`,
      { resourceRef: animationSetRef, animationSetRef, compatibleAnimationSetRefs });
  } else {
    resourceLockBuilder.addRegistryResource(animationSet,
      `${instancePath}/visualBinding/animationSetRef`, diagnostics);
  }

  if (subjectAsset === undefined || rigProfile === undefined || animationSet === undefined) {
    return undefined;
  }
  if (!rigProfile.compatibleSubjectAssetRefs.includes(subjectAsset.resourceRef)) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      `Rig Profile '${rigProfile.resourceRef}' is not compatible with Subject Asset '${subjectAsset.resourceRef}'.`,
      {
        subjectAssetRef: subjectAsset.resourceRef,
        rigProfileRef: rigProfile.resourceRef,
        compatibleSubjectAssetRefs: sortedStrings(rigProfile.compatibleSubjectAssetRefs),
      });
  }
  if (animationSet.subjectAssetRef !== subjectAsset.resourceRef) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' targets a different Subject Asset.`,
      {
        animationSetRef: animationSet.resourceRef,
        subjectAssetRef: subjectAsset.resourceRef,
        compatibleSubjectAssetRefs: [animationSet.subjectAssetRef],
      });
  }
  if (animationSet.rigProfileRef !== rigProfile.resourceRef) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' targets a different Rig Profile.`,
      {
        animationSetRef: animationSet.resourceRef,
        rigProfileRef: rigProfile.resourceRef,
        compatibleRigProfileRefs: [animationSet.rigProfileRef],
      });
  }
  if (rigProfile.bodyTopology !== definition.bodyTopology) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/rigProfileRef`,
      `Rig Profile '${rigProfile.resourceRef}' does not support Definition topology '${definition.bodyTopology}'.`,
      {
        rigProfileRef: rigProfile.resourceRef,
        bodyTopology: definition.bodyTopology,
        rigBodyTopology: rigProfile.bodyTopology,
      });
  }

  const boundActionIds = new Set(animationSet.animationBindings.map((binding) => binding.actionId));
  const declaredActionIds = new Set(animationSet.requiredActionIds);
  const missingActionIds = REQUIRED_GROUND_ACTION_IDS.filter((actionId) =>
    !declaredActionIds.has(actionId) || !boundActionIds.has(actionId));
  if (missingActionIds.length > 0) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' does not provide every required ground Action.`,
      { animationSetRef: animationSet.resourceRef, missingActionIds });
  }

  const availableClipNames = new Set(subjectAsset.inventory.animationClipNames);
  const missingSourceClipNames = sortedStrings(animationSet.animationBindings
    .filter((binding) => !availableClipNames.has(binding.sourceClipName))
    .map((binding) => binding.sourceClipName));
  if (missingSourceClipNames.length > 0) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/animationSetRef`,
      `Animation Set '${animationSet.resourceRef}' maps Clips absent from Subject Asset '${subjectAsset.resourceRef}'.`,
      {
        animationSetRef: animationSet.resourceRef,
        subjectAssetRef: subjectAsset.resourceRef,
        missingSourceClipNames,
        availableSourceClipNames: sortedStrings(subjectAsset.inventory.animationClipNames),
      });
  }

  const missingBoneIds = rigProfile.requiredBoneIds.filter((boneId) =>
    !Object.prototype.hasOwnProperty.call(rigProfile.sourceNodeNameByBoneId, boneId) ||
    rigProfile.sourceNodeNameByBoneId[boneId].length === 0);
  if (missingBoneIds.length > 0) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualBinding/rigProfileRef`,
      `Rig Profile '${rigProfile.resourceRef}' omits required Bone mappings.`,
      { rigProfileRef: rigProfile.resourceRef, missingBoneIds: sortedStrings(missingBoneIds) });
  }
  if (subjectAsset.inventory.skeletonCount !== 1 ||
    subjectAsset.inventory.boneCount < rigProfile.requiredBoneIds.length) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/visualParts/${assetPartIndex}/subjectAssetRef`,
      `Subject Asset '${subjectAsset.resourceRef}' inventory cannot satisfy Rig Profile '${rigProfile.resourceRef}'.`,
      {
        subjectAssetRef: subjectAsset.resourceRef,
        rigProfileRef: rigProfile.resourceRef,
        skeletonCount: subjectAsset.inventory.skeletonCount,
        boneCount: subjectAsset.inventory.boneCount,
        requiredBoneCount: rigProfile.requiredBoneIds.length,
      });
  }
  const availableBoneIds = new Set(rigProfile.requiredBoneIds);
  definition.sockets.forEach((socket, index) => {
    if (socket.kind === "bone" && !availableBoneIds.has(socket.boneId)) {
      addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        `${instancePath}/sockets/${index}/boneId`,
        `Bone Socket '${socket.id}' targets Bone '${socket.boneId}' not declared by Rig Profile '${rigProfile.resourceRef}'.`,
        {
          boneId: socket.boneId,
          rigProfileRef: rigProfile.resourceRef,
          availableBoneIds: sortedStrings(rigProfile.requiredBoneIds),
        });
    }
  });

  return {
    subjectAssetResource: structuredClone(subjectAsset),
    rigProfileResource: structuredClone(rigProfile),
    animationSetResource: structuredClone(animationSet),
  };
}

function resolveColliderPolicy(
  definition: SubjectDefinitionSourceV2,
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedSubjectColliderV2 | undefined {
  const { diagnostics, instancePath, resourceLockBuilder, subjectResourceRegistry } = request;
  if (definition.colliderPolicy.kind === "profile") {
    const { colliderProfileRef } = definition.colliderPolicy;
    const colliderProfile = subjectResourceRegistry.resolveColliderProfile(colliderProfileRef);
    if (colliderProfile === undefined) {
      const compatibleColliderProfileRefs = subjectResourceRegistry.listResources()
        .filter((resource) => resource.kind === "collider-profile" &&
          resource.supportedBodyTopologies.includes(definition.bodyTopology))
        .map((resource) => resource.resourceRef).sort((left, right) => left.localeCompare(right));
      addError(diagnostics, "SUBJECT_COLLIDER_PROFILE_NOT_FOUND",
        `${instancePath}/colliderPolicy/colliderProfileRef`,
        `Collider Profile '${colliderProfileRef}' is not registered at the exact requested version.`,
        { resourceRef: colliderProfileRef, colliderProfileRef, compatibleColliderProfileRefs });
      return undefined;
    }
    resourceLockBuilder.addRegistryResource(colliderProfile,
      `${instancePath}/colliderPolicy/colliderProfileRef`, diagnostics);
    const [centerX, centerY, centerZ] =
      colliderProfile.collider.centerOffsetFromSubjectOriginMetersXYZ;
    const isSupportCentered = Number.isFinite(colliderProfile.collider.radiusMeters) &&
      colliderProfile.collider.radiusMeters > 0 &&
      Number.isFinite(colliderProfile.collider.heightMeters) &&
      colliderProfile.collider.heightMeters > 0 && centerX === 0 && centerZ === 0 &&
      centerY === colliderProfile.collider.heightMeters / 2;
    if (!colliderProfile.supportedBodyTopologies.includes(definition.bodyTopology) ||
      !isSupportCentered) {
      addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        `${instancePath}/colliderPolicy/colliderProfileRef`,
        `Collider Profile '${colliderProfileRef}' is not a support-centered capsule compatible with '${definition.bodyTopology}'.`,
        {
          colliderProfileRef,
          bodyTopology: definition.bodyTopology,
          supportedBodyTopologies: sortedStrings(colliderProfile.supportedBodyTopologies),
          collider: structuredClone(colliderProfile.collider),
        });
    }
    return {
      kind: colliderProfile.collider.kind,
      radiusMeters: colliderProfile.collider.radiusMeters,
      heightMeters: colliderProfile.collider.heightMeters,
      centerOffsetFromSubjectOriginMetersXYZ: [centerX, centerY, centerZ],
    };
  }

  if (definition.visualParts.some((part) => part.kind === "asset")) {
    addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
      `${instancePath}/colliderPolicy/kind`,
      "A Subject Definition containing an Asset Part requires an explicit Collider Profile.",
      { colliderPolicyKind: definition.colliderPolicy.kind });
  }
  const colliderDerivationProfile = subjectResourceRegistry.resolveColliderDerivationProfile(
    definition.colliderPolicy.colliderDerivationProfileRef);
  if (colliderDerivationProfile === undefined) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      `Collider Derivation Profile '${definition.colliderPolicy.colliderDerivationProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.colliderPolicy.colliderDerivationProfileRef });
    return undefined;
  }
  resourceLockBuilder.addRegistryResource(colliderDerivationProfile,
    `${instancePath}/colliderPolicy/colliderDerivationProfileRef`, diagnostics);
  if (!colliderDerivationProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      `Collider Derivation Profile '${colliderDerivationProfile.resourceRef}' does not support '${definition.bodyTopology}'.`,
      { bodyTopology: definition.bodyTopology });
  }
  const colliderSourceParts: ColliderSourcePartV1[] = definition.visualParts.flatMap(
    (part) => part.kind === "primitive" && part.colliderContribution === "include"
      ? [{
          id: part.id,
          shape: part.shape,
          localPositionMetersXYZ: part.localTransform.positionMetersXYZ,
          localRotationEulerRadiansXYZ:
            part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0],
        }]
      : [],
  );
  const colliderResult = deriveVerticalCharacterCapsule(colliderSourceParts);
  if (!colliderResult.ok) {
    for (const issue of colliderResult.issues) {
      const isSupportOriginIssue = issue.code === "SUBJECT_SUPPORT_ORIGIN_INVALID";
      addError(diagnostics,
        isSupportOriginIssue ? "SUBJECT_SUPPORT_ORIGIN_INVALID" : "SUBJECT_COLLIDER_DERIVATION_FAILED",
        isSupportOriginIssue ? `${instancePath}/visualParts` : `${instancePath}/colliderPolicy`,
        issue.message, { partIds: issue.partIds, ...(issue.details ?? {}) });
    }
    return undefined;
  }
  if (colliderResult.collider.radiusMeters >
      colliderDerivationProfile.colliderDerivation.maximumRadiusMeters ||
    colliderResult.collider.heightMeters >
      colliderDerivationProfile.colliderDerivation.maximumHeightMeters) {
    addError(diagnostics, "SUBJECT_COLLIDER_DERIVATION_FAILED",
      `${instancePath}/colliderPolicy`,
      "Derived Collider exceeds the selected derivation Profile limits.",
      {
        derivedCollider: colliderResult.collider,
        maximumRadiusMeters: colliderDerivationProfile.colliderDerivation.maximumRadiusMeters,
        maximumHeightMeters: colliderDerivationProfile.colliderDerivation.maximumHeightMeters,
      });
  }
  return colliderResult.collider;
}

export function normalizeSubjectDefinitionV2(
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedSubjectDefinitionV2 | undefined {
  const { definition, diagnostics, instancePath, resourceBudget, resourceLockBuilder, source,
    subjectDefinitionRef, subjectResourceRegistry } = request;
  const initialErrorCount = diagnostics.filter((item) => item.severity === "error").length;

  if (source === "registry") {
    resourceLockBuilder.addRegistryResource(definition as RegistrySubjectDefinitionV2,
      instancePath, diagnostics);
  }
  const visualParts = normalizeVisualParts(definition, instancePath, diagnostics);
  const sockets = normalizeSockets(definition, instancePath, diagnostics);
  const capabilityRefs = sortedStrings(definition.capabilityRefs);
  const selectedCapabilityRefs = new Set(capabilityRefs);
  const capabilities = capabilityRefs.flatMap((resourceRef) => {
    const resource = subjectResourceRegistry.resolveCapability(resourceRef);
    if (resource === undefined) {
      addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
        `${instancePath}/capabilityRefs/${definition.capabilityRefs.indexOf(resourceRef)}`,
        `Capability '${resourceRef}' is not registered at the exact requested version.`,
        { resourceRef });
      return [];
    }
    resourceLockBuilder.addRegistryResource(resource, `${instancePath}/capabilityRefs`, diagnostics);
    return [resource];
  });

  const physicsBodyProfile = subjectResourceRegistry.resolvePhysicsBodyProfile(
    definition.profiles.physicsBodyProfileRef);
  if (physicsBodyProfile === undefined) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/physicsBodyProfileRef`,
      `Physics Body Profile '${definition.profiles.physicsBodyProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.profiles.physicsBodyProfileRef });
  } else {
    resourceLockBuilder.addRegistryResource(physicsBodyProfile,
      `${instancePath}/profiles/physicsBodyProfileRef`, diagnostics);
  }
  const locomotionProfile = subjectResourceRegistry.resolveLocomotionProfile(
    definition.profiles.locomotionProfileRef);
  if (locomotionProfile === undefined) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/locomotionProfileRef`,
      `Locomotion Profile '${definition.profiles.locomotionProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.profiles.locomotionProfileRef });
  } else {
    resourceLockBuilder.addRegistryResource(locomotionProfile,
      `${instancePath}/profiles/locomotionProfileRef`, diagnostics);
  }

  for (const capability of capabilities) {
    for (const requiredRef of capability.requiredCapabilityRefs) {
      if (!selectedCapabilityRefs.has(requiredRef)) {
        addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED", `${instancePath}/capabilityRefs`,
          `Capability '${capability.resourceRef}' requires '${requiredRef}'.`,
          { capabilityRef: capability.resourceRef, requiredCapabilityRef: requiredRef });
      }
    }
    for (const conflictingRef of capability.conflictingCapabilityRefs) {
      if (selectedCapabilityRefs.has(conflictingRef)) {
        addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED", `${instancePath}/capabilityRefs`,
          `Capability '${capability.resourceRef}' conflicts with '${conflictingRef}'.`,
          { capabilityRef: capability.resourceRef, conflictingCapabilityRef: conflictingRef });
      }
    }
  }
  const isCapabilityDrivenV3 =
    "schemaVersion" in definition && definition.schemaVersion === 3;
  if (!isCapabilityDrivenV3 && (capabilityRefs.length !== 1 ||
    capabilityRefs[0] !== "worldkit://capability/locomotion.ground@1" ||
    capabilities[0]?.providedFeatures.includes("ground-locomotion") !== true)) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED", `${instancePath}/capabilityRefs`,
      "S1b Subject Definitions require exactly the ground locomotion capability.",
      { requiredCapabilityRefs: ["worldkit://capability/locomotion.ground@1"] });
  }
  if (!isCapabilityDrivenV3 && locomotionProfile !== undefined && locomotionProfile.requiredCapabilityRefs.some(
    (resourceRef) => !selectedCapabilityRefs.has(resourceRef))) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/locomotionProfileRef`,
      `Locomotion Profile '${locomotionProfile.resourceRef}' requires a missing Capability.`,
      { requiredCapabilityRefs: locomotionProfile.requiredCapabilityRefs });
  }
  if (physicsBodyProfile !== undefined &&
    !physicsBodyProfile.supportedBodyTopologies.includes(definition.bodyTopology)) {
    addError(diagnostics, "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/physicsBodyProfileRef`,
      `Physics Body Profile '${physicsBodyProfile.resourceRef}' does not support '${definition.bodyTopology}'.`,
      { bodyTopology: definition.bodyTopology });
  }

  let riggedResources: NormalizedRiggedVisualResourcesV1 | undefined;
  if (definition.visualBinding.mode === "rigged") {
    riggedResources = resolveRiggedVisualResources(definition, request);
  } else {
    const assetPartIds = definition.visualParts.filter((part) => part.kind === "asset")
      .map((part) => part.id).sort((left, right) => left.localeCompare(right));
    if (assetPartIds.length > 0) {
      addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
        `${instancePath}/visualBinding/mode`,
        "A static Subject Definition cannot contain Asset Parts.", { assetPartIds });
    }
    definition.sockets.forEach((socket, index) => {
      if (socket.kind === "bone") {
        addError(diagnostics, "SUBJECT_ASSET_PROFILE_INCOMPATIBLE",
          `${instancePath}/sockets/${index}/kind`,
          "A Bone Socket requires a rigged Visual Binding.", { socketId: socket.id });
      }
    });
  }

  const normalizedCollider = resolveColliderPolicy(definition, request);
  const capabilityAssembly = normalizeCapabilityAssemblyV1(definition, request);
  const primitiveCost = calculatePrimitiveResourceCost(
    visualParts.filter((part) => part.kind === "primitive"));
  const subjectAsset = riggedResources?.subjectAssetResource;
  const resourceCost = {
    vertices: primitiveCost.vertices + (subjectAsset?.inventory.vertexCount ?? 0),
    triangles: primitiveCost.triangles + (subjectAsset?.inventory.triangleCount ?? 0),
    colliders: 1 as const,
  };
  if (resourceBudget !== undefined && subjectAsset !== undefined) {
    if (resourceCost.vertices > resourceBudget.maxVertices) {
      addError(diagnostics, "SUBJECT_ASSET_BUDGET_EXCEEDED",
        "/world/resourceBudget/maxVertices",
        `Subject Asset '${subjectAsset.resourceRef}' exceeds the world vertex budget.`,
        {
          subjectAssetRef: subjectAsset.resourceRef,
          requiredVertices: resourceCost.vertices,
          maxVertices: resourceBudget.maxVertices,
        });
    }
    if (resourceCost.triangles > resourceBudget.maxTriangles) {
      addError(diagnostics, "SUBJECT_ASSET_BUDGET_EXCEEDED",
        "/world/resourceBudget/maxTriangles",
        `Subject Asset '${subjectAsset.resourceRef}' exceeds the world triangle budget.`,
        {
          subjectAssetRef: subjectAsset.resourceRef,
          requiredTriangles: resourceCost.triangles,
          maxTriangles: resourceBudget.maxTriangles,
        });
    }
  }

  const finalErrorCount = diagnostics.filter((item) => item.severity === "error").length;
  if (finalErrorCount > initialErrorCount || physicsBodyProfile === undefined ||
    locomotionProfile === undefined || normalizedCollider === undefined ||
    (definition.visualBinding.mode === "rigged" && riggedResources === undefined)) {
    return undefined;
  }

  const normalizedDefinitionHashInput = {
    subjectDefinitionRef,
    id: definition.id,
    version: definition.version,
    kind: "subject-definition" as const,
    category: definition.category,
    bodyTopology: definition.bodyTopology,
    semanticClassId: definition.semanticClassId,
    coordinateConvention: structuredClone(definition.coordinateConvention),
    visualParts,
    visualBinding: definition.visualBinding.mode === "static"
      ? { mode: "static" as const }
      : {
          mode: "rigged" as const,
          rigProfileRef: definition.visualBinding.rigProfileRef,
          animationSetRef: definition.visualBinding.animationSetRef,
        },
    sockets,
    colliderPolicy: structuredClone(definition.colliderPolicy),
    capabilityRefs,
    profiles: structuredClone(definition.profiles),
    ...(capabilityAssembly === undefined ? {} : { capabilityAssembly }),
    aiMetadata: {
      ...structuredClone(definition.aiMetadata),
      semanticTags: sortedStrings(definition.aiMetadata.semanticTags),
    },
  };
  const subjectDefinitionHash = sha256CanonicalJson(normalizedDefinitionHashInput);
  if (source === "package") {
    resourceLockBuilder.addPackageSubjectDefinition(subjectDefinitionRef, definition.version,
      subjectDefinitionHash, instancePath, diagnostics);
  }
  return {
    ...normalizedDefinitionHashInput,
    subjectDefinitionHash,
    source,
    collider: {
      ...normalizedCollider,
      massKilograms: physicsBodyProfile.physicsBody.massKilograms,
      maxSlopeDegrees: physicsBodyProfile.physicsBody.maxSlopeDegrees,
      maxStepHeightMeters: physicsBodyProfile.physicsBody.maxStepHeightMeters,
    },
    locomotion: {
      mode: locomotionProfile.locomotion.mode,
      walkSpeedMetersPerSecond:
        locomotionProfile.locomotion.walkSpeedMetersPerSecond,
      runSpeedMetersPerSecond:
        locomotionProfile.locomotion.runSpeedMetersPerSecond,
      waterSpeedMetersPerSecond:
        locomotionProfile.locomotion.waterSpeedMetersPerSecond,
      jumpSpeedMetersPerSecond:
        locomotionProfile.locomotion.jumpSpeedMetersPerSecond,
    },
    resourceCost,
  };
}

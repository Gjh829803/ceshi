import {
  calculatePrimitiveResourceCost,
  deriveVerticalCharacterCapsule,
  type ColliderSourcePartV1,
} from "@whitebox-world/subject-composition";
import type {
  RegistrySubjectDefinitionV2,
  SubjectResourceRegistryV2,
} from "@whitebox-world/subject-registry";

import { sha256CanonicalJson } from "./canonical-json";
import { ResourceLockBuilderV1 } from "./resource-lock";
import type {
  AuthoringDiagnostic,
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
}

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
      addError(
        diagnostics,
        code,
        `${instancePath}/${index}/id`,
        `Duplicate Subject component ID '${value.id}'.`,
        { id: value.id },
      );
    }
    seen.add(value.id);
  });
}

function normalizeVisualParts(
  definition: SubjectDefinitionSourceV2,
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): readonly NormalizedSubjectVisualPartV2[] {
  reportDuplicateIds(
    definition.visualParts,
    "SUBJECT_VISUAL_PART_DUPLICATE",
    `${instancePath}/visualParts`,
    diagnostics,
  );
  return definition.visualParts
    .map((part) => ({
      id: part.id,
      kind: "primitive" as const,
      shape: structuredClone(part.shape) as SubjectPrimitiveShapeSpecV1,
      localTransform: {
        positionMetersXYZ: cloneVec3(part.localTransform.positionMetersXYZ),
        rotationEulerRadiansXYZ: cloneVec3(
          part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0],
        ),
      },
      colliderContribution: part.colliderContribution,
      semanticTags: sortedStrings(part.semanticTags),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeSockets(
  definition: SubjectDefinitionSourceV2,
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): readonly NormalizedSubjectSocketV2[] {
  reportDuplicateIds(
    definition.sockets,
    "SUBJECT_SOCKET_DUPLICATE",
    `${instancePath}/sockets`,
    diagnostics,
  );
  return definition.sockets
    .map((socket) => ({
      id: socket.id,
      localTransform: {
        positionMetersXYZ: cloneVec3(socket.localTransform.positionMetersXYZ),
        rotationEulerRadiansXYZ: cloneVec3(
          socket.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0],
        ),
      },
      semanticTags: sortedStrings(socket.semanticTags),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function normalizeSubjectDefinitionV2(
  request: NormalizeSubjectDefinitionRequestV2,
): NormalizedSubjectDefinitionV2 | undefined {
  const {
    definition,
    diagnostics,
    instancePath,
    resourceLockBuilder,
    source,
    subjectDefinitionRef,
    subjectResourceRegistry,
  } = request;

  if (source === "registry") {
    resourceLockBuilder.addRegistryResource(
      definition as RegistrySubjectDefinitionV2,
      instancePath,
      diagnostics,
    );
  }

  const visualParts = normalizeVisualParts(definition, instancePath, diagnostics);
  const sockets = normalizeSockets(definition, instancePath, diagnostics);
  const capabilityRefs = sortedStrings(definition.capabilityRefs);
  const selectedCapabilityRefs = new Set(capabilityRefs);

  const capabilities = capabilityRefs.flatMap((resourceRef) => {
    const resource = subjectResourceRegistry.resolveCapability(resourceRef);
    if (resource === undefined) {
      addError(
        diagnostics,
        "SUBJECT_CAPABILITY_UNSATISFIED",
        `${instancePath}/capabilityRefs/${definition.capabilityRefs.indexOf(resourceRef)}`,
        `Capability '${resourceRef}' is not registered at the exact requested version.`,
        { resourceRef },
      );
      return [];
    }
    resourceLockBuilder.addRegistryResource(resource, `${instancePath}/capabilityRefs`, diagnostics);
    return [resource];
  });

  const physicsBodyProfile = subjectResourceRegistry.resolvePhysicsBodyProfile(
    definition.profiles.physicsBodyProfileRef,
  );
  if (physicsBodyProfile === undefined) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/physicsBodyProfileRef`,
      `Physics Body Profile '${definition.profiles.physicsBodyProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.profiles.physicsBodyProfileRef },
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      physicsBodyProfile,
      `${instancePath}/profiles/physicsBodyProfileRef`,
      diagnostics,
    );
  }

  const locomotionProfile = subjectResourceRegistry.resolveLocomotionProfile(
    definition.profiles.locomotionProfileRef,
  );
  if (locomotionProfile === undefined) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/locomotionProfileRef`,
      `Locomotion Profile '${definition.profiles.locomotionProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.profiles.locomotionProfileRef },
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      locomotionProfile,
      `${instancePath}/profiles/locomotionProfileRef`,
      diagnostics,
    );
  }

  const colliderDerivationProfile =
    subjectResourceRegistry.resolveColliderDerivationProfile(
      definition.colliderPolicy.colliderDerivationProfileRef,
    );
  if (colliderDerivationProfile === undefined) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      `Collider Derivation Profile '${definition.colliderPolicy.colliderDerivationProfileRef}' is not registered at the exact requested version.`,
      { resourceRef: definition.colliderPolicy.colliderDerivationProfileRef },
    );
  } else {
    resourceLockBuilder.addRegistryResource(
      colliderDerivationProfile,
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      diagnostics,
    );
  }

  for (const capability of capabilities) {
    for (const requiredRef of capability.requiredCapabilityRefs) {
      if (!selectedCapabilityRefs.has(requiredRef)) {
        addError(
          diagnostics,
          "SUBJECT_CAPABILITY_UNSATISFIED",
          `${instancePath}/capabilityRefs`,
          `Capability '${capability.resourceRef}' requires '${requiredRef}'.`,
          { capabilityRef: capability.resourceRef, requiredCapabilityRef: requiredRef },
        );
      }
    }
    for (const conflictingRef of capability.conflictingCapabilityRefs) {
      if (selectedCapabilityRefs.has(conflictingRef)) {
        addError(
          diagnostics,
          "SUBJECT_CAPABILITY_UNSATISFIED",
          `${instancePath}/capabilityRefs`,
          `Capability '${capability.resourceRef}' conflicts with '${conflictingRef}'.`,
          { capabilityRef: capability.resourceRef, conflictingCapabilityRef: conflictingRef },
        );
      }
    }
  }

  if (
    capabilityRefs.length !== 1 ||
    capabilityRefs[0] !== "worldkit://capability/locomotion.ground@1" ||
    capabilities[0]?.providedFeatures.includes("ground-locomotion") !== true
  ) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/capabilityRefs`,
      "S1a Subject Definitions require exactly the ground locomotion capability.",
      { requiredCapabilityRefs: ["worldkit://capability/locomotion.ground@1"] },
    );
  }

  if (
    locomotionProfile !== undefined &&
    locomotionProfile.requiredCapabilityRefs.some(
      (resourceRef) => !selectedCapabilityRefs.has(resourceRef),
    )
  ) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/locomotionProfileRef`,
      `Locomotion Profile '${locomotionProfile.resourceRef}' requires a missing Capability.`,
      { requiredCapabilityRefs: locomotionProfile.requiredCapabilityRefs },
    );
  }

  if (
    physicsBodyProfile !== undefined &&
    !physicsBodyProfile.supportedBodyTopologies.includes(definition.bodyTopology)
  ) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/profiles/physicsBodyProfileRef`,
      `Physics Body Profile '${physicsBodyProfile.resourceRef}' does not support '${definition.bodyTopology}'.`,
      { bodyTopology: definition.bodyTopology },
    );
  }
  if (
    colliderDerivationProfile !== undefined &&
    !colliderDerivationProfile.supportedBodyTopologies.includes(definition.bodyTopology)
  ) {
    addError(
      diagnostics,
      "SUBJECT_CAPABILITY_UNSATISFIED",
      `${instancePath}/colliderPolicy/colliderDerivationProfileRef`,
      `Collider Derivation Profile '${colliderDerivationProfile.resourceRef}' does not support '${definition.bodyTopology}'.`,
      { bodyTopology: definition.bodyTopology },
    );
  }

  const colliderSourceParts: ColliderSourcePartV1[] = visualParts
    .filter((part) => part.colliderContribution === "include")
    .map((part) => ({
      id: part.id,
      shape: part.shape,
      localPositionMetersXYZ: part.localTransform.positionMetersXYZ,
      localRotationEulerRadiansXYZ: part.localTransform.rotationEulerRadiansXYZ,
    }));
  const colliderResult = deriveVerticalCharacterCapsule(colliderSourceParts);
  if (!colliderResult.ok) {
    for (const issue of colliderResult.issues) {
      const isSupportOriginIssue = issue.code === "SUBJECT_SUPPORT_ORIGIN_INVALID";
      addError(
        diagnostics,
        isSupportOriginIssue
          ? "SUBJECT_SUPPORT_ORIGIN_INVALID"
          : "SUBJECT_COLLIDER_DERIVATION_FAILED",
        isSupportOriginIssue
          ? `${instancePath}/visualParts`
          : `${instancePath}/colliderPolicy`,
        issue.message,
        { partIds: issue.partIds, ...(issue.details ?? {}) },
      );
    }
  }

  if (
    colliderResult.ok &&
    colliderDerivationProfile !== undefined &&
    (colliderResult.collider.radiusMeters >
      colliderDerivationProfile.colliderDerivation.maximumRadiusMeters ||
      colliderResult.collider.heightMeters >
        colliderDerivationProfile.colliderDerivation.maximumHeightMeters)
  ) {
    addError(
      diagnostics,
      "SUBJECT_COLLIDER_DERIVATION_FAILED",
      `${instancePath}/colliderPolicy`,
      "Derived Collider exceeds the selected derivation Profile limits.",
      {
        derivedCollider: colliderResult.collider,
        maximumRadiusMeters:
          colliderDerivationProfile.colliderDerivation.maximumRadiusMeters,
        maximumHeightMeters:
          colliderDerivationProfile.colliderDerivation.maximumHeightMeters,
      },
    );
  }

  if (
    !colliderResult.ok ||
    physicsBodyProfile === undefined ||
    locomotionProfile === undefined ||
    colliderDerivationProfile === undefined
  ) {
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
    sockets,
    colliderPolicy: structuredClone(definition.colliderPolicy),
    capabilityRefs,
    profiles: structuredClone(definition.profiles),
    aiMetadata: {
      ...structuredClone(definition.aiMetadata),
      semanticTags: sortedStrings(definition.aiMetadata.semanticTags),
    },
  };
  const subjectDefinitionHash = sha256CanonicalJson(normalizedDefinitionHashInput);

  if (source === "package") {
    resourceLockBuilder.addPackageSubjectDefinition(
      subjectDefinitionRef,
      definition.version,
      subjectDefinitionHash,
      instancePath,
      diagnostics,
    );
  }

  return {
    ...normalizedDefinitionHashInput,
    subjectDefinitionHash,
    source,
    collider: {
      ...colliderResult.collider,
      massKilograms: physicsBodyProfile.physicsBody.massKilograms,
      maxSlopeDegrees: physicsBodyProfile.physicsBody.maxSlopeDegrees,
      maxStepHeightMeters: physicsBodyProfile.physicsBody.maxStepHeightMeters,
    },
    locomotion: structuredClone(locomotionProfile.locomotion),
    resourceCost: calculatePrimitiveResourceCost(visualParts),
  };
}
